// NetCraft Bedrock Dedicated Server E2E LAB ONLY. Pure validation.
// This contract NEVER authorizes a commercial grant.
const ITEM_ID = 'd'.repeat(64) + '-0';
const VIP_ID = 'd'.repeat(64) + '-1';
const KIT_ID = 'd'.repeat(64) + '-2';
const RENEW_ID = 'd'.repeat(64) + '-3';
const EXPLORER = 'ncbr:vip_explorer';
const ORDER_ID = 'd'.repeat(64);
export const E2E_LAB_ORDER_ID = ORDER_ID;
export const E2E_LAB_ITEM_ID = ITEM_ID;
export const E2E_LAB_VIP_ID = VIP_ID;
export const E2E_LAB_KIT_ID = KIT_ID;
export const E2E_LAB_VIP_RENEW_ID = RENEW_ID;
export function validateLabResponse(parsed, expectedGamertag) {
  if (!parsed || parsed.simulation !== true || parsed.environment !== 'synthetic_local' ||
      parsed.dispatchEnabled !== false || !Array.isArray(parsed.deliveries) ||
      parsed.deliveries.length > 4) return null;
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
    } else if (entry.id === KIT_ID && entry.kind === 'items' &&
               !('rankTag' in entry) && !('days' in entry) &&
               Array.isArray(entry.items) && entry.items.length === 2 &&
               entry.items[0]?.itemId === 'minecraft:diamond' && entry.items[0]?.quantity === 3 &&
               entry.items[1]?.itemId === 'minecraft:iron_ingot' && entry.items[1]?.quantity === 6 &&
               entry.items.every(item => item && Object.keys(item).every(key=>['itemId','quantity'].includes(key)))) {
      jobs.push({contract:'netcraft.delivery.v1',id:KIT_ID,orderId:ORDER_ID,
        gamertag:expectedGamertag,kind:'items',items:[
          {itemId:'minecraft:diamond',quantity:3},{itemId:'minecraft:iron_ingot',quantity:6}]});
    } else if ((entry.id === VIP_ID || entry.id === RENEW_ID) && entry.kind === 'vip' &&
               entry.rankTag === EXPLORER &&
               entry.days === 1 && !('items' in entry) && Object.keys(entry).length <= 10) {
      // A VIP can only use a rank already configured in the Core. No arbitrary /tag.
      jobs.push({ contract: 'netcraft.delivery.v1', id: entry.id, orderId: ORDER_ID,
        gamertag: expectedGamertag, kind: 'vip', rankTag: EXPLORER, days:1 });
    } else return null;
  }
  return jobs;
}
export function isAckableResult(result) {
  return result?.status === 'applied' || result?.status === 'already_applied';
}
