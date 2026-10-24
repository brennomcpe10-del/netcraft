/**
 * Isolation boundary for Preview-only player and support data.
 * Preview and Production currently share a Firebase project/database.
 * New records written in Preview must never touch the live users/tickets
 * collections. These collection names are not covered by permissive legacy
 * Firestore rules, so browser access remains denied by default.
 *
 * Catalog/order settings migration is intentionally separate: do not change
 * those document paths here without a complete plan for Pix and Production.
 */
export type IsolatedCollection = "players" | "supportTickets";

export function isPreviewEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === "preview";
}

export function managedCollection(
  type: IsolatedCollection,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (isPreviewEnvironment(env)) {
    return type === "players" ? "previewPlayers" : "previewSupportTickets";
  }
  return type === "players" ? "users" : "tickets";
}
