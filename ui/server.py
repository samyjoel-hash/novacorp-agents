#!/usr/bin/env python3
"""NovaCorp agents server: CRM (home page), 3D campus, chat with the Manager and live activity.

Start:  python3 ui/server.py   then open http://127.0.0.1:8770
Listens on the local computer only (127.0.0.1); set HOST=0.0.0.0 to open it to the network.
Online: PASSWORD is required (username "novacorp"), otherwise the server refuses to start.

Every Claude Code run (chat or cycle) runs in the background; everything it does
(Manager decisions, missions handed out, tools used by each subagent, reports)
is recorded as a stream of events that the pages read continuously (/api/events).
An external timer can start a cycle with:  curl -X POST http://127.0.0.1:8770/api/cycle

Follow-up watcher: every 30 minutes the server checks (for free, no Claude call) whether sent emails have
gone unanswered for the delay set in config/target.md; if so it starts a cycle so the follow-up agent
prepares them. Turn it off with AUTO_FOLLOWUP=0.
"""
import base64
import hmac
import json
import os
import re
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
UI = Path(__file__).resolve().parent


sys.path.insert(0, str(ROOT / "tools"))
import env  # noqa: E402 — private settings (API keys), shared with the agents' tools

env.load()
DB = ROOT / "data" / "novacorp.db"
EVENTS_FILE = ROOT / "logs" / "events.jsonl"
CLAUDE = os.environ.get("CLAUDE_BIN", str(Path.home() / ".local" / "bin" / "claude"))
HOST, PORT = os.environ.get("HOST", "127.0.0.1"), int(os.environ.get("PORT", "8770"))
PASSWORD = os.environ.get("PASSWORD", "")
AUTO_FOLLOWUP = os.environ.get("AUTO_FOLLOWUP", "1") != "0"

state = {"session_id": None, "busy": False, "proc": None, "run": None}
lock = threading.Lock()
events, next_id = [], 1


# ------------------------------------------------------------------ events

def push(ev):
    global next_id
    with lock:
        ev["id"], ev["ts"] = next_id, datetime.now().strftime("%H:%M:%S")
        next_id += 1
        events.append(ev)
        del events[:-3000]
    EVENTS_FILE.parent.mkdir(exist_ok=True)
    with open(EVENTS_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(ev, ensure_ascii=False) + "\n")


def load_history():
    global next_id
    if EVENTS_FILE.exists():
        for line in EVENTS_FILE.read_text(encoding="utf-8").splitlines()[-600:]:
            try:
                events.append(json.loads(line))
            except ValueError:
                pass
        next_id = (events[-1]["id"] + 1) if events else 1
        for e in reversed(events):            # resume the conversation where it left off
            if e.get("session_id"):
                state["session_id"] = e["session_id"]; break


def translate(line, names, run):
    """Turns one Claude Code stream-json line into readable events."""
    try:
        ev = json.loads(line)
    except ValueError:
        return [{"kind": "info", "who": "system", "text": line.strip()[:300]}] if line.strip() else []
    out, parent, t = [], ev.get("parent_tool_use_id"), ev.get("type")
    who = names.get(parent, "subagent") if parent else "Manager"
    if t == "system" and ev.get("subtype") == "init":
        state["session_id"] = ev.get("session_id")
    elif t == "assistant":
        for b in ev.get("message", {}).get("content", []):
            if b.get("type") == "text" and b.get("text", "").strip():
                out.append({"kind": "text", "who": who, "text": b["text"]})
            elif b.get("type") == "tool_use":
                i = b.get("input", {}) or {}
                if b["name"] in ("Task", "Agent"):
                    names[b["id"]] = i.get("subagent_type") or "subagent"
                    out.append({"kind": "delegate", "who": who, "agent": names[b["id"]],
                                "text": i.get("description") or "", "mission": (i.get("prompt") or "")[:2000]})
                else:
                    detail = i.get("command") or i.get("query") or i.get("url") or i.get("file_path") or i.get("pattern") or ""
                    out.append({"kind": "tool", "who": who, "tool": b["name"], "text": str(detail)[:240]})
    elif t == "user":
        content = ev.get("message", {}).get("content")
        for b in content if isinstance(content, list) else []:
            if b.get("type") == "tool_result" and b.get("tool_use_id") in names:
                c = b.get("content")
                txt = c if isinstance(c, str) else " ".join(x.get("text", "") for x in (c or []) if isinstance(x, dict))
                out.append({"kind": "report", "who": names[b["tool_use_id"]], "text": txt[:3000]})
    elif t == "result":
        out.append({"kind": "done", "who": "Manager", "text": ev.get("result") or "", "cost": ev.get("total_cost_usd"),
                    "duration": round((ev.get("duration_ms") or 0) / 1000), "error": ev.get("is_error"),
                    "session_id": ev.get("session_id")})
    for o in out:
        o["run"] = run
    return out


