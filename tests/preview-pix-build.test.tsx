import { test } from "node:test";
import assert from "node:assert/strict";
import { runPreviewPixCheck } from "../scripts/preview-pix-build.ts";

test("sandbox build check runs exclusively on the authorized Preview branch", () => {
  let calls = 0;
  for (const environment of ["production", "development", undefined, "preview"]) {
    for (const branch of ["main", undefined, "redesign-mobile-solaris"]) {
      const expected = environment === "preview" && branch === "redesign-mobile-solaris";
      const result = runPreviewPixCheck({ VERCEL_ENV: environment, VERCEL_GIT_COMMIT_REF: branch }, () => { calls++; return Buffer.alloc(0); });
      assert.equal(result, expected ? "passed" : "skipped");
    }
  }
  assert.equal(calls, 1);
});
test("sandbox failure remains explicit without exposing exception data or blocking the shop build", () => {
  const messages: string[] = [];
  const result = runPreviewPixCheck({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "redesign-mobile-solaris" },
    () => { throw new Error("TEST-private buyer@example.com 12849309559"); }, message => messages.push(message));
  assert.equal(result, "failed");
  assert.equal(messages.length, 1);
  assert.match(messages[0], /FAILED/);
  assert.doesNotMatch(messages[0], /TEST-private|buyer@example.com|12849309559/);
});
