import { Loading } from "@/components/glass";
import { useOrg } from "@/lib/org-context";
import { Navigate } from "react-router";
import type { ReactNode } from "react";

/**
 * Garante que exista uma unidade ativa antes de renderizar o app.
 * Sem unidade, o usuário cai no onboarding (criar / entrar com convite / demo).
 */
export function RequireOrg({ children }: { children: ReactNode }) {
  const { loading, orgId } = useOrg();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loading label="Carregando sua unidade" />
      </div>
    );
  }
  if (!orgId) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}