FORBIDDEN = [
    "Edit(tools/**)", "Write(tools/**)", "Edit(.claude/**)", "Write(.claude/**)",
    "Edit(data/novacorp.db)", "Write(data/novacorp.db)",
    "Bash(sqlite3:*)", "Bash(sudo:*)", "Bash(rm -rf:*)", "Bash(git push:*)",
]


def run_claude(message, run_kind, who="you"):
    """Starts Claude Code in the background; returns False if a job is already running."""
    with lock:
        if state["busy"]:
            return False
        state["busy"] = True
    run = f"{run_kind}-{int(time.time())}"
    state["run"] = run
    push({"kind": "user" if run_kind == "chat" else "start", "who": who, "text": message, "run": run})

    def worker():
        # Full autonomy: no permission prompts, but the forbidden list below stays blocked
        # (passed on the command line so it applies even if the folder is not yet "trusted").
        cmd = [CLAUDE, "-p", message, "--output-format", "stream-json", "--verbose",
               "--permission-mode", "bypassPermissions", "--disallowedTools", *FORBIDDEN]
        if state["session_id"] and run_kind == "chat":
            cmd += ["--resume", state["session_id"]]
        names = {}
        try:
            proc = subprocess.Popen(cmd, cwd=ROOT, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            state["proc"] = proc
            for line in proc.stdout:
                for e in translate(line, names, run):
                    push(e)
            proc.wait()
        except Exception as exc:                       # noqa: BLE001 — surface the error in the UI
            push({"kind": "done", "who": "Manager", "text": f"Error: {exc}", "error": True, "run": run})
        finally:
            state["busy"], state["proc"], state["run"] = False, None, None

    threading.Thread(target=worker, daemon=True).start()
    return True


# ------------------------------------------------------------------ database

def q(sql, params=()):
    if not DB.exists():
        return []
    con = sqlite3.connect(DB, timeout=10)
    con.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in con.execute(sql, params)]
    except sqlite3.OperationalError:
        return []
    finally:
        con.close()


def one(sql, params=()):
    r = q(sql, params)
    return list(r[0].values())[0] if r else 0


def log_text():
    f = ROOT / "data" / "log.md"
    return f.read_text(encoding="utf-8") if f.exists() else ""


def recent_activity(window=120):
    seen = {}
    for line in log_text().splitlines()[-40:]:
        m = re.match(r"- (\d{4}-\d\d-\d\d \d\d:\d\d) · \*\*(.+?)\*\*", line)
        if m:
            age = (datetime.now() - datetime.strptime(m.group(1), "%Y-%m-%d %H:%M")).total_seconds()
            if age < window:
                seen[m.group(2)] = int(age)
    return [{"agent": a, "age": s} for a, s in seen.items()]


def stats():
    by_status = {r["status"]: r["n"] for r in q("SELECT status, COUNT(*) n FROM companies GROUP BY status")}
    return {
        "companies": sum(by_status.values()), "by_status": by_status,
        "contacts": one("SELECT COUNT(*) FROM contacts"),
        "emails": one("SELECT COUNT(*) FROM contacts WHERE email IS NOT NULL"),
        "drafts": one("SELECT COUNT(*) FROM drafts"),
        "sent": one("SELECT COUNT(*) FROM drafts WHERE status IN ('sent','replied')"),
        "replied": one("SELECT COUNT(*) FROM drafts WHERE status = 'replied'"),
        "followups": one("SELECT COUNT(*) FROM followups"),
        "decisions": log_text().count("**Manager**"),
        "searches": q("SELECT query, COUNT(*) pages, SUM(results) seen, SUM(useful) useful FROM searches GROUP BY query"),
        "recent": recent_activity(),
        "busy": state["busy"], "session": bool(state["session_id"]),
    }


