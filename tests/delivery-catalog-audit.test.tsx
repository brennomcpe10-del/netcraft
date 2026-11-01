import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { auditDeliveryCatalog } from "../server/delivery/catalogAudit.ts";

const product = (id: string, rewardDraft?: unknown, extra: object = {}) => ({
  id, name: "Product " + id, active: true, price: 5, category: "kits",
  description: "", highlights: [], image: "", order: 1,
  allowQuantity: false, ...extra, ...(rewardDraft ? { rewardDraft } : {}),
});
const draft = (items: {itemId:string;quantity:number}[]) => ({version: 1, items});
test("admin audit shows missing, invalid, quantity-dependent, lab-only and VIP blockers", () => {
  const list = [
    product("missing"),
    product("custom", draft([{itemId:"addon:magic_box",quantity:1}])),
    product("too-large", draft([{itemId:"minecraft:diamond",quantity:50}]), {allowQuantity:true, maxQuantity:64}),
    product("valid", draft([{itemId:"minecraft:diamond",quantity:3}])),
    product("inactive", undefined, {active:false}),
  ];
  const vips = [{id:"vip-test",name:"VIP Explorer",active:true}];
  const report = auditDeliveryCatalog(list as any, vips as any);
  assert.equal(report.realPaymentsEnabled, false);
  assert.equal(report.minecraftDispatchEnabled, false);
  assert.equal(report.totalActive, 5);
  assert.deepEqual(report.counts, {
    reward_invalid: 1, reward_missing: 1, quantity_exceeds_executor: 1,
    vip_mapping_required: 1, kit_lab_only: 1,
  });
  assert.deepEqual(report.items.map(x=>x.status), [
    "reward_invalid", "reward_missing", "quantity_exceeds_executor",
    "vip_mapping_required", "kit_lab_only",
  ]);
});
test("admin audit caps responses to 100 entries and never claims production readiness", () => {
  const many = Array.from({length:125},(_,i)=>product("p"+i));
  const report = auditDeliveryCatalog(many as any, []);
  assert.equal(report.totalActive,125);
  assert.equal(report.items.length,100);
  assert.equal(report.truncated,true);
  const api = readFileSync(new URL("../server/routes/api.ts",import.meta.url),"utf8");
  assert.match(api,/get\('\/admin\/delivery-catalog-audit',requireAdmin/);
  assert.match(api,/if\(!isPreviewEnvironment\(\)\)/);
});
