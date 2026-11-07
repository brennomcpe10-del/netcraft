import { ProductCatalogError } from "./productCatalog.ts";

// Reject invalid replacements instead of silently discarding uploaded artwork.
// Unchanged legacy images are preserved when administrators edit other fields.
export function validateVipImage(value: unknown, previousImage?: string): string {
  if (value === undefined) return previousImage ?? "crown";
  if (typeof value !== "string")
    throw new ProductCatalogError("Imagem do VIP inválida.", 400);
  if (previousImage !== undefined && value === previousImage) return value;
  if (value.length > 850000)
    throw new ProductCatalogError("A imagem do VIP excede o tamanho permitido.", 400);
  if (value === "crown" || value === "cube") return value;
  if (/^\/(?!\/)[^\\\u0000-\u001F\u007F]*$/.test(value)) return value;
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))
    return value;
  if (value.startsWith("https://")) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && url.hostname && !url.username && !url.password)
        return value;
    } catch {}
  }
  throw new ProductCatalogError(
    "Use uma imagem HTTPS, um caminho local ou envie uma imagem válida.",
    400,
  );
}
