import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { firebaseConfig } from "../../src/lib/firebaseConfig.ts";
import { PixError } from "./mercadoPago.ts";
export function paymentDatabase() {
  const emulator =
    process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8085" &&
    process.env.NODE_ENV !== "production";
  let app = getApps().find((a) => a.name === "netcraft-payments-test");
  if (!app) {
    let account;
    try {
      account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "null");
    } catch {
      throw new PixError(
        "Credencial de persistência do backend inválida.",
        503,
      );
    }
    if (
      !emulator &&
      (!account || account.project_id !== firebaseConfig.projectId)
    )
      throw new PixError(
        "Persistência privada de pagamentos indisponível no backend.",
        503,
      );
    app = initializeApp(
      {
        projectId: emulator
          ? "demo-netcraft-admin-test"
          : firebaseConfig.projectId,
        ...(!emulator ? { credential: cert(account) } : {}),
      },
      "netcraft-payments-test",
    );
  }
  return getFirestore(
    app,
    emulator ? "(default)" : firebaseConfig.firestoreDatabaseId,
  );
}
