# Budget Studio (Worker Well-Being Lab)

Single-file, scope-based evaluation budget calculator. No install, no server.

## Open
Double-click `index.html` (or open it in Chrome/Safari/Firefox). Hosted via GitHub Pages once published.

## What it does
- Labor priced from ticked deliverables x hours per role (capacity panel is feasibility only)
- 4 editable roles: PI $200, PM $100, Associate $50, Assistant $30 per hour, with day rate (x8)
- Fringe: faculty 28%, staff 13%, student 5% (editable)
- Indirect: 15% / 25% / 45.46% / custom, applied to the direct subtotal only (never contingency)
- Cost-by-deliverable summary plus category totals; contingency defaults to 0
- Optional IRB / external evaluator fees default to $0
- Ceiling check (flags any overage) and capacity check
- Save/load in browser (localStorage, plus autosave), JSON download/upload, CSV export

Not yet included: timeline and payment schedule.
