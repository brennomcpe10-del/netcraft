import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("admin request signals expired sessions before JSON parsing", () => {
  const source = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8");
  const start = source.indexOf("async function adminRequest<");
  const end = source.indexOf("\nexport const api =", start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);
  const notification = handler.indexOf("if (!res.ok) notifyIfSessionExpired(res.status)");
  const parse = handler.indexOf("await res.json()");
  assert.ok(notification >= 0 && notification < parse,
    "401/403 must invalidate the session even when an upstream proxy returns non-JSON");
  assert.match(source, /status === 401 \|\| status === 403/);
  assert.match(source, /admin:session_expired/);
});

test("admin credential requests remain uncached", () => {
  const source = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8");
  const start = source.indexOf("async function adminRequest<");
  const end = source.indexOf("\nexport const api =", start);
  const handler = source.slice(start, end);
  assert.match(handler, /cache:'no-store'/);
});
