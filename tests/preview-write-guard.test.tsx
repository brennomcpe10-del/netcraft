import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { apiRouter } from "../server/routes/api.ts";
import { previewSharedWriteBlocked } from "../server/services/previewWriteGuard.ts";
import { generateAdminToken } from "../server/auth/admin.ts";

test("remaining shared Preview writes stay protected by a server guard", () => {
  assert.equal(previewSharedWriteBlocked({VERCEL_ENV:"preview"} as NodeJS.ProcessEnv), true);
  for (const env of ["production","development",undefined]) {
    assert.equal(previewSharedWriteBlocked({VERCEL_ENV:env} as NodeJS.ProcessEnv), false);
  }
});

test("authenticated Preview cannot write to remaining shared settings, branding, coupons, editorial or legacy orders", async () => {
  const beforeKey = process.env.ADMIN_KEYWORD;
  const beforeEnv = process.env.VERCEL_ENV;
  process.env.ADMIN_KEYWORD = randomBytes(24).toString("hex");
  process.env.VERCEL_ENV = "preview";
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as any).port;
  const token = generateAdminToken();
  const protectedPaths: [string,string][] = [
    ["POST","/admin/coupons"],
    ["PUT","/admin/coupons/test-coupon"], ["DELETE","/admin/coupons/test-coupon"],
    ["PUT","/admin/settings"], ["PUT","/admin/settings/livepix"], ["PUT","/admin/settings/pix"],
    ["POST","/admin/events"], ["PUT","/admin/events/test-event"],
    ["DELETE","/admin/events/test-event"], ["POST","/admin/news"],
    ["PUT","/admin/news/test-news"], ["DELETE","/admin/news/test-news"],
    ["POST","/admin/community"], ["PUT","/admin/community/test-link"],
    ["DELETE","/admin/community/test-link"],
    ["PUT","/admin/orders/test-order/status"], ["PUT","/admin/orders/status"],
    ["POST","/admin/orders/bulk-delete"], ["DELETE","/admin/orders/test-order"],
    ["POST","/admin/identity/upload"], ["PUT","/admin/identity"],
  ];
  try {
    for (const [method,path] of protectedPaths) {
      const res=await fetch(`http://127.0.0.1:${port}/api${path}`,{
        method,
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
        body:method==="DELETE"?undefined:JSON.stringify({}),
      });
      assert.equal(res.status,409,`${method} ${path}`);
      assert.equal((await res.json()).code,"PREVIEW_STORE_NOT_ISOLATED");
    }
    const environment=await fetch(`http://127.0.0.1:${port}/api/admin/environment`,{
      headers:{Authorization:`Bearer ${token}`},
    });
    assert.equal(environment.status,200);
    assert.deepEqual(await environment.json(),{
      environment:"preview",
      isolatedPlayerAndSupportData:true,
      isolatedPreviewCatalog:true,
      sharedStoreData:true,
      storeWritesBlocked:true
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    if(beforeKey===undefined) delete process.env.ADMIN_KEYWORD;
    else process.env.ADMIN_KEYWORD=beforeKey;
    if(beforeEnv===undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV=beforeEnv;
  }
});

test("coupon admin updates are transactional and never accept browser Firestore fallbacks", () => {
  const source=readFileSync(new URL("../server/routes/api.ts",import.meta.url),"utf8");
  const start=source.indexOf("apiRouter.post('/admin/coupons'");
  const end=source.indexOf("apiRouter.post('/coupons/validate'");
  assert.ok(start>=0&&end>start);
  const adminRoutes=source.slice(start,end);
  assert.match(adminRoutes,/db\.runTransaction\(async tx=>/);
  assert.match(adminRoutes,/const next=couponDraft\(req\.body,id,snap\.data\(\)\)/);
  assert.match(adminRoutes,/tx\.set\(ref,next\)/);
  const validate=source.slice(end,source.indexOf("function isProviderManagedLegacyOrder",end));
  assert.doesNotMatch(validate,/import\('firebase\/firestore'\)/);
});
