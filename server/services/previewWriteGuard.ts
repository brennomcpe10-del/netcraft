import type { Request, Response, NextFunction } from "express";
import { isPreviewEnvironment } from "./previewIsolation.ts";

/**
 * The Preview and Production currently read one physical Firestore database.
 * Until store/catalog/content and legacy order writes have isolated collections,
 * *never* allow a Preview admin endpoint to mutate shared production records.
 *
 * This guard intentionally does not apply to Preview-only player and support
 * collections or to sandbox Pix order creation in pixTestOrders.
 */
export function previewSharedWriteBlocked(env: NodeJS.ProcessEnv = process.env): boolean {
  return isPreviewEnvironment(env);
}
export function protectSharedPreviewWrite(_req: Request, res: Response, next: NextFunction) {
  if (!previewSharedWriteBlocked()) return next();
  res.setHeader("Cache-Control", "no-store");
  return res.status(409).json({
    code: "PREVIEW_STORE_NOT_ISOLATED",
    error: "Alteração bloqueada: a Preview ainda compartilha o catálogo com a Production. Os registros existentes não foram modificados.",
  });
}