def companies():
    rows = q("SELECT * FROM companies ORDER BY updated_at DESC LIMIT 200")
    for r in rows:
        r["contacts"] = q("SELECT name, role, email, email_source, status FROM contacts WHERE company_id = ?", (r["id"],))
    return rows


def read(file):
    f = ROOT / (file or "")
    return f.read_text(encoding="utf-8") if file and f.is_file() else "(file not found)"


def drafts():
    rows = q("SELECT d.*, c.name contact, c.email, co.name company FROM drafts d "
             "JOIN contacts c ON c.id = d.contact_id JOIN companies co ON co.id = d.company_id ORDER BY d.created_at DESC")
    for r in rows:
        r["content"] = read(r["file"])
    return rows


def followups():
    rows = q("SELECT f.*, co.name company, c.name contact, c.email FROM followups f JOIN drafts d ON d.id = f.draft_id "
             "JOIN contacts c ON c.id = d.contact_id JOIN companies co ON co.id = d.company_id ORDER BY f.created_at DESC")
    for r in rows:
        r["content"] = read(r["file"])
    return rows


def crm():
    """One row per prospect (contact), with the company and where the outreach stands."""
    return q("""SELECT c.id, c.name, c.role, c.email, c.status, c.added_at, co.id company_id, co.name company, co.city,
                       co.status company_status, co.added_at scraped_at, d.status email_status, d.sent_at, d.replied_at,
                       (SELECT COUNT(*) FROM followups f WHERE f.draft_id = d.id) followups
                FROM contacts c JOIN companies co ON co.id = c.company_id
                LEFT JOIN drafts d ON d.contact_id = c.id
                ORDER BY co.added_at DESC, c.id""")


def crm_contact(cid):
    rows = q("SELECT * FROM contacts WHERE id = ?", (cid,))
    if not rows:
        return {"error": "not found"}
    c = rows[0]
    co = (q("SELECT * FROM companies WHERE id = ?", (c["company_id"],)) or [{}])[0]
    for r in (c, co):
        try:
            r["links"] = json.loads(r.get("links") or "{}")
        except ValueError:
            r["links"] = {}
    drafts_ = q("SELECT * FROM drafts WHERE contact_id = ?", (cid,))
    for d in drafts_:
        d["content"] = read(d["file"])
        d["followups"] = q("SELECT * FROM followups WHERE draft_id = ? ORDER BY number", (d["id"],))
        for f in d["followups"]:
            f["content"] = read(f["file"])
    names = [n for n in (co.get("name"), co.get("domain")) if n]
    history = [l[2:] for l in log_text().splitlines() if l.startswith("- ") and any(n.lower() in l.lower() for n in names)]
    return {"contact": c, "company": co, "colleagues": q("SELECT id, name, role, email FROM contacts WHERE company_id = ? AND id != ?", (c["company_id"], cid)),
            "drafts": drafts_, "history": history[-30:],
            "followup_days": target_setting("Follow up after", 2), "followup_max": target_setting("Maximum number of follow-ups", 2)}


def target_setting(label, default):
    f = ROOT / "config" / "target.md"
    m = re.search(re.escape(label) + r"[^:]*\*\*:\s*(\d+)", f.read_text(encoding="utf-8")) if f.exists() else None
    return int(m.group(1)) if m else default


