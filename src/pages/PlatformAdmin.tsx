import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Building2, CalendarDays, ChevronLeft, ClipboardList, LockKeyhole,
  LogOut, Search, ShieldCheck, Store, Users,
} from "lucide-react";

const STATUS: Record<string, string> = {
  unconfigured: "Sem plano configurado",
  trialing: "Teste",
  active: "Ativo (cadastro)",
  past_due: "Em atraso",
  canceled: "Cancelado",
  suspended: "Suspenso",
};

const fmt = (ts: number | null | undefined) =>
  ts ? new Date(ts).toLocaleDateString("pt-BR") : "—";

export default function PlatformAdmin() {
  const allowed = useQuery(api.platformAdmin.access);
  const overview = useQuery(api.platformAdmin.overview, allowed === true ? {} : "skip");
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const orgs = overview?.organizations ?? [];
    return orgs.filter(o => {
      if (filter === "demo" && !o.isDemo) return false;
      if (filter === "test" && o.status !== "trialing") return false;
      if (filter === "unconfigured" && o.status !== "unconfigured") return false;
      return o.name.toLocaleLowerCase("pt-BR").includes(term.trim().toLocaleLowerCase("pt-BR"));
    });
  }, [overview, term, filter]);

  if (allowed === undefined) {
    return <main className="mx-auto max-w-5xl p-8 text-sm text-muted-foreground">Verificando acesso administrativo…</main>;
  }

  if (!allowed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5">
        <div className="glass max-w-md rounded-3xl p-8 text-center">
          <LockKeyhole className="mx-auto mb-4 size-10 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Administração restrita</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Este painel é exclusivo da conta verificada e autorizada no backend.
            Ser proprietário ou administrador de uma barbearia não concede acesso.
          </p>
          <Button asChild variant="outline" className="mt-5"><Link to="/app">Voltar ao Barber OS</Link></Button>
        </div>
      </main>
    );
  }

  if (!overview) {
    return <main className="mx-auto max-w-5xl p-8 text-sm text-muted-foreground">Carregando a visão da plataforma…</main>;
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-7 px-4 py-7 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
              <ShieldCheck className="size-4" /> Área interna · somente leitura
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Barber OS Admin</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Acompanhe as unidades cadastradas sem acessar dados pessoais dos clientes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link to="/app"><ChevronLeft className="size-4" /> Voltar ao sistema</Link></Button>
            <Button variant="outline" onClick={() => {
              navigate("/");
              void signOut().catch(() => {});
            }}><LogOut className="size-4" /> Sair</Button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores de unidades">
          {[
            { label: "Unidades exibidas", value: overview.summary.organizationsShown, icon: Building2 },
            { label: "Demonstração", value: overview.summary.demoShown, icon: Store },
            { label: "Em teste", value: overview.summary.trialsShown, icon: CalendarDays },
            { label: "Sem plano", value: overview.summary.unitsWithoutEntitlement, icon: ClipboardList },
          ].map(item => (
            <div key={item.label} className="glass rounded-2xl p-5">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <item.icon className="size-4" /> {item.label}
              </div>
              <p className="mt-3 text-3xl font-semibold tabular-nums">{item.value}</p>
            </div>
          ))}
        </section>

        <section className="glass rounded-2xl p-5" aria-label="Barbearias cadastradas">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Unidades cadastradas</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Listagem restrita às {overview.maxRows} unidades mais recentes, por desempenho e privacidade.
              </p>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5" /> Sem dados de clientes ou funcionários
            </span>
          </div>

          {overview.hasMore && (
            <p role="status" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">
              Existem outras unidades além das {overview.maxRows} exibidas. Os indicadores acima não representam o total da plataforma.
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Pesquisar unidade"
                value={term}
                onChange={e => setTerm(e.target.value)}
                placeholder="Filtrar pelo nome nesta página"
                className="glass-input pl-9"
              />
            </div>
            <select
              aria-label="Filtrar situação"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="glass-input h-10 rounded-lg border px-3 text-sm"
            >
              <option value="all">Todas as situações</option>
              <option value="demo">Demonstração</option>
              <option value="test">Em teste</option>
              <option value="unconfigured">Sem plano</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma unidade encontrada nesta página.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border/60">
              {filtered.map(o => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 py-3.5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Store className="size-5 text-primary" />
                  </div>
                  <div className="min-w-44 flex-1">
                    <p className="font-medium">{o.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Cadastrada em {fmt(o.createdAt)}
                      {o.isDemo ? " · Ambiente demo" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{STATUS[o.status] ?? o.status}</Badge>
                    {o.plan && <Badge variant="outline">Plano: {o.plan}</Badge>}
                    {o.status === "trialing" && <span className="text-xs text-muted-foreground">Até {fmt(o.trialEndsAt)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="pb-4 text-xs leading-relaxed text-muted-foreground">
          Painel técnico de homologação. Status de plano são registros do backend;
          não representam pagamentos confirmados, receita da plataforma ou assinaturas comerciais.
          Nenhuma ação de edição, suporte remoto ou cobrança está habilitada nesta versão.
        </p>
      </div>
    </main>
  );
}
