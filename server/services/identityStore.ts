import {
  initializeApp,
  getApps,
  cert,
  applicationDefault,
} from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "node:crypto";
import { firebaseConfig } from "../../src/lib/firebaseConfig.ts";
import {
  defaultIdentity,
  identityFrame,
  type SiteIdentity,
  type LogoAsset,
} from "../../src/lib/identity.ts";
function services() {
  const emulator =
    process.env.NODE_ENV !== "production" &&
    process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8085" &&
    process.env.FIREBASE_STORAGE_EMULATOR_HOST === "127.0.0.1:9199";
  if (
    !emulator &&
    !process.env.FIREBASE_SERVICE_ACCOUNT_JSON &&
    !process.env.GOOGLE_APPLICATION_CREDENTIALS
  )
    throw new Error(
      "Configure as credenciais de serviço do Firebase no backend para salvar a identidade visual.",
    );
  let app = getApps().find((app) => app.name === "site-identity");
  if (!app) {
    const projectId = emulator
      ? "demo-netcraft-admin-test"
      : firebaseConfig.projectId;
    const credentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
      : null;
    if (credentials && credentials.project_id !== projectId)
      throw new Error(
        "A credencial não pertence ao projeto Firebase existente.",
      );
    app = initializeApp(
      {
        projectId,
        storageBucket: emulator
          ? "demo-netcraft-admin-test.appspot.com"
          : firebaseConfig.storageBucket,
        ...(!emulator
          ? {
              credential: credentials
                ? cert(credentials)
                : applicationDefault(),
            }
          : {}),
      },
      "site-identity",
    );
  }
  return {
    db: getFirestore(
      app,
      emulator ? "(default)" : firebaseConfig.firestoreDatabaseId,
    ),
    bucket: getStorage(app).bucket(),
    emulator,
  };
}
export async function readIdentity(): Promise<SiteIdentity> {
  const { db } = services();
  const snap = await db.doc("siteIdentity/current").get();
  return snap.exists ? (snap.data() as SiteIdentity) : defaultIdentity;
}
export async function storeLogo(value: {
  bytes: Buffer;
  mime: string;
  kind: any;
  width: number;
  height: number;
  duration?: number;
}): Promise<LogoAsset> {
  const { bucket, emulator } = services();
  const extension: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  const path = `site-identity/${crypto.randomUUID()}.${extension[value.mime]}`,
    downloadToken = crypto.randomUUID();
  await bucket
    .file(path)
    .save(value.bytes, {
      resumable: false,
      metadata: {
        contentType: value.mime,
        cacheControl: "public,max-age=31536000,immutable",
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });
  const host = emulator
    ? "http://127.0.0.1:9199"
    : "https://firebasestorage.googleapis.com";
  return {
    path,
    url: `${host}/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`,
    kind: value.kind,
    mime: value.mime,
    width: value.width,
    height: value.height,
    ...(value.duration ? { duration: value.duration } : {}),
  };
}
export async function saveIdentity(asset: LogoAsset | null, frame: unknown) {
  const { db, bucket } = services();
  const next = { asset, ...identityFrame(frame) };
  if (asset && !(await bucket.file(asset.path).exists())[0])
    throw new Error("Envie o arquivo novamente.");
  const ref = db.doc("siteIdentity/current");
  const old = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    tx.set(
      ref,
      { ...next, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    return snapshot.data()?.asset;
  });
  if (
    old?.path &&
    old.path !== asset?.path &&
    /^site-identity\/[a-f0-9-]+\.(png|jpg|webp|gif|svg|mp4|webm)$/.test(
      old.path,
    )
  )
    await bucket
      .file(old.path)
      .delete({ ignoreNotFound: true })
      .catch(() => {});
  return next;
}
export function signUpload(asset: LogoAsset) {
  const payload = Buffer.from(
    JSON.stringify({ asset, expires: Date.now() + 30 * 60 * 1000 }),
  ).toString("base64url");
  return (
    payload +
    "." +
    crypto
      .createHmac("sha256", process.env.ADMIN_KEYWORD!)
      .update(payload)
      .digest("hex")
  );
}
export function verifyUpload(token: unknown): LogoAsset {
  if (typeof token !== "string" || token.length > 6000)
    throw new Error("Envie o arquivo novamente.");
  const [payload, signature, ...rest] = token.split(".");
  const expected = crypto
    .createHmac("sha256", process.env.ADMIN_KEYWORD!)
    .update(payload)
    .digest();
  if (
    rest.length ||
    !signature ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    !crypto.timingSafeEqual(Buffer.from(signature, "hex"), expected)
  )
    throw new Error("Referência de upload inválida.");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (data.expires < Date.now())
    throw new Error("A prévia expirou. Envie o arquivo novamente.");
  return data.asset;
}
