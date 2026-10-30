import type { Firestore } from "firebase-admin/firestore";

// An isolated, test-only persistence adapter. Never dispatches a Minecraft reward.
// Does not read the live Pix queue; only accepts synthetic demo-only fixtures.
export function emulatorDeliveryStore(db: Firestore) {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8085" ||
      process.env.NODE_ENV !== "test" ||
      process.env.GCLOUD_PROJECT !== "demo-netcraft-admin-test")
    throw new Error("Demo emulator required");
  const collection = db.collection("deliverySimulationOnly");
  const validId = (id: string) => /^[a-f0-9]{64}-\d{1,3}$/.test(id);
  async function seed(job: { id: string; gamertag: string; kind: "vip" | "kit"; dispatchEnabled: false }) {
    if (!validId(job.id) || !/^[a-zA-Z0-9_ ]{1,32}$/.test(job.gamertag) ||
        !["vip","kit"].includes(job.kind) || job.dispatchEnabled !== false)
      throw new Error("Invalid simulated job");
    const ref = collection.doc(job.id);
    return db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (snapshot.exists) {
        if (snapshot.data()?.gamertag !== job.gamertag || snapshot.data()?.kind !== job.kind)
          throw new Error("Conflicting delivery");
        return { duplicate: true, state: snapshot.data()?.state };
      }
      tx.create(ref, { ...job, state: "waiting_for_player", attempts: 0, acknowledged: false });
      return { duplicate: false, state: "waiting_for_player" };
    });
  }
  async function poll(gamertag: string) {
    if (!/^[a-zA-Z0-9_ ]{1,32}$/.test(gamertag)) throw new Error("Invalid player");
    const snap = await collection.where("gamertag","==",gamertag).get();
    return snap.docs.filter(doc => doc.data().state === "waiting_for_player")
      .map(doc => ({ id: doc.id, kind: doc.data().kind, simulation: true }));
  }
  async function acknowledge(id: string) {
    if (!validId(id)) throw new Error("Invalid delivery");
    return db.runTransaction(async tx => {
      const ref = collection.doc(id), doc = await tx.get(ref);
      if (!doc.exists) throw new Error("Not found");
      const current = doc.data()!;
      if (current.state === "blocked") throw new Error("Refund blocked");
      if (current.state === "simulated_complete") return { duplicate: true, state: current.state };
      tx.update(ref, { state: "simulated_complete", acknowledged: true, attempts: current.attempts + 1 });
      return { duplicate: false, state: "simulated_complete" };
    });
  }
  async function retry(id: string) {
    if (!validId(id)) throw new Error("Invalid delivery");
    return db.runTransaction(async tx => {
      const ref = collection.doc(id), doc = await tx.get(ref);
      if (!doc.exists || doc.data()?.state !== "waiting_for_player") return false;
      tx.update(ref, { attempts: doc.data()!.attempts + 1 });
      return true;
    });
  }
  async function refund(id: string) {
    if (!validId(id)) throw new Error("Invalid delivery");
    return db.runTransaction(async tx => {
      const ref = collection.doc(id), doc = await tx.get(ref);
      if (!doc.exists) throw new Error("Not found");
      if (doc.data()!.state !== "blocked") tx.update(ref, { state: "blocked" });
      return { state: "blocked" };
    });
  }
  return { seed, poll, acknowledge, retry, refund };
}
