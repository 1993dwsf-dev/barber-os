/** Formatação pt-BR para a interface (valores de exibição apenas). */

export function brl(cents: number | undefined | null): string {
  if (cents === undefined || cents === null) return "—";
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function brlCompact(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1000) {
    return `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  }
  return brl(cents);
}

/** Converte "1.234,56" ou "1234.56" ou "1234,56" para centavos. */
export function reaisToCents(input: string | number): number {
  if (typeof input === "number") return Math.round(input * 100);
  const clean = input
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number.parseFloat(clean);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function fmtDateShort(iso: string | undefined | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const WEEKDAY_FULL = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
export const MONTH_LABELS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export function fmtMonthKey(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_LABELS[Number(m) - 1]}/${y.slice(2)}`;
}

export function fmtPhone(phone: string | undefined | null): string {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

export function whatsappLink(phone: string, message?: string): string {
  const d = phone.replace(/\D/g, "");
  const full = d.startsWith("55") ? d : `55${d}`;
  const base = `https://wa.me/${full}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  pix: "PIX",
};

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_atendimento: "Em atendimento",
  concluido: "Concluído",
  cancelado: "Cancelado",
  falta: "Falta",
};

export const APPOINTMENT_STATUS_TONES: Record<string, string> = {
  agendado: "bg-sky-100 text-sky-700 border-sky-200",
  confirmado: "bg-teal-100 text-teal-700 border-teal-200",
  em_atendimento: "bg-amber-100 text-amber-700 border-amber-200",
  concluido: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelado: "bg-rose-100 text-rose-600 border-rose-200",
  falta: "bg-zinc-200 text-zinc-600 border-zinc-300",
};

export function toCSV(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(";"), ...rows.map((r) => r.map(esc).join(";"))].join("\n");
}

export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
