#!/usr/bin/env python3
"""Reads a company web page with ScrapingBee (handles JavaScript sites and anti-bot protection).

Returns the readable text of the page, plus what matters for prospecting, found in the page itself:
the published email addresses, phone links and social / professional profile links.

  python3 tools/webpage.py --url https://example.com/contact
  python3 tools/webpage.py --url https://example.com --render-js      # for sites built with JavaScript

Needs SCRAPINGBEE_API_KEY in the private environment. Do not use it on sites that forbid scraping (e.g. LinkedIn).
"""
import argparse
import html
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

import env

API = "https://app.scrapingbee.com/api/v1/"
SOCIAL = ("linkedin.com", "facebook.com", "instagram.com", "x.com", "twitter.com", "youtube.com", "tiktok.com")
BLOCKED = ("linkedin.com",)


def fetch(key, url, render_js):
    q = urllib.parse.urlencode({"api_key": key, "url": url, "render_js": "true" if render_js else "false"})
    with urllib.request.urlopen(API + "?" + q, timeout=120) as r:
        return r.read().decode("utf-8", errors="replace")


def extract(page):
    links = re.findall(r'href=["\']([^"\']+)["\']', page, re.I)
    emails = {m.lower() for m in re.findall(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", html.unescape(page))
              if not m.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"))}
    emails |= {l[7:].split("?")[0].lower() for l in links if l.lower().startswith("mailto:")}
    phones = sorted({urllib.parse.unquote(l[4:]) for l in links if l.lower().startswith("tel:")})
    social = sorted({l for l in links if any(s in l.lower() for s in SOCIAL)})
    text = re.sub(r"(?is)<(script|style|noscript|svg).*?</\1>", " ", page)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    return {"emails": sorted(emails), "phones": phones, "social_links": social, "text": re.sub(r"\s+", " ", text).strip()[:6000]}


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--url", required=True)
    p.add_argument("--render-js", action="store_true", help="render JavaScript (costs more ScrapingBee credits)")
    a = p.parse_args()
    if any(b in a.url.lower() for b in BLOCKED):
        print(json.dumps({"result": "REFUSED", "reason": "this site forbids scraping: record the URL only"}))
        sys.exit(1)
    key = env.require("SCRAPINGBEE_API_KEY")
    try:
        page = fetch(key, a.url, a.render_js)
    except urllib.error.HTTPError as e:
        print(json.dumps({"result": "ERROR", "reason": f"ScrapingBee answered {e.code}: {e.read().decode(errors='replace')[:300]}"}))
        sys.exit(1)
    except urllib.error.URLError as e:
        print(json.dumps({"result": "ERROR", "reason": f"ScrapingBee unreachable: {e.reason}"}))
        sys.exit(1)
    print(json.dumps({"url": a.url, **extract(page)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
