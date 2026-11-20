/** Display historical records without changing or inventing their saved values. */
export function formatStoredMoney(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(value)
    : 'Valor não informado';
}
