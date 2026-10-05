import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  BadgeDollarSign,
  CalendarClock,
  CreditCard,
  MessageCircle,
  PauseCircle,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, Loading, PageHeader, StatCard, Tone } from "@/components/glass";
import { PAYMENT_LABELS, brl, centsToInput, fmtDate, reaisToCents, whatsappLink } from "@/lib/format";
import { todayISO } from "@/lib/dates";
import { useOrg } from "@/lib/org-context";

export default function Assinaturas() {
  const { orgId, canEdit } = useOrg();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Id<"membershipPlans"> | null>(null);

  const plans = useQuery(api.catalog.listPlans, orgId ? { organizationId: orgId } : "skip");
  const memberships = useQuery(
    api.catalog.listMemberships,
    orgId ? { organizationId: orgId } : "skip",
  );

  if (!orgId) return <Loading />;

  const active = (memberships ?? []).filter((m) => m.status === "ativa");
  const mrr = active.reduce((s, m) => s + m.priceCents, 0);
  const renewing = (memberships ?? []).filter(
    (m) => m.status === "ativa" && m.daysToRenewal <= 7,
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Catálogo"
        title="Assinaturas"
        description="Planos recorrentes com créditos mensais. Renovações e cancelamentos ficam visíveis e geram follow-ups automáticos."
        actions={
          canEdit("memberships") ? (
            <Button onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="size-4" /> Novo plano
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Assinaturas ativas" value={active.length} icon={CreditCard} />
        <StatCard label="Receita recorrente (MRR)" value={brl(mrr)} tone="positive" hint="Soma dos planos ativos" />
        <StatCard
          label="Renovações em 7 dias"
          value={renewing.length}
          tone="warning"
          icon={CalendarClock}
        />
        <StatCard
          label="Ticket médio do plano"
          value={brl(active.length ? Math.round(mrr / active.length) : 0)}
        />
      </div>

      <Tabs defaultValue="planos" className="glass rounded-2xl p-5">
        <TabsList className="glass-chip">
          <TabsTrigger value="planos">Planos</TabsTrigger>
          <TabsTrigger value="assinantes">Assinantes</TabsTrigger>
        </TabsList>

        <TabsContent value="planos" className="mt-4">
          {(plans ?? []).length === 0 ? (
            <EmptyState
              title="Nenhum plano criado"
              description="Defina os créditos mensais e o preço do plano."
              icon={CreditCard}
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {(plans ?? []).map((p) => (
                <li key={p._id} className="glass-chip rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                      <BadgeDollarSign className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {p.name}
                        </span>
                        {!p.active ? (
                          <Tone className="border-zinc-200 bg-zinc-100 text-zinc-600">Inativo</Tone>
                        ) : null}
                      </span>
                      {p.description ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
                      ) : null}
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {brl(p.priceCents)}/mês
                    </span>
                  </div>

                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {p.items.map((it) => (
                      <li key={it.serviceId}>
                        <Badge variant="secondary" className="rounded-full text-[10px]">
                          {it.credits}x {it.serviceName}
                        </Badge>
                      </li>
                    ))}
                  </ul>

                  {p.benefits.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-0.5">
                      {p.benefits.map((b) => (
                        <li key={b} className="text-[11px] text-muted-foreground">
                          · {b}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {p.subscribers} assinante(s)
                    </span>
                    {canEdit("memberships") ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto bg-white/60"
                          onClick={() => {
                            setEditing(p._id);
                            setOpen(true);
                          }}
                        >
                          Editar
                        </Button>
                        <SubscribeButton planId={p._id} planName={p.name} priceCents={p.priceCents} />
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="assinantes" className="mt-4">
          {(memberships ?? []).length === 0 ? (
            <EmptyState title="Nenhuma assinatura ativa" icon={CreditCard} />
          ) : (
            <ul className="flex flex-col gap-2">
              {(memberships ?? []).map((m) => (
                <li key={m._id} className="flex flex-wrap items-center gap-3 rounded-xl glass-chip px-3 py-2.5">
                  <Link
                    to={`/app/clientes/${m.clientId}`}
                    className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground hover:underline"
                  >
                    {m.clientName}
                  </Link>
                  <span className="truncate text-xs text-muted-foreground">{m.planName}</span>
                  <Tone
                    className={
                      m.status === "ativa"
                        ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                        : m.status === "pausada"
                          ? "border-amber-200 bg-amber-100 text-amber-700"
                          : "border-zinc-200 bg-zinc-100 text-zinc-600"
                    }
                  >
                    {m.status}
                  </Tone>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {m.creditsRemaining} créditos
                  </span>
                  <span
                    className={`text-xs tabular-nums ${
                      m.daysToRenewal <= 7 && m.status === "ativa" ? "font-medium text-amber-600" : "text-muted-foreground"
                    }`}
                  >
                    renova {fmtDate(m.renewalDate)}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums text-foreground">
                    {brl(m.priceCents)}
                  </span>
                  {canEdit("memberships") ? (
                    <div className="flex gap-1">
                      <RenewButton membershipId={m._id} priceCents={m.priceCents} status={m.status} />
                      <StatusButton membershipId={m._id} status={m.status} />
                      {m.clientPhone ? (
                        <a
                          href={whatsappLink(
                            m.clientPhone,
                            `Olá ${m.clientName}! Seu plano ${m.planName} renova em ${fmtDate(m.renewalDate)}.`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="WhatsApp"
                        >
                          <Button variant="ghost" size="icon-sm">
                            <MessageCircle className="size-3.5" />
                          </Button>
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <PlanDialog
        open={open}
        onOpenChange={setOpen}
        planId={editing}
        onSaved={() => {
          setOpen(false);
          toast.success("Plano salvo");
        }}
      />
    </div>
  );
}

function RenewButton({
  membershipId,
  priceCents,
  status,
}: {
  membershipId: Id<"memberships">;
  priceCents: number;
  status: string;
}) {
  const { orgId, org } = useOrg();
  const renew = useMutation(api.catalog.renew);
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"dinheiro" | "debito" | "credito" | "pix">("pix");
  const [amount, setAmount] = useState(centsToInput(priceCents));
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const methods = org?.settings.activePaymentMethods ?? ["pix"];

  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label="Renovar" onClick={() => setOpen(true)}>
        <RefreshCw className="size-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-strong">
          <DialogHeader>
            <DialogTitle>Renovar assinatura</DialogTitle>
            <DialogDescription>
              Registra o pagamento e estende a validade. Ficha atual: {status}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Data da renovação</Label>
              <Input
                type="date"
                className="glass-input mt-1"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Pagamento</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                  <SelectTrigger className="glass-input mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["dinheiro", "debito", "credito", "pix"] as const)
                      .filter((m) => methods.includes(m))
                      .map((m) => (
                        <SelectItem key={m} value={m}>
                          {PAYMENT_LABELS[m]}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Valor (R$)</Label>
                <Input
                  className="glass-input mt-1"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!orgId) return;
                setBusy(true);
                try {
                  await renew({
                    organizationId: orgId,
                    membershipId,
                    payments: [{ method, amountCents: reaisToCents(amount) }],
                    date,
                  });
                  setOpen(false);
                  toast.success("Assinatura renovada");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Falha ao renovar");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Registrando…" : "Confirmar renovação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusButton({
  membershipId,
  status,
}: {
  membershipId: Id<"memberships">;
  status: "ativa" | "pausada" | "cancelada";
}) {
  const { orgId } = useOrg();
  const setStatus = useMutation(api.catalog.setMembershipStatus);
  const next = status === "ativa" ? "pausada" : "ativa";
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={next === "pausada" ? "Pausar" : "Reativar"}
      onClick={async () => {
        if (!orgId) return;
        try {
          await setStatus({ organizationId: orgId, membershipId, status: next });
          toast.success(next === "pausada" ? "Assinatura pausada" : "Assinatura reativada");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Falha ao atualizar");
        }
      }}
    >
      {next === "pausada" ? (
        <PauseCircle className="size-3.5" />
      ) : (
        <RefreshCw className="size-3.5" />
      )}
    </Button>
  );
}

function SubscribeButton({
  planId,
  planName,
  priceCents,
}: {
  planId: Id<"membershipPlans">;
  planName: string;
  priceCents: number;
}) {
  const { orgId, org } = useOrg();
  const subscribe = useMutation(api.catalog.subscribe);
  const clients = useQuery(
    api.clients.list,
    orgId ? { organizationId: orgId, limit: 300, sort: "nome" } : "skip",
  );
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [method, setMethod] = useState<"dinheiro" | "debito" | "credito" | "pix">("pix");
  const [amount, setAmount] = useState(centsToInput(priceCents));
  const [startDate, setStartDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const methods = org?.settings.activePaymentMethods ?? ["pix"];

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Assinar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-strong">
          <DialogHeader>
            <DialogTitle>Assinar “{planName}”</DialogTitle>
            <DialogDescription>
              A primeira cobrança entra como venda e a assinatura passa a contar no MRR.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Cliente</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="glass-input mt-1">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(clients?.clients ?? []).map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Início</Label>
              <Input
                type="date"
                className="glass-input mt-1"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Pagamento</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                  <SelectTrigger className="glass-input mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["dinheiro", "debito", "credito", "pix"] as const)
                      .filter((m) => methods.includes(m))
                      .map((m) => (
                        <SelectItem key={m} value={m}>
                          {PAYMENT_LABELS[m]}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Valor (R$)</Label>
                <Input
                  className="glass-input mt-1"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
            {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!orgId) return;
                if (!clientId) {
                  setError("Escolha o cliente.");
                  return;
                }
                setBusy(true);
                setError(null);
                try {
                  await subscribe({
                    organizationId: orgId,
                    clientId: clientId as Id<"clients">,
                    planId,
                    startDate,
                    payments: [{ method, amountCents: reaisToCents(amount) }],
                  });
                  setOpen(false);
                  toast.success("Assinatura criada");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Não foi possível assinar.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Registrando…" : "Confirmar assinatura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PlanDialog({
  open,
  onOpenChange,
  planId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  planId: Id<"membershipPlans"> | null;
  onSaved: () => void;
}) {
  const { orgId } = useOrg();
  const plans = useQuery(api.catalog.listPlans, orgId ? { organizationId: orgId } : "skip");
  const services = useQuery(api.services.list, orgId ? { organizationId: orgId } : "skip");
  const create = useMutation(api.catalog.createPlan);
  const update = useMutation(api.catalog.updatePlan);
  const current = (plans ?? []).find((p) => p._id === planId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [benefits, setBenefits] = useState("");
  const [items, setItems] = useState<{ serviceId: string; credits: number }[]>([
    { serviceId: "", credits: 1 },
  ]);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (current && loadedFor !== current._id) {
    setLoadedFor(current._id);
    setName(current.name);
    setDescription(current.description ?? "");
    setPrice(centsToInput(current.priceCents));
    setBenefits(current.benefits.join(", "));
    setItems(current.items.map((i) => ({ serviceId: i.serviceId, credits: i.credits })));
    setActive(current.active);
  }

  async function submit() {
    if (!orgId) return;
    const valid = items.filter((i) => i.serviceId && i.credits > 0);
    if (name.trim().length < 2 || valid.length === 0) {
      setError("Informe o nome e ao menos um crédito de serviço.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      name: name.trim(),
      description: description || undefined,
      priceCents: reaisToCents(price),
      items: valid.map((i) => ({
        serviceId: i.serviceId as Id<"services">,
        credits: Number(i.credits),
      })),
      benefits: benefits.split(",").map((b) => b.trim()).filter(Boolean),
    };
    try {
      if (planId) await update({ organizationId: orgId, planId, ...payload, active });
      else await create({ organizationId: orgId, ...payload });
      setLoadedFor(null);
      setName("");
      setDescription("");
      setPrice("");
      setBenefits("");
      setItems([{ serviceId: "", credits: 1 }]);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-w-xl">
        <DialogHeader>
          <DialogTitle>{planId ? "Editar plano" : "Novo plano"}</DialogTitle>
          <DialogDescription>
            Os créditos são renovados a cada cobrança e consumidos nos atendimentos.
          </DialogDescription>
        </DialogHeader>
        <div className="scrollbar-slim max-h-[60vh] overflow-y-auto">
          <div className="grid gap-3">
            <Input
              className="glass-input"
              placeholder="Nome do plano"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Textarea
              className="glass-input"
              placeholder="Descrição"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Preço mensal (R$)</Label>
                <Input
                  className="glass-input mt-1"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Benefícios (vírgula)</Label>
                <Input
                  className="glass-input mt-1"
                  value={benefits}
                  onChange={(e) => setBenefits(e.target.value)}
                  placeholder="Pede com café, 10% em produtos"
                />
              </div>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Créditos mensais
            </p>
            <div className="flex flex-col gap-2">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={it.serviceId}
                    onValueChange={(v) =>
                      setItems(items.map((x, j) => (i === j ? { ...x, serviceId: v } : x)))
                    }
                  >
                    <SelectTrigger className="glass-input flex-1">
                      <SelectValue placeholder="Serviço" />
                    </SelectTrigger>
                    <SelectContent>
                      {(services ?? []).map((s) => (
                        <SelectItem key={s._id} value={s._id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    className="glass-input w-20"
                    value={it.credits}
                    onChange={(e) =>
                      setItems(
                        items.map((x, j) => (i === j ? { ...x, credits: Number(e.target.value) } : x)),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={items.length === 1}
                    onClick={() => setItems(items.filter((_, j) => j !== i))}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setItems([...items, { serviceId: "", credits: 1 }])}
            >
              <Plus className="size-3.5" /> Adicionar crédito
            </Button>

            {planId ? (
              <label className="flex items-center gap-2.5 text-xs text-muted-foreground">
                <Switch checked={active} onCheckedChange={setActive} />
                Plano ativo para novas assinaturas
              </label>
            ) : null}
            {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Salvando…" : "Salvar plano"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}