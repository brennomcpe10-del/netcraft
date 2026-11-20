import { RewardDraft } from "../types/index.ts";
export function validateRewardDraft(draft: RewardDraft | undefined) {
  if (!draft) return;
  if (draft.version !== 1 || !Array.isArray(draft.items))
    throw new Error("Formato de recompensa inválido.");
  if (Object.keys(draft).some((key) => !["version", "items"].includes(key)))
    throw new Error("Campos de recompensa não permitidos.");
  if (draft.items.length > 128)
    throw new Error("Use no máximo 128 linhas de recompensa.");
  for (const item of draft.items) {
    if (!item || typeof item.itemId !== "string")
      throw new Error("Item inválido.");
    if (Object.keys(item).some((key) => !["itemId", "quantity"].includes(key)))
      throw new Error("Campos do item não permitidos.");
    if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(item.itemId))
      throw new Error("Informe identificadores como minecraft:diamond.");
    if (
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 2304
    )
      throw new Error("Cada quantidade deve ser um inteiro entre 1 e 2304.");
  }
}
