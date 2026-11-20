import React, { useEffect, useState } from "react";
import { useAdmin } from "../context/AdminContext.tsx";
import { api } from "../lib/api.ts";
import { brasiliaPeriod, type RevenueReport } from "../lib/revenue.ts";
import { subscribeToOrders } from "../lib/firestoreSync.ts";
const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
export function RevenuePanel() {
  const { adminToken } = useAdmin();
  const [period, setPeriod] = useState(brasiliaPeriod(new Date())!),
    [report, setReport] = useState<RevenueReport | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true,
      version = 0;
    async function load() {
      const request = ++version;
      try {
        const next = await api.getRevenue(period, adminToken);
        if (active && request === version) {
          setReport(next);
          setError("");
        }
      } catch (err) {
        if (active && request === version) setError((err as Error).message);
      } finally {
        if (active && request === version) setLoading(false);
      }
    }
    setLoading(true);
    setReport(null);
    load();
    const unsubscribe = subscribeToOrders(() => {
      void load();
    });
    const timer = setInterval(load, 60000);
    window.addEventListener("focus", load);
    return () => {
      active = false;
      unsubscribe();
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [period, adminToken]);
  return (
    <section className="revenue-panel" aria-busy={loading}>
      <div className="section-heading">
        <div>
          <h2>Faturamento</h2>
          <p>Pagamentos confirmados, descontadas as devoluções conhecidas.</p>
        </div>
        <label>
          Consultar período
          <input
            aria-label="Mês e ano do faturamento"
            type="month"
            value={period}
            onChange={(e) => {
              if (e.target.value) setPeriod(e.target.value);
            }}
          />
        </label>
      </div>
      {error && (
        <p className="cart-error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Calculando faturamento…</p>}
      {report && !error && (
        <>
          <div className="revenue-grid">
            <article>
              <span>Faturamento total</span>
              <strong>{money(report.totalCents)}</strong>
            </article>
            <article>
              <span>
                Mês atual ·{" "}
                {report.currentPeriod.split("-").reverse().join("/")}
              </span>
              <strong>{money(report.currentMonthCents)}</strong>
            </article>
            <article>
              <span>
                Período selecionado · {period.split("-").reverse().join("/")}
              </span>
              <strong>{money(report.periodCents)}</strong>
            </article>
          </div>
          {(report.missingApprovalDates > 0 ||
            report.uncertainPayments > 0) && (
            <p role="status" className="revenue-notice">
              Relatório parcial: {report.missingApprovalDates} pagamento(s) sem
              data de aprovação confiável não entram nos meses;{" "}
              {report.uncertainPayments} registro(s) com valores ou estados
              conflitantes não entram nas somas. A data de criação não substitui
              a aprovação.
            </p>
          )}
          <p className="revenue-note">
            Fuso: Brasília. Histórico baseado nas confirmações registradas;
            datas antigas não foram reconciliadas com o provedor. Devoluções
            reduzem a receita do mês da aprovação original.{" "}
            {report.confirmedPayments} pagamento(s) identificado(s);{" "}
            {report.duplicates} duplicata(s) desconsiderada(s).
          </p>
        </>
      )}
    </section>
  );
}