def followup_watcher():
    """Starts a cycle when follow-ups are due, at most once every 6 hours for the same prospects."""
    last = {"ids": None, "at": 0}
    while True:
        try:
            days = target_setting("Follow up after", 2)
            mx = target_setting("Maximum number of follow-ups", 2)
            due = db_cli("due-followups", "--days", str(days), "--max", str(mx))
            ids = sorted(d["id"] for d in due) if isinstance(due, list) else []
            fresh = ids != last["ids"] or time.time() - last["at"] > 6 * 3600
            if ids and fresh and not state["busy"]:
                if run_claude(f"/cycle {len(ids)} prospect(s) have not replied for {days} days: delegate the follow-ups to follow-up first.",
                              "cycle", who="system"):
                    last.update(ids=ids, at=time.time())
        except Exception as exc:                       # noqa: BLE001 — the watcher must never die
            push({"kind": "info", "who": "system", "text": f"Follow-up watcher error: {exc}"})
        time.sleep(1800)


# ------------------------------------------------------------------ settings (API keys)

KEY_HELP = {
    "ANTHROPIC_API_KEY": "https://console.anthropic.com/settings/keys",
    "APIFY_TOKEN": "https://console.apify.com/settings/integrations",
    "SCRAPINGBEE_API_KEY": "https://app.scrapingbee.com/account/manage/api_key",
}


def settings():
    """Which keys are set, masked: a full key is never sent back to the browser."""
    keys = [{"name": k, "label": label, "help": KEY_HELP[k], "set": bool(os.environ.get(k)), "masked": env.masked(os.environ.get(k, ""))}
            for k, label in env.KEYS.items()]
    return {"keys": keys, "claude_mode": "api_key" if os.environ.get("ANTHROPIC_API_KEY") else "subscription"}


