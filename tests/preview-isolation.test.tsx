import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { managedCollection, isPreviewEnvironment } from "../server/services/previewIsolation.ts";

test("Preview player and support data use distinct private collections", () => {
  const preview = { VERCEL_ENV: "preview" } as NodeJS.ProcessEnv;
  assert.equal(isPreviewEnvironment(preview), true);
  assert.equal(managedCollection("players", preview), "previewPlayers");
  assert.equal(managedCollection("supportTickets", preview), "previewSupportTickets");
  assert.notEqual(managedCollection("players", preview), "users");
  assert.notEqual(managedCollection("supportTickets", preview), "tickets");
});

test("Production and local development retain existing collections", () => {
  for (const VERCEL_ENV of ["production", "development", undefined]) {
    const env = { VERCEL_ENV } as NodeJS.ProcessEnv;
    assert.equal(isPreviewEnvironment(env), false);
    assert.equal(managedCollection("players", env), "users");
    assert.equal(managedCollection("supportTickets", env), "tickets");
  }
});

test("private Preview collections have explicit Firestore deny policies", () => {
  const rules=readFileSync(new URL("../firestore.rules",import.meta.url),"utf8");
  for(const collection of ["previewPlayers","previewSupportTickets"]){
    assert.match(rules,new RegExp(`match /${collection}/\\{id\\} \\{ allow read, write: if false; \\}`));
  }
});

test("player and ticket services use Preview-aware collection paths", () => {
  const players=readFileSync(new URL("../server/services/players.ts",import.meta.url),"utf8");
  const tickets=readFileSync(new URL("../server/services/supportTickets.ts",import.meta.url),"utf8");
  assert.match(players,/db\.collection\(managedCollection\("players"\)\)/);
  assert.match(players,/if\(isPreviewEnvironment\(\)\)/);
  assert.match(tickets,/paymentDatabase\(\)\.collection\(managedCollection\("supportTickets"\)\)/);
  assert.match(tickets,/db\.collection\(managedCollection\("supportTickets"\)\)/);
});
