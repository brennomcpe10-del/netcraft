export interface RevenueReport {
  totalCents: number;
  currentMonthCents: number;
  periodCents: number;
  currentPeriod: string;
  selectedPeriod: string;
  confirmedPayments: number;
  missingApprovalDates: number;
  uncertainPayments: number;
  duplicates: number;
}
const confirmed = new Set([
  "pago",
  "entregue",
  "approved",
  "paid",
  "completed",
]);
const returned = new Set([
  "reembolsado",
  "estornado",
  "refunded",
  "charged_back",
  "chargeback",
]);
const pending = new Set([
  "pendente",
  "cancelado",
  "pending",
  "cancelled",
  "canceled",
  "rejected",
]);
const status = (v: unknown) =>
  typeof v === "string" ? v.toLowerCase().trim() : "";
function cents(v: unknown): number | null {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    v < 0 ||
    v > 1e9 ||
    Math.abs(v * 100 - Math.round(v * 100)) > 0.00001
  )
    return null;
  return Math.round(v * 100);
}
export function brasiliaPeriod(value: unknown): string | null {
  let date: Date;
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
  )
    date = new Date(value);
  else if (
    value &&
    typeof value === "object" &&
    typeof (value as any).seconds === "number"
  )
    date = new Date((value as any).seconds * 1000);
  else if (value instanceof Date) date = value;
  else return null;
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}
export function revenueReport(
  orders: Record<string, any>[],
  selectedPeriod: string,
  now = new Date(),
): RevenueReport {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selectedPeriod))
    throw new Error("Selecione mês e ano válidos.");
  const report: RevenueReport = {
    totalCents: 0,
    currentMonthCents: 0,
    periodCents: 0,
    currentPeriod: brasiliaPeriod(now)!,
    selectedPeriod,
    confirmedPayments: 0,
    missingApprovalDates: 0,
    uncertainPayments: 0,
    duplicates: 0,
  };
  const groups = new Map<string, Record<string, any>[]>();
  orders.forEach((order, index) => {
    const transaction = order.paymentId || order.transactionId;
    const usable =
      typeof transaction === "string" &&
      !transaction.startsWith("TX-") &&
      transaction.trim() &&
      !["pending", "null", "undefined", "n/a"].includes(
        transaction.toLowerCase(),
      );
    const key = usable
      ? `payment:${order.paymentProvider || order.paymentMethod || ""}:${transaction.trim()}`
      : `order:${String(order.sourceOrderId || order.id || index)
          .replace(/^#/, "")
          .toLowerCase()}`;
    const list = groups.get(key) || [];
    list.push(order);
    groups.set(key, list);
  });
  for (const records of groups.values()) {
    report.duplicates += records.length - 1;
    const relevant = records.filter(
      (o) =>
        confirmed.has(status(o.status)) ||
        returned.has(status(o.status)) ||
        confirmed.has(status(o.paymentStatus)) ||
        returned.has(status(o.paymentStatus)),
    );
    if (!relevant.length) continue;
    if (
      relevant.some((o) => pending.has(status(o.status))) ||
      (records.some((o) => pending.has(status(o.status))) &&
        records.some((o) => confirmed.has(status(o.status))))
    ) {
      report.uncertainPayments++;
      continue;
    }
    const amounts = relevant.map((o) => cents(o.amount));
    if (amounts.some((a) => a === null) || new Set(amounts).size !== 1) {
      report.uncertainPayments++;
      continue;
    }
    const gross = amounts[0]!;
    let refund = 0,
      uncertain = false;
    for (const order of relevant) {
      if (
        returned.has(status(order.status)) ||
        returned.has(status(order.paymentStatus))
      ) {
        refund = gross;
        continue;
      }
      let refunded = 0;
      if (order.refundedAmount !== undefined) {
        const amount = cents(order.refundedAmount);
        if (amount === null) {
          uncertain = true;
          break;
        }
        refunded = amount;
      }
      if (order.refunds !== undefined) {
        if (!Array.isArray(order.refunds)) {
          uncertain = true;
          break;
        }
        const seen = new Map<string, number>();
        for (const item of order.refunds) {
          if (!item || typeof item !== "object") {
            uncertain = true;
            break;
          }
          if (
            ["pending", "failed", "rejected", "cancelled", "canceled"].includes(
              status(item.status),
            )
          )
            continue;
          if (
            !["approved", "completed", "refunded", "succeeded"].includes(
              status(item.status),
            ) ||
            typeof item.id !== "string" ||
            !item.id
          ) {
            uncertain = true;
            break;
          }
          const amount = cents(item.amount);
          if (
            amount === null ||
            (seen.has(item.id) && seen.get(item.id) !== amount)
          ) {
            uncertain = true;
            break;
          }
          seen.set(item.id, amount);
        }
        refunded = Math.max(
          refunded,
          [...seen.values()].reduce((a, b) => a + b, 0),
        );
      }
      if (refunded > gross) {
        uncertain = true;
        break;
      }
      refund = Math.max(refund, refunded);
    }
    if (uncertain) {
      report.uncertainPayments++;
      continue;
    }
    const net = gross - refund;
    const dates = new Set(
      relevant
        .map((o) =>
          brasiliaPeriod(o.approvedAt || o.payment?.approvedAt || o.paidAt),
        )
        .filter(Boolean),
    );
    const period = dates.size === 1 ? [...dates][0] : null;
    report.confirmedPayments++;
    report.totalCents += net;
    if (!period) {
      if (net > 0) report.missingApprovalDates++;
      continue;
    }
    if (period === report.currentPeriod) report.currentMonthCents += net;
    if (period === selectedPeriod) report.periodCents += net;
  }
  return report;
}
