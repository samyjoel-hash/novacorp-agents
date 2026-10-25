---
description: Summary of the agents' activity and list of drafts to approve
---

Give the human a clear status update, without changing anything:
1. `python3 tools/db.py stats` and `python3 tools/db.py searches`.
2. The last 20 lines of `data/log.md`.
3. The list of drafts to approve in `emails/drafts/` (recipient, company, subject).
4. What `data/strategy.md` says about the segments that work and those to drop.

Present it all in under 25 lines, with the actions the human must take (review / send the drafts).
