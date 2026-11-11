import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateLogo } from "../server/services/logoValidation.ts";
import { signUpload, verifyUpload } from "../server/services/identityStore.ts";
import { identityFrame } from "../src/lib/identity.ts";
test("raster upload validates actual type, dimensions and byte limits", async () => {
  const r = await validateLogo(
    fs.readFileSync("public/categories/items.webp"),
    "image/webp",
  );
  assert.equal(r.kind, "image");
  assert.ok(r.width > 0);
  await assert.rejects(
    validateLogo(Buffer.from("<script>alert(1)</script>"), "image/png"),
  );
  await assert.rejects(
    validateLogo(fs.readFileSync("public/categories/items.webp"), "video/mp4"),
  );
  await assert.rejects(
    validateLogo(Buffer.alloc(3 * 1024 * 1024 + 1), "video/mp4"),
  );
});
test("safe SVG remains an image; active content, external links and entities are rejected", async () => {
  const safe =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#10b981" d="M0 0h32v32H0z"/></svg>';
  assert.equal(
    (await validateLogo(Buffer.from(safe), "image/svg+xml")).mime,
    "image/svg+xml",
  );
  for (const bad of [
    safe.replace("<path", "<script"),
    safe.replace("<path", "<foreignObject"),
    safe.replace('fill="#10b981"', 'onload="alert(1)"'),
    safe.replace('fill="#10b981"', 'fill="url(https://evil.test)"'),
    safe.replace("<path", '<image href="https://evil.test/x"'),
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + safe,
  ])
    await assert.rejects(validateLogo(Buffer.from(bad), "image/svg+xml"));
});
test("upload references are signed and framing rejects arbitrary values", () => {
  const old = process.env.ADMIN_KEYWORD;
  process.env.ADMIN_KEYWORD = "isolated-upload-test-key";
  try {
    const asset = {
      path: "site-identity/test.png",
      url: "https://example.test/logo",
      kind: "image" as const,
      mime: "image/png",
      width: 32,
      height: 32,
    };
    const token = signUpload(asset);
    assert.deepEqual(verifyUpload(token), asset);
    assert.throws(() => verifyUpload(token + "x"));
    assert.throws(() => verifyUpload("forged"));
    assert.throws(() => identityFrame({ fit: "stretch", x: 50, y: 50 }));
    assert.throws(() => identityFrame({ fit: "contain", x: 101, y: 50 }));
  } finally {
    if (old === undefined) delete process.env.ADMIN_KEYWORD;
    else process.env.ADMIN_KEYWORD = old;
  }
});
