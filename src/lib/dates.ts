/**
 * Utilitários puros de data/moeda — sem APIs de DOM, usáveis no Convex.
 * Datas de negócio são strings "YYYY-MM-DD" no fuso America/Sao_Paulo (UTC-3 fixo).
 */

const TZ_OFFSET_MIN = 180; // UTC-3 (Brasil, sem horário de verão)

export function todayISO(nowMs = Date.now()): string {
  return msToISODate(nowMs);
}

export function msToISODate(ms: number): string {
  const d = new Date(ms - TZ_OFFSET_MIN * 60_000);
  return d.toISOString().slice(0, 10);
}

export function nowISOTime(nowMs = Date.now()): string {
  const d = new Date(nowMs - TZ_OFFSET_MIN * 60_000);
  return d.toISOString().slice(11, 16); // HH:MM
}

/** Adiciona dias a uma data ISO. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Dia da semana 0=domingo..6=sábado de uma data ISO. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "YYYY-MM" de uma data ISO. */
export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Primeiro e último dia do mês de uma data ISO. */
export function monthRange(iso: string): { start: string; end: string } {
  const [y, m] = iso.split("-").map(Number);
  const start = `${iso.slice(0, 7)}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start, end: `${iso.slice(0, 7)}-${String(last).padStart(2, "0")}` };
}

/** Primeiro dia do mês deslocado em `delta` meses. */
export function monthOffsetISO(iso: string, delta: number): string {
  const [y, m] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return dt.toISOString().slice(0, 10);
}

/** Converte "HH:MM" para minutos desde 00:00. */
export function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Converte minutos desde 00:00 para "HH:MM". */
export function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Dias entre duas datas ISO (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
}

/** Aniversário (MM-DD) cai dentro dos próximos `days` dias a partir de `today`? */
export function birthdayWithin(birthDate: string, today: string, days: number): boolean {
  const mmdd = birthDate.slice(5);
  for (let i = 0; i <= days; i++) {
    const future = addDaysISO(today, i);
    if (future.slice(5) === mmdd) return true;
  }
  return false;
}
