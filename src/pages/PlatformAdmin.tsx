import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Building2, CalendarDays, ChevronLeft, ClipboardList, LockKeyhole,
  LogOut, Search, ShieldCheck, Store, Users, Eye, Pencil, Save, Tag,
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
  const [selectedOrg, setSelectedOrg] = useState<Id<"organizations"> | null>(null);
  const [editingPlan, setEditingPlan] = useState<Id<"platformPlanDrafts"> | null>(null);
  const [planName, setPlanName] = useState("");
  const [planDescription, setPlanDescription] = useState("");
  const [planPrice, setPlanPrice] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [planMessage, setPlanMessage] = useState("");
  const organizationDetails = useQuery(
    api.platformAdmin.organizationDetails,
    allowed === true && selectedOrg ? { organizationId: selectedOrg } : "skip",
  );
  const drafts = useQuery(api.platformAdmin.planDrafts, allowed === true ? {} : "skip");
  const savePlanDraft = useMutation(api.platformAdmin.savePlanDraft);

  function resetPlanForm() {
    setEditingPlan(null);
    setPlanName("");
    setPlanDescription("");
    setPlanPrice("");
    setPlanMessage("");
  }

  async function submitPlan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (savingPlan) return;
    const price = planPrice.trim().replace(",", ".");
    if (!/^\\d{1,7}(\\.\\d{1,2})?$/.test(price)) {
      setPlanMessage("Informe a mensalidade em reais, com até duas casas decimais.");
      return;
    }
    const [reais, centavos = ""] = price.split(".");
    const priceCents = Number(reais) * 100 + Number(centavos.padEnd(2, "0"));
    setSavingPlan(true);
    setPlanMessage("");
    try {
      await savePlanDraft({
        id: editingPlan ?? undefined,
        name: planName,
        description: planDescription,
        priceCents,
      });
      resetPlanForm();
      setPlanMessage("Rascunho salvo. Nenhuma assinatura ou cobrança foi alterada.");
    } catch (err) {
      setPlanMessage(err instanceof Error ? err.message : "Não foi possível salvar o rascunho.");
    } finally {
      setSavingPlan(false);
    }
  }

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
                    <Button type="button" size="sm" variant="outline" onClick={() => setSelectedOrg(o.id)}>
                      <Eye className="size-3.5" /> Detalhes
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass rounded-2xl p-5" aria-label="Detalhes da barbearia">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Detalhes da barbearia</h2>
              <p className="mt-1 text-xs text-muted-foreground">Dados operacionais, sem acesso a clientes ou funcionários.</p>
            </div>
            {selectedOrg && <Button type="button" variant="outline" size="sm" onClick={() => setSelectedOrg(null)}>Fechar</Button>}
          </div>
          {!selectedOrg ? (
            <p className="mt-4 text-sm text-muted-foreground">Escolha “Detalhes” em uma unidade da lista acima.</p>
          ) : organizationDetails === undefined ? (
            <p className="mt-4 text-sm text-muted-foreground">Carregando informações…</p>
          ) : (
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Barbearia", organizationDetails.name],
                ["Situação", STATUS[organizationDetails.status] ?? organizationDetails.status],
                ["Plano operacional", organizationDetails.plan ?? "Não configurado"],
                ["Origem do acesso", organizationDetails.source ?? "Não configurada"],
                ["Cadastro", fmt(organizationDetails.createdAt)],
                ["Última atualização", fmt(organizationDetails.updatedAt)],
                ["Fim do teste", fmt(organizationDetails.trialEndsAt)],
                ["Fim do período", fmt(organizationDetails.periodEndsAt)],
                ["Fim da tolerância", fmt(organizationDetails.graceEndsAt)],
                ["Demonstração", organizationDetails.isDemo ? "Sim" : "Não"],
                ["Onboarding", organizationDetails.onboardingStep === null ? "Concluído" : `Etapa ${organizationDetails.onboardingStep}`],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="glass rounded-2xl p-5" aria-label="Rascunhos de planos comerciais">
          <div className="mb-5">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary"><Tag className="size-4" /> Catálogo comercial</p>
            <h2 className="mt-2 text-lg font-semibold">Planos em rascunho</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Valores para planejamento. Não vinculam barbearias, não geram cobranças e não alteram permissões.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <form onSubmit={submitPlan} className="space-y-3">
              <h3 className="text-sm font-semibold">{editingPlan ? "Editar rascunho" : "Novo rascunho"}</h3>
              <label className="block text-sm" htmlFor="draft-name">Nome do plano</label>
              <Input id="draft-name" required maxLength={100} value={planName} onChange={e => setPlanName(e.target.value)} placeholder="Ex.: Essencial" />
              <label className="block text-sm" htmlFor="draft-description">Descrição</label>
              <textarea id="draft-description" maxLength={1000} value={planDescription} onChange={e => setPlanDescription(e.target.value)}
                className="glass-input min-h-24 w-full rounded-lg border p-3 text-sm" placeholder="O que este plano poderá oferecer" />
              <label className="block text-sm" htmlFor="draft-price">Mensalidade prevista (R$)</label>
              <Input id="draft-price" required inputMode="decimal" value={planPrice} onChange={e => setPlanPrice(e.target.value)} placeholder="99,90" />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={savingPlan}><Save className="size-4" /> {savingPlan ? "Salvando…" : "Salvar rascunho"}</Button>
                <Button type="button" variant="outline" onClick={resetPlanForm}>Limpar</Button>
              </div>
              {planMessage && <p role="status" className="text-sm text-muted-foreground">{planMessage}</p>}
            </form>
            <div>
              <h3 className="mb-3 text-sm font-semibold">Rascunhos salvos</h3>
              {drafts === undefined ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : drafts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum plano cadastrado ainda.</p>
              ) : (
                <ul className="max-h-96 space-y-2 overflow-y-auto">
                  {drafts.map(draft => (
                    <li key={draft._id} className="rounded-xl border border-border/60 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{draft.name} <Badge variant="outline">Rascunho</Badge></p>
                          <p className="mt-1 text-sm font-semibold">
                            {(draft.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês
                          </p>
                          {draft.description && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{draft.description}</p>}
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={() => {
                          setEditingPlan(draft._id);
                          setPlanName(draft.name);
                          setPlanDescription(draft.description);
                          setPlanPrice((draft.priceCents / 100).toFixed(2).replace(".", ","));
                          setPlanMessage("");
                        }}><Pencil className="size-3.5" /> Editar</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <p className="pb-4 text-xs leading-relaxed text-muted-foreground">
          Painel técnico de homologação. Status de plano são registros do backend;
          não representam pagamentos confirmados, receita da plataforma ou assinaturas comerciais.
          Somente rascunhos comerciais podem ser editados. Não há suporte remoto, alteração de acesso ou cobrança nesta versão.
        </p>
      </div>
    </main>
  );
}