def http_get(url, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": "NovaCorp-agents/1.0", **(headers or {})})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def test_key(name):
    """Makes the cheapest possible call to check that a key works (no agent run, no scraping)."""
    key = os.environ.get(name, "")
    if not key:
        return {"ok": False, "detail": "No key saved."}
    try:
        if name == "ANTHROPIC_API_KEY":
            d = http_get("https://api.anthropic.com/v1/models?limit=1", {"x-api-key": key, "anthropic-version": "2023-06-01"})
            return {"ok": True, "detail": "Key accepted by Anthropic." + (f" Model available: {d['data'][0]['id']}." if d.get("data") else "")}
        if name == "APIFY_TOKEN":
            d = http_get("https://api.apify.com/v2/users/me", {"Authorization": f"Bearer {key}"}).get("data", {})
            return {"ok": True, "detail": f"Connected to Apify as {d.get('username', '?')}."}
        if name == "SCRAPINGBEE_API_KEY":
            d = http_get("https://app.scrapingbee.com/api/v1/usage?" + urllib.parse.urlencode({"api_key": key}))
            left = (d.get("max_api_credit") or 0) - (d.get("used_api_credit") or 0)
            return {"ok": True, "detail": f"Connected to ScrapingBee: {left} credits left."}
    except urllib.error.HTTPError as e:
        return {"ok": False, "detail": "Key refused (invalid or revoked)." if e.code in (401, 403) else f"The service answered {e.code}."}
    except (urllib.error.URLError, TimeoutError) as e:
        return {"ok": False, "detail": f"Service unreachable: {getattr(e, 'reason', e)}"}
    return {"ok": False, "detail": "Unknown key."}


def db_cli(*args):
    r = subprocess.run(["python3", str(ROOT / "tools" / "db.py"), *args], cwd=ROOT, capture_output=True, text=True)
    try:
        return json.loads(r.stdout)
    except ValueError:
        return {"result": "ERROR", "reason": (r.stderr or r.stdout)[-300:]}


# ------------------------------------------------------------------ HTTP

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        if not PASSWORD:
            return True
        expected = "Basic " + base64.b64encode(f"novacorp:{PASSWORD}".encode()).decode()
        if hmac.compare_digest(self.headers.get("Authorization", ""), expected):
            return True
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="NovaCorp"')
        self.send_header("Content-Length", "0")
        self.end_headers()
        return False

    def do_GET(self):
        if not self.authorized():
            return
        u = urlparse(self.path)
        if u.path == "/api/events":
            since = int(parse_qs(u.query).get("since", ["0"])[0] or 0)
            with lock:
                new = [e for e in events if e["id"] > since][-800:]
            return self.send_json({"events": new, "busy": state["busy"], "run": state["run"]})
        routes = {"/api/stats": stats, "/api/companies": companies, "/api/drafts": drafts,
                  "/api/followups": followups, "/api/log": lambda: {"text": log_text()}, "/api/crm": crm, "/api/settings": settings}
        if u.path == "/api/crm/contact":
            return self.send_json(crm_contact(int(parse_qs(u.query).get("id", ["0"])[0] or 0)))
        if u.path in routes:
            return self.send_json(routes[u.path]())
        pages = {"/": "crm.html", "/crm": "crm.html", "/campus": "campus.html",
                 **{f"/static/{f}": f for f in ("crm.js", "crm.css", "campus.js", "campus.css")}}   # closed list: nothing else is served
        if u.path in pages:
            body = (UI / pages[u.path]).read_bytes()
            kind = {"html": "text/html", "js": "text/javascript", "css": "text/css"}[pages[u.path].rsplit(".", 1)[1]]
            self.send_response(200)
            self.send_header("Content-Type", f"{kind}; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return self.wfile.write(body)
        self.send_json({"error": "not found"}, 404)

    def same_origin(self):
        """Blocks requests sent by other websites open in the browser (CSRF): only JSON from this page is accepted."""
        origin = self.headers.get("Origin")
        if origin and urlparse(origin).netloc != self.headers.get("Host"):
            return False
        return (self.headers.get("Content-Type") or "").startswith("application/json")

    def do_POST(self):
        if not self.authorized():
            return
        if not self.same_origin():
            return self.send_json({"error": "forbidden"}, 403)
        n = int(self.headers.get("Content-Length") or 0)
        try:
            data = json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            data = {}
        p = urlparse(self.path).path
        if p in ("/api/chat", "/api/cycle"):
            msg = ("/cycle " + (data.get("instruction") or "")).strip() if p == "/api/cycle" else (data.get("message") or "").strip()
            if not msg:
                return self.send_json({"error": "empty message"}, 400)
            if not run_claude(msg, "cycle" if p == "/api/cycle" else "chat"):
                return self.send_json({"error": "The agents are already working: wait for them to finish or click Stop."}, 409)
            return self.send_json({"ok": True})
        if p == "/api/settings":
            if data.get("name") not in env.KEYS:
                return self.send_json({"error": "unknown key"}, 400)
            try:
                env.save(data["name"], data.get("value", ""))
            except ValueError as e:
                return self.send_json({"error": str(e)}, 400)
            return self.send_json(settings())
        if p == "/api/settings/test":
            return self.send_json(test_key(data.get("name")))
        if p == "/api/stop":
            proc = state.get("proc")
            if proc and proc.poll() is None:
                proc.terminate()
                push({"kind": "info", "who": "system", "text": "Work stopped at your request."})
            return self.send_json({"ok": True})
        if p == "/api/new":
            state["session_id"] = None
            push({"kind": "info", "who": "system", "text": "New conversation with the Manager.", "session_id": None})
            return self.send_json({"ok": True})
        if p == "/api/mark":            # the human: email sent / prospect replied / follow-up sent
            if data.get("followup_id"):
                return self.send_json(db_cli("followup-sent", "--id", str(int(data["followup_id"]))))
            state_ = data.get("state")
            if state_ not in ("sent", "replied"):
                return self.send_json({"error": "unknown state"}, 400)
            return self.send_json(db_cli("mark", "--draft-id", str(int(data.get("draft_id") or 0)), "--state", state_))
        self.send_json({"error": "not found"}, 404)


if __name__ == "__main__":
    if HOST not in ("127.0.0.1", "localhost") and not PASSWORD:
        raise SystemExit("Refused: server open to the network without PASSWORD.")
    load_history()
    if AUTO_FOLLOWUP:
        threading.Thread(target=followup_watcher, daemon=True).start()
    print(f"NovaCorp CRM: http://{HOST}:{PORT}   ·   Agents 3D campus: http://{HOST}:{PORT}/campus")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
