/**
 * NetCraftBR VIP catalog authorization (LAB OFF).
 *
 * This module does not read Firestore, accept payments, create jobs or grant
 * rewards. It only validates a server-owned, explicitly approved list of
 * Firestore VIP IDs against the current catalog. A name or price never
 * discovers/authorizes a product ID automatically.
 *
 * Activation requires an independently approved release and trusted Xbox
 * account binding; this helper is NOT wired into any Production path.
 */
import {
  makeRewardRegistry,
  type RewardRegistry,
  type VipTier,
  type VipRule,
} from "./verifiedRewardRegistry.ts";

export type ApprovedVipId = Readonly<{tier: VipTier; productId: string}>;
export type CatalogVipForApproval = Readonly<{
  id: string;
  name: string;
  price: number;
  duration: string;
  active: boolean;
}>;

// User-confirmed catalog terms, 2026-11-04. These are independent of
// editable browser-supplied checkout data.
export const NETCRAFT_VIP_TERMS: Readonly<
  Record<VipTier, Readonly<{
    name: string; priceCents: number; duration: "30 dias";
    rankTag: VipRule["rankTag"]; days: 30;
  }>>
> = Object.freeze({
  explorer: Object.freeze({
    name: "Explorer", priceCents: 490, duration: "30 dias",
    rankTag: "ncbr:vip_explorer", days: 30,
  }),
  elite: Object.freeze({
    name: "Elite", priceCents: 1290, duration: "30 dias",
    rankTag: "ncbr:vip_elite", days: 30,
  }),
  supreme: Object.freeze({
    name: "Supreme", priceCents: 2490, duration: "30 dias",
    rankTag: "ncbr:vip_supreme", days: 30,
  }),
});
const tiers = ["explorer", "elite", "supreme"] as const;
const validId = /^[a-zA-Z0-9_.-]{1,128}$/;
const cents = (price: unknown): number | null => {
  if(typeof price !== "number" || !Number.isFinite(price) || price <= 0)
    return null;
  const rounded = Math.round(price * 100);
  return Number.isSafeInteger(rounded) &&
    Math.abs(price * 100 - rounded) < 1e-7 ? rounded : null;
};

/**
 * Explicit IDs MUST come from a reviewed, server-controlled approval.
 * A storefront name, guessed slug or customer-supplied line does not qualify.
 * Refuses all three plans when ANY approved plan is missing/mismatched.
 */
export function approvedNetCraftVipRegistry(
  catalog: readonly CatalogVipForApproval[],
  approved: readonly ApprovedVipId[],
): RewardRegistry {
  if(!Array.isArray(catalog) || !Array.isArray(approved) ||
      approved.length !== tiers.length || catalog.length > 1000)
    throw new Error("vip_approval_incomplete");
  const byId = new Map<string, CatalogVipForApproval>();
  for(const vip of catalog) {
    if(!vip || typeof vip.id !== "string" || !validId.test(vip.id) ||
       byId.has(vip.id))
      throw new Error("invalid_or_duplicate_vip_catalog_id");
    byId.set(vip.id, vip);
  }
  const seenTiers = new Set<VipTier>(), seenIds = new Set<string>();
  const rules: VipRule[] = [];
  for(const entry of approved) {
    if(!entry || typeof entry !== "object" ||
       !tiers.includes(entry.tier) ||
       typeof entry.productId !== "string" || !validId.test(entry.productId) ||
       seenTiers.has(entry.tier) || seenIds.has(entry.productId))
      throw new Error("invalid_or_duplicate_vip_approval");
    seenTiers.add(entry.tier);
    seenIds.add(entry.productId);
    const expected = NETCRAFT_VIP_TERMS[entry.tier];
    const actual = byId.get(entry.productId);
    if(!actual || actual.active !== true ||
       actual.name !== expected.name ||
       actual.duration !== expected.duration ||
       cents(actual.price) !== expected.priceCents)
      throw new Error("vip_catalog_terms_mismatch");
    rules.push({
      kind: "vip", productId: entry.productId, tier: entry.tier,
      rankTag: expected.rankTag, duration: expected.duration, days: expected.days,
    });
  }
  if(seenTiers.size !== tiers.length)
    throw new Error("vip_approval_incomplete");
  return makeRewardRegistry(rules);
}
