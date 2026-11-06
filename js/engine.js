/* Worker Well-Being Lab · Budget Studio
   Cost engine. Price comes from scoped hours, never from capacity.
   Capacity is returned only as a feasibility check. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WWBEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ROLE_IDS = ["pi", "pm", "associate", "assistant"];
  const TIER_MULT = { lean: 0.6, standard: 1, expanded: 1.5 };
  const BUFFER = { low: 0.95, medium: 0.89, high: 0.78 };
  const FRINGE = { faculty: 28, staff: 13, student: 5 };
  const INDIRECT = { contract: 15, nonfederal: 25, federal: 45.46 };
  const PHASES = [
    { id: "pm", label: "Project management" },
    { id: "planning", label: "Planning" },
    { id: "field", label: "Data collection" },
    { id: "analysis", label: "Analysis" },
    { id: "reporting", label: "Reporting" }
  ];
  const SLOTS = [
    { id: "pm", label: "Whole timeline (management)" },
    { id: "design", label: "Design month" },
    { id: "feedback", label: "Feedback gap" },
    { id: "field", label: "Fieldwork" },
    { id: "field-late", label: "Later fieldwork" },
    { id: "analysis", label: "Analysis" },
    { id: "interim", label: "Interim report" },
    { id: "report", label: "Final report" }
  ];
  const EXPENSES = [
    { id: "travel", label: "Travel" },
    { id: "incentives", label: "Incentives" },
    { id: "consultants", label: "Consultants / transcription" },
    { id: "printing", label: "Report printing" },
    { id: "materials", label: "Materials" },
    { id: "software", label: "Software / tools" },
    { id: "subcontractors", label: "Subcontractors" },
    { id: "shipping", label: "Shipping" },
    { id: "postage", label: "Postage" },
    { id: "other", label: "Other" }
  ];

  let seq = 100;

  function uid(prefix) {
    seq += 1;
    return prefix + "-" + seq.toString(36) + Math.random().toString(36).slice(2, 5);
  }

  function num(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    if (v == null) return 0;
    const s = String(v).replace(/[$,%\s,]/g, "");
    if (s === "" || s === "-" || s === "." || s === "-.") return 0;
    const x = parseFloat(s);
    return Number.isFinite(x) ? x : 0;
  }

  function cents(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function qty(n) {
    return Math.round((Number(n) || 0) * 1000) / 1000;
  }

  function round1(n) {
    return Math.round((Number(n) || 0) * 10) / 10;
  }

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  function money(v) {
    const n = cents(v);
    return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function formatHour(n) {
    const x = round1(n);
    if (Object.is(x, -0) || x === 0) return "0";
    if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
    return x.toFixed(1);
  }

  function formatPctNumber(p) {
    const x = Math.round(num(p) * 100) / 100;
    if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
    return x.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  function hoursObj(partial) {
    const h = { pi: 0, pm: 0, associate: 0, assistant: 0 };
    if (partial) {
      ROLE_IDS.forEach(function (id) {
        if (partial[id] != null) h[id] = num(partial[id]);
      });
    }
    return h;
  }

  function subtask(id, name, partial, tags) {
    return { id: id, name: name, hours: hoursObj(partial), tags: tags || [] };
  }

  function defaultRoles() {
    return [
      { id: "pi", name: "PI / Faculty", rate: 200, fringeKind: "faculty", customFringe: "28", count: "1", hrsPerWeek: "2", baselineCount: "1" },
      { id: "pm", name: "Project Manager", rate: 100, fringeKind: "student", customFringe: "5", count: "1", hrsPerWeek: "3", baselineCount: "1" },
      { id: "associate", name: "Associate", rate: 50, fringeKind: "student", customFringe: "5", count: "1", hrsPerWeek: "5", baselineCount: "1" },
      { id: "assistant", name: "Assistant", rate: 30, fringeKind: "student", customFringe: "5", count: "1", hrsPerWeek: "3", baselineCount: "1" }
    ];
  }

  function defaultDeliverables() {
    return [
      {
        id: "pm",
        name: "Project management",
        phase: "pm",
        slot: "pm",
        enabled: true,
        report: false,
        subtasks: [
          subtask("pm-liaison", "Liaison with the organization", { pi: 1, pm: 3 }),
          subtask("pm-tasks", "Manage evaluation tasks", { pm: 3, associate: 2 }),
          subtask("pm-team", "Team management", { pi: 1, pm: 2 }),
          subtask("pm-meet", "Meetings", { pi: 2, pm: 3, associate: 2, assistant: 1 })
        ]
      },
      {
        id: "design",
        name: "Evaluation design",
        phase: "planning",
        slot: "design",
        enabled: true,
        report: false,
        subtasks: [
          subtask("des-q", "Design evaluation questions", { pi: 2, pm: 2, associate: 5 }),
          subtask("des-m", "Draft measures", { pi: 1, associate: 5, assistant: 2 }),
          subtask("des-p", "Pilot", { pm: 1, associate: 2, assistant: 1 }, ["training"])
        ]
      },
      {
        id: "feedback",
        name: "Client feedback and revision",
        phase: "planning",
        slot: "feedback",
        enabled: true,
        report: false,
        subtasks: [
          subtask("fb-rev", "Revise instruments after client feedback", { pi: 1, pm: 2, associate: 4 })
        ]
      },
      {
        id: "survey",
        name: "Worker survey",
        phase: "field",
        slot: "field",
        enabled: true,
        report: false,
        subtasks: [
          subtask("sv-design", "Design", { pm: 1, associate: 3 }),
          subtask("sv-recruit", "Recruit", { pm: 1, assistant: 2 }, ["training"]),
          subtask("sv-pilot", "Pilot", { associate: 1, assistant: 1 }, ["training"]),
          subtask("sv-sched", "Schedule", { assistant: 1, pm: 0 }),
          subtask("sv-conduct", "Conduct", { pm: 1, associate: 2, assistant: 4 }, ["field"]),
          subtask("sv-code", "Code", { associate: 2, assistant: 2 }),
          subtask("sv-write", "Write up", { pi: 1, pm: 1, associate: 2 })
        ]
      },
      {
        id: "interviews",
        name: "Interviews or focus groups",
        phase: "field",
        slot: "field",
        enabled: false,
        report: false,
        subtasks: [
          subtask("iv-design", "Design", { pi: 1, pm: 1, associate: 3 }),
          subtask("iv-recruit", "Recruit", { pm: 2, assistant: 2 }, ["training"]),
          subtask("iv-pilot", "Pilot", { pm: 1, associate: 1 }, ["training"]),
          subtask("iv-sched", "Schedule", { pm: 1, assistant: 2 }),
          subtask("iv-conduct", "Conduct", { pm: 2, associate: 6, assistant: 2 }, ["field"]),
          subtask("iv-code", "Code", { associate: 4, assistant: 3 }),
          subtask("iv-write", "Write up", { pi: 1, pm: 1, associate: 2 })
        ]
      },
      {
        id: "observations",
        name: "Site observations",
        phase: "field",
        slot: "field",
        enabled: false,
        report: false,
        subtasks: [
          subtask("ob-design", "Design", { pi: 1, associate: 2 }),
          subtask("ob-recruit", "Recruit", { pm: 1 }, ["training"]),
          subtask("ob-pilot", "Pilot", { associate: 1 }, ["training"]),
          subtask("ob-sched", "Schedule", { pm: 1, assistant: 2 }),
          subtask("ob-conduct", "Conduct", { pm: 1, associate: 4, assistant: 2 }, ["field"]),
          subtask("ob-code", "Code", { associate: 2, assistant: 2 }),
          subtask("ob-write", "Write up", { pi: 1, pm: 1, associate: 2 })
        ]
      },
      {
        id: "archival",
        name: "Existing and archival data",
        phase: "field",
        slot: "field",
        enabled: false,
        report: false,
        subtasks: [
          subtask("ar-design", "Design", { pm: 1, associate: 2 }),
          subtask("ar-recruit", "Recruit", { pm: 1 }),
          subtask("ar-pilot", "Pilot", { associate: 0 }),
          subtask("ar-sched", "Schedule", { pm: 0 }),
          subtask("ar-conduct", "Conduct", { associate: 2, assistant: 2 }),
          subtask("ar-code", "Code", { associate: 3, assistant: 3 }),
          subtask("ar-write", "Write up", { pi: 1, associate: 2 })
        ]
      },
      {
        id: "analysis",
        name: "Analysis and synthesis",
        phase: "analysis",
        slot: "analysis",
        enabled: true,
        report: false,
        subtasks: [
          subtask("an-clean", "Code and clean merged files", { associate: 3, assistant: 3 }),
          subtask("an-src", "Write up each source", { pi: 2, pm: 2, associate: 5 }),
          subtask("an-tri", "Triangulate across methods", { pi: 2, pm: 2, associate: 6 }),
          subtask("an-pack", "Write up the integrated findings", { pm: 1, associate: 3, assistant: 1 })
        ]
      },
      {
        id: "interim",
        name: "Interim update",
        phase: "reporting",
        slot: "interim",
        enabled: true,
        report: true,
        subtasks: [
          subtask("in-draft", "Write up the interim update", { pi: 1, pm: 2, associate: 3 })
        ]
      },
      {
        id: "final",
        name: "Final report and presentation",
        phase: "reporting",
        slot: "report",
        enabled: true,
        report: true,
        subtasks: [
          subtask("fn-report", "Write up the final report", { pi: 3, pm: 2, associate: 5, assistant: 2 }),
          subtask("fn-pres", "Write up and deliver the presentation", { pi: 2, pm: 2, associate: 2 })
        ]
      }
    ];
  }

  function defaultState() {
    return {
      version: 1,
      project: {
        name: "Worker Well-Being Evaluation",
        client: "Partner organization",
        clientType: "Nonprofit",
        budgetStage: "draft",
        budgetCeiling: "",
        ceilingUnknown: true,
        deliveryWindow: "Spring 2027",
        startMonth: "2027-01",
        startPinned: false,
        timelineType: "semester",
        customMonths: "6",
        projectType: "outcome_evaluation",
        decisionPoint: "Whether to renew or redesign the program next cycle",
        constraint: "time",
        dataCollection: "team"
      },
      capacity: { weeks: "15", buffer: "medium" },
      pricingMode: "headcount",
      tier: "standard",
      roles: defaultRoles(),
      deliverables: defaultDeliverables(),
      expenses: {
        travel: "",
        travelTouched: false,
        travelNote: "",
        materials: "",
        software: "",
        incentives: "",
        subcontractors: "",
        consultants: "",
        shipping: "",
        postage: "",
        printing: "",
        other: ""
      },
      fees: [
        { id: "irb", label: "IRB review fee", amount: "", note: "" },
        { id: "external", label: "External evaluator", amount: "", note: "" }
      ],
      indirectPreset: "contract",
      indirectCustom: "15",
      contingencyOn: false,
      contingencyPct: "0",
      contractType: "fixed",
      addons: [
        {
          id: "logic",
          name: "Logic model or theory of change revision",
          pricing: "fixed",
          amount: "500",
          hours: "0",
          rate: "200",
          included: false
        },
        {
          id: "compare",
          name: "Comparative analyses across cohorts or sites",
          pricing: "hourly",
          amount: "0",
          hours: "6",
          rate: "200",
          included: false
        },
        {
          id: "session",
          name: "Extra facilitated session with the partner team",
          pricing: "fixed",
          amount: "1200",
          hours: "0",
          rate: "200",
          included: false
        }
      ],
      payments: [
        { id: "pay-design", label: "Evaluation design accepted", deliverableId: "design", percent: "15" },
        { id: "pay-interim", label: "Interim update delivered", deliverableId: "interim", percent: "25" },
        { id: "pay-final", label: "Final report and presentation", deliverableId: "final", percent: "60" }
      ],
      timeline: { monthOverrides: {} },
      ui: {
        open: { s1: true, s2: true, s3: true, s4: true },
        openDeliv: {},
        rulesOpen: true,
        kitchenOpen: false,
        notice: ""
      }
    };
  }

  function fringePercent(role) {
    if (!role) return 0;
    if (role.fringeKind === "custom") return Math.max(0, num(role.customFringe));
    if (Object.prototype.hasOwnProperty.call(FRINGE, role.fringeKind)) return FRINGE[role.fringeKind];
    return 0;
  }

  function isStudentRole(role) {
    return role && role.fringeKind === "student";
  }

  function indirectPercent(state) {
    if (state.indirectPreset === "custom") return Math.max(0, num(state.indirectCustom));
    if (Object.prototype.hasOwnProperty.call(INDIRECT, state.indirectPreset)) return INDIRECT[state.indirectPreset];
    return 15;
  }

  function indirectLabel(state) {
    const p = formatPctNumber(indirectPercent(state));
    if (state.indirectPreset === "federal") return p + "% federal";
    if (state.indirectPreset === "nonfederal") return p + "% non-federal";
    if (state.indirectPreset === "contract") return p + "% contracts";
    return p + "% custom";
  }

  function tierMult(tier) {
    return TIER_MULT[tier] || 1;
  }

  function modeFactor(tags, mode) {
    const list = tags || [];
    if (mode === "site") {
      if (list.indexOf("field") !== -1) return 0.45;
      if (list.indexOf("training") !== -1) return 2;
    }
    return 1;
  }

  function roleScale(state, roleId) {
    if (!state || state.pricingMode !== "headcount") return 1;
    const role = (state.roles || []).filter(function (r) { return r.id === roleId; })[0];
    if (!role) return 1;
    const count = Math.max(0, num(role.count));
    const baseline = Math.max(0, num(role.baselineCount));
    if (baseline <= 0) return count;
    return count / baseline;
  }

  function hourMult(state, tags, roleId) {
    const scale = roleId ? roleScale(state, roleId) : 1;
    return tierMult(state.tier) * modeFactor(tags, state.project && state.project.dataCollection) * scale;
  }

  function teamCapacity(state) {
    const cap = state.capacity || {};
    const weeks = Math.max(0, num(cap.weeks));
    const buffer = BUFFER[cap.buffer] || BUFFER.medium;
    let studentGross = 0;
    let totalGross = 0;
    const rows = (state.roles || []).map(function (role) {
      const count = Math.max(0, num(role.count));
      const weekly = Math.max(0, num(role.hrsPerWeek));
      const gross = count * weeks * weekly;
      const student = isStudentRole(role);
      totalGross += gross;
      if (student) studentGross += gross;
      return { id: role.id, count: count, hrsPerWeek: weekly, gross: gross, usable: gross * buffer, student: student };
    });
    return {
      weeks: weeks,
      buffer: buffer,
      rows: rows,
      studentGross: studentGross,
      studentUsable: Math.round(studentGross * buffer),
      totalGross: totalGross,
      totalUsable: Math.round(totalGross * buffer)
    };
  }

  function setPersonWeeks(state, roleId, personWeeks) {
    const role = (state.roles || []).filter(function (r) { return r.id === roleId; })[0];
    if (!role) return;
    const target = Math.max(0, num(personWeeks)) * Math.max(0, num(role.hrsPerWeek));
    const cells = [];
    let current = 0;
    (state.deliverables || []).forEach(function (d) {
      if (!d.enabled) return;
      (d.subtasks || []).forEach(function (s) {
        if (!s.hours) s.hours = hoursObj();
        const mult = hourMult(state, s.tags, roleId);
        const eff = effectiveHour(s.hours[roleId], mult);
        current = qty(current + eff);
        cells.push({ hours: s.hours, mult: mult });
      });
    });
    if (!cells.length) return;
    if (current <= 0) {
      const each = target / cells.length;
      cells.forEach(function (cell) {
        cell.hours[roleId] = cell.mult ? each / cell.mult : 0;
      });
      return;
    }
    const factor = target / current;
    cells.forEach(function (cell) {
      cell.hours[roleId] = num(cell.hours[roleId]) * factor;
    });
  }

  function bakePricingMode(state, next) {
    const dest = next === "entered" ? "entered" : "headcount";
    const current = state.pricingMode === "entered" ? "entered" : "headcount";
    if (current === dest) {
      state.pricingMode = dest;
      return;
    }
    (state.roles || []).forEach(function (role) {
      const scale = current === "headcount" ? roleScale(state, role.id) : 1;
      (state.deliverables || []).forEach(function (d) {
        (d.subtasks || []).forEach(function (s) {
          if (!s.hours) s.hours = hoursObj();
          s.hours[role.id] = num(s.hours[role.id]) * scale;
        });
      });
      const count = Math.max(0, num(role.count));
      role.baselineCount = String(count > 0 ? count : 1);
    });
    state.pricingMode = dest;
  }

  function effectiveHour(base, mult) {
    return round1(Math.max(0, num(base)) * mult);
  }

  function monthCount(project) {
    if (!project) return 5;
    if (project.timelineType === "quarter") return 3;
    if (project.timelineType === "custom") return clamp(Math.round(num(project.customMonths) || 6), 2, 18);
    return 5;
  }

  function parseWindow(text) {
    const t = String(text || "").trim();
    const season = t.match(/\b(spring|summer|fall|autumn|winter)\b[\s,/-]*(\d{4})?/i);
    if (season) {
      const key = season[1].toLowerCase();
      const month = key === "summer" ? 6 : (key === "fall" || key === "autumn") ? 9 : 1;
      const year = season[2] ? parseInt(season[2], 10) : 2027;
      return { year: year, month: month };
    }
    const iso = t.match(/(\d{4})-(\d{1,2})/);
    if (iso) return { year: parseInt(iso[1], 10), month: clamp(parseInt(iso[2], 10), 1, 12) };
    const mon = t.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b[\s,/-]*(\d{4})?/i);
    if (mon) {
      const names = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const month = names.indexOf(mon[1].slice(0, 3).toLowerCase()) + 1;
      const year = mon[2] ? parseInt(mon[2], 10) : 2027;
      return { year: year, month: month };
    }
    return null;
  }

  function resolveStart(project) {
    const pinned = project && project.startPinned && /^(\d{4})-(\d{2})$/.test(project.startMonth || "");
    if (pinned) {
      const m = project.startMonth.match(/^(\d{4})-(\d{2})$/);
      return { year: parseInt(m[1], 10), month: clamp(parseInt(m[2], 10), 1, 12) };
    }
    const parsed = parseWindow(project && project.deliveryWindow);
    if (parsed) return parsed;
    if (project && /^(\d{4})-(\d{2})$/.test(project.startMonth || "")) {
      const m = project.startMonth.match(/^(\d{4})-(\d{2})$/);
      return { year: parseInt(m[1], 10), month: clamp(parseInt(m[2], 10), 1, 12) };
    }
    return { year: 2027, month: 1 };
  }

  function monthList(start, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const d = new Date(start.year, start.month - 1 + i, 1);
      out.push({
        index: i,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        label: d.toLocaleString("en-US", { month: "short" }),
        full: d.toLocaleString("en-US", { month: "long", year: "numeric" })
      });
    }
    return out;
  }

  function range(start, end) {
    const out = [];
    for (let i = start; i <= end; i++) out.push(i);
    return out;
  }

  function coverage(slot, count) {
    const last = count - 1;
    if (count <= 0) return [];
    if (slot === "pm") return range(0, last);
    if (slot === "design") return [0];
    if (slot === "feedback") return count >= 4 ? [1] : [0];
    if (slot === "field") {
      if (count <= 2) return [last];
      if (count === 3) return [1];
      if (count === 4) return [2];
      if (count === 5) return [2];
      return range(2, Math.max(2, count - 3));
    }
    if (slot === "field-late") {
      const field = coverage("field", count);
      const candidate = Math.min(last, field[field.length - 1] + 1);
      return [candidate];
    }
    if (slot === "analysis") {
      if (count <= 2) return [last];
      return [Math.max(0, last - 1)];
    }
    if (slot === "interim") {
      if (count <= 2) return [last];
      return [Math.max(0, last - 1)];
    }
    if (slot === "report") return [last];
    return [0];
  }

  function suggestedTravel(state) {
    const mult = tierMult(state.tier);
    const site = state.project && state.project.dataCollection === "site";
    return cents(400 * mult * (site ? 0.35 : 1));
  }

  function expenseAmount(state, id) {
    if (id === "travel" && state.expenses && !state.expenses.travelTouched) return suggestedTravel(state);
    return Math.max(0, num(state.expenses && state.expenses[id]));
  }

  function addonPrice(addon) {
    if (!addon) return 0;
    if (addon.pricing === "hourly") return cents(Math.max(0, num(addon.hours)) * Math.max(0, num(addon.rate)));
    return cents(Math.max(0, num(addon.amount)));
  }

  function dayRate(hourly) {
    return cents(num(hourly) * 8);
  }

  function roleById(roles, id) {
    for (let i = 0; i < roles.length; i++) if (roles[i].id === id) return roles[i];
    return null;
  }

  function lastDay(year, month) {
    return new Date(year, month, 0);
  }

  function formatDate(d) {
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  function formatMonth(year, month) {
    return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  function stageLabel(id) {
    return { quick: "Quick estimate", draft: "Draft", proposal: "Proposal-ready", final: "Final" }[id] || "Draft";
  }

  function projectTypeLabel(id) {
    return {
      needs_assessment: "a needs assessment",
      evaluation_plan: "an evaluation plan",
      outcome_evaluation: "an outcome evaluation",
      survey_reporting: "a worker survey and reporting package",
      workshop: "a workshop or facilitated session",
      combined: "a combined evaluation package"
    }[id] || "an evaluation";
  }

  function bufferLabel(id) {
    return { low: "low", medium: "medium", high: "high" }[id] || "medium";
  }

  function tierLabel(id) {
    return { lean: "Lean", standard: "Standard", expanded: "Expanded" }[id] || "Standard";
  }

  function constraintCopy(id) {
    if (id === "time") return "The binding constraint is time. Shorten the duration or cut the level of effort before adding tasks.";
    if (id === "money") return "The binding constraint is money. Keep essential data, prefer data the client already has, and price a smaller sample that still holds.";
    if (id === "both") return "Time and money are both tight. Prefer moves that help both, such as a shorter instrument or site staff collecting data the client already touches.";
    return "Name the binding constraint before adding scope. Time and money ask for different cuts.";
  }

  function listsJoin(items) {
    const list = items.filter(Boolean);
    if (!list.length) return "the agreed deliverables";
    if (list.length === 1) return list[0];
    if (list.length === 2) return list[0] + " and " + list[1];
    return list.slice(0, -1).join(", ") + ", and " + list[list.length - 1];
  }

  function compute(state) {
    const project = state.project || {};
    const roles = (state.roles && state.roles.length ? state.roles : defaultRoles()).map(function (r) {
      return {
        id: r.id,
        name: r.name || r.id,
        rate: Math.max(0, num(r.rate)),
        fringeKind: r.fringeKind || "student",
        customFringe: r.customFringe,
        fringePct: fringePercent(r),
        dayRate: dayRate(r.rate),
        student: isStudentRole(r)
      };
    });
    const roleIndex = {};
    roles.forEach(function (r) { roleIndex[r.id] = r; });

    const roleHours = {};
    const roleLabor = {};
    ROLE_IDS.forEach(function (id) { roleHours[id] = 0; roleLabor[id] = 0; });

    let studentHours = 0;
    let allHours = 0;

    const deliverables = (state.deliverables || []).map(function (d) {
      const enabled = !!d.enabled;
      const subtasksOut = (d.subtasks || []).map(function (s) {
        const hours = {};
        const cost = {};
        let line = 0;
        let lineHours = 0;
        ROLE_IDS.forEach(function (id) {
          const mult = hourMult(state, s.tags, id);
          const eff = enabled ? effectiveHour(s.hours && s.hours[id], mult) : 0;
          const rate = roleIndex[id] ? roleIndex[id].rate : 0;
          const ext = cents(eff * rate);
          hours[id] = eff;
          cost[id] = ext;
          line = cents(line + ext);
          lineHours = qty(lineHours + eff);
          if (enabled) {
            roleHours[id] = qty(roleHours[id] + eff);
            roleLabor[id] = cents(roleLabor[id] + ext);
            allHours = qty(allHours + eff);
            if (roleIndex[id] && roleIndex[id].student) studentHours = qty(studentHours + eff);
          }
        });
        return {
          id: s.id,
          name: s.name,
          tags: s.tags || [],
          hours: hours,
          cost: cost,
          labor: line,
          totalHours: lineHours
        };
      });
      const hours = {};
      const cost = {};
      ROLE_IDS.forEach(function (id) { hours[id] = 0; cost[id] = 0; });
      let labor = 0;
      let delivStudent = 0;
      let delivHours = 0;
      subtasksOut.forEach(function (s) {
        labor = cents(labor + s.labor);
        delivHours = qty(delivHours + s.totalHours);
        ROLE_IDS.forEach(function (id) {
          hours[id] = qty(hours[id] + s.hours[id]);
          cost[id] = cents(cost[id] + s.cost[id]);
          if (roleIndex[id] && roleIndex[id].student) delivStudent = qty(delivStudent + s.hours[id]);
        });
      });
      return {
        id: d.id,
        name: d.name,
        phase: d.phase || "field",
        slot: d.slot || "field",
        enabled: enabled,
        report: !!d.report,
        subtasks: subtasksOut,
        hours: hours,
        cost: cost,
        labor: labor,
        studentHours: delivStudent,
        totalHours: delivHours
      };
    });

    const labor = cents(ROLE_IDS.reduce(function (sum, id) { return sum + (roleLabor[id] || 0); }, 0));
    const team = teamCapacity(state);
    const teamById = {};
    team.rows.forEach(function (row) { teamById[row.id] = row; });
    const fringeByRole = roles.map(function (r) {
      const amount = cents((roleLabor[r.id] || 0) * (r.fringePct / 100));
      const capRow = teamById[r.id] || { count: 0, hrsPerWeek: 0, gross: 0, usable: 0 };
      const priced = roleHours[r.id] || 0;
      return {
        id: r.id,
        name: r.name,
        labor: roleLabor[r.id] || 0,
        hours: priced,
        rate: r.rate,
        dayRate: r.dayRate,
        fringePct: r.fringePct,
        fringeKind: r.fringeKind,
        student: r.student,
        fringe: amount,
        count: capRow.count,
        hrsPerWeek: capRow.hrsPerWeek,
        gross: capRow.gross,
        usable: capRow.usable,
        personWeeks: capRow.hrsPerWeek > 0 ? priced / capRow.hrsPerWeek : 0,
        scale: roleScale(state, r.id),
        over: priced > capRow.usable + 0.05
      };
    });
    const fringe = cents(fringeByRole.reduce(function (sum, r) { return sum + r.fringe; }, 0));

    const otherLines = EXPENSES.map(function (e) {
      return {
        id: e.id,
        label: e.label,
        amount: expenseAmount(state, e.id),
        note: e.id === "travel" ? (state.expenses && state.expenses.travelNote) || "" : ""
      };
    });
    const feeLines = (state.fees || []).map(function (f) {
      return {
        id: f.id,
        label: f.label || "Optional fee",
        amount: cents(Math.max(0, num(f.amount))),
        note: (f.note || "").trim()
      };
    });
    const otherTotal = cents(
      otherLines.reduce(function (s, l) { return s + l.amount; }, 0) +
      feeLines.reduce(function (s, l) { return s + l.amount; }, 0)
    );
    const direct = cents(labor + fringe + otherTotal);
    const indPct = indirectPercent(state);
    const indirect = cents(direct * (indPct / 100));
    const contOn = !!state.contingencyOn;
    const contPct = contOn ? Math.max(0, num(state.contingencyPct)) : 0;
    const contingency = contOn ? cents(direct * (contPct / 100)) : 0;

    const addons = (state.addons || []).map(function (a) {
      const price = addonPrice(a);
      return {
        id: a.id,
        name: a.name,
        pricing: a.pricing === "hourly" ? "hourly" : "fixed",
        amount: cents(Math.max(0, num(a.amount))),
        hours: Math.max(0, num(a.hours)),
        rate: Math.max(0, num(a.rate)),
        price: price,
        included: !!a.included
      };
    });
    const includedAddons = addons.filter(function (a) { return a.included; });
    const addonTotal = cents(includedAddons.reduce(function (s, a) { return s + a.price; }, 0));
    const total = cents(direct + indirect + contingency + addonTotal);

    const phases = PHASES.map(function (p) {
      const amount = cents(deliverables.filter(function (d) { return d.enabled && d.phase === p.id; }).reduce(function (s, d) { return s + d.labor; }, 0));
      return { id: p.id, label: p.label, labor: amount, pct: labor > 0 ? Math.round((amount / labor) * 1000) / 10 : 0 };
    });
    const weightFront = cents((phases.find(function (p) { return p.id === "pm"; }) || {}).labor + (phases.find(function (p) { return p.id === "planning"; }) || {}).labor);
    const weightBack = cents((phases.find(function (p) { return p.id === "analysis"; }) || {}).labor + (phases.find(function (p) { return p.id === "reporting"; }) || {}).labor);
    const weightWarning = labor > 0 && weightFront > weightBack;

    const cap = state.capacity || {};
    const bFactor = team.buffer;
    const grossHours = Math.round(team.studentGross);
    const fitPoolIsStudents = team.studentUsable > 0;
    const fitHours = fitPoolIsStudents ? studentHours : allHours;
    const usableHours = fitPoolIsStudents ? team.studentUsable : team.totalUsable;
    const ratio = usableHours > 0 ? fitHours / usableHours : (fitHours > 0 ? 99 : 0);
    const scaleOn = state.pricingMode === "headcount";
    let fitKey = "unknown";
    if (usableHours <= 0) fitKey = "unknown";
    else if (ratio <= 0.85) fitKey = "good";
    else if (ratio <= 1) fitKey = "tight";
    else if (ratio <= 1.25) fitKey = "over";
    else fitKey = "way";
    const scaleNote = scaleOn
      ? " Headcount scaling is on, so changing a role's count also scales that role's hours and cost."
      : " Entered-hours mode is on, so team size checks feasibility and does not change the price.";
    const fitCopy = {
      good: {
        title: "Feasible within capacity",
        message: "The takeoff sits inside usable hours, with room if a task runs long." + scaleNote
      },
      tight: {
        title: "Feasible, but manage it tightly",
        message: "Priced hours are close to usable capacity. Keep the deliverable list firm and protect analysis time." + scaleNote
      },
      over: {
        title: "Over team capacity",
        message: "Scoped hours exceed what these headcounts can deliver. Add people, raise hours per week, or cut a deliverable." + scaleNote
      },
      way: {
        title: "Well beyond team capacity",
        message: "This takeoff is well beyond the team. Reduce the scope or add people before you promise the work." + scaleNote
      },
      unknown: {
        title: "Add team capacity",
        message: "Set a headcount, weeks, and hours per week so the fit check has a denominator."
      }
    }[fitKey];

    const ceilingRaw = num(project.budgetCeiling);
    const ceilingKnown = !project.ceilingUnknown && ceilingRaw > 0;
    const overCeiling = ceilingKnown && total > ceilingRaw;

    const timeline = buildTimeline(state, deliverables);
    const payments = buildPayments(state, deliverables, total);

    const summaryRows = buildSummaryRows({
      deliverables: deliverables,
      phases: phases,
      labor: labor,
      fringe: fringe,
      fringeByRole: fringeByRole,
      otherLines: otherLines,
      feeLines: feeLines,
      direct: direct,
      indPct: indPct,
      indirect: indirect,
      indirectText: indirectLabel(state),
      contOn: contOn,
      contPct: contPct,
      contingency: contingency,
      includedAddons: includedAddons,
      total: total
    });

    const narratives = buildNarratives({
      state: state,
      project: project,
      roles: roles,
      fringeByRole: fringeByRole,
      deliverables: deliverables,
      labor: labor,
      fringe: fringe,
      otherTotal: otherTotal,
      direct: direct,
      indirect: indirect,
      indPct: indPct,
      contingency: contingency,
      contOn: contOn,
      contPct: contPct,
      total: total,
      addons: addons,
      addonTotal: addonTotal,
      studentHours: studentHours,
      allHours: allHours,
      facultyHours: roleHours.pi || 0,
      grossHours: grossHours,
      usableHours: usableHours,
      totalUsable: team.totalUsable,
      pricingMode: scaleOn ? "headcount" : "entered",
      fitKey: fitKey,
      ceilingKnown: ceilingKnown,
      ceilingRaw: ceilingRaw,
      overCeiling: overCeiling,
      timeline: timeline,
      payments: payments,
      summaryRows: summaryRows
    });

    const checks = buildChecks({
      state: state,
      project: project,
      deliverables: deliverables,
      labor: labor,
      studentHours: studentHours,
      usableHours: usableHours,
      fitKey: fitKey,
      ceilingKnown: ceilingKnown,
      overCeiling: overCeiling,
      total: total,
      ceilingRaw: ceilingRaw,
      feeLines: feeLines,
      timeline: timeline,
      payments: payments,
      addons: addons,
      weightWarning: weightWarning,
      roles: roles,
      contOn: contOn,
      contPct: contPct,
      fringeByRole: fringeByRole
    });

    return {
      roles: fringeByRole,
      deliverables: deliverables,
      phases: phases,
      labor: labor,
      fringe: fringe,
      otherLines: otherLines,
      feeLines: feeLines,
      otherTotal: otherTotal,
      direct: direct,
      indirectPercent: indPct,
      indirectLabel: indirectLabel(state),
      indirect: indirect,
      contingencyOn: contOn,
      contingencyPercent: contPct,
      contingency: contingency,
      addons: addons,
      addonTotal: addonTotal,
      total: total,
      studentHours: studentHours,
      allHours: allHours,
      facultyHours: roleHours.pi || 0,
      grossHours: grossHours,
      usableHours: usableHours,
      totalUsable: team.totalUsable,
      pricingMode: scaleOn ? "headcount" : "entered",
      bufferLabel: bufferLabel(cap.buffer),
      bufferFactor: bFactor,
      suggestedTravel: suggestedTravel(state),
      travelResolved: expenseAmount(state, "travel"),
      fitKey: fitKey,
      fitTitle: fitCopy.title,
      fitMessage: fitCopy.message,
      fitRatio: ratio,
      fitBarPct: Math.max(0, Math.min(100, Math.round((usableHours > 0 ? studentHours / usableHours : 0) * 100))),
      ceilingKnown: ceilingKnown,
      ceiling: ceilingRaw,
      overCeiling: overCeiling,
      weightFront: weightFront,
      weightBack: weightBack,
      weightWarning: weightWarning,
      timeline: timeline,
      payments: payments,
      summaryRows: summaryRows,
      narratives: narratives,
      checklist: checks.checklist,
      section3: checks.section3,
      flags: checks.flags,
      tierLabel: tierLabel(state.tier),
      tierMultiplier: tierMult(state.tier)
    };
  }

  function buildSummaryRows(m) {
    const rows = [];
    PHASES.forEach(function (phase) {
      const items = m.deliverables.filter(function (d) { return d.enabled && d.phase === phase.id; });
      if (!items.length) return;
      rows.push({ kind: "phase", label: phase.label, amount: null });
      items.forEach(function (d) {
        rows.push({ kind: "deliverable", id: d.id, label: d.name, amount: d.labor });
      });
    });
    rows.push({ kind: "subtotal", label: "Labor subtotal", amount: m.labor });
    rows.push({ kind: "fringe", label: "Fringe", amount: m.fringe });
    m.otherLines.forEach(function (line) {
      rows.push({ kind: "expense", id: line.id, label: line.label, amount: line.amount, note: line.note });
    });
    m.feeLines.forEach(function (fee) {
      if (fee.amount > 0 || fee.note) {
        rows.push({ kind: "fee", id: fee.id, label: fee.label, amount: fee.amount, note: fee.note });
      }
    });
    rows.push({ kind: "direct", label: "Direct subtotal", amount: m.direct });
    rows.push({
      kind: "indirect",
      label: "Indirect (" + m.indirectText + ")",
      amount: m.indirect,
      note: "Charged on the direct subtotal only"
    });
    if (m.contOn) {
      rows.push({
        kind: "contingency",
        label: "Contingency (" + formatPctNumber(m.contPct) + "%)",
        amount: m.contingency,
        note: "Not included in the indirect base"
      });
    }
    m.includedAddons.forEach(function (a) {
      rows.push({
        kind: "addon",
        id: a.id,
        label: "Add-on: " + a.name,
        amount: a.price,
        note: "Client price, not marked up again"
      });
    });
    rows.push({ kind: "total", label: "Total", amount: m.total });
    return rows;
  }

  function buildTimeline(state, deliverables) {
    const project = state.project || {};
    const count = monthCount(project);
    const start = resolveStart(project);
    const months = monthList(start, count);
    const overrides = (state.timeline && state.timeline.monthOverrides) || {};
    const rows = deliverables.map(function (d) {
      let idx;
      if (overrides && Object.prototype.hasOwnProperty.call(overrides, d.id) && Array.isArray(overrides[d.id])) {
        idx = overrides[d.id];
      } else {
        idx = coverage(d.slot, count);
      }
      idx = idx.map(function (n) { return Math.round(num(n)); }).filter(function (n) { return n >= 0 && n < count; });
      return {
        id: d.id,
        name: d.name,
        slot: d.slot,
        phase: d.phase,
        enabled: d.enabled,
        report: d.report,
        gap: d.slot === "feedback",
        months: idx
      };
    });
    const active = rows.filter(function (r) { return r.enabled; });
    const counts = months.map(function (m) {
      const names = active.filter(function (r) { return !r.gap && r.months.indexOf(m.index) !== -1; }).map(function (r) { return r.name; });
      return { index: m.index, count: names.length, names: names, rush: names.length >= 4 };
    });
    const designMonths = active.filter(function (r) { return r.slot === "design"; }).reduce(function (a, r) { return a.concat(r.months); }, []);
    const feedbackMonths = active.filter(function (r) { return r.gap; }).reduce(function (a, r) { return a.concat(r.months); }, []);
    const fieldMonths = active.filter(function (r) { return r.slot === "field" || r.slot === "field-late"; }).reduce(function (a, r) { return a.concat(r.months); }, []);
    const designEnd = designMonths.length ? Math.max.apply(null, designMonths) : null;
    const feedbackSet = unique(feedbackMonths);
    const fieldSet = unique(fieldMonths);
    const overlap = feedbackSet.filter(function (m) { return fieldSet.indexOf(m) !== -1; });
    const fieldStart = fieldSet.length ? Math.min.apply(null, fieldSet) : null;
    const gapHealthy = fieldStart == null
      ? true
      : designEnd != null && fieldStart >= designEnd + 2 && overlap.length === 0 && feedbackSet.some(function (m) { return m > designEnd && m < fieldStart; });
    const warnings = [];
    if (fieldStart != null && !gapHealthy) {
      warnings.push("No protected month between draft delivery and fielding. Leave a client feedback gap before data collection starts.");
    }
    if (overlap.length) {
      warnings.push("Fieldwork is scheduled in the same month as the client feedback window.");
    }
    counts.forEach(function (c) {
      if (c.rush) warnings.push(months[c.index].full + " is rush hour (" + c.count + " workstreams). Spread the work, or stack it on purpose.");
    });

    function monthObj(index) {
      return index == null ? null : months[index];
    }
    const milestones = [];
    if (designEnd != null) {
      const m = monthObj(designEnd);
      milestones.push({
        id: "draft",
        label: "Draft measures delivered",
        date: formatDate(lastDay(m.year, m.month)),
        detail: "Dated deliverable. Do not start fielding in this month."
      });
    }
    if (feedbackSet.length) {
      const first = monthObj(Math.min.apply(null, feedbackSet));
      const last = monthObj(Math.max.apply(null, feedbackSet));
      const span = first.index === last.index ? first.full : first.full + " to " + last.full;
      milestones.push({
        id: "gap",
        label: "Client feedback window",
        date: span,
        detail: gapHealthy ? "Protected gap before fielding." : "This window does not sit fully before fielding."
      });
    }
    if (fieldStart != null) {
      const m = monthObj(fieldStart);
      milestones.push({
        id: "field",
        label: "Data collection starts",
        date: formatDate(new Date(m.year, m.month - 1, 1)),
        detail: "After the feedback window."
      });
    }
      active.filter(function (r) { return r.months.length && (r.report || r.slot === "interim" || r.slot === "report"); }).forEach(function (r) {
      const m = monthObj(Math.max.apply(null, r.months));
      const day = r.slot === "report" ? lastDay(m.year, m.month) : new Date(m.year, m.month - 1, 15);
      milestones.push({
        id: "report-" + r.id,
        label: r.name,
        date: formatDate(day),
        detail: r.slot === "report"
          ? "Final report, timed to the client decision: " + (project.decisionPoint || "the next program decision") + "."
          : "Interim slice. Say what cannot be in it yet."
      });
    });

    return {
      count: count,
      start: start,
      startLabel: formatMonth(start.year, start.month),
      months: months,
      rows: rows,
      counts: counts,
      warnings: warnings,
      gapHealthy: gapHealthy,
      milestones: milestones,
      typeLabel: project.timelineType === "quarter" ? "Quarter" : project.timelineType === "custom" ? "Custom" : "Semester"
    };
  }

  function unique(list) {
    const out = [];
    list.forEach(function (n) { if (out.indexOf(n) === -1) out.push(n); });
    return out;
  }

  // Phase labels accompany deliverables, never blank-amount client rows.
  function clientSummaryRows(model) {
    let phase = "";
    return model.summaryRows.reduce(function (rows, row) {
      if (row.kind === "phase") { phase = row.label; return rows; }
      if ((row.kind === "expense" || row.kind === "fee") && row.amount <= 0) return rows;
      rows.push(Object.assign({}, row, { phase: row.kind === "deliverable" ? phase : "" }));
      return rows;
    }, []);
  }

  function clientPayments(model) {
    return model.payments.items.filter(function (p) { return p.linked && p.percent > 0; });
  }

  function clientScope(state, model) {
    const names = model.deliverables.filter(function (d) { return d.enabled; }).map(function (d) { return d.name; });
    return "This proposal supports " + projectTypeLabel(state.project.projectType) + " for " + (state.project.client || "the client") + ". " +
      (names.length ? "Included deliverables: " + listsJoin(names) + ". " : "No deliverables are selected. ") +
      "Work not listed is outside this scope and requires a separate agreement.";
  }

  function clientText(state, model) {
    model = model || compute(state);
    const p = state.project;
    const payments = clientPayments(model);
    const optional = model.addons.filter(function (a) { return !a.included && a.price > 0; });
    return ["WWB LAB | CLIENT PROPOSAL", p.name || "Untitled project", "Prepared for " + (p.client || "Client"), "",
      "Proposed total: " + money(model.total) + ". " + (model.payments.contractType === "fixed" ? "Fixed cost." : "Cost reimbursement. Invoices reflect work performed; amounts below are a planning guide."),
      clientScope(state, model),
      "Timing: " + (p.deliveryWindow || model.timeline.startLabel + " through " + model.timeline.months[model.timeline.months.length - 1].full) + ".",
      "", "BUDGET", clientSummaryRows(model).map(function (r) { return r.label + ": " + money(r.amount); }).join("\n"),
      "", "PAYMENTS", payments.length ? payments.map(function (item) { return formatPctNumber(item.percent) + "% (" + money(item.amount) + "): " + item.label + " (" + item.deliverableName + ")"; }).join("\n") : "Payment milestones will be agreed once deliverables are priced.",
      !model.payments.balanced ? "Payment allocation is incomplete. Confirm the schedule before agreement." : "",
      "", "OPTIONAL ADD-ONS", optional.length ? optional.map(function (a) { return a.name + ": " + money(a.price) + (a.pricing === "hourly" ? " (" + formatHour(a.hours) + " hours at " + money(a.rate) + "/hr)" : " fixed") + ". Not included in the proposed total."; }).join("\n") : "No optional add-ons quoted.",
      "", "Planning proposal only. Not an institutional submission. Scope, dates, and payment terms are subject to agreement."
    ].join("\n");
  }

  function buildPayments(state, deliverables, total) {
    // Keep percentages unchanged. Retie to the next priced item, or the last.
    const eligible = deliverables.filter(function (d) { return d.enabled && d.labor > 0; });
    const items = (state.payments || []).map(function (p) {
      const original = deliverables.find(function (d) { return d.id === p.deliverableId; });
      const originalIndex = deliverables.indexOf(original);
      const valid = original && original.enabled && original.labor > 0;
      const deliv = valid ? original : eligible.find(function (d) {
        return deliverables.indexOf(d) > originalIndex;
      }) || eligible[eligible.length - 1];
      const staleLabel = deliverables.some(function (d) {
        return (!d.enabled || d.labor <= 0) && d.name && String(p.label || "").toLowerCase().indexOf(d.name.toLowerCase()) !== -1;
      });
      const percent = Math.max(0, num(p.percent));
      return {
        id: p.id,
        label: valid && !staleLabel ? (p.label || deliv.name + " accepted") : (deliv ? deliv.name + " accepted" : "Schedule to be agreed"),
        deliverableId: deliv ? deliv.id : "",
        deliverableName: deliv ? deliv.name : "No priced deliverable",
        linked: !!deliv,
        retied: (!valid || staleLabel) && !!deliv,
        percent: percent,
        amount: cents(total * (percent / 100))
      };
    });
    const sum = cents(items.reduce(function (s, p) { return s + p.percent; }, 0));
    const earlySmaller = items.length >= 2 && items[0].percent < items[items.length - 1].percent;
    return {
      contractType: state.contractType === "reimbursement" ? "reimbursement" : "fixed",
      items: items,
      percentSum: sum,
      balanced: Math.abs(sum - 100) < 0.05,
      earlySmaller: earlySmaller
    };
  }

  function buildNarratives(ctx) {
    const p = ctx.project;
    const enabled = ctx.deliverables.filter(function (d) { return d.enabled; });
    const names = enabled.map(function (d) { return d.name; });
    const rateLine = ctx.roles.map(function (r) {
      return r.name + " " + money(r.rate) + "/hr (" + money(r.dayRate) + "/day)";
    }).join("; ");
    const fringeLine = ctx.fringeByRole.map(function (r) {
      return r.name + " " + formatPctNumber(r.fringePct) + "% (" + money(r.fringe) + ")";
    }).join("; ");
    const ceilingBit = ctx.ceilingKnown
      ? (ctx.overCeiling ? "The total is over the " + money(ctx.ceilingRaw) + " client ceiling." : "The total is within the " + money(ctx.ceilingRaw) + " client ceiling.")
      : "No client ceiling is set.";
    const contBit = ctx.contOn
      ? "Contingency is " + formatPctNumber(ctx.contPct) + "% of the direct subtotal (" + money(ctx.contingency) + ") and is excluded from indirect."
      : "Contingency is off. Uncertainty is carried by the analysis and reporting hours, not by a reserve line.";
    const modeBit = p.dataCollection === "site"
      ? "Site staff collect data, so field hours and suggested travel are lower and training, scripts, and consistency checks are higher."
      : "The evaluation team collects data, so field hours and travel stay with the lab.";
    const draft = ctx.timeline.milestones.filter(function (m) { return m.id === "draft"; })[0];
    const gap = ctx.timeline.milestones.filter(function (m) { return m.id === "gap"; })[0];
    const field = ctx.timeline.milestones.filter(function (m) { return m.id === "field"; })[0];
    const finalMs = ctx.timeline.milestones.filter(function (m) { return m.id.indexOf("report-final") === 0 || /final report/i.test(m.label); })[0];

    const summaryLines = ["BUDGET SUMMARY", p.name || "Untitled project", "Client: " + (p.client || "Client") + " (" + (p.clientType || "Organization") + ")", "Stage: " + stageLabel(p.budgetStage), "Tier: " + tierLabel(ctx.state.tier), "Contract: " + (ctx.payments.contractType === "fixed" ? "Fixed cost" : "Cost reimbursement"), ""];
    clientSummaryRows(ctx).forEach(function (row) {
      if (row.amount == null) summaryLines.push(row.label.toUpperCase());
      else summaryLines.push(row.label + ": " + money(row.amount));
    });
    summaryLines.push("");
    summaryLines.push(ceilingBit);
    const summary = summaryLines.join("\n");

    const assumptions = [
      "Price is the scope takeoff, not student capacity. Labor is the sum of deliverable subtask hours times role rates.",
      "Rates: " + rateLine + ". Day rate = hourly x 8.",
      "Fringe: " + fringeLine + ". Defaults follow the CGU card (faculty 28%, staff 13%, students 5%). The Week 10 sample prices the project manager as a student.",
      "Usable capacity is headcount x " + num(ctx.state.capacity.weeks) + " weeks x hours per week, after a " + bufferLabel(ctx.state.capacity.buffer) + " buffer. Student roles can deliver " + ctx.usableHours + " hours. The whole team, including faculty, can deliver " + ctx.totalUsable + " hours. The takeoff uses " + formatHour(ctx.studentHours) + " student hours and " + formatHour(ctx.facultyHours) + " faculty hours. " + (ctx.state.pricingMode === "headcount" ? "Headcount scaling is on: each role's hours move with its count, from a baseline of one person in the template." : "Entered hours stay put when the headcount changes. Capacity is only a feasibility check."),
      "Scope tier is " + tierLabel(ctx.state.tier) + " (" + Math.round(tierMult(ctx.state.tier) * 100) + "% of the Standard base hours).",
      modeBit,
      "Indirect is " + indirectLabel(ctx.state) + " of the direct subtotal (labor + fringe + other direct costs), not of contingency.",
      contBit,
      "Transcription is not priced as staff time. Put vendor transcription on Consultants / transcription.",
      "Timeline type is " + ctx.timeline.typeLabel.toLowerCase() + ", starting " + ctx.timeline.startLabel + (p.deliveryWindow ? " (" + p.deliveryWindow + ")" : "") + ".",
      "This budget does not assume a later wave, extra site visit, or comparative analysis unless it is turned on as an add-on or its own deliverable."
    ].join("\n\n");

    const scope = [
      "This budget supports a bounded engagement for " + (p.client || "the partner") + " focused on " + projectTypeLabel(p.projectType) + ".",
      "Priced deliverables: " + listsJoin(names) + ".",
      draft ? "Draft measures are delivered " + draft.date + "." : "",
      gap ? "The client feedback window is " + gap.date + ", before fielding." : "Schedule a dated client feedback window before fielding.",
      field ? "Data collection starts " + field.date + "." : "",
      finalMs ? "The final report is " + finalMs.date + ", in time for this decision: " + (p.decisionPoint || "the client's next decision") + "." : "",
      "Work that is not listed is out of scope. Extra waves, extra sessions, and comparative analyses are add-ons or a later phase."
    ].filter(Boolean).join(" ");

    const addonMenu = ctx.addons.map(function (a) {
      const price = a.pricing === "hourly"
        ? money(a.rate) + "/hr x " + formatHour(a.hours) + " hrs = " + money(a.price)
        : money(a.price) + " fixed";
      return a.name + ": " + price + (a.included ? " (included in the total)" : " (not in the total)");
    }).join("\n");

    const justification = [
      "Labor of " + money(ctx.labor) + " is priced from the scope takeoff: each deliverable is split into subtasks, with hours by role. Unticking a deliverable removes its hours and its cost. " + rateLine + ".",
      "Fringe of " + money(ctx.fringe) + " is applied per role (" + fringeLine + ").",
      "Other direct costs are " + money(ctx.otherTotal) + ", covering travel, incentives, transcription, printing, and related lines. Optional fees such as IRB or an external evaluator are included only when an amount is entered, with a source note.",
      "The direct subtotal is " + money(ctx.direct) + ". Indirect (" + indirectLabel(ctx.state) + ") is " + money(ctx.indirect) + ", charged on that direct subtotal only.",
      contBit,
      "Included add-ons add " + money(ctx.addonTotal) + " at the quoted client price, without a second markup.",
      "The total project budget is " + money(ctx.total) + ". " + ceilingBit,
      "The contract is " + (ctx.payments.contractType === "fixed" ? "fixed cost. Payments are tied to deliverables, and the earlier payment is the smaller one." : "cost reimbursement. Hours would be invoiced, and work stops when funds run out. A fixed price is the better fit when the scope is this clear."),
      "Priced add-ons, for the client to accept or decline before the work starts:",
      addonMenu
    ].join("\n\n");

    const payLines = ["PAYMENT SCHEDULE", ctx.payments.contractType === "fixed" ? "Fixed cost. Amounts due when the linked deliverable is accepted." : "Cost reimbursement. The split below is a planning guide, not a fixed fee.", ""];
    ctx.payments.items.forEach(function (item) {
      payLines.push(formatPctNumber(item.percent) + "%  " + money(item.amount) + "  " + item.label + "  (" + item.deliverableName + ")");
    });
    payLines.push("");
    payLines.push("Percents sum to " + formatPctNumber(ctx.payments.percentSum) + "%.");
    const paymentsText = payLines.join("\n");

    return {
      client: clientText(ctx.state, ctx),
      summary: summary,
      assumptions: assumptions,
      scope: scope,
      justification: justification,
      addons: "PRICED ADD-ONS\n\n" + addonMenu + "\n\nThese stay off the base total until the client asks for them.",
      payments: paymentsText
    };
  }

  function statusMeta(status) {
    if (status === "complete") return { status: "complete", label: "Complete" };
    if (status === "na") return { status: "na", label: "Not applicable" };
    return { status: "attention", label: "Needs attention" };
  }

  function item(label, status, detail) {
    const meta = statusMeta(status);
    return { label: label, status: meta.status, statusLabel: meta.label, detail: detail || "" };
  }

  function buildChecks(ctx) {
    const weeklyOk = (ctx.state.roles || []).every(function (r) {
      if (num(r.count) <= 0) return true;
      const hrs = num(r.hrsPerWeek);
      return hrs > 0 && hrs <= 10;
    });
    const feeProblem = ctx.feeLines.some(function (f) { return f.amount > 0 && !f.note; });
    const anyDeliv = ctx.deliverables.some(function (d) { return d.enabled; });
    const piHours = ctx.fringeByRole.filter(function (r) { return r.id === "pi"; })[0];
    const checklist = [
      item("Budget stage is set", "complete", stageLabel(ctx.project.budgetStage)),
      item("Client ceiling is entered or marked unknown", ctx.ceilingKnown || ctx.project.ceilingUnknown ? "complete" : "attention"),
      item("Scope hours fit usable student capacity", ctx.usableHours > 0 && ctx.fitKey !== "over" && ctx.fitKey !== "way" ? "complete" : "attention", formatHour(ctx.studentHours) + " student hrs vs " + ctx.usableHours + " usable"),
      item("At least one deliverable is priced", anyDeliv && ctx.labor > 0 ? "complete" : "attention"),
      item("Faculty time is included or clearly waived", piHours && piHours.hours > 0 ? "complete" : "attention"),
      item("Fringe is set on every role", ctx.roles.every(function (r) { return r.fringePct >= 0 && r.fringeKind; }) ? "complete" : "attention"),
      item("Indirect rate is selected", "complete", ctx.state.indirectPreset === "custom" ? "Custom " + formatPctNumber(indirectPercent(ctx.state)) + "%" : indirectLabel(ctx.state)),
      item("Contingency is off, or a percent you chose", !ctx.contOn || ctx.contPct > 0 ? "complete" : "attention", ctx.contOn ? formatPctNumber(ctx.contPct) + "% of direct, excluded from indirect" : "Off. Pad synthesis and reporting hours instead."),
      item("Other direct costs are reviewed", "complete", "Zeros are fine. Transcription belongs on the consultant line."),
      item("Optional fees have a source note when charged", feeProblem ? "attention" : "complete"),
      item("Weekly hours per person look realistic", weeklyOk ? "complete" : "attention", "Each filled role is between 1 and 10 hours per week."),
      item("Client feedback gap sits before fielding", ctx.timeline.gapHealthy ? "complete" : "attention"),
      item("Fixed-cost payments sum to 100% and tie to deliverables", ctx.payments.contractType === "reimbursement" ? "na" : (ctx.payments.balanced && ctx.payments.items.every(function (p) { return p.linked; }) ? "complete" : "attention")),
      item("Early payment is smaller than the last", ctx.payments.contractType === "reimbursement" ? "na" : (ctx.payments.earlySmaller ? "complete" : "attention")),
      item("Weight sits on analysis and reporting", ctx.weightWarning ? "attention" : "complete")
    ];

    const pricedAddons = ctx.addons.filter(function (a) { return a.price > 0; }).length;
    const reportsOn = ctx.deliverables.some(function (d) {
      return d.enabled && (d.report || d.slot === "interim" || d.slot === "report");
    });
    const section3 = [
      item("Timeline uses the same phases as the crosswalk", ctx.timeline.months.length > 0 && anyDeliv ? "complete" : "attention", "Phases: project management, planning, data collection, analysis, reporting."),
      item("Feedback window is dated, with a gap before fielding", ctx.timeline.gapHealthy && ctx.timeline.milestones.some(function (m) { return m.id === "gap"; }) ? "complete" : "attention"),
      item("Reports are timed to the client's decision point", reportsOn && (ctx.project.decisionPoint || "").trim() ? "complete" : "attention", ctx.project.decisionPoint || ""),
      item("Budget table is by deliverable or phase", anyDeliv ? "complete" : "attention"),
      item("Payment schedule is tied to deliverables", ctx.payments.items.length > 0 && ctx.payments.items.every(function (p) { return p.deliverableId; }) ? "complete" : "attention"),
      item("Budget justification plus two or three priced add-ons", pricedAddons >= 2 ? "complete" : "attention", pricedAddons + " priced add-ons")
    ];

    const flags = [];
    if (ctx.fitKey === "good") flags.push({ tone: "success", title: "Scope fits the team", body: formatHour(ctx.studentHours) + " student hours sit inside " + ctx.usableHours + " usable student hours." });
    else if (ctx.fitKey === "tight") flags.push({ tone: "warning", title: "Running near the limit", body: formatHour(ctx.studentHours) + " of " + ctx.usableHours + " usable student hours. Do not add a deliverable without cutting one." });
    else if (ctx.fitKey === "over" || ctx.fitKey === "way") flags.push({ tone: "danger", title: "Over team capacity", body: "The takeoff needs " + formatHour(ctx.studentHours) + " student hours and the student roles have " + ctx.usableHours + ". Add people or cut scope." });
    (ctx.fringeByRole || []).forEach(function (r) {
      if (r.over) flags.push({ tone: "warning", title: r.name + " is over capacity", body: formatHour(r.hours) + " priced hours against about " + formatHour(r.usable) + " usable hours for this headcount." });
    });
    if (ctx.overCeiling) flags.push({ tone: "danger", title: "Over the client ceiling", body: "Total is " + money(ctx.total) + " against a " + money(ctx.ceilingRaw) + " ceiling. Any amount over the ceiling counts." });
    else if (ctx.ceilingKnown && ctx.total <= ctx.ceilingRaw * 0.8) flags.push({ tone: "note", title: "Room under the ceiling", body: "The total is well under " + money(ctx.ceilingRaw) + ". That can fund a priced add-on, or you can leave the proposal lean." });
    else if (ctx.ceilingKnown) flags.push({ tone: "success", title: "Within the client ceiling", body: money(ctx.total) + " against " + money(ctx.ceilingRaw) + "." });
    if (piHours && piHours.hours <= 0) flags.push({ tone: "warning", title: "No faculty time priced", body: "Add PI hours on design, analysis, or the final report, or write down why faculty time is waived." });
    if (ctx.contOn && ctx.contPct <= 0) flags.push({ tone: "warning", title: "Contingency is on at 0%", body: "Enter a percent or switch contingency off. Prefer padding synthesis hours." });
    else if (ctx.contOn) flags.push({ tone: "note", title: "Contingency is on", body: formatPctNumber(ctx.contPct) + "% of the direct subtotal. Indirect does not apply to it. Many clients will not pay this line." });
    ctx.timeline.warnings.forEach(function (w) { flags.push({ tone: "warning", title: "Timeline", body: w }); });
    if (ctx.weightWarning) flags.push({ tone: "warning", title: "Weight is on the front of the project", body: "Project management and planning cost more labor than analysis and reporting. Pad synthesis and the final report, which is where the weeks actually go." });
    if (ctx.project.dataCollection === "site") flags.push({ tone: "note", title: "Site staff are collecting data", body: "Travel and field hours drop. Training, administration guides, and consistency checks go up. Transcription stays on the consultant line." });
    if (feeProblem) flags.push({ tone: "warning", title: "Optional fee needs a source", body: "Enter a source note for any IRB or external evaluator amount so the figure is not a magic add." });
    if (!ctx.payments.balanced && ctx.payments.contractType === "fixed") flags.push({ tone: "warning", title: "Payments do not sum to 100%", body: "The schedule currently sums to " + formatPctNumber(ctx.payments.percentSum) + "%." });
    flags.push({ tone: "note", title: "Constraint", body: constraintCopy(ctx.project.constraint) });

    return { checklist: checklist, section3: section3, flags: flags };
  }

  function newSubtask(name, partial, tags) {
    return subtask(uid("st"), name || "New subtask", partial || {}, tags || []);
  }

  function newDeliverable(name) {
    const standard = ["Design", "Recruit", "Pilot", "Schedule", "Conduct", "Code", "Write up"];
    return {
      id: uid("dv"),
      name: name || "New deliverable",
      phase: "field",
      slot: "field",
      enabled: true,
      report: false,
      subtasks: standard.map(function (n) {
        const tags = n === "Conduct" ? ["field"] : (n === "Recruit" || n === "Pilot" ? ["training"] : []);
        return newSubtask(n, {}, tags);
      })
    };
  }

  function duplicateAsWave(deliv) {
    const copy = JSON.parse(JSON.stringify(deliv));
    copy.id = uid("dv");
    copy.name = /post-test/i.test(deliv.name) ? deliv.name + " copy" : deliv.name + " (post-test)";
    copy.enabled = true;
    copy.slot = "field-late";
    copy.report = false;
    copy.subtasks.forEach(function (s) {
      s.id = uid("st");
      if (/design|recruit|pilot/i.test(s.name)) {
        ROLE_IDS.forEach(function (id) { s.hours[id] = qty(num(s.hours[id]) * 0.5); });
      }
    });
    return copy;
  }

  function csvCell(v) {
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  }

  function toCsv(state) {
    const model = compute(state);
    const lines = [];
    function push(row) { lines.push(row.map(csvCell).join(",")); }
    push(["Worker Well-Being Lab Budget Studio"]);
    push(["Project", state.project.name]);
    push(["Client", state.project.client]);
    push(["Tier", model.tierLabel]);
    push(["Contract", model.payments.contractType]);
    push([]);
    push(["Role rates"]);
    push(["Role", "Hourly", "Day rate", "Fringe category", "Fringe percent", "Hours", "Labor", "Fringe"]);
    model.roles.forEach(function (r) {
      push([r.name, r.rate, r.dayRate, r.fringeKind, r.fringePct, r.hours, r.labor, r.fringe]);
    });
    push([]);
    push(["Takeoff (priced hours)"]);
    push(["Deliverable", "Subtask", "PI hours", "PM hours", "Associate hours", "Assistant hours", "PI cost", "PM cost", "Associate cost", "Assistant cost", "Line cost"]);
    model.deliverables.forEach(function (d) {
      if (!d.enabled) return;
      d.subtasks.forEach(function (s) {
        push([d.name, s.name, s.hours.pi, s.hours.pm, s.hours.associate, s.hours.assistant, s.cost.pi, s.cost.pm, s.cost.associate, s.cost.assistant, s.labor]);
      });
    });
    push([]);
    push(["Client summary"]);
    push(["Line", "Amount", "Note"]);
    model.summaryRows.forEach(function (row) {
      push([row.label, row.amount == null ? "" : row.amount, row.note || ""]);
    });
    push([]);
    push(["Timeline", model.timeline.typeLabel, model.timeline.startLabel]);
    push(["Month"].concat(model.timeline.months.map(function (m) { return m.label + " " + m.year; })));
    model.timeline.rows.forEach(function (r) {
      if (!r.enabled) return;
      push([r.name].concat(model.timeline.months.map(function (m) { return r.months.indexOf(m.index) !== -1 ? "Yes" : ""; })));
    });
    push(["Active workstreams"].concat(model.timeline.counts.map(function (c) { return c.count; })));
    push([]);
    push(["Payments", model.payments.contractType]);
    model.payments.items.forEach(function (p) {
      push([p.label, p.deliverableName, p.percent, p.amount]);
    });
    return lines.join("\r\n");
  }

  function xmlEsc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function colName(i) {
    let n = i + 1;
    let s = "";
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function sheetXml(rows, options) {
    options = options || {};
    const body = rows.map(function (row, r) {
      const cells = row.map(function (cell, c) {
        if (cell == null || cell === "") return "";
        const ref = colName(c) + (r + 1);
        let style = r === options.header ? 2 : (options.boldRows || []).indexOf(r) !== -1 ? 3 : 0;
        if (r === 0 && options.client) style = 1;
        if (typeof cell === "number" && (options.currencyCols || []).indexOf(c) !== -1) style = style === 3 ? 5 : 4;
        if (typeof cell === "number" && (options.percentCols || []).indexOf(c) !== -1) style = 6;
        const attr = style ? ' s="' + style + '"' : '';
        if (typeof cell === "number" && Number.isFinite(cell)) return '<c r="' + ref + '"' + attr + '><v>' + cell + "</v></c>";
        return '<c r="' + ref + '"' + attr + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(cell) + "</t></is></c>";
      }).join("");
      return '<row r="' + (r + 1) + '">' + cells + "</row>";
    }).join("");
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
       '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (options.client ? '<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><cols><col min="1" max="1" width="57" customWidth="1"/><col min="2" max="2" width="20" customWidth="1"/><col min="3" max="3" width="44" customWidth="1"/></cols>' : '') +
      '<sheetData>' + body + '</sheetData>' +
      (options.client ? '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="1" orientation="portrait" fitToWidth="1" fitToHeight="0"/>' : '') + '</worksheet>';
  }

  function crc32(bytes) {
    if (!crc32.table) {
      const table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
      }
      crc32.table = table;
    }
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crc32.table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zipStore(files) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const now = new Date();
    const dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | (Math.floor(now.getSeconds() / 2) & 31);
    const dosDate = (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);
    files.forEach(function (file) {
      const name = enc.encode(file.name);
      const data = file.data;
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0, true);
      dv.setUint16(8, 0, true);
      dv.setUint16(10, dosTime, true);
      dv.setUint16(12, dosDate, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, name.length, true);
      dv.setUint16(28, 0, true);
      local.set(name, 30);
      const cen = new Uint8Array(46 + name.length);
      const cv = new DataView(cen.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      cen.set(name, 46);
      chunks.push(local, data);
      central.push(cen);
      offset += local.length + data.length;
    });
    const centralStart = offset;
    let centralSize = 0;
    central.forEach(function (c) { chunks.push(c); centralSize += c.length; });
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, centralStart, true);
    ev.setUint16(20, 0, true);
    chunks.push(end);
    const total = chunks.reduce(function (s, c) { return s + c.length; }, 0);
    const out = new Uint8Array(total);
    let p = 0;
    chunks.forEach(function (c) { out.set(c, p); p += c.length; });
    return out;
  }

  function utf8(s) {
    return new TextEncoder().encode(s);
  }

  function workbookStyles() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00;[Red](&quot;$&quot;#,##0.00)"/></numFmts>' +
      '<fonts count="4"><font><sz val="11"/><color rgb="FF45464C"/><name val="Calibri"/></font><font><b/><sz val="18"/><color rgb="FF1A1A1C"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF1A1A1C"/><name val="Calibri"/></font></fonts>' +
      '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1A1A1C"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4F0E9"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="7">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="164" fontId="3" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  }

  function toXlsx(state) {
    const model = compute(state);
    const summary = [["WWB LAB | CLIENT PROPOSAL"], [state.project.name || "Untitled project"],
      ["Prepared for", state.project.client || "Client"], ["Project type", projectTypeLabel(state.project.projectType)],
      ["Stage", stageLabel(state.project.budgetStage)], ["Contract", model.payments.contractType === "fixed" ? "Fixed cost" : "Cost reimbursement"],
      ["Delivery window", state.project.deliveryWindow || model.timeline.startLabel],
      ["Prepared", new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" }) + " (PT)"], [], ["Budget line", "Amount", "Phase"]];
    const boldRows = [];
    clientSummaryRows(model).forEach(function (row) {
      if (["subtotal", "direct", "total"].indexOf(row.kind) !== -1) boldRows.push(summary.length);
      summary.push([row.label, row.amount, row.phase || ""]);
    });
    if (model.ceilingKnown) summary.push(["Client ceiling", model.ceiling]);
    summary.push([], ["Planning proposal only. Not an institutional submission."]);
    const takeoff = [
      ["", "", model.roles[0].name, model.roles[1].name, model.roles[2].name, model.roles[3].name, "Line cost"],
      ["Hourly rate", "", model.roles[0].rate, model.roles[1].rate, model.roles[2].rate, model.roles[3].rate, ""],
      ["Day rate (hourly x 8)", "", model.roles[0].dayRate, model.roles[1].dayRate, model.roles[2].dayRate, model.roles[3].dayRate, ""],
      ["Priced hours for tier", model.tierLabel, "", "", "", "", ""]
    ];
    model.deliverables.forEach(function (d) {
      if (!d.enabled) return;
      takeoff.push([d.name, "", "", "", "", "", ""]);
      d.subtasks.forEach(function (s) {
        takeoff.push(["", s.name, s.hours.pi, s.hours.pm, s.hours.associate, s.hours.assistant, s.labor]);
      });
      takeoff.push(["", "Deliverable labor", d.cost.pi, d.cost.pm, d.cost.associate, d.cost.assistant, d.labor]);
    });
    takeoff.push([]);
    takeoff.push(["Labor subtotal", "", model.roles[0].labor, model.roles[1].labor, model.roles[2].labor, model.roles[3].labor, model.labor]);
    takeoff.push(["Fringe rate", "", model.roles[0].fringePct / 100, model.roles[1].fringePct / 100, model.roles[2].fringePct / 100, model.roles[3].fringePct / 100, ""]);
    takeoff.push(["Fringe", "", model.roles[0].fringe, model.roles[1].fringe, model.roles[2].fringe, model.roles[3].fringe, model.fringe]);
    model.otherLines.forEach(function (line) { takeoff.push([line.label, line.note || "", line.amount]); });
    model.feeLines.forEach(function (fee) {
      if (fee.amount > 0 || fee.note) takeoff.push([fee.label, fee.note, fee.amount]);
    });
    takeoff.push(["Direct subtotal", "", model.direct]);
    takeoff.push(["Indirect (" + model.indirectLabel + ")", "On direct subtotal only", model.indirect]);
    if (model.contingencyOn) takeoff.push(["Contingency", "Not in the indirect base", model.contingency]);
    takeoff.push(["Total", "", model.total]);

    const rates = [["Role", "Hourly", "Day rate", "Fringe category", "Fringe percent"]];
    model.roles.forEach(function (r) { rates.push([r.name, r.rate, r.dayRate, r.fringeKind, r.fringePct]); });

    const time = [["Timeline", model.timeline.typeLabel, model.timeline.startLabel], ["Deliverable"].concat(model.timeline.months.map(function (m) { return m.full; }))];
    model.timeline.rows.forEach(function (r) {
      if (!r.enabled) return;
      time.push([r.name].concat(model.timeline.months.map(function (m) { return r.months.indexOf(m.index) !== -1 ? "x" : ""; })));
    });
    time.push(["Workstreams"].concat(model.timeline.counts.map(function (c) { return c.count; })));
    model.timeline.milestones.forEach(function (ms) { time.push([ms.label, ms.date, ms.detail]); });

    const pays = [["Contract", model.payments.contractType], ["Payment", "Deliverable", "Percent", "Amount"]];
    clientPayments(model).forEach(function (p) { pays.push([p.label, p.deliverableName, p.percent / 100, p.amount]); });

    pays.push([], ["Rule: off or unpriced milestones move to the next priced deliverable, or the last priced deliverable."]);
    if (!clientPayments(model).length) pays.push(["Payment milestones will be agreed once deliverables are priced."]);
    if (!model.payments.balanced) pays.push(["Payment allocation is incomplete. Confirm before agreement."]);
    const sheets = [
      { name: "Summary", rows: summary, options: { client: true, header: 9, currencyCols: [1], boldRows: boldRows } },
      { name: "Takeoff", rows: takeoff },
      { name: "Rates", rows: rates },
      { name: "Timeline", rows: time },
      { name: "Payments", rows: pays, options: { header: 1, percentCols: [2], currencyCols: [3] } }
    ];
    const contentTypes = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    ];
    sheets.forEach(function (_s, i) {
      contentTypes.push('<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
    });
    contentTypes.push('<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>');
    contentTypes.push("</Types>");
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>";
    const wb = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
    ];
    const wbRels = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    ];
    sheets.forEach(function (s, i) {
      wb.push('<sheet name="' + xmlEsc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>');
      wbRels.push('<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>');
    });
    wb.push("</sheets></workbook>");
    wbRels.push('<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>');
    wbRels.push("</Relationships>");
    const files = [
      { name: "[Content_Types].xml", data: utf8(contentTypes.join("")) },
      { name: "_rels/.rels", data: utf8(rels) },
      { name: "xl/workbook.xml", data: utf8(wb.join("")) },
      { name: "xl/_rels/workbook.xml.rels", data: utf8(wbRels.join("")) }
    ];
    files.push({ name: "xl/styles.xml", data: utf8(workbookStyles()) });
    sheets.forEach(function (s, i) {
      files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", data: utf8(sheetXml(s.rows, s.options)) });
    });
    return zipStore(files);
  }

  function exportPayload(state) {
    const copy = JSON.parse(JSON.stringify(state));
    delete copy.ui;
    return {
      app: "wwb-budget-studio",
      version: 1,
      savedAt: new Date().toISOString(),
      state: copy
    };
  }

  function hydrate(payload) {
    const base = defaultState();
    const src = payload && payload.state ? payload.state : payload;
    if (!src || typeof src !== "object") return base;
    const next = base;
    if (src.project) next.project = Object.assign({}, base.project, src.project);
    if (src.capacity) next.capacity = Object.assign({}, base.capacity, src.capacity);
    if (src.tier) next.tier = src.tier;
    if (src.pricingMode === "entered" || src.pricingMode === "headcount") next.pricingMode = src.pricingMode;
    if (Array.isArray(src.roles) && src.roles.length) {
      next.roles = defaultRoles().map(function (role) {
        const found = src.roles.filter(function (r) { return r.id === role.id; })[0] || {};
        return Object.assign({}, role, found, { id: role.id });
      });
    }
    if (Array.isArray(src.deliverables) && src.deliverables.length) {
      next.deliverables = src.deliverables.map(function (d) {
        return {
          id: d.id || uid("dv"),
          name: d.name || "Deliverable",
          phase: d.phase || "field",
          slot: d.slot || "field",
          enabled: d.enabled !== false,
          report: !!d.report,
          subtasks: (d.subtasks || []).map(function (s) {
            return {
              id: s.id || uid("st"),
              name: s.name || "Subtask",
              hours: hoursObj(s.hours),
              tags: Array.isArray(s.tags) ? s.tags : []
            };
          })
        };
      });
    }
    if (src.expenses) next.expenses = Object.assign({}, base.expenses, src.expenses);
    if (Array.isArray(src.fees)) next.fees = src.fees.map(function (f) {
      return { id: f.id || uid("fee"), label: f.label || "Fee", amount: f.amount == null ? "" : f.amount, note: f.note || "" };
    });
    if (src.indirectPreset) next.indirectPreset = src.indirectPreset;
    if (src.indirectCustom != null) next.indirectCustom = src.indirectCustom;
    next.contingencyOn = !!src.contingencyOn;
    if (src.contingencyPct != null) next.contingencyPct = src.contingencyPct;
    if (src.contractType) next.contractType = src.contractType;
    if (Array.isArray(src.addons)) next.addons = src.addons;
    if (Array.isArray(src.payments)) next.payments = src.payments;
    if (src.timeline && src.timeline.monthOverrides) next.timeline = { monthOverrides: src.timeline.monthOverrides };
    if (src.ui) next.ui = Object.assign({}, base.ui, src.ui, { notice: "" });
    next.version = 1;
    return next;
  }

  function plainText(state) {
    const model = compute(state);
    return [
      "INTERNAL LAB COPY. Not for client handoff.",
      "",
      model.narratives.summary,
      "",
      "INTERNAL LAB COPY: ASSUMPTIONS",
      model.narratives.assumptions,
      "",
      "SCOPE STATEMENT",
      model.narratives.scope,
      "",
      "INTERNAL LAB COPY: BUDGET JUSTIFICATION",
      model.narratives.justification,
      "",
      model.narratives.payments,
      "",
      model.narratives.addons
    ].join("\n");
  }

  return {
    ROLE_IDS: ROLE_IDS,
    PHASES: PHASES,
    SLOTS: SLOTS,
    EXPENSES: EXPENSES,
    TIER_MULT: TIER_MULT,
    FRINGE: FRINGE,
    INDIRECT: INDIRECT,
    defaultState: defaultState,
    compute: compute,
    money: money,
    formatHour: formatHour,
    formatPctNumber: formatPctNumber,
    num: num,
    cents: cents,
    dayRate: dayRate,
    coverage: coverage,
    monthCount: monthCount,
    parseWindow: parseWindow,
    resolveStart: resolveStart,
    effectiveHour: effectiveHour,
    hourMult: hourMult,
    roleScale: roleScale,
    setPersonWeeks: setPersonWeeks,
    bakePricingMode: bakePricingMode,
    suggestedTravel: suggestedTravel,
    newDeliverable: newDeliverable,
    newSubtask: newSubtask,
    duplicateAsWave: duplicateAsWave,
    toCsv: toCsv,
    toXlsx: toXlsx,
    exportPayload: exportPayload,
    hydrate: hydrate,
    plainText: plainText,
    clientText: clientText,
    clientScope: clientScope,
    clientSummaryRows: clientSummaryRows,
    clientPayments: clientPayments,
    addonPrice: addonPrice,
    stageLabel: stageLabel,
    projectTypeLabel: projectTypeLabel,
    tierLabel: tierLabel,
    indirectLabel: indirectLabel
  };
});
