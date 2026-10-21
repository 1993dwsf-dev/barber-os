import { describe, expect, test } from "bun:test";
import { APP_ROLES, RBAC, canManage, canView } from "../src/lib/rbac";

/**
 * A matriz de permissões é a base do isolamento por papel. Estes testes travam
 * as garantias que o backend assume ao chamar `requireManage`.
 */

describe("RBAC", () => {
  test("apenas owner/admin administram configurações e demo", () => {
    expect(canManage("owner", "settings")).toBe(true);
    expect(canManage("admin", "settings")).toBe(true);
    expect(canManage("manager", "settings")).toBe(false);
    expect(canManage("barber", "settings")).toBe(false);
    expect(canManage("cashier", "settings")).toBe(false);
    expect(canManage("viewer", "settings")).toBe(false);

    for (const role of ["manager", "barber", "cashier", "viewer"] as const) {
      expect(canManage(role, "demo")).toBe(false);
    }
  });

  test("barbeiro não mexe em dinheiro", () => {
    expect(canManage("barber", "cash")).toBe(false);
    expect(canManage("barber", "expenses")).toBe(false);
    expect(canManage("barber", "commissions")).toBe(false);
    expect(canManage("barber", "agenda")).toBe(true);
    expect(canManage("barber", "clients")).toBe(true);
  });

  test("visitante nunca escreve", () => {
    expect(RBAC.viewer.manage).toHaveLength(0);
    expect(canView("viewer", "clients")).toBe(true);
    expect(canManage("viewer", "clients")).toBe(false);
  });

  test("gerente não altera equipe", () => {
    expect(canView("manager", "team")).toBe(true);
    expect(canManage("manager", "team")).toBe(false);
    expect(canManage("owner", "team")).toBe(true);
  });
  test("qualquer papel que pode gerenciar um módulo também pode visualizá-lo", () => {
    for (const role of APP_ROLES) {
      for (const capability of RBAC[role].manage) {
        expect(canView(role, capability)).toBe(true);
      }
    }
    expect(canView("barber", "pos")).toBe(true);
    expect(canView("cashier", "pos")).toBe(true);
    expect(canView("cashier", "cash")).toBe(true);
    expect(canView("cashier", "crm")).toBe(true);
  });
});
