import { test } from "node:test";
import assert from "node:assert/strict";
import { MercadoPago, validationDiagnostics } from "../server/payments/mercadoPago.ts";

const secrets = ["buyer@example.com", "12849309559", "TEST-private-token", "APP_USR-private-token"];
const response = {
  errors: [{ code: "property_type", message: secrets.join(" "), details: [
    { property: "total_amount", code: "property_type", value: secrets[1], message: secrets[0] },
    { field: "transactions.payments[0].amount", validation_code: "invalid_type" },
    { path: "items[0].unit_price", error_code: "property_type" },
    ...secrets.map(secret => ({ property: secret, code: secret, value: secret })),
    { property: "payer.email", code: "property_required", message: secrets[0] },
    { property: "total_amount " + secrets[0], code: "property_type " + secrets[1] },
    { message: "property_type", value: "total_amount" },
    secrets.join(" "), null,
  ] }],
};
test("validation diagnostics inspect details and expose only allowlisted identifiers", () => {
  assert.deepEqual(validationDiagnostics(response), {
    properties: ["total_amount", "transactions.payments[0].amount", "items[0].unit_price", "payer.email"],
    codes: ["property_type", "invalid_type", "property_required"],
  });
  for (const secret of secrets) assert.ok(!JSON.stringify(validationDiagnostics(response)).includes(secret));
  for (const invalid of [null, {}, { errors: {} }, { errors: [null, { details: "private" }] }])
    assert.deepEqual(validationDiagnostics(invalid), { properties: [], codes: [] });
});
test("HTTP validation diagnostics log only in Preview and never enter public errors", async () => {
  const previous = process.env.VERCEL_ENV;
  const warn = console.warn;
  try {
    for (const environment of ["preview", "production", "development", undefined]) {
      if (environment === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = environment;
      const logs: unknown[][] = [];
      console.warn = (...args: unknown[]) => { logs.push(args); };
      const gateway = new MercadoPago("TEST-private-token", (async () =>
        new Response(JSON.stringify(response), { status: 400 })) as typeof fetch);
      await assert.rejects(gateway.request("/v1/orders"), (error: Error) => {
        assert.match(error.message, /HTTP 400/);
        assert.ok(!error.message.includes("property_type"));
        assert.ok(!error.message.includes("total_amount"));
        for (const secret of secrets) assert.ok(!error.message.includes(secret));
        return true;
      });
      assert.equal(logs.length, environment === "preview" ? 1 : 0);
      if (environment === "preview") assert.deepEqual(logs[0], ["[MercadoPago validation]", validationDiagnostics(response)]);
      for (const secret of secrets) assert.ok(!JSON.stringify(logs).includes(secret));
    }
  } finally {
    console.warn = warn;
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});
