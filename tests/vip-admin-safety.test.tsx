import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("VIP admin validation prevents active zero-price plans", () => {
  const source = readFileSync(new URL("../server/routes/api.ts", import.meta.url), "utf8");
  const begin = source.indexOf("function vipDraft(");
  const end = source.indexOf("apiRouter.post('/admin/vips'", begin);
  assert.ok(begin >= 0 && end > begin);
  const draft = source.slice(begin, end);
  assert.match(draft, /body\.active !== false && price === 0/);
  assert.match(draft, /Number\.isFinite\(price\)/);
  assert.match(draft, /Math\.abs\(price\*100-Math\.round\(price\*100\)\)/);
});

test("VIP benefits are length-bounded prior to writing into Firestore", () => {
  const source = readFileSync(new URL("../server/routes/api.ts", import.meta.url), "utf8");
  const draft = source.slice(source.indexOf("function vipDraft("), source.indexOf("apiRouter.post('/admin/vips'"));
  assert.match(draft, /slice\(0,100\)\.map\(\(x:string\)=>x\.slice\(0,500\)\)/);
  assert.match(draft, /\^\[a-zA-Z0-9_-\]\{2,128\}\$/);
});

test("Preview VIP writes continue through isolated catalog references", () => {
  const source = readFileSync(new URL("../server/routes/api.ts", import.meta.url), "utf8");
  for (const operation of ["post", "put", "delete"]) {
    const start = source.indexOf(`apiRouter.${operation}('/admin/vips`);
    const next = source.indexOf("\napiRouter.", start + 8);
    assert.ok(start >= 0, operation);
    const handler = source.slice(start, next > start ? next : undefined);
    assert.match(handler, /requireAdmin/);
    assert.match(handler, /catalogWriteReference\('vips',id\)/);
  }
});

test("VIP active and featured settings require actual boolean values", () => {
  const source = readFileSync(new URL("../server/routes/api.ts", import.meta.url), "utf8");
  const begin = source.indexOf("function vipDraft(");
  const end = source.indexOf("apiRouter.post('/admin/vips'", begin);
  assert.ok(begin >= 0 && end > begin);
  const draft = source.slice(begin, end);
  assert.match(draft, /body\?\.active !== undefined && typeof body\.active !== 'boolean'/);
  assert.match(draft, /body\?\.isPopular !== undefined && typeof body\.isPopular !== 'boolean'/);
  assert.match(draft, /body\.active !== false/);
  assert.match(draft, /body\.isPopular === true/);
});

test("VIP payment fields reject oversized values and unsafe LivePix schemes", () => {
  const source = readFileSync(new URL("../server/routes/api.ts", import.meta.url), "utf8");
  const draft = source.slice(source.indexOf("function vipDraft("), source.indexOf("apiRouter.post('/admin/vips'"));
  assert.match(draft, /\['livepixUrl','pixUrl'\]/);
  assert.match(draft, /value\.length > 2048/);
  assert.match(draft, /typeof value !== 'string'/);
  assert.ok(draft.includes(String.raw`/^https?:\/\//i.test(body.livepixUrl.trim())`));
});
