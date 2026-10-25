#!/usr/bin/env python3
"""NovaCorp database (the agents' "data center").

Every write goes through this script: it guarantees there are no duplicates
(same website, same Google Maps place, same registration number, or same name in the same city;
unique emails) and that the unsubscribe list is respected. Works for companies in any country.

Examples:
  python3 tools/db.py init
  python3 tools/db.py add-company --name "Acme" --domain acme.com --city Lyon --country FR --source apify-google-maps
  python3 tools/db.py list --status new --limit 10
  python3 tools/db.py stats
"""
import argparse
import json
import re
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "novacorp.db"
LOG = ROOT / "data" / "log.md"

COMPANY_STATUSES = ["new", "enriched", "draft", "approved", "sent", "replied", "rejected"]
CONTACT_STATUSES = ["new", "chosen", "draft", "sent", "replied", "rejected"]
COMPANY_FIELDS = ("domain", "place_id", "registry_id", "category", "country", "city", "address", "phone",
                  "rating", "reviews", "headcount", "created_on", "notes", "source")

SCHEMA = """
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  domain TEXT UNIQUE,                 -- official website, without www
  place_id TEXT UNIQUE,               -- Google Maps place id (from Apify)
  registry_id TEXT UNIQUE,            -- company registration number, any country (optional)
  category TEXT, country TEXT, city TEXT, address TEXT, phone TEXT,
  rating TEXT, reviews TEXT, headcount TEXT, created_on TEXT,
  hook TEXT, debrief TEXT, links TEXT, notes TEXT, source TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  added_at TEXT NOT NULL, enriched_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL, role TEXT,
  email TEXT UNIQUE, email_source TEXT, phone TEXT, linkedin TEXT, links TEXT, source TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  added_at TEXT NOT NULL,
  UNIQUE (company_id, name)
);
CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  contact_id INTEGER NOT NULL UNIQUE REFERENCES contacts(id),
  file TEXT NOT NULL, subject TEXT,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending, sent, replied
  created_at TEXT NOT NULL, sent_at TEXT, replied_at TEXT
);
CREATE TABLE IF NOT EXISTS searches (
  query TEXT NOT NULL, page INTEGER NOT NULL,
  results INTEGER, useful INTEGER, done_at TEXT NOT NULL,
  PRIMARY KEY (query, page)
);
CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id INTEGER NOT NULL REFERENCES drafts(id),
  number INTEGER NOT NULL,
  file TEXT NOT NULL, subject TEXT,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending, sent
  created_at TEXT NOT NULL, sent_at TEXT,
  UNIQUE (draft_id, number)
);
CREATE TABLE IF NOT EXISTS unsubscribed (
  value TEXT PRIMARY KEY,   -- email or domain
  at TEXT NOT NULL, reason TEXT
);
"""


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB, timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(SCHEMA)
    return con


def out(obj):
    print(json.dumps(obj, ensure_ascii=False, indent=2))


def norm_domain(v):
    if not v:
        return None
    v = v.strip().lower()
    if "@" in v:
        v = v.split("@", 1)[1]
    if "://" not in v:
        v = "http://" + v
    host = urlparse(v).hostname or ""
    host = re.sub(r"^www\d?\.", "", host)
    return host or None


def norm_email(v):
    if not v:
        return None
    v = v.strip().lower()
    return v if re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", v) else None


def add_link(current, link):
    """Adds a "label=url" pair to a JSON object of public links (website, LinkedIn page, X, Facebook...)."""
    links = json.loads(current or "{}")
    if link:
        label, _, url = link.partition("=")
        if not url:
            label, url = urlparse(label).hostname or "link", label
        links[label.strip().lower()] = url.strip()
    return json.dumps(links, ensure_ascii=False)


def is_unsubscribed(con, email=None, domain=None):
    for val in (email, domain):
        if val and con.execute("SELECT 1 FROM unsubscribed WHERE value = ?", (val,)).fetchone():
            return True
    return False


