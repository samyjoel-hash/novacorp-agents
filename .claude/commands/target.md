---
description: Defines NovaCorp's offer and ideal customer with you, then prepares the search plan
---

Help the user fill in `config/target.md`. This file tells the agents **where to look**.

1. If `config/target.md` does not exist, copy `config/target.template.md` to it. Read `config/target.md`. Ask the questions **one at a time**, in plain English, with examples:
   - NovaCorp's offer, in one sentence, and the problem it solves;
   - the ideal customer: industry, countries and cities, size (number of employees, number of locations);
   - the role that makes the purchase decision (and a fallback role);
   - the signals showing a company needs the offer now;
   - the email tone and language, the signature, an optional booking link;
   - the limits: leads per cycle, drafts per day.
2. Turn the answers into concrete segments: a **search term** as people would type it in Google Maps
   (e.g. "restaurant", "dental clinic", "real estate agency") and a **location** ("Lyon, France").
3. Check the first segment with a small real call `python3 tools/companies.py --query ... --location ... --max 3`
   (it costs Apify credits: one segment is enough) and show the user what comes back.
4. Write `config/target.md` (replace every `TO FILL IN`), then the initial **search plan**
   in `data/strategy.md`: the ordered list of segments to explore (key `search term|location`).
5. Summarise for the user what the agents will look for and offer to run `/cycle`.
