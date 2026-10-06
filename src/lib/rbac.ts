/**
 * RBAC — matriz de permissões compartilhada entre backend (Convex) e frontend.
 * As checagens server-side são autoritativas; o frontend usa a mesma matriz
 * apenas para esconder UI que o usuário não pode usar.
 */

export const APP_ROLES = ["owner", "admin", "manager", "barber", "cashier", "viewer"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gerente",
  barber: "Barbeiro",
  cashier: "Caixa",
  viewer: "Visitante",
};

/** Módulos/capacidades do sistema. */
export const CAPS = [
  "dashboard",
  "agenda",
  "clients",
  "team",
  "catalog",
  "packages",
  "memberships",
  "products",
  "inventory",
  "pos",
  "cash",
  "expenses",
  "commissions",
  "loyalty",
  "crm",
  "reports",
  "audit",
  "settings",
  "demo",
  "loyalty_done",
  "crm_done",
] as const;
export type Cap = (typeof CAPS)[number];

const ALL: Cap[] = [...CAPS];

type Matrix = Record<AppRole, { view: Cap[]; manage: Cap[] }>;

export const RBAC: Matrix = {
  owner: { view: ALL, manage: ALL },
  admin: { view: ALL, manage: ALL },
  manager: {
    view: ALL,
    manage: ALL.filter((c) => c !== "settings" && c !== "demo" && c !== "team"),
  },
  barber: {
    view: [
      "dashboard",
      "agenda",
      "clients",
      "catalog",
      "packages",
      "memberships",
      "products",
      "commissions",
      "loyalty",
      "crm",
      "reports",
    ],
    manage: ["agenda", "clients", "pos", "crm"],
  },
  cashier: {
    view: [
      "dashboard",
      "agenda",
      "clients",
      "catalog",
      "packages",
      "memberships",
      "products",
      "commissions",
      "reports",
      "inventory",
      "loyalty",
    ],
    manage: ["agenda", "clients", "pos", "cash", "packages", "memberships", "crm"],
  },
  viewer: {
    view: [
      "dashboard",
      "agenda",
      "clients",
      "team",
      "catalog",
      "packages",
      "memberships",
      "products",
      "inventory",
      "commissions",
      "loyalty",
      "crm",
      "reports",
    ],
    manage: [],
  },
};

export function canView(role: AppRole, cap: Cap): boolean {
  return RBAC[role]?.view.includes(cap) ?? false;
}

export function canManage(role: AppRole, cap: Cap): boolean {
  return RBAC[role]?.manage.includes(cap) ?? false;
}