def find_company(con, domain=None, place_id=None, registry_id=None, name=None, city=None):
    """The existing company that matches on website, Google Maps place, registration number, or name + city."""
    return con.execute("""SELECT id, name, city, domain, status FROM companies
                          WHERE (domain IS NOT NULL AND domain = ?) OR (place_id IS NOT NULL AND place_id = ?)
                             OR (registry_id IS NOT NULL AND registry_id = ?)
                             OR (lower(name) = lower(?) AND lower(COALESCE(city, '')) = lower(COALESCE(?, '')))""",
                       (domain, place_id, registry_id, name, city)).fetchone()


def company_exists(con, cid):
    return con.execute("SELECT 1 FROM companies WHERE id = ?", (cid,)).fetchone() is not None


# ---------------------------------------------------------------- commands

def cmd_init(a):
    connect().close()
    out({"ok": True, "database": str(DB)})


def cmd_add_company(a):
    con = connect()
    domain = norm_domain(a.domain)
    if is_unsubscribed(con, domain=domain):
        return out({"result": "REFUSED", "reason": "domain unsubscribed"})
    existing = find_company(con, domain, a.place_id, a.registry_id, a.name.strip(), a.city)
    if existing:
        return out({"result": "ALREADY EXISTS", "company": dict(existing)})
    values = {k: getattr(a, k) for k in COMPANY_FIELDS}
    values["domain"] = domain
    cur = con.execute(f"""INSERT INTO companies (name, {', '.join(COMPANY_FIELDS)}, added_at, updated_at)
                          VALUES ({', '.join('?' * (len(COMPANY_FIELDS) + 3))})""",
                      (a.name.strip(), *values.values(), now(), now()))
    con.commit()
    out({"result": "ADDED", "company_id": cur.lastrowid})


