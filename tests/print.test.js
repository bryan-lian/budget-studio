"use strict";

// Print typography is a readability contract, not a two-page target.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const css = fs.readFileSync(path.join(__dirname, "../css/studio.css"), "utf8");
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...css.matchAll(new RegExp(escaped + "\\s*\\{([^}]+)\\}", "g"))];
  assert.ok(matches.length, "Missing print rule: " + selector);
  return matches[matches.length - 1][1];
}
function minimum(selector, pt) {
  const size = rule(selector).match(/font-size:\s*([\d.]+)pt/);
  assert.ok(size && Number(size[1]) >= pt, selector + " must be at least " + pt + "pt");
}
assert.match(rule("body.printing-client .client-proposal"), /font:\s*12pt\/1\.45/);
minimum(".client-proposal table", 11);
minimum(".client-proposal small", 10);
minimum(".client-proposal .proposal-phase", 10);
minimum(".client-proposal .proposal-meta", 10);
minimum(".client-proposal footer", 10);
minimum(".client-proposal h1", 20);
minimum(".client-proposal h2", 14);
assert.match(rule(".client-proposal .proposal-phase"), /color:\s*#45464c/);
assert.match(rule("body.printing-client #app > :not(.client-proposal)"), /display:\s*none\s*!important/);
console.log("Print readability checks passed");
