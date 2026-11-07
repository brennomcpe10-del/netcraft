import crypto from "node:crypto";
import {
  defaultIdentity,
  identityFrame,
  type SiteIdentity,
} from "../../src/lib/identity.ts";
export interface SignedIdentity {
  payload: string;
  signature: string;
  version: 2;
}
export interface IdentityRepository {
  read(): Promise<unknown | null>;
  write(value: SignedIdentity): Promise<void>;
}
function signature(payload: string) {
  const secret = process.env.ADMIN_KEYWORD;
  if (!secret) throw new Error("Serviço administrativo indisponível.");
  return crypto
    .createHmac("sha256", secret)
    .update("netcraft/site-identity/v2:" + payload)
    .digest("hex");
}
export function signIdentity(value: SiteIdentity): SignedIdentity {
  return {
    version: 2,
    payload: JSON.stringify(value),
    signature: signature(JSON.stringify(value)),
  };
}
export function decodeIdentity(value: unknown): SiteIdentity {
  const record = value as SignedIdentity;
  if (
    !record ||
    record.version !== 2 ||
    typeof record.payload !== "string" ||
    record.payload.length > 250000 ||
    typeof record.signature !== "string" ||
    !/^[a-f0-9]{64}$/.test(record.signature) ||
    !crypto.timingSafeEqual(
      Buffer.from(record.signature, "hex"),
      Buffer.from(signature(record.payload), "hex"),
    )
  )
    throw new Error(
      "A configuração do logo não pôde ser validada. Salve o logo novamente pelo painel.",
    );
  const identity = JSON.parse(record.payload);
  identityFrame(identity);
  if (
    identity.asset !== null &&
    (!identity.asset ||
      typeof identity.asset.url !== "string" ||
      typeof identity.asset.path !== "string" ||
      !["image", "gif", "video"].includes(identity.asset.kind))
  )
    throw new Error("Configuração do logo inválida.");
  return identity;
}
export function identityPersistence(repository: IdentityRepository) {
  return {
    async read() {
      const stored = await repository.read();
      return stored === null ? null : decodeIdentity(stored);
    },
    async save(value: SiteIdentity) {
      identityFrame(value);
      const signed = signIdentity(value);
      await repository.write(signed);
      return value;
    },
    async reset() {
      const value = { ...defaultIdentity };
      await repository.write(signIdentity(value));
      return value;
    },
  };
}
