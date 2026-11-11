export const ORD = "ORD01JP84C939T20S0P1DN382FQ6K";
export const PAY = "PAY01JP84C939T20S0P1DN6FCMWQC";
export function ordersFixture(
  reference: string,
  total = "25.00",
  state = "pending",
): any {
  const processed = state === "approved";
  const status = processed
    ? "processed"
    : state === "pending"
      ? "action_required"
      : state;
  const detail = processed
    ? "accredited"
    : state === "pending"
      ? "waiting_transfer"
      : state;
  return {
    id: ORD,
    type: "online",
    processing_mode: "automatic",
    external_reference: reference,
    total_amount: total,
    total_paid_amount: processed ? total : "0.00",
    country_code: "BRA",
    user_id: "42",
    status,
    status_detail: detail,
    created_date: new Date().toISOString(),
    last_updated_date: new Date().toISOString(),
    transactions: {
      payments: [
        {
          id: PAY,
          amount: total,
          paid_amount: processed ? total : "0.00",
          status,
          status_detail: detail,
          payment_method: {
            id: "pix",
            type: "bank_transfer",
            qr_code: "local-fixture-never-a-live-product",
            qr_code_base64: "",
          },
        },
      ],
    },
  };
}
export function memoryDB() {
  const records = new Map<string, any>();
  const ref = (path: string): any => ({
    path,
    id: path.split("/").pop(),
    get: async () => snap(path),
    // Match Firestore DocumentReference.create(): an atomic unique-key write
    // which fails with ALREADY_EXISTS (gRPC 6), not an upsert.
    create: async (data: any) => {
      if (records.has(path)) {
        const err: any = new Error("ALREADY_EXISTS");
        err.code = 6;
        throw err;
      }
      records.set(path, structuredClone(data));
      return { writeTime: null };
    },
    collection: (name: string) => collection(path + "/" + name),
  });
  const snap = (path: string): any => ({
    exists: records.has(path),
    id: path.split("/").pop(),
    ref: ref(path),
    data: () => structuredClone(records.get(path)),
  });
  const collection = (path: string): any => ({
    doc: (id: string) => ref(path + "/" + id),
    where: (field: string, _op: string, value: any) => ({
      query: true,
      path,
      field,
      value,
      // Mirror Firestore Query.get() as well as Transaction.get(Query), so
      // authenticated BDS candidate poll can exercise the real query shape.
      get: async () => ({
        docs: [...records.entries()]
          .filter(([key, entry]) => key.startsWith(path + "/") &&
            entry[field] === value)
          .map(([key]) => snap(key)),
      }),
    }),
  });
  const tx: any = {
    get: async (r: any) =>
      r.query
        ? {
            docs: [...records.entries()]
              .filter(
                ([key, v]) =>
                  key.startsWith(r.path + "/") && v[r.field] === r.value,
              )
              .map(([key]) => snap(key)),
            get size() {
              return this.docs.length;
            },
          }
        : snap(r.path),
    create: (r: any, d: any) => {
      if (records.has(r.path)) throw Error("Duplicate");
      records.set(r.path, structuredClone(d));
    },
    set: (r: any, d: any) => records.set(r.path, structuredClone(d)),
    update: (r: any, d: any) =>
      records.set(r.path, { ...records.get(r.path), ...structuredClone(d) }),
    delete: (r: any) => records.delete(r.path),
  };
  return { records, collection, runTransaction: async (fn: any) => fn(tx) };
}
