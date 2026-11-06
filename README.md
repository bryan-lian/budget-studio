# Budget Studio

A single-page budget builder for Bryan Lian and the Worker Well-Being Lab. It prices an evaluation from scoped hours, then checks whether that scope fits the student team.

Open `index.html` in a browser. It also works as a static GitHub Pages site from the repository root. No build step and no server are required. The page saves itself in the browser.

To serve it locally:

```bash
python3 -m http.server 43127
```

Then open `http://127.0.0.1:43127`.

Check the cost engine with:

```bash
node tests/engine.test.js
```

## What changed from the earlier studio

The earlier page priced student labor from usable capacity (students x weeks x hours, after a buffer). Unticking a deliverable did not change the fee. This version prices labor from the scope takeoff:

**cost = sum of deliverable subtask hours x role rate**

Capacity stays a feasibility check. Lean, Standard, and Expanded rescale those hours (60%, 100%, 150%). Turning a deliverable off, or cutting its hours, lowers the price.

Also in this version:

- Role table with day rates (hourly x 8) and editable fringe
- Subtasks under each deliverable, plus a project management block (liaison, team management, meetings, manage tasks)
- Fringe by role, then indirect on the direct subtotal only
- Client menu in sheet order: deliverables, labor subtotal, fringe, travel, incentives, transcription, printing, other directs, indirect, total
- Internal role-by-subtask ticket
- Timeline with month columns, dated deliverables, a feedback gap before fielding, report dates, and a rush-hour warning
- Fixed-cost payment schedule tied to deliverables
- Optional IRB and external-evaluator fees, blank until you enter an amount and a source note
- Contingency off unless you turn it on. Pad analysis and reporting hours instead.
- Worker Well-Being evaluation template instead of the bridal demo
- Review and export scrolls to the review step
- A ceiling warning as soon as the total is over the ceiling
- Autosave, JSON download and upload, CSV, and Excel

## Default rates

From the Week 10 sample workbook and the Section 3 rate card:

| Role | Hourly | Day rate | Fringe in the template |
| --- | --- | --- | --- |
| PI / Faculty | $200 | $1,600 | 28% faculty |
| Project Manager | $100 | $800 | 5% student |
| Associate | $50 | $400 | 5% student |
| Assistant | $30 | $240 | 5% student |

The sample workbook prices the project manager as a student. Staff fringe is 13% if you change that role's category. Faculty stays 28%.

Indirect presets:

- 15% contracts (the template default)
- 25% non-federal
- 45.46% federal
- Custom

Indirect is charged on labor + fringe + other direct costs. It is not charged on contingency. Included add-ons keep their menu price and are not marked up again.

The template also assumes a Spring 2027 semester, a nonprofit partner, and the evaluation team collecting data. Suggested travel is $400 until you edit it ($140 if site staff collect). Contingency is 0%. Optional fees are $0.

Opening team, one person per role: PI at 2 hours a week, project manager and assistant at 3, associate at 5 (the takeoff sits on the associate). Usable hours are headcount x 15 weeks x hours per week x the medium buffer. Student roles can deliver 147 hours. The takeoff uses 108 student hours and 19 faculty hours, so the fit check reads feasible. **Scale with headcount** is on, but the baseline is this one-person roster, so the sticker price does not move until you change a count. Switch to **Entered hours** if the grid should stay fixed and team size should only be a capacity check. Person-weeks on a role spread that role's hours across the deliverables that are turned on.

The priced total on the opening roster is **$13,962.73** (labor $10,350, fringe $1,391.50, travel $400, indirect 15%).

Dated milestones on that semester: draft measures January 31, 2027, client feedback in February, data collection starts March 1, interim update April 15, final report May 31.

## Versus the thin MVP

The thin MVP was a single cost form. This studio adds the full proposal worksheet on top of that:

- Per-role headcount steppers, hours per week, and person-weeks. Capacity is headcount x weeks x hours per week x buffer.
- Scale-with-headcount mode (on by default, baseline of one person per role) and an Entered hours mode that keeps the grid fixed.
- Subtask takeoff, client menu by deliverable, fringe, and the indirect dropdown on the direct subtotal only.
- Timeline with a feedback gap, report dates, and a rush-hour count.
- Fixed-cost payment schedule tied to deliverables.
- JSON save and load, CSV, and Excel. Contingency stays at 0. IRB and external evaluator stay at $0 until you type an amount and a source note.

## How the page is organized

1. Project snapshot. Client, ceiling, delivery window, and timeline type. The window sets the first month (Spring starts in January, Fall in September) unless you pin Timeline starts.
2. Scope and capacity fit. One stepper per role, hours per week, and person-weeks. Usable hours are headcount x weeks x hours per week x buffer. Scale with headcount also revises labor. The tier rescales hours. Deliverable chips add or remove price.
3. Budget builder. Rates, the hour grid, expenses, fees, indirect, add-ons, timeline, payments, where the weight sits, and the client menu.
4. Review and export. Defensibility checklist, the Section 3 submission list, and copy-ready narrative.

Who collects data shifts the balloon: site staff lower field hours and suggested travel, and raise recruit, pilot, and training hours.