def cmd_update_company(a):
    con = connect()
    if not company_exists(con, a.id):
        return out({"result": "NOT FOUND", "company_id": a.id})
    fields = {}
    if a.status:
        if a.status not in COMPANY_STATUSES:
            return out({"result": "REFUSED", "reason": f"unknown status, expected: {COMPANY_STATUSES}"})
        fields["status"] = a.status
        if a.status == "enriched":
            fields["enriched_at"] = now()
    if a.domain:
        d = norm_domain(a.domain)
        other = con.execute("SELECT id FROM companies WHERE domain = ? AND id != ?", (d, a.id)).fetchone()
        if other:
            return out({"result": "REFUSED", "reason": f"domain already used by company {other['id']}"})
        fields["domain"] = d
    for k in ("hook", "debrief", "notes", "headcount", "city", "address", "phone", "category", "registry_id", "created_on"):
        if getattr(a, k):
            fields[k] = getattr(a, k)
    if a.link:
        fields["links"] = add_link(con.execute("SELECT links FROM companies WHERE id = ?", (a.id,)).fetchone()[0], a.link)
    if not fields:
        return out({"result": "NOTHING TO DO"})
    fields["updated_at"] = now()
    con.execute(f"UPDATE companies SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), a.id))
    con.commit()
    out({"result": "UPDATED", "company_id": a.id, "fields": list(fields)})


def cmd_add_contact(a):
    con = connect()
    email = norm_email(a.email)
    if a.email and not email:
        return out({"result": "REFUSED", "reason": "invalid email"})
    if not company_exists(con, a.company_id):
        return out({"result": "REFUSED", "reason": "unknown company: add it first"})
    if is_unsubscribed(con, email=email, domain=norm_domain(email)):
        return out({"result": "REFUSED", "reason": "contact or domain unsubscribed"})
    name = " ".join(a.name.split()).title()
    existing = con.execute("SELECT id, name, email, status FROM contacts WHERE (email IS NOT NULL AND email = ?) OR (company_id = ? AND name = ?)",
                           (email, a.company_id, name)).fetchone()
    if existing:
        if email and not existing["email"]:
            con.execute("UPDATE contacts SET email = ?, email_source = ? WHERE id = ?", (email, a.email_source, existing["id"]))
            con.commit()
            return out({"result": "EMAIL ADDED TO EXISTING CONTACT", "contact_id": existing["id"]})
        return out({"result": "ALREADY EXISTS", "contact": dict(existing)})
    cur = con.execute("""INSERT INTO contacts (company_id, name, role, email, email_source, phone, linkedin, links, source, added_at)
                         VALUES (?,?,?,?,?,?,?,?,?,?)""",
                      (a.company_id, name, a.role, email, a.email_source, a.phone, a.linkedin, add_link(None, a.link), a.source, now()))
    con.commit()
    out({"result": "ADDED", "contact_id": cur.lastrowid})


def cmd_update_contact(a):
    con = connect()
    fields = {}
    if a.status:
        if a.status not in CONTACT_STATUSES:
            return out({"result": "REFUSED", "reason": f"unknown status, expected: {CONTACT_STATUSES}"})
        fields["status"] = a.status
    if a.email:
        e = norm_email(a.email)
        if not e:
            return out({"result": "REFUSED", "reason": "invalid email"})
        if con.execute("SELECT 1 FROM contacts WHERE email = ? AND id != ?", (e, a.id)).fetchone():
            return out({"result": "REFUSED", "reason": "email already assigned to another contact"})
        fields["email"], fields["email_source"] = e, a.email_source
    for k in ("role", "phone", "linkedin"):
        if getattr(a, k):
            fields[k] = getattr(a, k)
    if a.link:
        row = con.execute("SELECT links FROM contacts WHERE id = ?", (a.id,)).fetchone()
        if not row:
            return out({"result": "NOT FOUND", "contact_id": a.id})
        fields["links"] = add_link(row[0], a.link)
    if not fields:
        return out({"result": "NOTHING TO DO"})
    con.execute(f"UPDATE contacts SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?", (*fields.values(), a.id))
    con.commit()
    out({"result": "UPDATED", "contact_id": a.id})


def cmd_add_draft(a):
    con = connect()
    c = con.execute("SELECT * FROM contacts WHERE id = ?", (a.contact_id,)).fetchone()
    if not c:
        return out({"result": "REFUSED", "reason": "unknown contact"})
    if not c["email"]:
        return out({"result": "REFUSED", "reason": "no verified email for this contact"})
    if is_unsubscribed(con, email=c["email"], domain=norm_domain(c["email"])):
        return out({"result": "REFUSED", "reason": "contact unsubscribed"})
    if con.execute("SELECT 1 FROM drafts WHERE contact_id = ?", (a.contact_id,)).fetchone():
        return out({"result": "ALREADY EXISTS", "reason": "this contact already has a prepared or sent email"})
    day = datetime.now().strftime("%Y-%m-%d")
    n = con.execute("SELECT COUNT(*) FROM drafts WHERE created_at LIKE ?", (day + "%",)).fetchone()[0]
    if a.max_per_day and n >= a.max_per_day:
        return out({"result": "REFUSED", "reason": f"daily limit reached ({a.max_per_day})"})
    con.execute("INSERT INTO drafts (company_id, contact_id, file, subject, created_at) VALUES (?,?,?,?,?)",
                (c["company_id"], a.contact_id, a.file, a.subject, now()))
    con.execute("UPDATE contacts SET status = 'draft' WHERE id = ?", (a.contact_id,))
    con.execute("UPDATE companies SET status = 'draft', updated_at = ? WHERE id = ?", (now(), c["company_id"]))
    con.commit()
    out({"result": "ADDED", "file": a.file})


def cmd_mark(a):
    """The human reports that an email was sent (sent) or that the prospect replied (replied)."""
    con = connect()
    d = con.execute("SELECT * FROM drafts WHERE id = ?", (a.draft_id,)).fetchone()
    if not d:
        return out({"result": "NOT FOUND"})
    if a.state == "sent":
        con.execute("UPDATE drafts SET status = 'sent', sent_at = COALESCE(sent_at, ?) WHERE id = ?", (now(), d["id"]))
    else:
        con.execute("UPDATE drafts SET status = 'replied', replied_at = ? WHERE id = ?", (now(), d["id"]))
    con.execute("UPDATE contacts SET status = ? WHERE id = ?", (a.state, d["contact_id"]))
    con.execute("UPDATE companies SET status = ?, updated_at = ? WHERE id = ?", (a.state, now(), d["company_id"]))
    con.commit()
    out({"result": "UPDATED", "draft_id": d["id"], "state": a.state})


def last_touch(con, d):
    r = con.execute("SELECT MAX(COALESCE(sent_at, created_at)) d FROM followups WHERE draft_id = ?", (d["id"],)).fetchone()
    return r["d"] or d["sent_at"]


def cmd_due_followups(a):
    """Sent emails with no reply, last touched at least N days ago, and under the follow-up cap."""
    con = connect()
    cutoff = (datetime.now() - timedelta(days=a.days)).strftime("%Y-%m-%d %H:%M")
    res = []
    for d in con.execute("""SELECT d.*, c.name contact, c.email, c.role, co.name company, co.hook FROM drafts d
                            JOIN contacts c ON c.id = d.contact_id JOIN companies co ON co.id = d.company_id
                            WHERE d.status = 'sent' AND d.replied_at IS NULL"""):
        n = con.execute("SELECT COUNT(*) FROM followups WHERE draft_id = ?", (d["id"],)).fetchone()[0]
        waiting = con.execute("SELECT COUNT(*) FROM followups WHERE draft_id = ? AND status = 'pending'", (d["id"],)).fetchone()[0]
        t = last_touch(con, d)
        if n < a.max and not waiting and t and t <= cutoff and not is_unsubscribed(con, email=d["email"], domain=norm_domain(d["email"])):
            r = dict(d); r["followups_done"] = n; r["last_touch"] = t
            res.append(r)
    out(res[: a.limit])


def cmd_add_followup(a):
    con = connect()
    d = con.execute("SELECT d.*, c.email FROM drafts d JOIN contacts c ON c.id = d.contact_id WHERE d.id = ?", (a.draft_id,)).fetchone()
    if not d:
        return out({"result": "REFUSED", "reason": "unknown original email"})
    if d["status"] != "sent" or d["replied_at"]:
        return out({"result": "REFUSED", "reason": "the original email was not sent, or the prospect already replied"})
    if is_unsubscribed(con, email=d["email"], domain=norm_domain(d["email"])):
        return out({"result": "REFUSED", "reason": "contact unsubscribed"})
    n = con.execute("SELECT COUNT(*) FROM followups WHERE draft_id = ?", (d["id"],)).fetchone()[0]
    if n >= a.max:
        return out({"result": "REFUSED", "reason": f"cap of {a.max} follow-ups reached"})
    if con.execute("SELECT 1 FROM followups WHERE draft_id = ? AND status = 'pending'", (d["id"],)).fetchone():
        return out({"result": "ALREADY EXISTS", "reason": "a follow-up is already waiting for approval"})
    con.execute("INSERT INTO followups (draft_id, number, file, subject, created_at) VALUES (?,?,?,?,?)",
                (d["id"], n + 1, a.file, a.subject, now()))
    con.commit()
    out({"result": "ADDED", "number": n + 1, "file": a.file})


def cmd_followup_sent(a):
    con = connect()
    con.execute("UPDATE followups SET status = 'sent', sent_at = ? WHERE id = ?", (now(), a.id))
    con.commit()
    out({"result": "UPDATED", "followup_id": a.id})


def with_contacts(con, rows):
    for r in rows:
        r["contacts"] = [dict(c) for c in con.execute("SELECT * FROM contacts WHERE company_id = ?", (r["id"],))]
    return rows


def cmd_list(a):
    con = connect()
    sql, params = "SELECT * FROM companies WHERE 1=1", []
    if a.status:
        sql += " AND status = ?"; params.append(a.status)
    if a.stale:
        sql += " AND status = 'enriched' AND enriched_at < ?"
        params.append((datetime.now() - timedelta(days=180)).strftime("%Y-%m-%d"))
    sql += " ORDER BY added_at LIMIT ?"; params.append(a.limit)
    out(with_contacts(con, [dict(r) for r in con.execute(sql, params)]))


def cmd_record(a):
    con = connect()
    co = con.execute("SELECT * FROM companies WHERE id = ?", (a.id,)).fetchone()
    if not co:
        return out({"result": "NOT FOUND"})
    r = with_contacts(con, [dict(co)])[0]
    r["drafts"] = [dict(d) for d in con.execute("SELECT * FROM drafts WHERE company_id = ?", (a.id,))]
    out(r)


def cmd_exists(a):
    con = connect()
    dom = norm_domain(a.domain)
    row = find_company(con, dom, a.place_id, a.registry_id, a.name, a.city) if (dom or a.place_id or a.registry_id or a.name) else None
    out({"exists": bool(row), "company": dict(row) if row else None, "unsubscribed": is_unsubscribed(con, domain=dom)})


def cmd_search_log(a):
    con = connect()
    con.execute("INSERT OR REPLACE INTO searches VALUES (?,?,?,?,?)", (a.query, a.page, a.results, a.useful, now()))
    con.commit()
    out({"result": "LOGGED"})


def cmd_search_state(a):
    con = connect()
    rows = [dict(r) for r in con.execute("SELECT * FROM searches WHERE query = ? ORDER BY page", (a.query,))]
    last = rows[-1]["page"] if rows else 0
    out({"query": a.query, "pages_done": [r["page"] for r in rows], "next_page": last + 1,
         "results_seen": sum(r["results"] or 0 for r in rows), "useful_total": sum(r["useful"] or 0 for r in rows), "history": rows})


def cmd_searches(a):
    con = connect()
    out([dict(r) for r in con.execute(
        "SELECT query, COUNT(*) pages, MAX(page) last_page, SUM(results) results, SUM(useful) useful, MAX(done_at) last_time "
        "FROM searches GROUP BY query ORDER BY last_time DESC")])


def cmd_unsubscribe(a):
    con = connect()
    val = norm_email(a.value) or norm_domain(a.value)
    con.execute("INSERT OR IGNORE INTO unsubscribed VALUES (?,?,?)", (val, now(), a.reason))
    con.execute("UPDATE contacts SET status = 'rejected' WHERE email = ? OR email LIKE ?", (val, "%@" + val))
    con.commit()
    out({"result": "UNSUBSCRIBED", "value": val})


def cmd_stats(a):
    con = connect()
    day = datetime.now().strftime("%Y-%m-%d")
    out({
        "companies_by_status": {r[0]: r[1] for r in con.execute("SELECT status, COUNT(*) FROM companies GROUP BY status")},
        "contacts": con.execute("SELECT COUNT(*) FROM contacts").fetchone()[0],
        "contacts_with_email": con.execute("SELECT COUNT(*) FROM contacts WHERE email IS NOT NULL").fetchone()[0],
        "drafts_by_status": {r[0]: r[1] for r in con.execute("SELECT status, COUNT(*) FROM drafts GROUP BY status")},
        "drafts_today": con.execute("SELECT COUNT(*) FROM drafts WHERE created_at LIKE ?", (day + "%",)).fetchone()[0],
        "companies_added_today": con.execute("SELECT COUNT(*) FROM companies WHERE added_at LIKE ?", (day + "%",)).fetchone()[0],
        "distinct_searches": con.execute("SELECT COUNT(DISTINCT query) FROM searches").fetchone()[0],
        "followups_by_status": {r[0]: r[1] for r in con.execute("SELECT status, COUNT(*) FROM followups GROUP BY status")},
        "unsubscribed": con.execute("SELECT COUNT(*) FROM unsubscribed").fetchone()[0],
    })


def cmd_log(a):
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"- {now()} · **{a.agent}** · {a.text}\n")
    out({"result": "LOGGED"})


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    s = p.add_subparsers(dest="cmd", required=True)

    s.add_parser("init")

    x = s.add_parser("add-company", epilog="Duplicates are detected on --domain, --place-id, --registry-id, or --name + --city.")
    x.add_argument("--name", required=True)
    for k in COMPANY_FIELDS:
        x.add_argument("--" + k.replace("_", "-"))

    x = s.add_parser("update-company", epilog='--link "label=url" adds a public link, e.g. --link "linkedin=https://..."')
    x.add_argument("--id", type=int, required=True)
    for k in ("status", "domain", "hook", "debrief", "notes", "headcount", "city", "address", "phone", "category", "registry-id", "created-on", "link"):
        x.add_argument("--" + k)

    x = s.add_parser("add-contact")
    x.add_argument("--company-id", type=int, required=True); x.add_argument("--name", required=True)
    for k in ("role", "email", "email-source", "phone", "linkedin", "link", "source"):
        x.add_argument("--" + k)

    x = s.add_parser("update-contact", epilog='--link "label=url" adds a public link, e.g. --link "x=https://x.com/..."')
    x.add_argument("--id", type=int, required=True)
    for k in ("status", "email", "email-source", "role", "phone", "linkedin", "link"):
        x.add_argument("--" + k)

    x = s.add_parser("add-draft")
    x.add_argument("--contact-id", type=int, required=True); x.add_argument("--file", required=True)
    x.add_argument("--subject"); x.add_argument("--max-per-day", type=int, default=20)

    x = s.add_parser("mark")
    x.add_argument("--draft-id", type=int, required=True); x.add_argument("--state", choices=["sent", "replied"], required=True)
    x = s.add_parser("due-followups")
    x.add_argument("--days", type=int, default=2); x.add_argument("--max", type=int, default=2); x.add_argument("--limit", type=int, default=10)
    x = s.add_parser("add-followup")
    x.add_argument("--draft-id", type=int, required=True); x.add_argument("--file", required=True)
    x.add_argument("--subject"); x.add_argument("--max", type=int, default=2)
    x = s.add_parser("followup-sent"); x.add_argument("--id", type=int, required=True)

    x = s.add_parser("list")
    x.add_argument("--status"); x.add_argument("--limit", type=int, default=10)
    x.add_argument("--stale", action="store_true")

    x = s.add_parser("record"); x.add_argument("--id", type=int, required=True)
    x = s.add_parser("exists")
    for k in ("domain", "place-id", "registry-id", "name", "city"):
        x.add_argument("--" + k)

    x = s.add_parser("search-log")
    x.add_argument("--query", required=True); x.add_argument("--page", type=int, required=True)
    x.add_argument("--results", type=int, default=0); x.add_argument("--useful", type=int, default=0)
    x = s.add_parser("search-state"); x.add_argument("--query", required=True)
    s.add_parser("searches")

    x = s.add_parser("unsubscribe"); x.add_argument("--value", required=True); x.add_argument("--reason")
    s.add_parser("stats")
    x = s.add_parser("log"); x.add_argument("--agent", required=True); x.add_argument("--text", required=True)

    a = p.parse_args()
    fn = globals()["cmd_" + a.cmd.replace("-", "_")]
    try:
        fn(a)
    except sqlite3.IntegrityError as e:
        out({"result": "REFUSED", "reason": f"duplicate blocked by the database: {e}"})
        sys.exit(0)


if __name__ == "__main__":
    main()
