import { test } from "node:test";
import assert from "node:assert/strict";
import {
  identityPersistence,
  decodeIdentity,
  signIdentity,
  type SignedIdentity,
} from "../server/services/identityPersistence.ts";
import { defaultIdentity, type SiteIdentity } from "../src/lib/identity.ts";
const identity: SiteIdentity = {
  asset: {
    path: "inline:test",
    storage: "firestore",
    url: "data:image/png;base64,dGVzdA==",
    mime: "image/png",
    kind: "image",
    width: 32,
    height: 32,
  },
  fit: "contain",
  x: 40,
  y: 60,
};
test("signed raster config persists across repository instances and resets without Admin SDK credentials", async () => {
  const previous = process.env.ADMIN_KEYWORD;
  process.env.ADMIN_KEYWORD = "isolated-test-only-key";
  let data: SignedIdentity | null = null;
  const repository = {
    read: async () => data,
    write: async (value: SignedIdentity) => {
      data = structuredClone(value);
    },
  };
  try {
    const first = identityPersistence(repository);
    assert.equal(await first.read(), null);
    await first.save(identity);
    assert.deepEqual(await identityPersistence(repository).read(), identity);
    await identityPersistence(repository).reset();
    assert.deepEqual(await first.read(), defaultIdentity);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_KEYWORD;
    else process.env.ADMIN_KEYWORD = previous;
  }
});
test("forged Firestore writes cannot change the logo accepted by the public reader", () => {
  const previous = process.env.ADMIN_KEYWORD;
  process.env.ADMIN_KEYWORD = "isolated-test-only-key";
  try {
    const stored = signIdentity(identity);
    assert.deepEqual(decodeIdentity(stored), identity);
    assert.throws(() =>
      decodeIdentity({
        ...stored,
        payload: stored.payload.replace("inline:test", "inline:tampered"),
      }),
    );
    assert.throws(() =>
      decodeIdentity({ ...stored, signature: "0".repeat(64) }),
    );
    assert.throws(() =>
      decodeIdentity({ asset: { url: "https://attacker.test" } }),
    );
  } finally {
    if (previous === undefined) delete process.env.ADMIN_KEYWORD;
    else process.env.ADMIN_KEYWORD = previous;
  }
});
test("failed Firestore commit rejects instead of returning a successful save", async () => {
  const previous = process.env.ADMIN_KEYWORD;
  process.env.ADMIN_KEYWORD = "isolated-test-only-key";
  try {
    const service = identityPersistence({
      read: async () => null,
      write: async () => {
        throw new Error("Firestore unavailable");
      },
    });
    await assert.rejects(service.save(identity), /Firestore unavailable/);
    await assert.rejects(service.reset(), /Firestore unavailable/);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_KEYWORD;
    else process.env.ADMIN_KEYWORD = previous;
  }
});
