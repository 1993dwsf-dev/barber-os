import { bad } from "./lib";

/**
 * Limites de campos de texto livre.
 *
 * Sem teto de tamanho, um campo como "observações" aceitava megabytes de
 * texto: isso infla o banco, quebra relatórios/CSV e transforma qualquer
 * listagem em uma transferência enorme. Os limites abaixo são generosos para
 * o uso real da barbearia e barram abuso.
 */
export const TEXT_LIMITS = {
  name: 120,
  note: 2_000,
  description: 1_000,
  reason: 300,
  reference: 120,
  unit: 20,
  tag: 40,
  address: 400,
  email: 160,
  phone: 40,
} as const;

export type TextLimitKey = keyof typeof TEXT_LIMITS;

/** Normaliza (trim) e valida o tamanho; devolve `undefined` para vazio. */
export function text(
  value: string | undefined,
  limit: TextLimitKey,
  label: string,
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > TEXT_LIMITS[limit])
    bad(`${label} deve ter no máximo ${TEXT_LIMITS[limit]} caracteres.`);
  return trimmed;
}

/** Valida o tamanho de um campo obrigatório já normalizado. */
export function requiredText(value: string, limit: TextLimitKey, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) bad(`Informe ${label.toLowerCase()}.`);
  if (trimmed.length > TEXT_LIMITS[limit])
    bad(`${label} deve ter no máximo ${TEXT_LIMITS[limit]} caracteres.`);
  return trimmed;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Valida um horário no formato 24h "HH:MM" (ex.: 09:30). */
export function timeLabel(value: string, label: string): string {
  if (!TIME_RE.test(value)) bad(`${label} deve estar no formato HH:MM (ex.: 09:30).`);
  return value;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida uma data "AAAA-MM-DD" existente no calendário.
 * Sem isso uma data como "2026-02-31" ou "abc" entrava no banco e quebrava
 * relatórios, agendamentos e comparações de período.
 */
export function dateISO(value: string, label: string): string {
  if (!DATE_RE.test(value)) bad(`${label} deve estar no formato AAAA-MM-DD.`);
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    bad(`${label} inválida.`);
  }
  return value;
}

/** Valida cor hexadecimal no formato #RRGGBB. */
export function hexColor(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) bad(`${label} deve estar no formato #RRGGBB.`);
  return trimmed.toLowerCase();
}

/** Valida listas de etiquetas (quantidade e tamanho de cada uma). */
export function textList(
  values: string[] | undefined,
  limit: TextLimitKey,
  maxItems: number,
  label: string,
): string[] | undefined {
  if (values === undefined) return undefined;
  if (values.length > maxItems) bad(`${label}: no máximo ${maxItems} item(ns).`);
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      if (value.length > TEXT_LIMITS[limit])
        bad(`${label}: cada item deve ter no máximo ${TEXT_LIMITS[limit]} caracteres.`);
      return value;
    });
}
