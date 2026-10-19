import "@vly-ai/integrations";
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireOrg } from "@/components/RequireOrg";
import { AppShell } from "@/components/AppShell";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, lazy, Suspense, useEffect } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import "./index.css";
import { OrgProvider } from "@/lib/org-context";

const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Onboarding = lazy(() => import("./pages/Onboarding.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Agenda = lazy(() => import("./pages/Agenda.tsx"));
const Clientes = lazy(() => import("./pages/Clientes.tsx"));
const ClienteDetalhe = lazy(() => import("./pages/ClienteDetalhe.tsx"));
const Equipe = lazy(() => import("./pages/Equipe.tsx"));
const BarbeiroDetalhe = lazy(() => import("./pages/BarbeiroDetalhe.tsx"));
const Servicos = lazy(() => import("./pages/Servicos.tsx"));
const Produtos = lazy(() => import("./pages/Produtos.tsx"));
const Pdv = lazy(() => import("./pages/Pdv.tsx"));
const Caixa = lazy(() => import("./pages/Caixa.tsx"));
const Despesas = lazy(() => import("./pages/Despesas.tsx"));
const Comissoes = lazy(() => import("./pages/Comissoes.tsx"));
const Relatorios = lazy(() => import("./pages/Relatorios.tsx"));
const Configuracoes = lazy(() => import("./pages/Configuracoes.tsx"));
const Legal = lazy(() => import("./pages/Legal.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        Carregando…
      </div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in the browser runtime). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/**
 * Guardião genérico para que erros de runtime nunca gerem tela em branco na preview.
 * Mostra stack trace só em dev; em produção exibe mensagem genérica e orienta a recarregar.
 */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: import.meta.env.DEV ? error.stack || "" : "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[Preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Ocorreu um erro inesperado</p>
            <p className="mt-2 text-xs break-words text-muted-foreground">{this.state.message}</p>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">
              Recarregue a página para continuar. Se o problema persistir, fale com o suporte
              informando o horário do erro.
            </p>
            {this.state.stack && (
              <pre className="mt-3 max-h-40 overflow-auto rounded border border-border/60 p-2 text-left text-[10px] leading-4 text-muted-foreground/80">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

function VlyRouteBridge() {
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change" },
      "*",
    );
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

/** Rota autenticada: exige sessão + unidade ativa e monta o shell do app. */
function Protected({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <OrgProvider>
        <RequireOrg>
          <AppShell>{children}</AppShell>
        </RequireOrg>
      </OrgProvider>
    </RequireAuth>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <VlyRouteBridge />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/app" />}
              />
              <Route
                path="/onboarding"
                element={<Protected><Onboarding /></Protected>}
              />

              <Route path="/dashboard" element={<Navigate to="/app" replace />} />
              <Route path="/app" element={<Protected><Dashboard /></Protected>} />
              <Route path="/app/agenda" element={<Protected><Agenda /></Protected>} />
              <Route path="/app/pdv" element={<Protected><Pdv /></Protected>} />
              <Route path="/app/caixa" element={<Protected><Caixa /></Protected>} />
              <Route path="/app/clientes" element={<Protected><Clientes /></Protected>} />
              <Route path="/app/clientes/:id" element={<Protected><ClienteDetalhe /></Protected>} />
              <Route path="/app/relacionamento" element={<Navigate to="/app/clientes" replace />} />
              <Route path="/app/fidelidade" element={<Navigate to="/app" replace />} />
              <Route path="/app/equipe" element={<Protected><Equipe /></Protected>} />
              <Route path="/app/barbeiros/:id" element={<Protected><BarbeiroDetalhe /></Protected>} />
              <Route path="/app/servicos" element={<Protected><Servicos /></Protected>} />
              <Route path="/app/produtos" element={<Protected><Produtos /></Protected>} />
              <Route path="/app/estoque" element={<Navigate to="/app/produtos" replace />} />
              <Route path="/app/despesas" element={<Protected><Despesas /></Protected>} />
              <Route path="/app/comissoes" element={<Protected><Comissoes /></Protected>} />
              <Route path="/app/relatorios" element={<Protected><Relatorios /></Protected>} />
              <Route path="/app/configuracoes" element={<Protected><Configuracoes /></Protected>} />

              <Route path="/privacidade" element={<Legal />} />
              <Route path="/termos" element={<Legal />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);