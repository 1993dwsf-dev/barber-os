import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  buildAdminUnitsCsv, countTrialWindows, trialWindow,
} from "@/lib/platform-admin-report";
import {
  groupSandboxPaymentEvents, SANDBOX_EVENT_LABELS,
} from "@/lib/asaas-payment-groups";
import { sandboxLinksCsv } from "@/lib/asaas-link-csv";
import {
  Building2, CalendarDays, ChevronLeft, ClipboardList, LockKeyhole,
  LogOut, Search, ShieldCheck, Store, Users, Eye, Pencil, Save, Tag, PauseCircle,
  Download, AlertTriangle, Clock3,
} from "lucide-react";

const TRIAL_ACTION_LABELS: Record<string, string> = {
  pilot_trial_start: "Teste iniciado",
  pilot_trial_extend: "Teste prorrogado",
  pilot_trial_suspend: "Teste suspenso",
  pilot_trial_resume: "Teste reativado",
};

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
  const [trialAction, setTrialAction] = useState<"" | "start" | "extend" | "suspend" | "resume">("");
  const [trialDays, setTrialDays] = useState("7");
  const [trialReason, setTrialReason] = useState("");
  const [trialConfirmName, setTrialConfirmName] = useState("");
  const [trialSaving, setTrialSaving] = useState(false);
  const [trialMessage, setTrialMessage] = useState("");

  const organizationDetails = useQuery(
    api.platformAdmin.organizationDetails,
    allowed === true && selectedOrg ? { organizationId: selectedOrg } : "skip",
  );
  const drafts = useQuery(api.platformAdmin.planDrafts, allowed === true ? {} : "skip");
  const billingInbox = useQuery(api.platformAdmin.billingInbox, allowed === true ? {} : "skip");
  const paymentGroups = useMemo(
    () => groupSandboxPaymentEvents(billingInbox?.items ?? []),
    [billingInbox],
  );
  const checkSandboxPayment = useAction(api.billingSandbox.checkPaymentStatus);
  const [checkingPayment, setCheckingPayment] = useState<string | null>(null);
  const [paymentStatusResults, setPaymentStatusResults] = useState<
    Record<string, { status: string; checkedAt: number }>
  >({});
  const [paymentCheckError, setPaymentCheckError] = useState("");
  // Pedidos de cobrança originados no Barber OS, somente Asaas Sandbox.
  const sandboxOrders = useQuery(api.sandboxOrders.orders, allowed === true ? {} : "skip");
  const prepareSandboxOrder = useMutation(api.sandboxOrders.prepareOrder);
  const voidSandboxDraft = useMutation(api.sandboxOrders.voidDraft);
  const sendSandboxOrder = useAction(api.sandboxOrders.sendOrder);
  const recoverSandboxOrder = useAction(api.sandboxOrders.recoverOrder);
  const [orderUnitId, setOrderUnitId] = useState("");
  const [orderPlanId, setOrderPlanId] = useState("");
  const [orderCustomerId, setOrderCustomerId] = useState("");
  const [orderBillingType, setOrderBillingType] = useState<"PIX" | "BOLETO">("PIX");
  const [orderDueDate, setOrderDueDate] = useState("");
  const [orderConfirmName, setOrderConfirmName] = useState("");
  const [orderReason, setOrderReason] = useState("");
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderMessage, setOrderMessage] = useState("");
  const [orderActionId, setOrderActionId] = useState<string | null>(null);
  const [orderVoidTarget, setOrderVoidTarget] = useState<string | null>(null);
  const [orderVoidName, setOrderVoidName] = useState("");
  const [orderVoidReason, setOrderVoidReason] = useState("");

  const selectedOrderUnit = overview?.organizations.find(o => o.id === orderUnitId);
  const selectedOrderPlan = drafts?.find(p => p._id === orderPlanId);

  async function submitOrderDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sandboxOrders?.enabled || orderBusy ||
        !selectedOrderUnit || selectedOrderUnit.isDemo || !selectedOrderPlan ||
        orderConfirmName.trim() !== selectedOrderUnit.name ||
        !orderCustomerId.trim() || !orderDueDate ||
        orderReason.trim().length < 12 || orderReason.trim().length > 350) return;
    setOrderBusy(true);
    setOrderMessage("");
    try {
      await prepareSandboxOrder({
        organizationId: selectedOrderUnit.id,
        planDraftId: selectedOrderPlan._id,
        expectedPlanUpdatedAt: selectedOrderPlan.updatedAt,
        customerId: orderCustomerId.trim(),
        billingType: orderBillingType,
        dueDate: orderDueDate,
        confirmedOrganizationName: orderConfirmName,
        reason: orderReason,
      });
      setOrderMessage("Pedido de homologação preparado. Nenhuma cobrança foi enviada ainda.");
      setOrderCustomerId("");
      setOrderConfirmName("");
      setOrderReason("");
      setOrderDueDate("");
    } catch (err) {
      setOrderMessage(err instanceof Error ? err.message : "Não foi possível preparar o pedido.");
    } finally {
      setOrderBusy(false);
    }
  }

  async function executeSandboxOrder(orderId: Id<"sandboxBillingOrders">, mode: "send" | "recover") {
    if (!sandboxOrders?.enabled || orderActionId) return;
    if (mode === "send" && !window.confirm(
      "Você autoriza emitir UMA cobrança fictícia somente no Asaas Sandbox? " +
      "Em caso de falha de rede, o sistema NÃO fará uma segunda emissão automática.",
    )) return;
    setOrderActionId(orderId);
    setOrderMessage("");
    try {
      const result = mode === "send"
        ? await sendSandboxOrder({ orderId })
        : await recoverSandboxOrder({ orderId });
      setOrderMessage(mode === "send"
        ? `Cobrança fictícia emitida: ${result.paymentId}. Nenhuma assinatura ativada.`
        : result.paymentId
          ? `Pedido recuperado por consulta: ${result.paymentId}. Nenhuma assinatura ativada.`
          : "Nenhuma cobrança encontrada pela referência. Pedido permanece incerto, sem novo envio.");
    } catch (err) {
      setOrderMessage(err instanceof Error ? err.message : "Operação Sandbox não concluída.");
    } finally {
      setOrderActionId(null);
    }
  }

  async function cancelSandboxDraft(order: NonNullable<typeof sandboxOrders>["items"][number]) {
    if (!sandboxOrders?.enabled || orderBusy ||
        orderVoidName.trim() !== order.organizationName ||
        orderVoidReason.trim().length < 12 || orderVoidReason.trim().length > 350) return;
    setOrderBusy(true);
    setOrderMessage("");
    try {
      await voidSandboxDraft({
        orderId: order.id, confirmedOrganizationName: orderVoidName,
        reason: orderVoidReason,
      });
      setOrderMessage("Rascunho invalidado antes de enviar cobrança.");
      setOrderVoidTarget(null);
      setOrderVoidName("");
      setOrderVoidReason("");
    } catch (err) {
      setOrderMessage(err instanceof Error ? err.message : "Não foi possível invalidar o rascunho.");
    } finally {
      setOrderBusy(false);
    }
  }

  const billingLinks = useQuery(api.platformBilling.links, allowed === true ? {} : "skip");
  const createBillingLink = useMutation(api.platformBilling.createLink);
  const voidBillingLink = useMutation(api.platformBilling.voidLink);
  const reviewBillingLink = useAction(api.billingReconciliation.reviewLink);
  const [linkUnitId, setLinkUnitId] = useState("");
  const [linkPlanId, setLinkPlanId] = useState("");
  const [linkEventId, setLinkEventId] = useState("");
  const [linkName, setLinkName] = useState("");
  const [linkReason, setLinkReason] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkMessage, setLinkMessage] = useState("");
  const [voidTargetId, setVoidTargetId] = useState<string | null>(null);
  const [voidName, setVoidName] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [voidSaving, setVoidSaving] = useState(false);
  const [reviewingLinkId, setReviewingLinkId] = useState<string | null>(null);
  const [linkReviews, setLinkReviews] = useState<Record<string, {
    status: string;
    amountMatches: boolean;
    paidStatus: boolean;
    cashRecordedOutsideAsaas: boolean;
    receivedAmountCents: number;
    expectedAmountCents: number;
    checkedAt: number;
  }>>({});
  const [linkReviewError, setLinkReviewError] = useState("");

  const selectedLinkUnit = overview?.organizations.find(org => org.id === linkUnitId);
  const selectedLinkPlan = drafts?.find(plan => plan._id === linkPlanId);
  const selectedLinkEvent = paymentGroups.find(group => group.latest.id === linkEventId);
  const linkedPayments = new Set(billingLinks?.items.map(item => item.paymentId) ?? []);
  const availablePayments = paymentGroups.filter(group =>
    !linkedPayments.has(group.paymentId) && !group.latest.subscriptionId);
  const fmtMoney = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  async function submitBillingLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!billingLinks?.enabled || !selectedLinkUnit || selectedLinkUnit.isDemo ||
        !selectedLinkPlan || !selectedLinkEvent || linkedPayments.has(selectedLinkEvent.paymentId) ||
        linkName.trim() !== selectedLinkUnit.name || linkReason.trim().length < 12 ||
        linkReason.trim().length > 350 || linkSaving) return;
    setLinkSaving(true);
    setLinkMessage("");
    try {
      await createBillingLink({
        organizationId: selectedLinkUnit.id,
        planDraftId: selectedLinkPlan._id,
        sourceInboxId: selectedLinkEvent.latest.id,
        expectedPlanUpdatedAt: selectedLinkPlan.updatedAt,
        confirmedOrganizationName: linkName,
        reason: linkReason,
      });
      setLinkMessage("Vínculo de homologação registrado. Nenhum acesso ou pagamento foi alterado.");
      setLinkEventId("");
      setLinkName("");
      setLinkReason("");
    } catch (error) {
      setLinkMessage(error instanceof Error ? error.message : "Não foi possível criar o vínculo.");
    } finally {
      setLinkSaving(false);
    }
  }

  async function submitVoidLink(link: NonNullable<typeof billingLinks>["items"][number]) {
    if (!billingLinks?.enabled || voidSaving || voidName.trim() !== link.organizationName ||
        voidReason.trim().length < 12) return;
    setVoidSaving(true);
    setLinkMessage("");
    try {
      await voidBillingLink({
        linkId: link.id, expectedUpdatedAt: link.updatedAt,
        confirmedOrganizationName: voidName, reason: voidReason,
      });
      setVoidTargetId(null);
      setVoidName("");
      setVoidReason("");
      setLinkMessage("Vínculo invalidado sem excluir a auditoria. A cobrança não poderá ser reutilizada.");
    } catch (error) {
      setLinkMessage(error instanceof Error ? error.message : "Erro ao invalidar vínculo.");
    } finally {
      setVoidSaving(false);
    }
  }

  function exportSandboxLinksCsv() {
    if (!billingLinks?.items.length) return;
    const csv = sandboxLinksCsv(billingLinks.items);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "barber-os-vinculos-sandbox.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function reviewAssociation(linkId: Id<"sandboxBillingLinks">) {
    if (reviewingLinkId || !billingInbox?.lookupEnabled) return;
    setReviewingLinkId(linkId);
    setLinkReviewError("");
    try {
      const result = await reviewBillingLink({ linkId });
      setLinkReviews(previous => ({
        ...previous,
        [linkId]: {
          status: result.status, amountMatches: result.amountMatches,
          paidStatus: result.paidStatus,
          cashRecordedOutsideAsaas: result.cashRecordedOutsideAsaas,
          receivedAmountCents: result.receivedAmountCents,
          expectedAmountCents: result.expectedAmountCents,
          checkedAt: result.checkedAt,
        },
      }));
    } catch {
      setLinkReviewError("Não foi possível comparar a cobrança com o plano na API Sandbox.");
    } finally {
      setReviewingLinkId(null);
    }
  }


  async function verifySandboxStatus(inboxId: Id<"billingWebhookInbox">) {
    if (checkingPayment || !billingInbox?.lookupEnabled) return;
    setCheckingPayment(inboxId);
    setPaymentCheckError("");
    try {
      const result = await checkSandboxPayment({ inboxId });
      setPaymentStatusResults(previous => ({
        ...previous, [result.paymentId]: { status: result.status, checkedAt: result.checkedAt },
      }));
    } catch {
      setPaymentCheckError("Não foi possível consultar o Asaas Sandbox. Verifique as configurações privadas do backend.");
    } finally {
      setCheckingPayment(null);
    }
  }
  const savePlanDraft = useMutation(api.platformAdmin.savePlanDraft);
  const managePilotTrial = useMutation(api.platformAdmin.managePilotTrial);
  const trialHistory = useQuery(
    api.platformAdmin.pilotTrialHistory,
    allowed === true && selectedOrg ? { organizationId: selectedOrg } : "skip",
  );
  const trialReasonLength = trialReason.trim().length;
  const trialDaysNumber = Number(trialDays);
  const trialDaysValid = trialAction === "suspend" ||
    (trialDays.trim().length > 0 && Number.isInteger(trialDaysNumber) &&
      trialDaysNumber >= 1 && trialDaysNumber <= 30);
  const trialNameConfirmed = trialConfirmName.trim() === organizationDetails?.name;
  const trialFormHint = !trialAction
    ? "Selecione uma ação para continuar."
    : !trialDaysValid
      ? "Informe um prazo de 1 a 30 dias, sem frações."
      : trialReasonLength < 12
        ? `A justificativa precisa de mais ${12 - trialReasonLength} caracteres.`
        : trialReasonLength > 350
          ? "A justificativa não pode ultrapassar 350 caracteres."
          : !trialNameConfirmed
            ? "Digite o nome exato da barbearia para confirmar."
            : "Pronto para confirmar. Essa ação atualizará o registro do teste.";

  const trialOptions = organizationDetails && !organizationDetails.isDemo &&
    organizationDetails.source !== "billing"
    ? organizationDetails.status === "unconfigured"
      ? [{ value: "start", label: "Iniciar teste" }]
      : organizationDetails.status === "trialing"
        ? [{ value: "extend", label: "Prorrogar teste" }, { value: "suspend", label: "Suspender teste" }]
        : organizationDetails.status === "suspended" && organizationDetails.source === "pilot" &&
            organizationDetails.trialEndsAt !== null
          ? [{ value: "resume", label: "Reativar como teste" }]
          : []
    : [];

  function selectOrganization(id: Id<"organizations">) {
    setSelectedOrg(id);
    setTrialAction("");
    setTrialDays("7");
    setTrialReason("");
    setTrialConfirmName("");
    setTrialMessage("");
  }

  async function submitTrial(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!organizationDetails || !trialAction || trialSaving || !selectedOrg ||
        !trialOptions.some(o => o.value === trialAction) || !trialDaysValid ||
        trialReasonLength < 12 || trialReasonLength > 350 || !trialNameConfirmed) return;
    setTrialSaving(true);
    setTrialMessage("");
    try {
      await managePilotTrial({
        organizationId: selectedOrg,
        operation: trialAction,
        confirmedName: trialConfirmName,
        reason: trialReason,
        days: trialAction === "suspend" ? undefined : Number(trialDays),
        expectedEntitlementId: organizationDetails.entitlementId ?? undefined,
        expectedUpdatedAt: organizationDetails.entitlementUpdatedAt ?? undefined,
      });
      setTrialMessage("Operação registrada no Convex com auditoria. Confira o novo status.");
      setTrialAction("");
      setTrialConfirmName("");
      setTrialReason("");
    } catch (err) {
      setTrialMessage(err instanceof Error ? err.message : "Não foi possível atualizar o teste.");
    } finally {
      setTrialSaving(false);
    }
  }


  function resetPlanForm() {
    setEditingPlan(null);
    setPlanName("");
    setPlanDescription("");
    setPlanPrice("");
    setPlanMessage("");
  }

  async function submitPlan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (savingPlan) return;
    const price = planPrice.trim().replace(",", ".");
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(price)) {
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

  const now = overview?.generatedAt ?? 0;
  const trialCounts = useMemo(() =>
    countTrialWindows(overview?.organizations ?? [], now), [overview, now]);

  const filtered = useMemo(() => {
    const orgs = overview?.organizations ?? [];
    return orgs.filter(o => {
      if (filter === "demo" && !o.isDemo) return false;
      if (filter === "test" && o.status !== "trialing") return false;
      if (filter === "unconfigured" && o.status !== "unconfigured") return false;
      if (filter === "due_soon" && trialWindow(o, now) !== "due_soon") return false;
      if (filter === "expired" && trialWindow(o, now) !== "expired") return false;
      if (filter === "missing_deadline" && trialWindow(o, now) !== "missing_deadline") return false;
      return o.name.toLocaleLowerCase("pt-BR").includes(term.trim().toLocaleLowerCase("pt-BR"));
    });
  }, [overview, now, term, filter]);

  function exportFilteredCsv() {
    if (!overview || !filtered.length) return;
    const csv = buildAdminUnitsCsv(filtered, now);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `barber-os-admin-unidades-${new Date(now).toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

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
              <ShieldCheck className="size-4" /> Área interna · gestão restrita
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

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Indicadores de unidades">
          {[
            { label: "Unidades exibidas", value: overview.summary.organizationsShown, icon: Building2 },
            { label: "Demonstração", value: overview.summary.demoShown, icon: Store },
            { label: "Em teste", value: overview.summary.trialsShown, icon: CalendarDays },
            { label: "Sem plano", value: overview.summary.unitsWithoutEntitlement, icon: ClipboardList },
            { label: "Testes vencendo em 7 dias", value: trialCounts.dueSoon, icon: Clock3 },
            { label: "Testes com prazo expirado", value: trialCounts.expired, icon: AlertTriangle },
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
                Listagem e indicadores limitados às {overview.maxRows} unidades mais recentes — não representam o total da plataforma.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="size-3.5" /> Sem dados de clientes ou funcionários
              </span>
              <Button type="button" size="sm" variant="outline"
                disabled={filtered.length === 0} onClick={exportFilteredCsv}>
                <Download className="size-4" /> Exportar CSV ({filtered.length})
              </Button>
            </div>
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
              <option value="due_soon">Teste vence em até 7 dias</option>
              <option value="expired">Prazo de teste expirado</option>
              <option value="missing_deadline">Teste sem vencimento</option>
            </select>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            O CSV inclui somente as {filtered.length} unidades visíveis após os filtros.
            Não inclui clientes, equipe, faturamento ou dados além das {overview.maxRows} unidades autorizadas.
          </p>

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
                    {trialWindow(o, now) === "due_soon" &&
                      <Badge variant="outline">Vence em 7 dias</Badge>}
                    {trialWindow(o, now) === "expired" &&
                      <Badge variant="destructive">Prazo expirado</Badge>}
                    {trialWindow(o, now) === "missing_deadline" &&
                      <Badge variant="outline">Sem data de término</Badge>}
                    <Button type="button" size="sm" variant="outline" onClick={() => selectOrganization(o.id)}>
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
            <>
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

            <div className="mt-6 border-t border-border/60 pt-5">
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <PauseCircle className="size-5" /> Gestão de períodos de teste
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Ações exclusivas de pilotos: iniciar, prorrogar, suspender ou reativar testes.
                Não altera planos pagos, não emite cobranças e não confirma pagamentos.
              </p>
              {!organizationDetails.commercialAccessEnforced && (
                <p role="status" className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                  Atenção: o controle comercial de acesso está desativado neste deployment.
                  Suspender um teste muda o registro, mas não bloqueia as edições da barbearia enquanto esse controle estiver desativado.
                </p>
              )}
              {!organizationDetails.trialManagementEnabled ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Alterações manuais desabilitadas por padrão no servidor. É necessário habilitar
                  BARBER_PLATFORM_TRIAL_ADMIN_WRITES exclusivamente no Convex de homologação.
                </p>
              ) : trialOptions.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Nenhuma ação manual permitida para esta unidade ou situação. Assinaturas originadas de cobrança permanecem protegidas.
                </p>
              ) : (
                <form onSubmit={submitTrial} className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Gerenciar teste">
                  <div>
                    <label htmlFor="trial-action" className="mb-1 block text-sm font-medium">Ação</label>
                    <select id="trial-action" required value={trialAction}
                      onChange={e => { setTrialAction(e.target.value as typeof trialAction); setTrialMessage(""); }}
                      className="glass-input h-10 w-full rounded-lg border px-3 text-sm">
                      <option value="">Selecione uma ação</option>
                      {trialOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  {trialAction !== "suspend" && trialAction !== "" && (
                    <div>
                      <label htmlFor="trial-days" className="mb-1 block text-sm font-medium">
                        {trialAction === "extend" ? "Dias adicionais" : "Duração do teste (dias)"}
                      </label>
                      <Input id="trial-days" required type="number" min={1} max={30} step={1}
                        value={trialDays} onChange={e => setTrialDays(e.target.value)} />
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <label htmlFor="trial-reason" className="mb-1 block text-sm font-medium">Justificativa obrigatória (12 a 350 caracteres)</label>
                    <textarea id="trial-reason" required minLength={12} maxLength={350}
                      value={trialReason} onChange={e => setTrialReason(e.target.value)}
                      aria-describedby="trial-reason-counter"
                      className="glass-input min-h-20 w-full rounded-lg border p-3 text-sm"
                      placeholder="Ex.: Prorrogação autorizada para validar recursos da agenda" />
                    <p id="trial-reason-counter" className="mt-1 text-xs text-muted-foreground">
                      {trialReasonLength}/350 caracteres (mínimo de 12)
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="trial-confirm-name" className="mb-1 block text-sm font-medium">
                      Digite o nome exato da barbearia para confirmar: <strong>{organizationDetails.name}</strong>
                    </label>
                    <Input id="trial-confirm-name" required value={trialConfirmName}
                      onChange={e => setTrialConfirmName(e.target.value)} autoComplete="off" />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                    <Button type="submit" disabled={trialSaving || !trialAction || !trialDaysValid ||
                      !trialNameConfirmed || trialReasonLength < 12 || trialReasonLength > 350}>
                      {trialSaving ? "Confirmando…" : "Confirmar alteração de teste"}
                    </Button>
                    <span className="text-xs text-muted-foreground">Alteração real no registro de acesso; reversível apenas por nova ação autorizada.</span>
                  </div>
                  <p role="status" aria-live="polite" className="text-xs text-muted-foreground sm:col-span-2">
                    {trialSaving ? "Registrando alteração..." : trialFormHint}
                  </p>
                </form>
              )}
              {trialMessage && <p role="status" className="mt-3 text-sm text-muted-foreground">{trialMessage}</p>}
              <div className="mt-5">
                <h4 className="mb-2 text-sm font-semibold">Histórico de ações administrativas (últimos 20)</h4>
                {trialHistory === undefined ? (
                  <p className="text-sm text-muted-foreground">Carregando histórico…</p>
                ) : trialHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma alteração manual registrada.</p>
                ) : (
                  <ul className="space-y-2">
                    {trialHistory.map(entry => (
                      <li key={entry.id} className="rounded-xl border border-border/60 p-3 text-sm">
                        <p className="font-medium">{TRIAL_ACTION_LABELS[entry.action] ?? entry.action} · {fmt(entry.createdAt)}</p>
                        <p className="text-xs text-muted-foreground">
                          {STATUS[entry.beforeStatus ?? ""] ?? entry.beforeStatus ?? "—"} → {STATUS[entry.afterStatus ?? ""] ?? entry.afterStatus ?? "—"}
                          {" · "}Fim anterior: {fmt(entry.beforeTrialEndsAt)} · Novo fim: {fmt(entry.afterTrialEndsAt)}
                        </p>
                        {entry.reason && <p className="mt-1 whitespace-pre-wrap text-xs">{entry.reason}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            </>
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


        <section className="glass rounded-2xl p-5" aria-label="Eventos de pagamento Sandbox">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Eventos financeiros — ambiente de testes</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Uma linha por cobrança, mostrando a última movimentação. O histórico de notificações
                fica preservado e acessível. Nenhum evento comprova, sozinho, conciliação ou assinatura ativa.
              </p>
            </div>
            <Badge variant="outline">
              {billingInbox?.enabled ? "Recebimento de testes habilitado" : "Recebimento desabilitado"}
            </Badge>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Não há concessão ou suspensão automática de acesso nesta etapa.
            A verificação manual de status consulta a API do provedor, sem liberar a assinatura de nenhuma unidade.
          </p>
          {billingInbox && !billingInbox.lookupEnabled && (
            <div id="asaas-lookup-disabled-help" role="status" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <p className="font-semibold">Consulta de status desabilitada no servidor</p>
              <p className="mt-1">
                Verificação individual das configurações privadas no Convex Development:
              </p>
              <ul className="mt-2 space-y-1" aria-label="Diagnóstico da consulta Asaas">
                {[
                  { label: "Ambiente Sandbox selecionado", ok: billingInbox.lookupChecks.sandboxSelected },
                  { label: "BARBER_ASAAS_LOOKUP_ENABLED=true", ok: billingInbox.lookupChecks.lookupEnabledFlag },
                  { label: "Controle comercial não forçado", ok: billingInbox.lookupChecks.billingSafelyDisabled },
                  { label: "Deployment correto: unique-tortoise-387", ok: billingInbox.lookupChecks.developmentDeployment },
                  { label: "BARBER_ASAAS_API_KEY cadastrada no Convex", ok: billingInbox.lookupChecks.apiKeyConfigured },
                  { label: "Formato da chave válido (mínimo de 20 caracteres, sem espaços)", ok: billingInbox.lookupChecks.apiKeyValidFormat },
                ].map(check => (
                  <li key={check.label} className="flex gap-2">
                    <span aria-hidden="true">{check.ok ? "✓" : "✕"}</span>
                    <span>{check.label}: <strong>{check.ok ? "OK" : "Pendente"}</strong></span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">
                O token de autenticação do webhook não substitui a chave de API.
                Nunca configure esses segredos no navegador, Cloudflare Pages ou repositório.
              </p>
            </div>
          )}
          {!billingInbox ? (
            <p className="mt-4 text-sm text-muted-foreground">Carregando caixa de entrada…</p>
          ) : billingInbox.items.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Nenhuma notificação financeira Sandbox recebida.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-border/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Última movimentação</th>
                    <th className="py-2 pr-3">Pagamento (ID)</th>
                    <th className="py-2 pr-3">Atualizado em</th>
                    <th className="py-2">Verificação no Asaas</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentGroups.map(group => (
                    <tr key={group.paymentId} className="border-b border-border/40">
                      <td className="py-3 pr-3 align-top">
                        <p className="font-medium">
                          {SANDBOX_EVENT_LABELS[group.latest.eventType] ?? group.latest.eventType}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{group.latest.eventType}</p>
                        {group.history.length > 1 && (
                          <details className="mt-2 text-xs">
                            <summary className="cursor-pointer text-primary">
                              Ver histórico ({group.history.length} eventos)
                            </summary>
                            <ol className="mt-2 space-y-2 border-l border-border/60 pl-3">
                              {group.history.map(entry => (
                                <li key={entry.id}>
                                  <span className="font-medium">
                                    {SANDBOX_EVENT_LABELS[entry.eventType] ?? entry.eventType}
                                  </span>
                                  <span className="block text-muted-foreground">
                                    {new Date(entry.receivedAt).toLocaleString("pt-BR")}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          </details>
                        )}
                      </td>
                      <td className="max-w-44 break-all py-3 pr-3 align-top font-mono text-xs">
                        {group.paymentId}
                      </td>
                      <td className="py-3 pr-3 align-top">
                        {new Date(group.latest.receivedAt).toLocaleString("pt-BR")}
                      </td>
                      <td className="py-3 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" size="sm" variant="outline"
                            disabled={!billingInbox.lookupEnabled || checkingPayment !== null}
                            aria-describedby={!billingInbox.lookupEnabled ? "asaas-lookup-disabled-help" : undefined}
                            onClick={() => void verifySandboxStatus(group.latest.id)}>
                            {checkingPayment === group.latest.id ? "Consultando…" : "Consultar status"}
                          </Button>
                          {paymentStatusResults[group.paymentId] ? (
                            <div className="flex flex-col text-xs">
                              <Badge variant="outline">
                                {paymentStatusResults[group.paymentId].status} (Sandbox)
                              </Badge>
                              <span className="mt-1 text-muted-foreground">
                                Consultado em {new Date(paymentStatusResults[group.paymentId].checkedAt).toLocaleString("pt-BR")}
                              </span>
                            </div>
                          ) : <Badge variant="outline">Não verificado</Badge>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground">
                Exibindo {paymentGroups.length} cobranças distintas, agrupadas entre os {billingInbox.items.length}
                eventos retornados (no máximo 30 eventos recentes). O histórico disponível pode ser
                parcial se houver eventos mais antigos fora desse limite. Nenhum evento foi excluído.
                {billingInbox.lookupEnabled
                  ? " A consulta do status é pontual e não equivale a conciliação financeira ou ativação."
                  : " Consultas ao Asaas desabilitadas até configurar a chave de API privada e a flag de verificação."}
              </p>
              {paymentCheckError && <p role="alert" className="mt-2 text-sm text-destructive">{paymentCheckError}</p>}
            </div>
          )}
        </section>


        <section className="glass rounded-2xl p-5" aria-label="Vínculos comerciais de homologação">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Vínculos comerciais — Sandbox</h2>
            <Button type="button" size="sm" variant="outline"
              disabled={!billingLinks?.items.length} onClick={exportSandboxLinksCsv}>
              <Download className="size-4" /> Exportar CSV ({billingLinks?.items.length ?? 0})
            </Button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Associe manualmente uma cobrança já recebida a uma unidade e a um rascunho de plano.
            Isso é somente preparação: não cria cobrança, não reconhece receita e não libera acesso.
          </p>
          {!billingLinks ? (
            <p className="mt-4 text-sm text-muted-foreground">Carregando vínculos…</p>
          ) : (
            <>
              {!billingLinks.enabled && (
                <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                  Associação administrativa desabilitada por padrão.
                  O servidor exige BARBER_ASAAS_LINKING_ENABLED=true somente no Convex Development de homologação.
                </p>
              )}
              <form onSubmit={submitBillingLink} className="mt-5 grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="sandbox-link-unit">Barbearia</label>
                  <select id="sandbox-link-unit" required value={linkUnitId}
                    onChange={e => { setLinkUnitId(e.target.value); setLinkName(""); }}
                    className="glass-input h-10 w-full rounded-lg border px-3 text-sm">
                    <option value="">Selecione uma unidade</option>
                    {(overview?.organizations ?? []).filter(org => !org.isDemo).map(org => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="sandbox-link-plan">Plano previsto</label>
                  <select id="sandbox-link-plan" required value={linkPlanId}
                    onChange={e => setLinkPlanId(e.target.value)}
                    className="glass-input h-10 w-full rounded-lg border px-3 text-sm">
                    <option value="">Selecione um rascunho</option>
                    {(drafts ?? []).filter(plan => plan.priceCents > 0).map(plan => (
                      <option key={plan._id} value={plan._id}>
                        {plan.name} — {fmtMoney(plan.priceCents)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium" htmlFor="sandbox-link-payment">Cobrança recebida (evento Sandbox)</label>
                  <select id="sandbox-link-payment" required value={linkEventId}
                    onChange={e => setLinkEventId(e.target.value)}
                    className="glass-input h-10 w-full rounded-lg border px-3 text-sm">
                    <option value="">Selecione uma cobrança ainda não associada</option>
                    {availablePayments.map(group => (
                      <option key={group.paymentId} value={group.latest.id}>
                        {group.paymentId} · {SANDBOX_EVENT_LABELS[group.latest.eventType] ?? group.latest.eventType}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Apresenta somente as cobranças avulsas visíveis entre os últimos 30 eventos recebidos.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="sandbox-link-confirm">
                    Confirme o nome completo da unidade: {selectedLinkUnit?.name ?? "—"}
                  </label>
                  <Input id="sandbox-link-confirm" autoComplete="off" required
                    value={linkName} onChange={e => setLinkName(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="sandbox-link-reason">
                    Justificativa (12 a 350 caracteres)
                  </label>
                  <textarea id="sandbox-link-reason" required minLength={12} maxLength={350}
                    value={linkReason} onChange={e => setLinkReason(e.target.value)}
                    className="glass-input min-h-20 w-full rounded-lg border p-3 text-sm"
                    placeholder="Associação manual autorizada para testar o contrato no Sandbox" />
                </div>
                <div className="md:col-span-2">
                  <Button type="submit" disabled={!billingLinks.enabled || linkSaving ||
                    !selectedLinkUnit || !selectedLinkPlan || !selectedLinkEvent ||
                    linkName.trim() !== selectedLinkUnit.name ||
                    linkReason.trim().length < 12 || linkReason.trim().length > 350}>
                    {linkSaving ? "Registrando…" : "Criar vínculo de homologação"}
                  </Button>
                </div>
              </form>
              {linkMessage && <p role="status" className="mt-3 text-sm">{linkMessage}</p>}
              <div className="mt-6 border-t border-border/60 pt-4">
                <h3 className="text-sm font-semibold">Últimos vínculos registrados (até 50)</h3>
                {billingLinks.items.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Nenhum vínculo criado.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {billingLinks.items.map(link => (
                      <li key={link.id} className="rounded-xl border border-border/60 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold">{link.organizationName} · {link.planName}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {link.paymentId} · Plano previsto {fmtMoney(link.priceCents)}
                              {" · "}Criado em {new Date(link.createdAt).toLocaleString("pt-BR")}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {link.status === "voided" ? "Vínculo invalidado" : "Aguardando revisão"}
                          </Badge>
                        </div>
                        {link.status === "pending_review" && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Button type="button" size="sm" variant="outline"
                              disabled={!billingInbox?.lookupEnabled || reviewingLinkId !== null}
                              onClick={() => void reviewAssociation(link.id)}>
                              {reviewingLinkId === link.id ? "Verificando…" : "Comparar valor e status"}
                            </Button>
                            <Button type="button" size="sm" variant="outline"
                              disabled={!billingLinks.enabled}
                              onClick={() => {
                                setVoidTargetId(voidTargetId === link.id ? null : link.id);
                                setVoidReason(""); setVoidName("");
                              }}>Invalidar vínculo</Button>
                          </div>
                        )}
                        {linkReviews[link.id] && link.status === "pending_review" && (
                          <div role="status" className="mt-3 rounded-lg border border-border/60 p-3 text-xs">
                            <p>Status atual: <strong>{linkReviews[link.id].status}</strong> ·
                              {" "}Valor no Asaas: {fmtMoney(linkReviews[link.id].receivedAmountCents)} ·
                              {" "}Plano: {fmtMoney(linkReviews[link.id].expectedAmountCents)}
                            </p>
                            <p className="mt-1">
                              {linkReviews[link.id].amountMatches ? "Valor compatível" : "Valor divergente"} ·
                              {" "}{linkReviews[link.id].paidStatus ? "Status de pagamento recebido/confirmado" : "Pagamento não confirmado"}
                              {linkReviews[link.id].cashRecordedOutsideAsaas ? " · Baixa em dinheiro fora do Asaas" : ""}
                            </p>
                            <p className="mt-1 text-muted-foreground">
                              Titularidade contratual não verificada. Nenhum acesso será liberado automaticamente.
                            </p>
                          </div>
                        )}
                        {voidTargetId === link.id && link.status === "pending_review" && (
                          <div className="mt-3 grid gap-2 border-t border-border/60 pt-3">
                            <label htmlFor="sandbox-void-confirm" className="text-xs font-medium">
                              Digite o nome exato da unidade para invalidar: {link.organizationName}
                            </label>
                            <Input id="sandbox-void-confirm" value={voidName}
                              onChange={e => setVoidName(e.target.value)} />
                            <label htmlFor="sandbox-void-reason" className="text-xs font-medium">
                              Justificativa de invalidação (mínimo 12 caracteres)
                            </label>
                            <textarea id="sandbox-void-reason" minLength={12} maxLength={350}
                              className="glass-input min-h-20 w-full rounded-lg border p-3 text-sm"
                              value={voidReason} onChange={e => setVoidReason(e.target.value)} />
                            <Button type="button" size="sm" variant="destructive"
                              disabled={voidSaving || voidName.trim() !== link.organizationName ||
                                voidReason.trim().length < 12}
                              onClick={() => void submitVoidLink(link)}>
                              {voidSaving ? "Invalidando…" : "Confirmar invalidação"}
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {linkReviewError && <p role="alert" className="mt-3 text-sm text-destructive">{linkReviewError}</p>}
              </div>
            </>
          )}
        </section>


        <section className="glass rounded-2xl p-5" aria-label="Pedidos de cobrança gerados pela plataforma Sandbox">
          <h2 className="text-lg font-semibold">Emissão de cobranças — somente Sandbox</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Prepare pedidos originados no Barber OS com referência rastreável no Asaas. A emissão
            é uma ação separada, exclusivamente fictícia e sem liberação de assinaturas.
          </p>
          {!sandboxOrders ? (
            <p className="mt-4 text-sm text-muted-foreground">Carregando pedidos Sandbox…</p>
          ) : (
            <>
              {!sandboxOrders.enabled && (
                <p role="status" className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                  Emissão desabilitada no servidor. Requer BARBER_ASAAS_ORDER_WRITES=true,
                  consulta Sandbox habilitada e deployment de homologação único-tortoise-387.
                  Não habilite em produção.
                </p>
              )}
              <form onSubmit={submitOrderDraft} className="mt-5 grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="sb-order-unit">Barbearia</label>
                  <select id="sb-order-unit" required value={orderUnitId}
                    onChange={e => { setOrderUnitId(e.target.value); setOrderConfirmName(""); }}
                    className="glass-input h-10 w-full rounded-lg border px-3 text-sm">
                    <option value="">Escolha uma barbearia</option>
                    {(overview?.organizations ?? []).filter(o => !o.isDemo).map(o => (
                      <option value={o.id} key={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="sb-order-plan">Plano previsto</label>
                  <select id="sb-order-plan" required value={orderPlanId}
                    onChange={e => setOrderPlanId(e.target.value)}
                    className="glass-input h-10 w-full rounded-lg border px-3 text-sm">
                    <option value="">Escolha um rascunho comercial</option>
                    {(drafts ?? []).filter(p => p.priceCents > 0).map(p => (
                      <option key={p._id} value={p._id}>
                        {p.name} · {(p.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="sb-order-customer">
                    ID do cliente no Asaas Sandbox
                  </label>
                  <Input id="sb-order-customer" placeholder="cus_..." autoComplete="off"
                    required value={orderCustomerId} onChange={e => setOrderCustomerId(e.target.value)} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Utilize um cliente fictício já cadastrado no Sandbox. Não insira CPF ou dados pessoais.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="sb-order-due">
                    Vencimento (hoje até 45 dias)
                  </label>
                  <Input id="sb-order-due" type="date" required
                    value={orderDueDate} onChange={e => setOrderDueDate(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="sb-order-method">Modalidade</label>
                  <select id="sb-order-method" value={orderBillingType}
                    onChange={e => setOrderBillingType(e.target.value as "PIX" | "BOLETO")}
                    className="glass-input h-10 w-full rounded-lg border px-3 text-sm">
                    <option value="PIX">Pix (Sandbox)</option>
                    <option value="BOLETO">Boleto (Sandbox)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="sb-order-confirm">
                    Confirme o nome exato: {selectedOrderUnit?.name ?? "—"}
                  </label>
                  <Input id="sb-order-confirm" autoComplete="off" required
                    value={orderConfirmName} onChange={e => setOrderConfirmName(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium" htmlFor="sb-order-reason">
                    Justificativa administrativa (12 a 350 caracteres)
                  </label>
                  <textarea id="sb-order-reason" minLength={12} maxLength={350} required
                    value={orderReason} onChange={e => setOrderReason(e.target.value)}
                    className="glass-input min-h-16 w-full rounded-lg border p-3 text-sm"
                    placeholder="Emitir cobrança fictícia para validar o fluxo de homologação" />
                </div>
                <div className="md:col-span-2">
                  <Button type="submit" disabled={!sandboxOrders.enabled || orderBusy ||
                    !selectedOrderUnit || !selectedOrderPlan || !orderCustomerId.trim() ||
                    !orderDueDate || orderConfirmName.trim() !== selectedOrderUnit.name ||
                    orderReason.trim().length < 12 || orderReason.trim().length > 350}>
                    {orderBusy ? "Preparando…" : "Preparar pedido (não emite cobrança)"}
                  </Button>
                </div>
              </form>
              {orderMessage && <p role="status" className="mt-3 text-sm">{orderMessage}</p>}
              <div className="mt-6 border-t border-border/60 pt-4">
                <h3 className="text-sm font-semibold">Pedidos recentes (até 50)</h3>
                {sandboxOrders.items.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Nenhum pedido preparado.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {sandboxOrders.items.map(order => (
                      <li key={order.id} className="rounded-xl border border-border/60 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold">{order.organizationName} · {order.planName}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {(order.amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                              {" · "}{order.billingType} · Vence {order.dueDate}
                            </p>
                            <p className="mt-1 break-all text-xs text-muted-foreground">
                              Ref. {order.externalReference}
                              {order.paymentId ? ` · Cobrança ${order.paymentId}` : ""}
                            </p>
                          </div>
                          <Badge variant={order.status === "uncertain" ? "destructive" : "outline"}>
                            {({
                              draft: "Rascunho",
                              sending: "Envio em andamento/indefinido",
                              uncertain: "Resposta incerta — NÃO REENVIAR",
                              created: "Cobrança criada no Sandbox",
                              voided: "Rascunho invalidado",
                            } as Record<string, string>)[order.status] ?? order.status}
                          </Badge>
                        </div>
                        {order.status === "draft" && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="outline"
                              disabled={!sandboxOrders.enabled || orderActionId !== null}
                              onClick={() => void executeSandboxOrder(order.id, "send")}>
                              {orderActionId === order.id ? "Emitindo…" : "Emitir UMA cobrança fictícia"}
                            </Button>
                            <Button type="button" size="sm" variant="outline"
                              disabled={!sandboxOrders.enabled || orderBusy}
                              onClick={() => {
                                setOrderVoidTarget(orderVoidTarget === order.id ? null : order.id);
                                setOrderVoidName(""); setOrderVoidReason("");
                              }}>
                              Invalidar rascunho
                            </Button>
                          </div>
                        )}
                        {(order.status === "sending" || order.status === "uncertain") && (
                          <div className="mt-3">
                            <Button type="button" size="sm" variant="outline"
                              disabled={!sandboxOrders.enabled || orderActionId !== null}
                              onClick={() => void executeSandboxOrder(order.id, "recover")}>
                              {orderActionId === order.id ? "Buscando…" : "Buscar cobrança pela referência (somente leitura)"}
                            </Button>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Nunca envie outra cobrança automaticamente. Recuperação consulta o Asaas sem repetir POST.
                            </p>
                          </div>
                        )}
                        {orderVoidTarget === order.id && order.status === "draft" && (
                          <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                            <label className="block text-xs font-medium" htmlFor="sb-void-name">
                              Confirme a barbearia: {order.organizationName}
                            </label>
                            <Input id="sb-void-name" autoComplete="off" value={orderVoidName}
                              onChange={e => setOrderVoidName(e.target.value)} />
                            <label className="block text-xs font-medium" htmlFor="sb-void-reason">
                              Justificativa da invalidação
                            </label>
                            <textarea id="sb-void-reason" minLength={12} maxLength={350}
                              className="glass-input min-h-16 w-full rounded-lg border p-3 text-sm"
                              value={orderVoidReason} onChange={e => setOrderVoidReason(e.target.value)} />
                            <Button type="button" size="sm" variant="destructive"
                              disabled={orderBusy || orderVoidName.trim() !== order.organizationName ||
                                orderVoidReason.trim().length < 12 || orderVoidReason.trim().length > 350}
                              onClick={() => void cancelSandboxDraft(order)}>
                              {orderBusy ? "Invalidando…" : "Confirmar invalidação"}
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>

        <p className="pb-4 text-xs leading-relaxed text-muted-foreground">
          Painel técnico de homologação. Status de plano são registros do backend;
          não representam pagamentos confirmados, receita da plataforma ou assinaturas comerciais.
          O catálogo aceita rascunhos; o gestor de testes só opera com autorização adicional do servidor.
          Não há cobrança, pagamentos confirmados ou suporte remoto nesta versão.
        </p>
      </div>
    </main>
  );
}
