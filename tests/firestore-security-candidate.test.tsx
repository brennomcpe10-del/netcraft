import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("proposed Firebase rules prohibit all unauthenticated client writes", () => {
  const rules = readFileSync(new URL("../firestore.proposed-admin-only.rules", import.meta.url),"utf8");
  assert.match(rules, /CANDIDATE ONLY - NOT DEPLOYED/);
  const grants = rules.split("\n").filter(x => /\ballow\b/.test(x) && !x.trim().startsWith("//"));
  const writes = grants.filter(x => /allow (?:read, )?write:/.test(x));
  assert.ok(writes.length >= 20);
  for (const line of writes) assert.match(line, /allow (?:read, )?write: if false;/);
  for (const col of ["orders","users","players","pixTestOrders","pixTestDeliveries",
    "coupons","products","vips","events","news","settings","tickets","test"]) {
    assert.match(rules, new RegExp("match /" + col + "/\\{"));
  }
  // Existing production rules MUST be unchanged by this proposal.
  const current = readFileSync(new URL("../firestore.rules", import.meta.url),"utf8");
  assert.ok(current.includes("allow write: if isValidId(eventId);"));
  assert.ok(!current.startsWith("// CANDIDATE ONLY"));
});
