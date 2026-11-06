(function () {
  "use strict";

  const E = window.WWBEngine;
  const KEY = "wwb-budget-studio-v1";
  const root = document.getElementById("app");
  const FIT = {
    good: { icon: "✓", solid: "#3f7d52", bg: "#f8faf0", border: "#e6edce" },
    tight: { icon: "!", solid: "#b86a22", bg: "#f9e4d4", border: "#f3ccaa" },
    over: { icon: "!", solid: "#a8460f", bg: "#f8e4e4", border: "#e4b4b4" },
    way: { icon: "!", solid: "#8d2e2e", bg: "#f8e4e4", border: "#e4b4b4" },
    unknown: { icon: "?", solid: "#6c6d74", bg: "#f4f0e9", border: "#dddee2" }
  };
  const PHASE_COLOR = {
    pm: "#575da1",
    planning: "#7aa0ad",
    field: "#eea76f",
    analysis: "#c6541c",
    reporting: "#8aa05a"
  };
  const CLIENTS = ["Nonprofit", "Business", "Government", "University", "Labor union", "Other"];
  const STAGES = [
    ["quick", "Quick estimate"],
    ["draft", "Draft"],
    ["proposal", "Proposal-ready"],
    ["final", "Final"]
  ];
  const TYPES = [
    ["needs_assessment", "Needs assessment"],
    ["evaluation_plan", "Evaluation plan"],
    ["outcome_evaluation", "Outcome evaluation"],
    ["survey_reporting", "Survey and reporting"],
    ["workshop", "Workshop or facilitation"],
    ["combined", "Combined package"]
  ];
  const RULES = [
    "Headcount times weeks times hours per week, after the buffer, is usable capacity.",
    "Scale with headcount revises labor when the roster changes. Entered hours keeps the grid fixed and uses team size as a check only.",
    "Lean scales hours to 60%, Standard to 100%, Expanded to 150%.",
    "Leave a dated client feedback gap before fielding.",
    "Pad analysis and reporting. Leave contingency off unless the client expects that line.",
    "Show the client one line per deliverable. Keep the subtask grid for the lab.",
    "Day rate is the hourly rate times 8. Transcription belongs on the consultant line, at zero hours.",
    "Indirect applies to the direct subtotal only. It does not apply to contingency.",
    "Default the contract to fixed cost. Tie payments to deliverables and keep the early one smaller.",
    "If site staff collect data, travel and field time drop and training time rises."
  ];

  let state;
  let pendingCaret = null;
  const drafts = {};
  let copied = "";

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function byId(list, id) {
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function isOpen(d) {
    if (Object.prototype.hasOwnProperty.call(state.ui.openDeliv, d.id)) return !!state.ui.openDeliv[d.id];
    return !!d.enabled;
  }

  function clearDrafts() {
    Object.keys(drafts).forEach(function (k) { delete drafts[k]; });
  }

  function persist() {
    try {
      const payload = E.exportPayload(state);
      payload.ui = {
        open: state.ui.open,
        openDeliv: state.ui.openDeliv,
        rulesOpen: state.ui.rulesOpen,
        kitchenOpen: state.ui.kitchenOpen
      };
      localStorage.setItem(KEY, JSON.stringify(payload));
      state.ui.savedAt = true;
      state.ui.noticeBad = false;
    } catch (err) {
      state.ui.notice = "Could not save in this browser. Download a JSON file before you close the tab.";
      state.ui.noticeBad = true;
    }
  }

  function load() {
    state = E.defaultState();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      state = E.hydrate(data);
      if (data.ui) {
        state.ui.open = Object.assign({}, state.ui.open, data.ui.open || {});
        state.ui.openDeliv = data.ui.openDeliv || {};
        if (data.ui.rulesOpen === false) state.ui.rulesOpen = false;
        state.ui.kitchenOpen = !!data.ui.kitchenOpen;
      }
      state.ui.notice = "Restored the budget saved in this browser.";
      state.ui.savedAt = true;
    } catch (err) {
      state = E.defaultState();
      state.ui.notice = "The saved budget could not be read. Started from the lab template.";
      state.ui.noticeBad = true;
    }
  }

  function fileBase() {
    const s = String(state.project.name || "budget").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return s || "budget";
  }

  function download(name, blob) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
      return;
    }
    fallbackCopy(text);
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (err) { /* ignore */ }
    ta.remove();
  }

  function applyBind(bind, value) {
    if (bind === "project.deliveryWindow") {
      state.project.deliveryWindow = value;
      const parsed = E.parseWindow(value);
      if (parsed) {
        state.project.startPinned = false;
        state.project.startMonth = parsed.year + "-" + String(parsed.month).padStart(2, "0");
      }
      return;
    }
    if (bind === "start") {
      state.project.startMonth = value;
      state.project.startPinned = true;
      return;
    }
    if (bind.indexOf("project.") === 0) {
      state.project[bind.slice(8)] = value;
      return;
    }
    if (bind.indexOf("capacity.") === 0) {
      state.capacity[bind.slice(9)] = value;
      return;
    }
    const p = bind.split("|");
    if (p[0] === "role") {
      const role = byId(state.roles, p[1]);
      if (role) role[p[2]] = value;
      return;
    }
    if (p[0] === "expense") {
      if (p[1] === "travel") state.expenses.travelTouched = true;
      state.expenses[p[1]] = value;
      return;
    }
    if (p[0] === "note") {
      state.expenses.travelNote = value;
      return;
    }
    if (p[0] === "fee") {
      const fee = byId(state.fees, p[1]);
      if (fee) fee[p[2]] = value;
      return;
    }
    if (p[0] === "indirectCustom") { state.indirectCustom = value; return; }
    if (p[0] === "contingencyPct") { state.contingencyPct = value; return; }
    if (p[0] === "contingencyOn") { state.contingencyOn = !!value; return; }
    if (p[0] === "addon") {
      const addon = byId(state.addons, p[1]);
      if (addon) addon[p[2]] = value;
      return;
    }
    if (p[0] === "pay") {
      const pay = byId(state.payments, p[1]);
      if (pay) pay[p[2]] = value;
      return;
    }
    if (p[0] === "deliv") {
      const d = byId(state.deliverables, p[1]);
      if (!d) return;
      if (p[2] === "enabled" || p[2] === "report") d[p[2]] = !!value;
      else d[p[2]] = value;
      return;
    }
    if (p[0] === "sub") {
      const d = byId(state.deliverables, p[1]);
      const s = d && byId(d.subtasks, p[2]);
      if (s) s.name = value;
    }
  }

  function applyHour(bind, raw) {
    const p = bind.split("|");
    const d = byId(state.deliverables, p[1]);
    const s = d && byId(d.subtasks, p[2]);
    if (!s) return;
    const mult = E.hourMult(state, s.tags, p[3]);
    s.hours[p[3]] = mult ? E.num(raw) / mult : 0;
    drafts[bind] = raw;
  }

  function onField(e) {
    const t = e.target;
    if (!t.dataset || !t.dataset.bind) return;
    const bind = t.dataset.bind;
    const value = t.type === "checkbox" ? t.checked : t.value;
    if (bind.indexOf("hour|") === 0) applyHour(bind, value);
    else if (bind.indexOf("pweeks|") === 0) {
      drafts[bind] = value;
      E.setPersonWeeks(state, bind.split("|")[1], value);
    } else applyBind(bind, value);
    let start = null;
    let end = null;
    try { start = t.selectionStart; end = t.selectionEnd; } catch (err) { /* number inputs */ }
    pendingCaret = { bind: bind, start: start, end: end };
    persist();
    render();
  }

  function toggleMonth(id, index) {
    const model = E.compute(state);
    const row = model.timeline.rows.filter(function (r) { return r.id === id; })[0];
    if (!row) return;
    const has = Object.prototype.hasOwnProperty.call(state.timeline.monthOverrides, id);
    const current = (has ? state.timeline.monthOverrides[id] : row.months).slice();
    const at = current.indexOf(index);
    if (at === -1) current.push(index);
    else current.splice(at, 1);
    current.sort(function (a, b) { return a - b; });
    state.timeline.monthOverrides[id] = current;
  }

  function onClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn || !root.contains(btn)) return;
    const action = btn.dataset.action;
    if (action === "section") {
      const id = btn.dataset.id;
      state.ui.open[id] = !state.ui.open[id];
    } else if (action === "goto-review") {
      state.ui.open.s4 = true;
      pendingCaret = null;
      persist();
      render("review");
      return;
    } else if (action === "seg") {
      const group = btn.dataset.group;
      const field = btn.dataset.field;
      const value = btn.dataset.value;
      if (group === "project") state.project[field] = value;
      else if (group === "capacity") state.capacity[field] = value;
      else if (group === "tier") { state.tier = value; clearDrafts(); }
      else if (group === "pricing") { E.bakePricingMode(state, value); clearDrafts(); }
      else if (group === "indirect") state.indirectPreset = value;
      else if (group === "contract") state.contractType = value;
      else if (group === "data") { state.project.dataCollection = value; clearDrafts(); }
      else if (group === "constraint") state.project.constraint = value;
      else if (group === "addon") {
        const addon = byId(state.addons, btn.dataset.id);
        if (addon) addon.pricing = value;
      }
    } else if (action === "count") {
      const role = byId(state.roles, btn.dataset.id);
      if (!role) return;
      const next = Math.max(0, Math.min(30, Math.round(E.num(role.count)) + Number(btn.dataset.dir)));
      role.count = String(next);
      clearDrafts();
    } else if (action === "deliv-toggle") {
      const d = byId(state.deliverables, btn.dataset.id);
      if (d) d.enabled = !d.enabled;
    } else if (action === "deliv-open") {
      const d = byId(state.deliverables, btn.dataset.id);
      if (d) state.ui.openDeliv[d.id] = !isOpen(d);
    } else if (action === "deliv-add") {
      const d = E.newDeliverable("New deliverable");
      state.deliverables.push(d);
      state.ui.openDeliv[d.id] = true;
    } else if (action === "deliv-wave") {
      const d = byId(state.deliverables, btn.dataset.id);
      if (!d) return;
      const copy = E.duplicateAsWave(d);
      const at = state.deliverables.indexOf(d);
      state.deliverables.splice(at + 1, 0, copy);
      state.ui.openDeliv[copy.id] = true;
    } else if (action === "deliv-remove") {
      const d = byId(state.deliverables, btn.dataset.id);
      if (!d) return;
      if (!window.confirm("Remove " + d.name + " from this budget?")) return;
      state.deliverables = state.deliverables.filter(function (item) { return item.id !== d.id; });
    } else if (action === "sub-add") {
      const d = byId(state.deliverables, btn.dataset.id);
      if (d) d.subtasks.push(E.newSubtask("New subtask"));
    } else if (action === "sub-remove") {
      const d = byId(state.deliverables, btn.dataset.id);
      if (!d || d.subtasks.length < 2) return;
      d.subtasks = d.subtasks.filter(function (s) { return s.id !== btn.dataset.sub; });
    } else if (action === "month") {
      toggleMonth(btn.dataset.id, Number(btn.dataset.index));
    } else if (action === "months-reset") {
      state.timeline.monthOverrides = {};
    } else if (action === "pay-add") {
      const first = state.deliverables[0];
      state.payments.push({
        id: "pay-" + Math.random().toString(36).slice(2, 8),
        label: "New payment",
        deliverableId: first ? first.id : "",
        percent: "0"
      });
    } else if (action === "pay-remove") {
      state.payments = state.payments.filter(function (p) { return p.id !== btn.dataset.id; });
    } else if (action === "rules") {
      state.ui.rulesOpen = !state.ui.rulesOpen;
    } else if (action === "kitchen") {
      state.ui.kitchenOpen = !state.ui.kitchenOpen;
    } else if (action === "dismiss") {
      state.ui.notice = "";
      state.ui.noticeBad = false;
    } else if (action === "copy") {
      const model = E.compute(state);
      copyText(model.narratives[btn.dataset.which] || "");
      copied = btn.dataset.which;
      document.querySelectorAll("[data-copy-for]").forEach(function (el) {
        el.textContent = el.getAttribute("data-copy-for") === copied ? "Copied" : "Copy";
      });
      setTimeout(function () {
        copied = "";
        document.querySelectorAll("[data-copy-for]").forEach(function (el) { el.textContent = "Copy"; });
      }, 1400);
      return;
    } else if (action === "download") {
      const kind = btn.dataset.kind;
      const base = fileBase();
      if (kind === "csv") download(base + "-budget.csv", new Blob(["\uFEFF" + E.toCsv(state)], { type: "text/csv;charset=utf-8" }));
      else if (kind === "xlsx") download(base + "-budget.xlsx", new Blob([E.toXlsx(state)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      else if (kind === "json") download(base + "-budget.json", new Blob([JSON.stringify(E.exportPayload(state), null, 2)], { type: "application/json" }));
      else if (kind === "txt") download(base + "-narrative.txt", new Blob([E.plainText(state)], { type: "text/plain;charset=utf-8" }));
      return;
    } else if (action === "load") {
      document.getElementById("loader").click();
      return;
    } else if (action === "print") {
      window.print();
      return;
    } else if (action === "reset") {
      if (!window.confirm("Reset to the Worker Well-Being template? This replaces the budget saved in this browser.")) return;
      clearDrafts();
      state = E.defaultState();
      try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
      state.ui.notice = "Template restored.";
    } else {
      return;
    }
    pendingCaret = null;
    persist();
    render();
  }

  function field(bind, value, extra) {
    return '<input class="field" data-bind="' + esc(bind) + '" value="' + esc(value) + '" autocomplete="off" ' + (extra || "") + ">";
  }

  function segs(group, fieldName, options, current) {
    return '<div class="segs">' + options.map(function (opt) {
      const value = opt[0];
      const label = opt[1];
      const on = current === value ? " on" : "";
      return '<button type="button" class="seg' + on + '" data-action="seg" data-group="' + esc(group) + '" data-field="' + esc(fieldName) + '" data-value="' + esc(value) + '">' + esc(label) + "</button>";
    }).join("") + "</div>";
  }

  function select(bind, options, current) {
    return '<select class="select" data-bind="' + esc(bind) + '">' + options.map(function (opt) {
      return '<option value="' + esc(opt[0]) + '"' + (opt[0] === current ? " selected" : "") + ">" + esc(opt[1]) + "</option>";
    }).join("") + "</select>";
  }

  function moneyInput(bind, value) {
    return '<div class="money-wrap"><span class="prefix">$</span>' + field(bind, value, 'inputmode="decimal"') + "</div>";
  }

  function checks(items) {
    return '<div class="checks">' + items.map(function (c) {
      const icon = c.status === "complete" ? "✓" : c.status === "na" ? "·" : "!";
      return '<div class="check-item"><span class="badge ' + c.status + '">' + icon + '</span><div><div class="t">' + esc(c.label) + '</div>' +
        (c.detail ? '<div class="d">' + esc(c.detail) + "</div>" : "") +
        '<div class="status ' + c.status + '">' + esc(c.statusLabel) + "</div></div></div>";
    }).join("") + "</div>";
  }

  function summaryTable(model) {
    const body = model.summaryRows.map(function (row) {
      if (row.amount == null) return '<tr class="phase"><td colspan="2">' + esc(row.label) + "</td></tr>";
      const note = row.note ? '<div class="note">' + esc(row.note) + "</div>" : "";
      return '<tr class="' + esc(row.kind) + '"><td>' + esc(row.label) + note + '</td><td class="amt">' + E.money(row.amount) + "</td></tr>";
    }).join("");
    const fringe = model.roles.map(function (r) {
      return esc(r.name) + " " + E.formatPctNumber(r.fringePct) + "% · " + E.money(r.fringe);
    }).join(" · ");
    return '<div class="scroll"><table class="sheet"><thead><tr><th>Line</th><th class="amt">Amount</th></tr></thead><tbody>' +
      body + "</tbody></table></div>" +
      '<p class="hint mt-sm">Fringe detail: ' + fringe + ". Indirect is " + esc(model.indirectLabel) +
      " of the direct subtotal (" + E.money(model.direct) + "). Contingency is not in that base.</p>";
  }

  function hourValue(d, s, roleId) {
    const key = "hour|" + d.id + "|" + s.id + "|" + roleId;
    if (drafts[key] != null && pendingCaret && pendingCaret.bind === key) return drafts[key];
    return E.formatHour(s.hours[roleId]);
  }

  function dayHint(raw) {
    const h = E.num(raw);
    if (!h) return "";
    const days = Math.round((h / 8) * 100) / 100;
    return days + (days === 1 ? " day" : " days");
  }

  function tagNote(tags) {
    if (!tags) return "";
    if (tags.indexOf("field") !== -1) return "field";
    if (tags.indexOf("training") !== -1) return "training";
    return "";
  }

  function takeoff(model) {
    const head = '<div class="hours head"><span>Subtask</span>' + model.roles.map(function (r) {
      return "<span>" + esc(r.name) + "<small>" + E.money(r.rate) + "/hr · " + E.money(r.dayRate) + "/day</small></span>";
    }).join("") + "<span>Line</span><span></span></div>";
    return model.deliverables.map(function (d) {
      const open = isOpen(d);
      const body = open ? (
        '<div class="take-body"><div class="meta-row"><div><span class="lbl">Phase</span>' +
        select("deliv|" + d.id + "|phase", E.PHASES.map(function (p) { return [p.id, p.label]; }), d.phase) +
        '</div><div><span class="lbl">Timeline placement</span>' +
        select("deliv|" + d.id + "|slot", E.SLOTS.map(function (s) { return [s.id, s.label]; }), d.slot) +
        '</div><label class="check"><input type="checkbox" data-bind="deliv|' + d.id + '|report"' + (d.report ? " checked" : "") + "> Report date</label></div>" +
        '<div class="scroll">' + head + d.subtasks.map(function (s) {
          const tag = tagNote(s.tags);
          const cells = E.ROLE_IDS.map(function (roleId) {
            const shown = hourValue(d, s, roleId);
            return '<label><input class="field" inputmode="decimal" autocomplete="off" aria-label="' + esc(s.name + " " + roleId + " hours") +
              '" data-bind="hour|' + d.id + "|" + s.id + "|" + roleId + '" value="' + esc(shown) + '"><span class="dayhint">' + esc(dayHint(shown)) + "</span></label>";
          }).join("");
          return '<div class="hours"><input class="field subname" data-bind="sub|' + d.id + "|" + s.id + '" value="' + esc(s.name) + '" aria-label="Subtask name" title="' + esc(tag ? tag + " task" : "Subtask") + '">' +
            cells +
            '<div class="linecost">' + E.money(s.labor) + '</div><button type="button" class="icon-btn" data-action="sub-remove" data-id="' + esc(d.id) + '" data-sub="' + esc(s.id) + '" aria-label="Remove subtask">×</button></div>';
        }).join("") + "</div>" +
        '<div class="actions mt-sm"><button type="button" class="btn-tiny" data-action="sub-add" data-id="' + esc(d.id) + '">Add subtask</button>' +
        '<button type="button" class="btn-tiny" data-action="deliv-wave" data-id="' + esc(d.id) + '">Copy as post-test wave</button>' +
        '<button type="button" class="btn-tiny btn-danger" data-action="deliv-remove" data-id="' + esc(d.id) + '">Remove deliverable</button></div></div>'
      ) : "";
      return '<article class="take"><div class="take-head"><input type="checkbox" data-bind="deliv|' + d.id + '|enabled" aria-label="Include ' + esc(d.name) + '"' + (d.enabled ? " checked" : "") + ">" +
        field("deliv|" + d.id + "|name", d.name, 'aria-label="Deliverable name"') +
        '<div class="take-sum"><strong>' + E.money(d.labor) + "</strong><span>" + E.formatHour(d.studentHours) + ' student hrs</span></div>' +
        '<button type="button" class="btn-tiny" data-action="deliv-open" data-id="' + esc(d.id) + '" aria-expanded="' + open + '">' + (open ? "Hide" : "Edit") + "</button></div>" +
        body + "</article>";
    }).join("");
  }

  function kitchen(model) {
    if (!state.ui.kitchenOpen) return "";
    const head = model.roles.map(function (r) {
      return '<th class="amt">' + esc(r.name) + ' hrs</th><th class="amt">' + esc(r.name) + " $</th>";
    }).join("");
    const body = model.deliverables.filter(function (d) { return d.enabled; }).map(function (d) {
      return d.subtasks.map(function (s) {
        const cells = E.ROLE_IDS.map(function (id) {
          return '<td class="amt">' + E.formatHour(s.hours[id]) + '</td><td class="amt">' + E.money(s.cost[id]) + "</td>";
        }).join("");
        return "<tr><td>" + esc(d.name) + "</td><td>" + esc(s.name) + "</td>" + cells + '<td class="amt">' + E.money(s.labor) + "</td></tr>";
      }).join("");
    }).join("");
    return '<div class="scroll mt"><table class="matrix"><thead><tr><th>Deliverable</th><th>Subtask</th>' + head + '<th class="amt">Line</th></tr></thead><tbody>' +
      (body || '<tr><td colspan="11">No deliverables are on.</td></tr>') + "</tbody></table></div>";
  }

  function timelineBlock(model) {
    const tl = model.timeline;
    const style = "--months:" + tl.months.length;
    const head = '<div class="tl-h">Deliverable</div>' + tl.months.map(function (m) {
      return '<div class="tl-h">' + esc(m.label) + '<div class="note">' + m.year + "</div></div>";
    }).join("");
    const rows = tl.rows.filter(function (r) { return r.enabled; }).map(function (r) {
      const name = '<div class="tl-name">' + esc(r.name) + "</div>";
      const cells = tl.months.map(function (m) {
        const on = r.months.indexOf(m.index) !== -1;
        let cls = "cell";
        if (on && r.gap) cls = "cell gap";
        else if (on && (r.report || r.slot === "interim" || r.slot === "report")) cls = "cell report";
        else if (on) cls = "cell on";
        return '<button type="button" class="' + cls + '" data-action="month" data-id="' + esc(r.id) + '" data-index="' + m.index + '" aria-pressed="' + on + '" aria-label="' + esc(r.name + " " + m.full) + '"></button>';
      }).join("");
      return name + cells;
    }).join("");
    const bars = '<div class="tl-name">Workstreams</div>' + tl.counts.map(function (c) {
      const h = Math.max(8, Math.round((c.count / 6) * 46));
      return '<div class="count"><div class="bar' + (c.rush ? " rush" : "") + '" style="height:' + h + 'px"><span>' + c.count + "</span></div></div>";
    }).join("");
    const miles = tl.milestones.map(function (m) {
      return '<div class="mile"><strong>' + esc(m.date) + "</strong><div>" + esc(m.label) + '<div class="note">' + esc(m.detail) + "</div></div></div>";
    }).join("");
    const warns = tl.warnings.map(function (w) {
      return '<div class="callout warning mt-sm"><strong>Timeline</strong><p>' + esc(w) + "</p></div>";
    }).join("");
    return '<p class="hint">' + esc(tl.typeLabel) + " timeline starting " + esc(tl.startLabel) +
      ". Click a cell to move a deliverable. Hatched cells are the client feedback gap. A month with 4 or more workstreams is rush hour.</p>" +
      '<div class="timeline mt-sm"><div class="tl" style="' + style + '">' + head + rows + "</div>" +
      '<div class="counts" style="' + style + '">' + bars + "</div></div>" +
      '<div class="legend"><span><i class="swatch" style="background:#9c9ec7"></i>Work</span><span><i class="swatch" style="background:#eea76f"></i>Report</span><span><i class="swatch" style="background:#e6edce"></i>Feedback gap</span></div>' +
      warns +
      '<div class="miles">' + miles + "</div>" +
      '<div class="actions mt"><button type="button" class="btn-tiny" data-action="months-reset">Reset months to the timeline type</button></div>';
  }

  function weightBlock(model) {
    const bar = model.phases.map(function (p) {
      return '<span style="width:' + p.pct + "%;background:" + (PHASE_COLOR[p.id] || "#ccc") + '" title="' + esc(p.label) + " " + p.pct + '%"></span>';
    }).join("");
    const key = model.phases.map(function (p) {
      return "<span><i style=\"background:" + (PHASE_COLOR[p.id] || "#ccc") + "\"></i>" + esc(p.label) + " " + p.pct + "% · " + E.money(p.labor) + "</span>";
    }).join("");
    const warn = model.weightWarning
      ? '<div class="callout warning mt-sm"><strong>Weight is sitting on planning</strong><p>Project management and planning cost more labor than analysis and reporting. Pad synthesis and the final report. That is the part under the water.</p></div>'
      : '<p class="hint mt-sm">Analysis and reporting currently carry more labor than planning and project management.</p>';
    return '<div class="weight" aria-hidden="true">' + bar + '</div><div class="weight-key">' + key + "</div>" + warn;
  }

  function step1(model) {
    const p = state.project;
    const open = state.ui.open.s1;
    const custom = p.timelineType === "custom"
      ? '<div class="mt-sm"><label class="lbl">Custom length (months)</label>' + field("project.customMonths", p.customMonths, 'inputmode="numeric"') + "</div>"
      : "";
    return card("1", "Project snapshot", "Who it is for, the ceiling, and the window the timeline has to fit.", open, "s1",
      '<div class="grid-2"><div><label class="lbl">Project name</label>' + field("project.name", p.name) +
      '</div><div><label class="lbl">Client or organization</label>' + field("project.client", p.client) + "</div></div>" +
      '<div class="mt"><span class="lbl">Client type</span>' + segs("project", "clientType", CLIENTS.map(function (c) { return [c, c]; }), p.clientType) + "</div>" +
      '<div class="mt"><span class="lbl">Budget stage</span>' + segs("project", "budgetStage", STAGES, p.budgetStage) + "</div>" +
      '<div class="grid-2 mt"><div><label class="lbl">Client budget ceiling</label>' + moneyInput("project.budgetCeiling", p.budgetCeiling) +
      '<label class="check"><input type="checkbox" data-bind="project.ceilingUnknown"' + (p.ceilingUnknown ? " checked" : "") + "> Ceiling unknown right now</label></div>" +
      '<div><label class="lbl">Target delivery window</label>' + field("project.deliveryWindow", p.deliveryWindow, 'placeholder="Spring 2027"') +
      '<p class="hint mt-sm">A season and year sets the first month, unless you pin the start below.</p></div></div>' +
      '<div class="grid-2 mt"><div><label class="lbl">Timeline starts</label><input class="field" type="month" data-bind="start" value="' + esc(model.timeline.start.year + "-" + String(model.timeline.start.month).padStart(2, "0")) + '"></div>' +
      "<div><span class=\"lbl\">Timeline type</span>" + segs("project", "timelineType", [["semester", "Semester"], ["quarter", "Quarter"], ["custom", "Custom"]], p.timelineType) + custom + "</div></div>" +
      '<div class="mt"><span class="lbl">Primary project type</span>' + segs("project", "projectType", TYPES, p.projectType) + "</div>" +
      '<div class="mt"><label class="lbl">Client decision the final report should inform</label>' + field("project.decisionPoint", p.decisionPoint) + "</div>" +
      '<div class="mt"><span class="lbl">Binding constraint</span>' + segs("project", "constraint", [["unsure", "Not sure yet"], ["time", "Short on time"], ["money", "Short on money"], ["both", "Short on both"]], p.constraint) +
      '<p class="hint mt-sm">Name the constraint before adding scope. Time and money ask for different cuts.</p></div>'
    );
  }

  function stepper(roleId, value, label, editable) {
    const mid = editable
      ? field("role|" + roleId + "|count", value, 'inputmode="numeric" aria-label="' + esc(label) + ' headcount"')
      : '<span class="stepper-val">' + esc(value) + "</span>";
    return '<div class="stepper"><button type="button" data-action="count" data-id="' + esc(roleId) + '" data-dir="-1" aria-label="Fewer ' + esc(label) + '">-</button>' +
      mid +
      '<button type="button" data-action="count" data-id="' + esc(roleId) + '" data-dir="1" aria-label="More ' + esc(label) + '">+</button></div>';
  }

  function pweeksShown(view) {
    const key = "pweeks|" + view.id;
    if (drafts[key] != null && pendingCaret && pendingCaret.bind === key) return drafts[key];
    return E.formatHour(view.personWeeks);
  }

  function teamCards(model) {
    return '<div class="team-grid">' + state.roles.map(function (role, i) {
      const view = model.roles[i];
      return '<div class="team-card"><div class="lbl">' + esc(role.name) + "</div>" + stepper(role.id, role.count, role.name, true) +
        '<label class="lbl mt-sm">Hrs/week</label>' + field("role|" + role.id + "|hrsPerWeek", role.hrsPerWeek, 'inputmode="decimal" aria-label="' + esc(role.name) + ' hours per week"') +
        '<label class="lbl mt-sm">Person-weeks</label>' + field("pweeks|" + role.id, pweeksShown(view), 'inputmode="decimal" aria-label="' + esc(role.name) + ' person-weeks"') +
        '<p class="hint mt-sm">Usable ' + E.formatHour(view.usable) + " hrs · priced " + E.formatHour(view.hours) + " hrs" + (view.over ? " · over this role" : "") + "</p></div>";
    }).join("") + "</div>";
  }

  function step2(model) {
    const c = state.capacity;
    const open = state.ui.open.s2;
    const fit = FIT[model.fitKey] || FIT.unknown;
    const tiers = [
      ["lean", "Lean", "60% of base hours", "Shorter instruments, fewer sources, a brief memo."],
      ["standard", "Standard", "100% of base hours", "Design, one wave, analysis, interim and final."],
      ["expanded", "Expanded", "150% of base hours", "More methods, deeper synthesis, more reporting."]
    ].map(function (t) {
      return '<button type="button" class="tier' + (state.tier === t[0] ? " on" : "") + '" data-action="seg" data-group="tier" data-value="' + t[0] + '"><strong>' + t[1] + "</strong><em>" + t[2] + "</em><span>" + t[3] + "</span></button>";
    }).join("");
    const chips = model.deliverables.map(function (d) {
      const on = d.enabled;
      const meta = on ? E.formatHour(d.studentHours) + "h · " + E.money(d.labor) : "Off";
      return '<button type="button" class="deliv' + (on ? " on" : "") + '" data-action="deliv-toggle" data-id="' + esc(d.id) + '" aria-pressed="' + on + '"><span class="box">' + (on ? "✓" : "") + "</span><span>" + esc(d.name) + '</span><span class="meta">' + esc(meta) + "</span></button>";
    }).join("");
    const suggested = model.studentHours <= 70 ? "Lean" : model.studentHours <= 135 ? "Standard" : "Expanded";
    const mode = state.pricingMode === "entered" ? "entered" : "headcount";
    return card("2", "Scope and capacity fit", "Headcount, weeks, and hours per week. Scale labor with the roster, or lock the hours you typed.", open, "s2",
      '<div class="eyebrow">Team size</div>' +
      '<div class="mt-sm"><span class="lbl">How labor uses the roster</span>' + segs("pricing", "mode", [["headcount", "Scale with headcount"], ["entered", "Entered hours"]], mode) +
      '<p class="hint mt-sm">' + (mode === "headcount"
        ? "The hour grid is the baseline team (one of each role in the template). Add a person and that role's hours and cost scale. Person-weeks redistribute a role across the deliverables that are on."
        : "Hours stay exactly as entered. Headcount still sets usable capacity, and it does not change the price.") + "</p></div>" +
      teamCards(model) +
      '<div class="grid-2 mt"><div><label class="lbl">Active project weeks</label>' + field("capacity.weeks", c.weeks, 'inputmode="decimal"') +
      '</div><div><span class="lbl">Capacity buffer</span>' + segs("capacity", "buffer", [["low", "Low · light term"], ["medium", "Medium · typical"], ["high", "High · heavy term"]], c.buffer) +
      '<p class="hint mt-sm">Usable hours = headcount x weeks x hrs/week x buffer. The buffer holds back class, finals, and coordination.</p></div></div>' +
      '<div class="stats mt"><div class="stat"><div class="k">Student-role gross</div><div class="v">' + model.grossHours + ' <span style="font-size:14px;font-weight:500">hrs</span></div><div class="s">PM, associate, and assistant, before the buffer</div></div>' +
      '<div class="stat accent"><div class="k">Usable student hours · ' + esc(model.bufferLabel) + ' buffer</div><div class="v">' + model.usableHours + ' <span style="font-size:14px;font-weight:500">hrs</span></div><div class="s">Whole team usable ' + model.totalUsable + " hrs, faculty included</div></div>" +
      '<div class="stat"><div class="k">Priced student hours</div><div class="v">' + E.formatHour(model.studentHours) + ' <span style="font-size:14px;font-weight:500">hrs</span></div><div class="s">Plus ' + E.formatHour(model.facultyHours) + " faculty hrs</div></div>" +
      '<div class="stat"><div class="k">Priced total</div><div class="v" style="font-size:22px">' + E.money(model.total) + '</div><div class="s">Labor ' + E.money(model.labor) + ". Untick a deliverable and this drops.</div></div></div>" +
      '<div class="mt"><span class="lbl">Scope tier</span><div class="tiers">' + tiers + "</div>" +
      '<p class="hint mt-sm">Fit guide: Lean up to 70 student hours, Standard up to 135, Expanded above that. This takeoff suggests <strong>' + suggested + "</strong>. The tier rescales every subtask.</p></div>" +
      '<div class="mt" style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><span class="lbl" style="margin:0">Deliverables</span><span class="hint">Selected student hours: <strong>' + E.formatHour(model.studentHours) + "</strong></span></div>" +
      '<div class="delivs mt-sm">' + chips + "</div>" +
      '<div class="verdict mt" style="background:' + fit.bg + ";border-color:" + fit.border + '"><div style="display:flex;gap:8px;align-items:center"><span class="badge" style="background:' + fit.solid + '">' + fit.icon + "</span><h3>" + esc(model.fitTitle) + "</h3></div>" +
      '<div class="meter"><span style="width:' + model.fitBarPct + "%;background:" + fit.solid + '"></span></div>' +
      '<p class="hint">' + E.formatHour(model.studentHours) + " student hrs / " + model.usableHours + " usable. " + esc(model.fitMessage) + "</p></div>"
    );
  }

  function step3(model) {
    const open = state.ui.open.s3;
    const roles = '<div class="scroll"><table class="role-table"><thead><tr><th>Role</th><th>Hourly</th><th>Day rate</th><th>Fringe</th><th class="amt">Hours</th><th class="amt">Labor</th><th class="amt">Fringe $</th></tr></thead><tbody>' +
      state.roles.map(function (role, i) {
        const view = model.roles[i];
        const custom = role.fringeKind === "custom"
          ? field("role|" + role.id + "|customFringe", role.customFringe, 'inputmode="decimal" aria-label="Custom fringe percent"')
          : "";
        return "<tr><td>" + field("role|" + role.id + "|name", role.name, 'aria-label="Role name"') + stepper(role.id, role.count, role.name, false) + "</td><td>" +
          field("role|" + role.id + "|rate", role.rate, 'inputmode="decimal" aria-label="Hourly rate"') + '</td><td class="day">' + E.money(view.dayRate) + "</td><td>" +
          select("role|" + role.id + "|fringeKind", [["faculty", "Faculty 28%"], ["staff", "Staff 13%"], ["student", "Student 5%"], ["custom", "Custom"]], role.fringeKind) + custom +
          '</td><td class="amt">' + E.formatHour(view.hours) + '</td><td class="amt">' + E.money(view.labor) + '</td><td class="amt">' + E.money(view.fringe) + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<p class="hint mt-sm">Defaults: PI / faculty $200, project manager $100, associate $50, assistant $30. Day rate = hourly × 8. The Week 10 sample treats the project manager as a student (5% fringe). Switch that role to Staff if a staff PM should carry 13%.</p>';

    const expenses = '<div class="expense-grid">' + E.EXPENSES.map(function (ex) {
      const value = ex.id === "travel" && !state.expenses.travelTouched ? model.travelResolved : state.expenses[ex.id];
      return "<div><label class=\"lbl\">" + esc(ex.label) + "</label>" + moneyInput("expense|" + ex.id, value) + "</div>";
    }).join("") + "</div>" +
      '<div class="mt"><label class="lbl">Travel detail (optional)</label>' + field("note|travel", state.expenses.travelNote, 'placeholder="Sites, who travels, mileage"') +
      '<p class="hint mt-sm">Suggested travel is ' + E.money(model.suggestedTravel) + " until you edit the travel line. " +
      (state.project.dataCollection === "site" ? "Site-staff collection lowers that suggestion." : "Evaluation-team collection keeps field travel in the lab.") + "</p></div>";

    const fees = state.fees.map(function (fee) {
      return '<div class="grid-2" style="margin-top:10px"><div><label class="lbl">' + esc(fee.label) + "</label>" + moneyInput("fee|" + fee.id + "|amount", fee.amount) +
        '</div><div><label class="lbl">Source note</label>' + field("fee|" + fee.id + "|note", fee.note, 'placeholder="Quote, policy, or invoice"') + "</div></div>";
    }).join("");

    const addons = model.addons.map(function (a, i) {
      const src = state.addons[i];
      const hourly = a.pricing === "hourly";
      return '<div class="addon"><div class="addon-top"><label class="check" style="margin:0"><input type="checkbox" data-bind="addon|' + a.id + '|included"' + (src.included ? " checked" : "") + "> Include in total</label>" +
        '<span class="price-pill">' + (hourly ? E.money(a.rate) + "/hr" : "Fixed") + " · " + E.money(a.price) + "</span></div>" +
        field("addon|" + a.id + "|name", src.name, 'aria-label="Add-on name"') +
        '<div class="segs">' +
        '<button type="button" class="seg' + (hourly ? "" : " on") + '" data-action="seg" data-group="addon" data-id="' + esc(a.id) + '" data-value="fixed">Fixed</button>' +
        '<button type="button" class="seg' + (hourly ? " on" : "") + '" data-action="seg" data-group="addon" data-id="' + esc(a.id) + '" data-value="hourly">Hourly</button></div>' +
        (hourly
          ? '<div class="grid-2"><div><label class="lbl">Hours</label>' + field("addon|" + a.id + "|hours", src.hours, 'inputmode="decimal"') + '</div><div><label class="lbl">Hourly rate</label>' + field("addon|" + a.id + "|rate", src.rate, 'inputmode="decimal"') + "</div></div>"
          : moneyInput("addon|" + a.id + "|amount", src.amount)) +
        "</div>";
    }).join("");

    const pays = model.payments.items.map(function (item, i) {
      const src = state.payments[i];
      return '<div class="pay"><div class="pay-top">' + field("pay|" + src.id + "|label", src.label, 'aria-label="Payment label"') +
        '<span class="price-pill">' + E.formatPctNumber(item.percent) + "% · " + E.money(item.amount) + "</span>" +
        '<button type="button" class="btn-tiny btn-danger" data-action="pay-remove" data-id="' + esc(src.id) + '">Remove</button></div>' +
        '<div class="grid-2"><div><label class="lbl">Percent</label>' + field("pay|" + src.id + "|percent", src.percent, 'inputmode="decimal"') +
        '</div><div><label class="lbl">Tied to deliverable</label>' +
        select("pay|" + src.id + "|deliverableId", state.deliverables.map(function (d) { return [d.id, d.name]; }), src.deliverableId) +
        "</div></div></div>";
    }).join("");

    const indirectOptions = [
      ["contract", "15% contracts"],
      ["nonfederal", "25% non-federal"],
      ["federal", "45.46% federal"],
      ["custom", "Custom"]
    ];

    return card("3", "Budget builder", "Hours by role and subtask, then fringe, other costs, indirect, and the client menu.", open, "s3",
      '<div class="panel"><h3>Role rates</h3>' + roles + "</div>" +
      '<div class="mt"><span class="lbl">Who collects data</span>' + segs("data", "dataCollection", [["team", "Evaluation team"], ["site", "Site staff"]], state.project.dataCollection) +
      '<p class="hint mt-sm">Site staff squeeze travel and conduct hours. Recruit, pilot, scripts, and consistency checks bulge the other way. Transcription stays at zero hours on the consultant line.</p></div>' +
      '<div class="mt" style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h3 style="font-size:16px;color:var(--ink-900)">Hours by deliverable</h3><button type="button" class="btn-tiny" data-action="deliv-add">Add deliverable</button></div>' +
      '<p class="hint">These hours are the price. Standard base hours rescale with the tier (' + esc(model.tierLabel) + ", " + Math.round(model.tierMultiplier * 100) + "%). Edits stick, then rescale if you change tier.</p>" +
      '<div class="takeoff mt-sm">' + takeoff(model) + "</div>" +
      '<div class="panel mt"><h3>Other direct costs</h3>' + expenses + "</div>" +
      '<div class="panel mt"><h3>Optional fees</h3><p class="hint">Blank means zero. Nothing is added for IRB or an external evaluator until you enter an amount and where it came from.</p>' + fees + "</div>" +
      '<div class="panel mt"><h3>Indirect and contingency</h3>' + segs("indirect", "preset", indirectOptions, state.indirectPreset) +
      (state.indirectPreset === "custom" ? '<div class="mt-sm"><label class="lbl">Custom indirect percent</label>' + field("indirectCustom", state.indirectCustom, 'inputmode="decimal"') + "</div>" : "") +
      '<p class="hint mt-sm">Indirect is ' + esc(model.indirectLabel) + " of the direct subtotal (" + E.money(model.direct) + "), which is labor + fringe + other direct costs. Amount: " + E.money(model.indirect) + ".</p>" +
      '<label class="check"><input type="checkbox" data-bind="contingencyOn"' + (state.contingencyOn ? " checked" : "") + "> Add a contingency percent</label>" +
      '<div class="mt-sm" style="max-width:220px">' + field("contingencyPct", state.contingencyPct, 'inputmode="decimal" aria-label="Contingency percent"' + (state.contingencyOn ? "" : " disabled")) + "</div>" +
      '<p class="hint mt-sm">Leave this off unless the client expects it. Pad synthesis and reporting hours instead. Contingency is calculated on the direct subtotal and is excluded from indirect.</p></div>' +
      '<div class="panel mt"><h3>Priced add-ons</h3><p class="hint">Print the menu before anyone orders. These stay out of the total, and out of indirect, until you include them. The sticker price is not marked up again.</p>' + addons + "</div>" +
      '<div class="panel mt"><h3>Timeline</h3>' + timelineBlock(model) + "</div>" +
      '<div class="panel mt"><h3>Payment schedule</h3><p class="hint">Fixed cost is the default: paid per deliverable, on time. Run over and the lab absorbs it. Come in under and the lab keeps the difference. Cost reimbursement bills hours and stops when funds run out.</p>' +
      segs("contract", "contractType", [["fixed", "Fixed cost"], ["reimbursement", "Cost reimbursement"]], state.contractType) +
      pays +
      '<div class="actions mt"><button type="button" class="btn-tiny" data-action="pay-add">Add payment</button></div>' +
      '<p class="hint mt-sm">Percents sum to ' + E.formatPctNumber(model.payments.percentSum) + "%." + (model.payments.balanced ? "" : " They need to sum to 100% for a fixed-cost contract.") + "</p></div>" +
      '<div class="panel mt"><h3>Where the weight sits</h3>' + weightBlock(model) + "</div>" +
      '<div class="mt"><h3 style="font-size:16px;color:var(--ink-900)">Client menu</h3><p class="hint">One line per deliverable, then labor subtotal, fringe, travel, incentives, transcription, printing, and the other directs, then indirect and total.</p></div>' +
      '<div class="mt-sm">' + summaryTable(model) + "</div>" +
      '<div class="mt"><button type="button" class="btn" data-action="kitchen">' + (state.ui.kitchenOpen ? "Hide kitchen ticket" : "Show kitchen ticket") + "</button>" +
      '<p class="hint mt-sm">The kitchen ticket is the internal role-by-subtask grid. The menu above is what the client should see.</p>' + kitchen(model) + "</div>"
    );
  }

  function step4(model) {
    const open = state.ui.open.s4;
    const blocks = [
      ["summary", "Budget summary"],
      ["assumptions", "Assumptions"],
      ["scope", "Scope statement"],
      ["justification", "Budget justification"],
      ["payments", "Payment schedule"],
      ["addons", "Priced add-ons"]
    ].map(function (b) {
      const label = copied === b[0] ? "Copied" : "Copy";
      return '<article class="export"><header><span>' + b[1] + '</span><button type="button" class="btn-tiny" data-action="copy" data-which="' + b[0] + '" data-copy-for="' + b[0] + '">' + label + "</button></header><pre>" + esc(model.narratives[b[0]]) + "</pre></article>";
    }).join("");
    return card("4", "Review and export", "Is this ready to send? Copy the pieces, or download the workbook.", open, "s4",
      '<div class="actions noprint"><button type="button" class="btn" data-action="download" data-kind="csv">Download CSV</button>' +
      '<button type="button" class="btn" data-action="download" data-kind="xlsx">Download Excel</button>' +
      '<button type="button" class="btn" data-action="download" data-kind="json">Save JSON</button>' +
      '<button type="button" class="btn" data-action="load">Load JSON</button>' +
      '<button type="button" class="btn" data-action="download" data-kind="txt">Narrative text</button>' +
      '<button type="button" class="btn" data-action="print">Print</button>' +
      '<button type="button" class="btn-ghost btn-danger" data-action="reset">Reset template</button></div>' +
      '<h3 style="margin-top:18px;font-size:15px;color:var(--ink-900)">Defensibility checklist</h3><div class="mt-sm">' + checks(model.checklist) + "</div>" +
      '<h3 style="margin-top:18px;font-size:15px;color:var(--ink-900)">Section 3 box</h3><p class="hint">From the Week 10 deck: what has to be in the team submission.</p><div class="mt-sm">' + checks(model.section3) + "</div>" +
      '<h3 style="margin-top:18px;font-size:15px;color:var(--ink-900)">Budget table</h3><div class="mt-sm">' + summaryTable(model) + "</div>" +
      '<div class="mt" style="display:flex;flex-direction:column;gap:10px">' + blocks + "</div>"
    );
  }

  function card(num, title, sub, open, id, body) {
    const anchor = id === "s4" ? ' id="review"' : "";
    return '<section class="card"' + anchor + ' style="scroll-margin-top:84px"><div class="card-bar bar-' + num + '"></div>' +
      '<button type="button" class="card-head" data-action="section" data-id="' + id + '" aria-expanded="' + open + '">' +
      '<span class="num num-' + num + '">' + num + "</span><span><h2>" + title + "</h2><p>" + sub + "</p></span><span class=\"chev\">▼</span></button>" +
      (open ? '<div class="card-body">' + body + "</div>" : "") + "</section>";
  }

  function rail(model) {
    const fit = FIT[model.fitKey] || FIT.unknown;
    const ceiling = !model.ceilingKnown
      ? '<span class="chip">No ceiling</span>'
      : model.overCeiling
        ? '<span class="chip" style="color:var(--rust-600)">Over ceiling</span>'
        : '<span class="chip" style="color:var(--success)">Within ceiling</span>';
    const lines = [
      ["Labor", model.labor],
      ["Fringe", model.fringe],
      ["Other direct", model.otherTotal],
      ["Indirect", model.indirect]
    ];
    if (model.contingencyOn) lines.push(["Contingency", model.contingency]);
    if (model.addonTotal) lines.push(["Included add-ons", model.addonTotal]);
    const flags = model.flags.map(function (f) {
      return '<div class="callout ' + f.tone + '"><strong>' + esc(f.title) + "</strong><p>" + esc(f.body) + "</p></div>";
    }).join("");
    return '<aside class="rail"><div class="hero"><div class="eyebrow">Scope-fit status</div><h2>' + esc(model.fitTitle) + "</h2>" +
      '<div class="meter"><span style="width:' + model.fitBarPct + "%;background:" + fit.solid + '"></span></div>' +
      '<div class="hero-row"><div><span>Deliverables need</span><strong>' + E.formatHour(model.studentHours) + ' hrs</strong></div><div style="text-align:right"><span>Team can deliver</span><strong>' + model.usableHours + " hrs</strong></div></div></div>" +
      '<div class="card budget-card"><div style="display:flex;justify-content:space-between;align-items:center"><span class="eyebrow">Total budget</span>' + ceiling + "</div>" +
      '<div class="big">' + E.money(model.total) + "</div>" +
      lines.map(function (line) {
        return '<div class="line"><span>' + line[0] + "</span><strong>" + E.money(line[1]) + "</strong></div>";
      }).join("") +
      (model.ceilingKnown ? '<p class="hint mt-sm">' + (model.overCeiling ? E.money(E.cents(model.total - model.ceiling)) + " over " : "Within ") + E.money(model.ceiling) + ".</p>" : "") +
      "</div>" +
      '<div class="eyebrow">Live coaching</div>' + flags +
      '<div class="rules"><button type="button" class="card-head" data-action="rules" aria-expanded="' + state.ui.rulesOpen + '"><span class="num" style="background:white;color:var(--success)">✦</span><span><h2 style="font-size:15px">Scoping rules of thumb</h2></span><span class="chev">▼</span></button>' +
      (state.ui.rulesOpen ? "<ul>" + RULES.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>" : "") +
      "</div></aside>";
  }

  function render(scrollMode) {
    let model;
    try {
      model = E.compute(state);
    } catch (err) {
      root.innerHTML = '<div class="wrap"><div class="banner bad">The budget could not be drawn (' + esc(err.message) + '). <button type="button" class="btn-tiny" data-action="reset">Reset template</button></div></div>';
      return;
    }
    const y = window.scrollY;
    const fit = FIT[model.fitKey] || FIT.unknown;
    const notice = state.ui.notice
      ? '<div class="banner' + (state.ui.noticeBad ? " bad" : "") + '"><span>' + esc(state.ui.notice) + '</span><button type="button" class="btn-tiny" data-action="dismiss">Dismiss</button></div>'
      : "";
    root.innerHTML =
      '<header class="top"><div class="top-inner"><div class="brand"><svg class="mark" viewBox="0 0 36 36" aria-hidden="true"><rect x="3" y="6" width="8" height="24" rx="4" fill="#B6D4DF"/><rect x="14" y="12" width="8" height="18" rx="4" fill="#EEA76F"/><rect x="25" y="4" width="8" height="26" rx="4" fill="#575DA1"/></svg><div style="min-width:0"><div class="eyebrow">Worker Well-Being Lab</div><div class="project-title">' + esc(state.project.name || "Untitled project") + "</div></div></div>" +
      '<div class="spacer"></div><div class="top-actions noprint"><span class="chip"><span class="dot" style="background:' + fit.solid + '"></span>' + esc(model.fitTitle) + "</span>" +
      '<span class="total-mini">Total <strong>' + E.money(model.total) + "</strong></span>" +
      '<span class="saved">' + (state.ui.savedAt ? "Saved in this browser" : "Autosaves in this browser") + "</span>" +
      '<button type="button" class="btn-accent" data-action="goto-review">Review and export</button></div></div></header>' +
      '<main class="wrap">' + notice + '<div class="layout"><div class="steps">' + step1(model) + step2(model) + step3(model) + step4(model) + "</div>" + rail(model) + "</div></main>" +
      '<p class="foot">Worker Well-Being Lab · Budget Studio. Default rates follow the Week 10 sample and the Section 3 rate card. This is a planning tool for a proposal, not an institutional submission system.</p>';
    if (pendingCaret && pendingCaret.bind) {
      const el = root.querySelector('[data-bind="' + pendingCaret.bind.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]');
      if (el) {
        try {
          el.focus({ preventScroll: true });
          if (pendingCaret.start != null && el.setSelectionRange) el.setSelectionRange(pendingCaret.start, pendingCaret.end);
        } catch (err) { /* ignore */ }
      }
    }
    if (scrollMode === "review") {
      const review = document.getElementById("review");
      if (review) review.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo(0, y);
    }
  }

  load();
  root.addEventListener("click", onClick);
  root.addEventListener("input", function (e) {
    if (e.target.matches("select, input[type=checkbox]")) return;
    onField(e);
  });
  root.addEventListener("change", function (e) {
    if (e.target.matches("select, input[type=checkbox]")) onField(e);
  });
  root.addEventListener("focusout", function (e) {
    const bind = e.target.dataset && e.target.dataset.bind;
    if (!bind || drafts[bind] == null) return;
    delete drafts[bind];
  });
  document.getElementById("loader").addEventListener("change", function (e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data || (data.app && data.app !== "wwb-budget-studio") && !data.state && !data.deliverables && !data.project) {
          throw new Error("unrecognized");
        }
        const open = state.ui.open;
        state = E.hydrate(data);
        state.ui.open = open;
        state.ui.notice = "Loaded " + file.name + ".";
        clearDrafts();
        persist();
        render();
      } catch (err) {
        state.ui.notice = "That file is not a Budget Studio JSON save.";
        state.ui.noticeBad = true;
        render();
      }
    };
    reader.readAsText(file);
  });
  render();
})();
