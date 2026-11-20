/**
 * Explicit IDs observed in the owner's NetCraftBR Preview VIP panel on
 * 2026-11-04. Only use this mapping to validate an isolated LAB catalog.
 *
 * IMPORTANT:
 * - Preview records may be copies; these IDs are NOT assumed to be Production IDs.
 * - Nothing imports this file into a payment endpoint, dispatcher or BDS.
 * - This is NOT proof of a payment, identity or permission to grant a VIP.
 * - Old Nubank/LivePix links are not payment confirmation.
 */
import {
  approvedNetCraftVipRegistry,
  type CatalogVipForApproval,
  type ApprovedVipId,
} from "./netcraftVipCatalogApproval.ts";
import type {RewardRegistry} from "./verifiedRewardRegistry.ts";

// Manually reviewed screenshot: Panel Administrativo -> VIPs, Preview branch.
// Keep IDs exact; never infer them from plan name, price, or customer input.
export const NETCRAFT_PREVIEW_VIP_APPROVALS: readonly ApprovedVipId[] =
  Object.freeze([
    Object.freeze({tier: "explorer" as const, productId: "vip-1791128040888-vvek"}),
    Object.freeze({tier: "elite" as const, productId: "vip-1791128072288-kztd"}),
    Object.freeze({tier: "supreme" as const, productId: "vip-1791128111086-kw5n"}),
  ]);

/** Returns only a validation registry. No network access and no grants. */
export function netcraftPreviewVipRegistry(
  trustedPreviewCatalog: readonly CatalogVipForApproval[],
): RewardRegistry {
  return approvedNetCraftVipRegistry(
    trustedPreviewCatalog,
    NETCRAFT_PREVIEW_VIP_APPROVALS,
  );
}
