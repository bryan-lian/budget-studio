"use strict";

const assert = require("assert");
const E = require("../js/engine.js");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    console.error("FAIL", name);
    console.error(err);
    process.exitCode = 1;
  }
}

function clone(state) {
  return JSON.parse(JSON.stringify(state));
}

test("default template prices labor from scope and fits tightly", function () {
  const model = E.compute(E.defaultState());
  assert.strictEqual(model.studentHours, 108);
  assert.strictEqual(model.facultyHours, 19);
  assert.strictEqual(model.labor, 10350);
  assert.strictEqual(model.fringe, 1391.5);
  assert.strictEqual(model.travelResolved, 400);
  assert.strictEqual(model.direct, 12141.5);
  assert.strictEqual(model.indirect, 1821.23);
  assert.strictEqual(model.total, 13962.73);
  assert.strictEqual(model.usableHours, 147);
  assert.strictEqual(model.fitKey, "good");
  assert.strictEqual(model.pricingMode, "headcount");
  assert.strictEqual(model.contingency, 0);
  assert.strictEqual(model.timeline.gapHealthy, true);
  assert.deepStrictEqual(model.timeline.warnings, []);
  assert.strictEqual(model.roles[0].dayRate, 1600);
  assert.strictEqual(model.roles[0].fringePct, 28);
  assert.strictEqual(model.roles[1].fringePct, 5);
  assert.ok(model.phases[3].labor + model.phases[4].labor > model.phases[0].labor + model.phases[1].labor);
});

test("entered hours ignore headcount; scale mode reprices", function () {
  const opened = E.compute(E.defaultState());
  const locked = E.defaultState();
  E.bakePricingMode(locked, "entered");
  locked.roles.forEach(function (r) { r.count = "4"; r.hrsPerWeek = "8"; });
  const afterLock = E.compute(locked);
  assert.strictEqual(afterLock.total, opened.total);
  assert.ok(afterLock.usableHours > opened.usableHours);
  const scaled = E.defaultState();
  scaled.roles.filter(function (r) { return r.id === "assistant"; })[0].count = "2";
  const afterScale = E.compute(scaled);
  assert.ok(afterScale.total > opened.total);
  assert.ok(afterScale.usableHours > opened.usableHours);
  const beforeAsst = opened.roles.filter(function (r) { return r.id === "assistant"; })[0];
  const afterAsst = afterScale.roles.filter(function (r) { return r.id === "assistant"; })[0];
  assert.strictEqual(afterAsst.hours, beforeAsst.hours * 2);
  assert.strictEqual(afterScale.roles.filter(function (r) { return r.id === "pi"; })[0].hours, opened.roles.filter(function (r) { return r.id === "pi"; })[0].hours);
});

test("person-weeks reallocates one role without touching the others", function () {
  const before = E.compute(E.defaultState());
  const state = E.defaultState();
  E.setPersonWeeks(state, "assistant", 0);
  const after = E.compute(state);
  assert.strictEqual(after.roles.filter(function (r) { return r.id === "assistant"; })[0].hours, 0);
  assert.ok(after.total < before.total);
  assert.strictEqual(after.facultyHours, before.facultyHours);
});

test("unticking a deliverable lowers labor and total", function () {
  const state = E.defaultState();
  const before = E.compute(state);
  const survey = state.deliverables.filter(function (d) { return d.id === "survey"; })[0];
  const surveyLabor = before.deliverables.filter(function (d) { return d.id === "survey"; })[0].labor;
  assert.ok(surveyLabor > 0);
  survey.enabled = false;
  const after = E.compute(state);
  assert.strictEqual(after.deliverables.filter(function (d) { return d.id === "survey"; })[0].labor, 0);
  assert.strictEqual(after.labor, E.cents(before.labor - surveyLabor));
  assert.ok(after.fringe < before.fringe);
  assert.ok(after.total < before.total);
  survey.enabled = true;
  assert.strictEqual(E.compute(state).total, before.total);
});

test("reducing subtask hours lowers the price", function () {
  const state = E.defaultState();
  const before = E.compute(state).total;
  const survey = state.deliverables.filter(function (d) { return d.id === "survey"; })[0];
  const conduct = survey.subtasks.filter(function (s) { return s.id === "sv-conduct"; })[0];
  conduct.hours.assistant = 0;
  conduct.hours.associate = 0;
  conduct.hours.pm = 0;
  const after = E.compute(state).total;
  assert.ok(after < before);
});

test("scope tier scales hours and cost", function () {
  const lean = E.defaultState();
  lean.tier = "lean";
  const standard = E.defaultState();
  const expanded = E.defaultState();
  expanded.tier = "expanded";
  const a = E.compute(lean);
  const b = E.compute(standard);
  const c = E.compute(expanded);
  assert.ok(a.studentHours < b.studentHours);
  assert.ok(b.studentHours < c.studentHours);
  assert.ok(a.total < b.total);
  assert.ok(b.total < c.total);
  assert.ok(Math.abs(a.studentHours - 64.8) < 0.05);
  assert.ok(Math.abs(c.studentHours - 162) < 0.05);
});

