import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { canManage, canView } from "@/lib/rbac";
import type { AppRole, Cap } from "@/lib/rbac";

const STORAGE_KEY = "barberflow:org";

/** localStorage pode lançar em iframes restritos — nunca deve derrubar o app. */
function readStoredOrg(): string | null {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

function writeStoredOrg(id: string): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignora
  }
}

export type OrgMembership = {
  org: Doc<"organizations">;
  role: AppRole;
  memberId: Id<"organizationMembers">;
};

type OrgContextValue = {
  memberships: OrgMembership[];
  loading: boolean;
  orgId: Id<"organizations"> | null;
  role: AppRole | null;
  org: Doc<"organizations"> | null;
  select: (id: string) => void;
  /** true quando o usuário ainda não escolheu (ou não tem) uma unidade */
  needsSetup: boolean;
  can: (cap: Cap) => boolean;
  canEdit: (cap: Cap) => boolean;
  refreshKey: number;
  refresh: () => void;
};

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
  const memberships = useQuery(api.orgs.myOrganizations);
  const [selected, setSelected] = useState<Id<"organizations"> | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const list = useMemo<OrgMembership[]>(
    () => (memberships ?? []).filter((m) => Boolean(m?.org)),
    [memberships],
  );

  // A unidade ativa é derivada de forma síncrona, já no mesmo render em que as
  // memberships chegam. Antes isso era feito num useEffect, então o primeiro
  // render já "pronto" tinha orgId nulo e o RequireOrg jogava o usuário no
  // onboarding toda vez que o provider montava (login, criar barbearia, etc.).
  const orgId = useMemo<Id<"organizations"> | null>(() => {
    if (!memberships || list.length === 0) return null;
    if (selected && list.some((m) => m.org._id === selected)) return selected;
    const stored = readStoredOrg();
    const match = stored ? list.find((m) => m.org._id === stored) : undefined;
    return (match ?? list[0]).org._id;
  }, [memberships, list, selected]);

  const select = useCallback((id: string) => {
    setSelected(id as Id<"organizations">);
    writeStoredOrg(id);
  }, []);

  const active = list.find((m) => m.org._id === orgId) ?? null;
  const role = (active?.role as AppRole | undefined) ?? null;

  const value: OrgContextValue = {
    memberships: list,
    loading: memberships === undefined,
    orgId,
    role,
    org: active?.org ?? null,
    select,
    needsSetup: memberships !== undefined && list.length === 0,
    can: (cap) => (role ? canView(role, cap) : false),
    canEdit: (cap) => (role ? canManage(role, cap) : false),
    refreshKey,
    refresh: () => setRefreshKey((k) => k + 1),
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg precisa estar dentro de <OrgProvider>");
  return ctx;
}