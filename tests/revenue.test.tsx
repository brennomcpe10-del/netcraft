import { test } from "node:test";
import assert from "node:assert/strict";
import { revenueReport, brasiliaPeriod } from "../src/lib/revenue.ts";
import { paymentStatusPatch } from "../src/lib/paymentStatus.ts";
const now = new Date("2026-10-18T18:00:00Z");
const order = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  amount: 10,
  status: "Pago",
  paidAt: "2026-10-01T15:00:00Z",
  ...patch,
});
test("confirmed net receipts exclude pending, cancelled and returned money", () => {
  const r = revenueReport(
    [
      order("a"),
      order("b", { status: "Entregue", amount: 15.5 }),
      order("c", { status: "Pendente" }),
      order("d", { status: "Cancelado" }),
      order("e", { status: "Reembolsado" }),
      order("f", { status: "Estornado" }),
      order("g", { amount: 20, refundedAmount: 5.25 }),
    ],
    "2026-10",
    now,
  );
  assert.equal(r.totalCents, 4025);
  assert.equal(r.periodCents, 4025);
  assert.equal(r.currentMonthCents, 4025);
});
test("Brasilia approval boundaries never use creation or delivery dates", () => {
  assert.equal(brasiliaPeriod("2026-10-01T02:59:59Z"), "2026-09");
  assert.equal(brasiliaPeriod("2026-10-01T03:00:00Z"), "2026-10");
  const r = revenueReport(
    [
      order("a", {
        paidAt: "2026-10-01T02:59:59Z",
        createdAt: "2026-10-03T00:00:00Z",
      }),
      order("b", { paidAt: undefined, createdAt: "2026-10-01T10:00:00Z" }),
      order("c", { paidAt: "2026-10-01 12:00:00" }),
    ],
    "2026-09",
    now,
  );
  assert.equal(r.totalCents, 3000);
  assert.equal(r.periodCents, 1000);
  assert.equal(r.currentMonthCents, 0);
  assert.equal(r.missingApprovalDates, 2);
});
test("deduplicates gateway IDs and order aliases but not generated legacy TX references", () => {
  const r = revenueReport(
    [
      order("a", { paymentId: "gateway-1" }),
      order("copy", { paymentId: "gateway-1" }),
      order("legacy-a", { transactionId: "TX-PIX-123" }),
      order("legacy-b", { transactionId: "TX-PIX-123" }),
      order("alias-1", { sourceOrderId: "ORD-1" }),
      order("alias-2", { sourceOrderId: "#ord-1" }),
    ],
    "2026-10",
    now,
  );
  assert.equal(r.totalCents, 4000);
  assert.equal(r.duplicates, 2);
});
test("partial refunds deduplicate refund IDs and repeated payment copies", () => {
  const a = order("a", {
    paymentId: "payment",
    amount: 30,
    refunds: [
      { id: "r1", status: "completed", amount: 5 },
      { id: "r1", status: "completed", amount: 5 },
      { id: "r2", status: "pending", amount: 10 },
    ],
  });
  assert.equal(
    revenueReport([a, { ...a, id: "copy" }], "2026-10", now).totalCents,
    2500,
  );
  assert.equal(
    revenueReport([{ ...a, status: "Reembolsado" }], "2026-10", now).totalCents,
    0,
  );
});
test("unknown amounts, excessive refunds and conflicting states are reported without estimates", () => {
  const r = revenueReport(
    [
      order("a", { amount: undefined }),
      order("b", { refundedAmount: 11 }),
      order("c", { paymentId: "same", amount: 10 }),
      order("d", { paymentId: "same", amount: 20 }),
      order("e", { status: "Cancelado", paymentStatus: "approved" }),
    ],
    "2026-10",
    now,
  );
  assert.equal(r.totalCents, 0);
  assert.equal(r.uncertainPayments, 4);
});
test("new confirmation records its date; delivery/refund never invent historical approval", () => {
  const date = now.toISOString();
  assert.equal(
    paymentStatusPatch({ status: "Pendente" }, "Pago", date).paidAt,
    date,
  );
  for (const status of ["Pago", "Entregue"] as const)
    assert.ok(
      !("paidAt" in paymentStatusPatch({ status: "Pago" }, status, date)),
    );
  assert.ok(
    !("paidAt" in paymentStatusPatch({ status: "Pendente" }, "Entregue", date)),
  );
  assert.ok(
    !(
      "paidAt" in
      paymentStatusPatch({ status: "Pago", paidAt: "old" }, "Reembolsado", date)
    ),
  );
});