test("indirect uses the direct subtotal and ignores contingency", function () {
  const state = E.defaultState();
  state.deliverables = [{
    id: "only",
    name: "Only task",
    phase: "planning",
    slot: "design",
    enabled: true,
    report: false,
    subtasks: [{ id: "a", name: "Design", hours: { pi: 10, pm: 0, associate: 0, assistant: 0 }, tags: [] }]
  }];
  state.expenses.travelTouched = true;
  state.expenses.travel = "100";
  const priced = E.compute(state);
  assert.strictEqual(priced.labor, 2000);
  assert.strictEqual(priced.fringe, 560);
  assert.strictEqual(priced.direct, 2660);
  assert.strictEqual(priced.indirect, 399);
  assert.strictEqual(priced.total, 3059);
  state.contingencyOn = true;
  state.contingencyPct = "10";
  const withCont = E.compute(state);
  assert.strictEqual(withCont.indirect, 399);
  assert.strictEqual(withCont.contingency, 266);
  assert.strictEqual(withCont.total, 3325);
  state.indirectPreset = "federal";
  const federal = E.compute(state);
  assert.strictEqual(federal.indirectPercent, 45.46);
  assert.strictEqual(federal.indirect, E.cents(2660 * 0.4546));
  assert.notStrictEqual(federal.indirect, E.cents((2660 + federal.contingency) * 0.4546));
});

test("ceiling warning is strict", function () {
  const state = E.defaultState();
  const total = E.compute(state).total;
  state.project.ceilingUnknown = false;
  state.project.budgetCeiling = String(total);
  assert.strictEqual(E.compute(state).overCeiling, false);
  state.project.budgetCeiling = String(E.cents(total - 0.01));
  assert.strictEqual(E.compute(state).overCeiling, true);
  state.project.budgetCeiling = String(total + 1);
  assert.strictEqual(E.compute(state).overCeiling, false);
});

test("site staff collection shifts field hours, training hours, and travel", function () {
  const team = E.compute(E.defaultState());
  const state = E.defaultState();
  state.project.dataCollection = "site";
  const site = E.compute(state);
  function hours(model, sub, role) {
    const survey = model.deliverables.filter(function (d) { return d.id === "survey"; })[0];
    const row = survey.subtasks.filter(function (s) { return s.id === sub; })[0];
    return row.hours[role];
  }
  assert.ok(hours(site, "sv-conduct", "assistant") < hours(team, "sv-conduct", "assistant"));
  assert.ok(hours(site, "sv-recruit", "assistant") > hours(team, "sv-recruit", "assistant"));
  assert.ok(site.travelResolved < team.travelResolved);
  assert.strictEqual(site.travelResolved, 140);
});

test("optional fees stay at zero until entered and do not invent IRB or evaluator amounts", function () {
  const model = E.compute(E.defaultState());
  assert.ok(model.feeLines.every(function (f) { return f.amount === 0; }));
  assert.ok(!model.summaryRows.some(function (r) { return r.kind === "fee"; }));
  const state = E.defaultState();
  state.fees[0].amount = "250";
  state.fees[0].note = "";
  const charged = E.compute(state);
  assert.strictEqual(charged.feeLines[0].amount, 250);
  assert.ok(charged.total > model.total);
  assert.ok(charged.checklist.some(function (c) { return c.label.indexOf("source note") !== -1 && c.status === "attention"; }));
  state.fees[0].note = "CGU IRB invoice, quote attached";
  assert.ok(E.compute(state).checklist.some(function (c) { return c.label.indexOf("source note") !== -1 && c.status === "complete"; }));
});

test("timeline type and delivery window drive dates", function () {
  const semester = E.compute(E.defaultState());
  assert.deepStrictEqual(semester.timeline.months.map(function (m) { return m.label; }), ["Jan", "Feb", "Mar", "Apr", "May"]);
  assert.strictEqual(semester.timeline.milestones[0].date, "January 31, 2027");
  assert.strictEqual(semester.timeline.milestones[2].date, "March 1, 2027");
  const state = E.defaultState();
  state.project.timelineType = "quarter";
  state.project.deliveryWindow = "Fall 2026";
  state.project.startPinned = false;
  const quarter = E.compute(state);
  assert.strictEqual(quarter.timeline.months.length, 3);
  assert.strictEqual(quarter.timeline.months[0].label, "Sep");
  assert.strictEqual(quarter.timeline.months[0].year, 2026);
  assert.strictEqual(quarter.timeline.gapHealthy, false);
  assert.ok(quarter.timeline.warnings.length > 0);
});

