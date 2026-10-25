#!/usr/bin/env python3
"""Finds companies with Apify (Google Maps scraper): works in any country and any industry.

Each result gives the company name, category, address, city, country, phone, website,
Google rating and number of reviews, and the Google Maps place id (used to block duplicates).

  python3 tools/companies.py --query "restaurant" --location "Lyon, France" --max 20
  python3 tools/companies.py --query "real estate agency" --location "Manchester, UK" --max 10 --skip 10

--skip N ignores the first N results, to continue a segment already explored (see db.py search-state).
Needs APIFY_TOKEN in the private environment. APIFY_ACTOR can point to another Google Maps actor.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

import env

DEFAULT_ACTOR = "compass~crawler-google-places"


def run_actor(token, actor, query, location, count, language):
    url = f"https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items?format=json&clean=true"
    body = {"searchStringsArray": [query], "locationQuery": location, "maxCrawledPlacesPerSearch": count,
            "language": language, "skipClosedPlaces": True}
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=300) as r:   # the actor runs while we wait (up to 5 minutes)
        return json.load(r)


def simplify(p):
    return {
        "name": p.get("title"),
        "category": p.get("categoryName"),
        "address": p.get("address"),
        "city": p.get("city"),
        "country": p.get("countryCode"),
        "phone": p.get("phone"),
        "website": p.get("website"),
        "rating": p.get("totalScore"),
        "reviews": p.get("reviewsCount"),
        "place_id": p.get("placeId"),
        "maps_url": p.get("url"),
        "permanently_closed": p.get("permanentlyClosed"),
    }


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--query", required=True, help='what to look for, e.g. "restaurant", "dentist", "real estate agency"')
    p.add_argument("--location", required=True, help='city/region and country, e.g. "Lyon, France"')
    p.add_argument("--max", type=int, default=20, help="number of new results wanted (default 20)")
    p.add_argument("--skip", type=int, default=0, help="results already seen in this segment")
    p.add_argument("--language", default="en")
    a = p.parse_args()
    token = env.require("APIFY_TOKEN")
    actor = os.environ.get("APIFY_ACTOR", DEFAULT_ACTOR)
    try:
        places = run_actor(token, actor, a.query, a.location, a.skip + a.max, a.language)
    except urllib.error.HTTPError as e:
        print(json.dumps({"result": "ERROR", "reason": f"Apify answered {e.code}: {e.read().decode(errors='replace')[:300]}"}))
        sys.exit(1)
    except urllib.error.URLError as e:
        print(json.dumps({"result": "ERROR", "reason": f"Apify unreachable: {e.reason}"}))
        sys.exit(1)
    results = [simplify(x) for x in places[a.skip:] if not x.get("permanentlyClosed")]
    print(json.dumps({"query": a.query, "location": a.location, "skipped": a.skip, "count": len(results),
                      "companies": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
