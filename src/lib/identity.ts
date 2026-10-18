export interface LogoAsset {
  path: string;
  url: string;
  kind: "image" | "gif" | "video";
  mime: string;
  width: number;
  height: number;
  duration?: number;
}
export interface SiteIdentity {
  asset: LogoAsset | null;
  fit: "contain" | "cover";
  x: number;
  y: number;
}
export const defaultIdentity: SiteIdentity = {
  asset: null,
  fit: "contain",
  x: 50,
  y: 50,
};
export function identityFrame(
  value: any,
): Pick<SiteIdentity, "fit" | "x" | "y"> {
  if (
    !value ||
    !["contain", "cover"].includes(value.fit) ||
    ![value.x, value.y].every(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100,
    )
  )
    throw new Error("Enquadramento inválido.");
  return { fit: value.fit, x: value.x, y: value.y };
}
export const LOGO_LIMITS = {
  image: 1024 * 1024,
  gif: 2 * 1024 * 1024,
  video: 3 * 1024 * 1024,
  seconds: 8,
  pixels: 2048,
};