test("fixed-cost payments tie to deliverables and sum to the total", function () {
  const model = E.compute(E.defaultState());
  assert.strictEqual(model.payments.contractType, "fixed");
  assert.strictEqual(model.payments.balanced, true);
  assert.strictEqual(model.payments.earlySmaller, true);
  const sum = E.cents(model.payments.items.reduce(function (s, p) { return s + p.amount; }, 0));
  assert.ok(Math.abs(sum - model.total) < 0.02);
  assert.ok(model.section3.every(function (item) { return item.status === "complete"; }));
});

test("add-ons stay off the total until included and are not marked up", function () {
  const before = E.compute(E.defaultState());
  const state = E.defaultState();
  state.addons[0].included = true;
  const after = E.compute(state);
  assert.strictEqual(E.cents(after.total - before.total), 500);
  assert.strictEqual(after.indirect, before.indirect);
});

test("summary order and exports match the sample shape", function () {
  const state = E.defaultState();
  const model = E.compute(state);
  const labels = model.summaryRows.map(function (r) { return r.kind + ":" + r.label; });
  const laborAt = labels.findIndex(function (l) { return l.indexOf("Labor subtotal") !== -1; });
  const fringeAt = labels.findIndex(function (l) { return l.indexOf("Fringe") === 0 || l.indexOf(":Fringe") !== -1; });
  const travelAt = labels.findIndex(function (l) { return l.indexOf("Travel") !== -1; });
  const incentiveAt = labels.findIndex(function (l) { return l.indexOf("Incentives") !== -1; });
  const consultAt = labels.findIndex(function (l) { return l.indexOf("transcription") !== -1; });
  const printAt = labels.findIndex(function (l) { return l.indexOf("printing") !== -1; });
  const indirectAt = labels.findIndex(function (l) { return l.indexOf("Indirect") !== -1; });
  const totalAt = labels.findIndex(function (l) { return l.indexOf(":Total") !== -1; });
  assert.ok(labels.some(function (l) { return l.indexOf("deliverable:Worker survey") !== -1; }));
  assert.ok(laborAt < fringeAt);
  assert.ok(fringeAt < travelAt);
  assert.ok(travelAt < incentiveAt);
  assert.ok(incentiveAt < consultAt);
  assert.ok(consultAt < printAt);
  assert.ok(printAt < indirectAt);
  assert.ok(indirectAt < totalAt);
  const csv = E.toCsv(state);
  assert.ok(csv.indexOf("Worker survey") !== -1);
  assert.ok(csv.indexOf("Consultants / transcription") !== -1);
  assert.ok(csv.indexOf("Day rate") !== -1);
  const xlsx = E.toXlsx(state);
  assert.strictEqual(xlsx[0], 0x50);
  assert.strictEqual(xlsx[1], 0x4b);
  const text = Buffer.from(xlsx).toString("latin1");
  assert.ok(text.indexOf("Labor subtotal") !== -1);
  assert.ok(text.indexOf("Takeoff") !== -1);
  const blob = JSON.stringify(E.plainText(state) + model.narratives.justification);
  assert.strictEqual(blob.indexOf("\u2014"), -1);
  assert.strictEqual(blob.indexOf("\u2013"), -1);
});

test("save payload round-trips", function () {
  const state = E.defaultState();
  state.project.name = "Round trip study";
  state.tier = "lean";
  const again = E.hydrate(E.exportPayload(state));
  assert.strictEqual(again.project.name, "Round trip study");
  assert.strictEqual(again.tier, "lean");
  assert.strictEqual(E.compute(again).total, E.compute(state).total);
});

test("rush hour appears when too many field methods share a month", function () {
  const state = E.defaultState();
  state.deliverables.forEach(function (d) {
    if (d.id === "interviews" || d.id === "observations" || d.id === "archival") d.enabled = true;
  });
  const model = E.compute(state);
  assert.ok(model.timeline.counts.some(function (c) { return c.rush; }));
  assert.ok(model.total > E.compute(E.defaultState()).total);
});

test("turning every deliverable off zeros labor but keeps entered expenses", function () {
  const state = E.defaultState();
  state.expenses.travelTouched = true;
  state.expenses.travel = "80";
  state.deliverables.forEach(function (d) { d.enabled = false; });
  const model = E.compute(state);
  assert.strictEqual(model.labor, 0);
  assert.strictEqual(model.fringe, 0);
  assert.strictEqual(model.studentHours, 0);
  assert.strictEqual(model.direct, 80);
  assert.strictEqual(model.indirect, 12);
  assert.strictEqual(model.total, 92);
});

if (process.exitCode) {
  console.error("Some tests failed");
} else {
  console.log(passed + " tests passed");
}
