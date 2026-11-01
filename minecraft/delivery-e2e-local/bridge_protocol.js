// NetCraft Bedrock Dedicated Server E2E LAB ONLY. Pure validation.
// This contract NEVER authorizes a commercial grant.
const ITEM_ID = 'd'.repeat(64) + '-0';
const VIP_ID = 'd'.repeat(64) + '-1';
const ORDER_ID = 'd'.repeat(64);
export const E2E_LAB_ORDER_ID = ORDER_ID;
export const E2E_LAB_ITEM_ID = ITEM_ID;
export const E2E_LAB_VIP_ID = VIP_ID;
export function validateLabResponse(parsed, expectedGamertag) {
  if (!parsed || parsed.simulation !== true || parsed.environment !== 'synthetic_local' ||
      parsed.dispatchEnabled !== false || !Array.isArray(parsed.deliveries) ||
      parsed.deliveries.length > 2) return null;
  const jobs = [];
  const ids = new Set();
  for (const entry of parsed.deliveries) {
    if (!entry || entry.labFixture !== true || entry.contract !== 'netcraft.delivery.v1' ||
        entry.orderId !== ORDER_ID || entry.gamertag !== expectedGamertag ||
        typeof entry.id !== 'string' || ids.has(entry.id)) return null;
    ids.add(entry.id);
    if (entry.id === ITEM_ID && entry.kind === 'items' &&
        Array.isArray(entry.items) && entry.items.length === 1 &&
        entry.items[0]?.itemId === 'minecraft:iron_ingot' && entry.items[0]?.quantity === 2) {
      jobs.push({ contract: 'netcraft.delivery.v1', id: ITEM_ID, orderId: ORDER_ID,
        gamertag: expectedGamertag, kind: 'items', items: [{itemId:'minecraft:iron_ingot',quantity:2}] });
    } else if (entry.id === VIP_ID && entry.kind === 'vip' &&
               /^ncbr:vip_[a-z0-9_]{1,32}$/.test(entry.rankTag || '') &&
               entry.days === 1 && Object.keys(entry).length <= 10) {
      // A VIP can only use a rank already configured in the Core. No arbitrary /tag.
      jobs.push({ contract: 'netcraft.delivery.v1', id: VIP_ID, orderId: ORDER_ID,
        gamertag: expectedGamertag, kind: 'vip', rankTag: entry.rankTag, days:1 });
    } else return null;
  }
  return jobs;
}
export function isAckableResult(result) {
  return result?.status === 'applied' || result?.status === 'already_applied';
}
