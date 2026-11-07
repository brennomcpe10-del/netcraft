/** Shared, defensive image URL policy for storefront and admin previews. */
export function safeStoreImage(input: unknown, fallback: string): string {
  if (typeof input !== "string" || !input || input.length > 850000)
    return fallback;
  if (input === "cube" || input === "crown") return fallback;
  // Existing uploaded PNG/JPEG/WebP/GIF images are stored as compressed data URLs.
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(input))
    return input;
  // No javascript:, http:, protocol-relative URLs, encoded backslashes, or HTML.
  if (/^https:\/\/[a-z0-9.-]+(?::443)?(?:\/[A-Za-z0-9._~%/?=&#+-]*)?$/i.test(input))
    return input;
  if (/^\/(?!\/)[A-Za-z0-9._~/%-]+(?:\?[A-Za-z0-9._~%&=+-]*)?$/.test(input) &&
      !input.includes("..") && !/%(?:2f|5c)/i.test(input))
    return input;
  return fallback;
}
export function fallbackStoreImage(event: {currentTarget: HTMLImageElement}, fallback: string) {
  const image = event.currentTarget;
  if (image.getAttribute("src") !== fallback) image.src = fallback;
}
