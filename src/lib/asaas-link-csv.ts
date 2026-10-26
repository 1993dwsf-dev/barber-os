/**
 * Restricted admin CSV export of manual Sandbox payment associations.
 * These records are NOT invoices, settled receivables or active subscriptions.
 */
export type LinkCsvRow = {
  organizationName: string;
  paymentId: string;
  planName: string;
  priceCents: number;
  status: "pending_review" | "voided";
  createdAt: number;
  updatedAt: number;
};

function cell(input: string | number): string {
  const raw = String(input);
  const guarded = /^[\s\uFEFF]*[=+\-@]/u.test(raw) ? "'" + raw : raw;
  return '"' + guarded.replace(/"/g, '""') + '"';
}

export function sandboxLinksCsv(rows: readonly LinkCsvRow[]): string {
  const columns = [
    "Barbearia", "Cobrança Asaas Sandbox", "Plano previsto", "Preço previsto (R$)",
    "Situação do vínculo", "Criado em", "Atualizado em", "Observação",
  ];
  const date = (time: number) => new Date(time).toISOString();
  const body = rows.map(item => [
    item.organizationName, item.paymentId, item.planName,
    (item.priceCents / 100).toFixed(2).replace(".", ","),
    item.status === "pending_review" ? "Pendente de revisão" : "Invalidado",
    date(item.createdAt), date(item.updatedAt),
    "Não comprova recebimento nem concede acesso",
  ]);
  return "\uFEFF" + [columns, ...body].map(row => row.map(cell).join(";")).join("\r\n") + "\r\n";
}
