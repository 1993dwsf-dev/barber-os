/**
 * Relatório comercial interno: apenas metadados de organizações já autorizados
 * pela query platformAdmin.overview. Nunca exporta dados de clientes ou equipe.
 */
export type AdminUnitReport = {
  id: string;
  name: string;
  isDemo: boolean;
  createdAt: number;
  plan: string | null;
  status: string;
  trialEndsAt: number | null;
  periodEndsAt: number | null;
};

export type TrialWindow = "due_soon" | "expired" | "ongoing" | "missing_deadline" | "not_trial";

const DAY_MS = 86_400_000;

export function trialWindow(unit: Pick<AdminUnitReport, "status" | "trialEndsAt">, now: number): TrialWindow {
  if (unit.status !== "trialing") return "not_trial";
  if (typeof unit.trialEndsAt !== "number" || !Number.isFinite(unit.trialEndsAt)) {
    return "missing_deadline";
  }
  if (unit.trialEndsAt <= now) return "expired";
  if (unit.trialEndsAt <= now + 7 * DAY_MS) return "due_soon";
  return "ongoing";
}

export function countTrialWindows(units: AdminUnitReport[], now: number) {
  return units.reduce((counts, unit) => {
    const window = trialWindow(unit, now);
    if (window === "due_soon") counts.dueSoon += 1;
    if (window === "expired") counts.expired += 1;
    if (window === "missing_deadline") counts.missingDeadline += 1;
    return counts;
  }, { dueSoon: 0, expired: 0, missingDeadline: 0 });
}

const STATUS: Record<string, string> = {
  trialing: "Em teste",
  active: "Ativo (registro)",
  past_due: "Em atraso",
  canceled: "Cancelado",
  suspended: "Suspenso",
  unconfigured: "Sem plano",
};

const WINDOWS: Record<TrialWindow, string> = {
  due_soon: "Vence em até 7 dias",
  expired: "Prazo de teste expirado",
  ongoing: "Em teste — mais de 7 dias",
  missing_deadline: "Teste sem vencimento registrado",
  not_trial: "Não se aplica",
};

function dateCell(ms: number | null | undefined) {
  return typeof ms === "number" && Number.isFinite(ms)
    ? new Date(ms).toISOString().slice(0, 10)
    : "";
}

/**
 * Proteção contra CSV/Formula Injection no Excel/LibreOffice.
 * Aspas de CSV, por si só, não impedem interpretação de fórmulas.
 */
function csvCell(input: string | number | boolean | null | undefined): string {
  const text = String(input ?? "");
  const safe = /^[\s\uFEFF]*[=+\-@]/u.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function buildAdminUnitsCsv(units: AdminUnitReport[], now: number): string {
  const columns = [
    "ID da unidade", "Barbearia", "Demonstração", "Plano operacional",
    "Situação cadastrada", "Prazo do teste", "Data do cadastro",
    "Fim do teste", "Fim do período",
  ];
  const rows = units.map(unit => [
    unit.id, unit.name, unit.isDemo ? "Sim" : "Não", unit.plan ?? "",
    STATUS[unit.status] ?? unit.status, WINDOWS[trialWindow(unit, now)],
    dateCell(unit.createdAt), dateCell(unit.trialEndsAt), dateCell(unit.periodEndsAt),
  ]);
  return "\uFEFF" + [columns, ...rows].map(row => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
