import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { CalendarDays, Package, Plus, ShoppingCart, Ticket } from "lucide-react";
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
import { EmptyState, Loading, PageHeader, SectionTitle, StatCard, Tone } from "@/components/glass";
import {
  PAYMENT_LABELS,
  brl,
  centsToInput,
  fmtDate,
  reaisToCents,
} from "@/lib/format";
import { todayISO } from "@/lib/dates";
import { useOrg } from "@/lib/org-context";

type PayLine = { method: "dinheiro" | "debito" | "credito" | "pix"; amountCents: number };

export default function Pacotes() {
  const { orgId, canEdit, org } = useOrg();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Id<"packages"> | null>(null);

  const packages = useQuery(
    api.catalog.listPackages,
    orgId ? { organizationId: orgId, includeInactive: true } : "skip",
  );
  const clientPackages = useQuery(
    api.catalog.listClientPackages,
    orgId ? { organizationId: orgId } : "skip",
  );

  if (!orgId) return <Loading />;

  const list = packages ?? [];
  const credits = clientPackages ?? [];
  const activeCredits = credits.filter((c) => c.status === "ativo");
  const revenue = credits.reduce((s, c) => s + c.pricePaidCents, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Catálogo"
        title="Pacotes de serviços"
        description="Venda pacotes de serviços que geram créditos com validade. Cada serviço incluído no pacote concede créditos ao cliente, que são consumidos nos atendimentos. Quando o crédito é usado, ele não é contabilizado como nova receita — a receita já foi registrada na venda do pacote."
        actions={
          canEdit("packages") ? (
            <Button onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="size-4" /> Novo pacote
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pacotes no catálogo" value={list.length} icon={Package} />
        <StatCard label="Créditos ativos" value={activeCredits.length} tone="positive" />
        <StatCard label="Receita com pacotes" value={brl(revenue)} />
        <StatCard
          label="Créditos a vencer"
          value={activeCredits.filter((c) => !c.expired).length}
          tone="warning"
        />
      </div>

      <Tabs defaultValue="catalogo" className="glass rounded-2xl p-5">
        <TabsList className="glass-chip">
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          <TabsTrigger value="vendidos">Créditos vendidos</TabsTrigger>
        </TabsList>

        <TabsContent value="catalogo" className="mt-4">
          {list.length === 0 ? (
            <EmptyState
              title="Nenhum pacote cadastrado"
              description="Monte um pacote com sessões de vários serviços e defina a validade."
              icon={Package}
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {list.map((p) => (
                <li key={p._id} className="glass-chip rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                      <Package className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {p.name}
                        </span>
                        {!p.active ? (
                          <Tone className="border-zinc-200 bg-zinc-100 text-zinc-600">Inativo</Tone>
                        ) : null}
                      </div>
                      {p.description ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
                      ) : null}
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {brl(p.priceCents)}
                    </span>
                  </div>

                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {p.items.map((it) => (
                      <li key={it.serviceId}>
                        <Badge variant="secondary" className="rounded-full text-[10px]">
                          {it.sessions}x {it.serviceName}
                        </Badge>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span>{p.credits} créditos</span>
                    <span>Validade {p.validityDays} dias</span>
                    <span>{p.soldCount} vendido(s) · {p.activeCount} ativo(s)</span>
                  </div>

                  {canEdit("packages") ? (
                    <div className="mt-3 flex gap-2">
                      <BuyPackageButton packageId={p._id} priceCents={p.priceCents} name={p.name} />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(p._id);
                          setOpen(true);
                        }}
                      >
                        Editar
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="vendidos" className="mt-4">
          {credits.length === 0 ? (
            <EmptyState title="Nenhum pacote vendido ainda" icon={Ticket} />
          ) : (
            <ul className="flex flex-col gap-2">
              {credits.map((c) => (
                <li key={c._id} className="flex flex-wrap items-center gap-3 rounded-xl glass-chip px-3 py-2.5">
                  <Link
                    to={`/app/clientes/${c.clientId}`}
                    className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground hover:underline"
                  >
                    {c.clientName}
                  </Link>
                  <span className="truncate text-xs text-muted-foreground">{c.packageName}</span>
                  <Tone
                    className={
                      c.expired
                        ? "border-zinc-200 bg-zinc-100 text-zinc-600"
                        : c.status === "ativo"
                          ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                          : "border-amber-200 bg-amber-100 text-amber-700"
                    }
                  >
                    {c.expired ? "expirado" : c.status}
                  </Tone>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {c.remaining}/{c.creditsTotal} créditos
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="size-3" /> até {fmtDate(c.expiryDate)}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums text-foreground">
                    {brl(c.pricePaidCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <PackageDialog
        open={open}
        onOpenChange={setOpen}
        packageId={editing}
        onSaved={() => {
          setOpen(false);
          toast.success("Pacote salvo");
        }}
      />
    </div>
  );
}

function BuyPackageButton({
  packageId,
  priceCents,
  name,
}: {
  packageId: Id<"packages">;
  priceCents: number;
  name: string;
}) {
  const { orgId, org } = useOrg();
  const buy = useMutation(api.catalog.buyPackage);
  const clients = useQuery(
    api.clients.list,
    orgId ? { organizationId: orgId, limit: 300, sort: "nome" } : "skip",
  );
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [method, setMethod] = useState<"dinheiro" | "debito" | "credito" | "pix">("pix");
  const [amount, setAmount] = useState(centsToInput(priceCents));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const methods = org?.settings.activePaymentMethods ?? ["pix"];

  return (
    <>
      <Button size="sm" variant="outline" className="bg-white/60" onClick={() => setOpen(true)}>
        <ShoppingCart className="size-3.5" /> Vender
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-strong">
          <DialogHeader>
            <DialogTitle>Vender “{name}”</DialogTitle>              <DialogDescription>
              A venda registra o pagamento real e cria os créditos do cliente no pacote.
              Cada crédito é consumido em um atendimento e não entra novamente na receita.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Cliente</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="glass-input mt-1.5">
                  <SelectValue placeholder="Selecione o cliente" />
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Pagamento</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                  <SelectTrigger className="glass-input mt-1.5">
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
                <Label>Valor (R$)</Label>
                <Input
                  className="glass-input mt-1.5"
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
                  await buy({
                    organizationId: orgId,
                    clientId: clientId as Id<"clients">,
                    packageId,
                    payments: [{ method, amountCents: reaisToCents(amount) }],
                  });
                  setOpen(false);
                  toast.success("Pacote vendido", {
                    description: "Créditos disponíveis imediatamente para o cliente.",
                  });
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Não foi possível concluir a venda.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Registrando…" : "Confirmar venda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PackageDialog({
  open,
  onOpenChange,
  packageId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  packageId: Id<"packages"> | null;
  onSaved: () => void;
}) {
  const { orgId } = useOrg();
  const packages = useQuery(
    api.catalog.listPackages,
    orgId && packageId ? { organizationId: orgId, includeInactive: true } : "skip",
  );
  const services = useQuery(api.services.list, orgId ? { organizationId: orgId } : "skip");
  const create = useMutation(api.catalog.createPackage);
  const update = useMutation(api.catalog.updatePackage);
  const current = (packages ?? []).find((p) => p._id === packageId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [validity, setValidity] = useState("90");
  const [items, setItems] = useState<{ serviceId: string; sessions: number }[]>([
    { serviceId: "", sessions: 1 },
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
    setValidity(String(current.validityDays));
    setItems(current.items.map((i) => ({ serviceId: i.serviceId, sessions: i.sessions })));
    setActive(current.active);
  }

  async function submit() {
    if (!orgId) return;
    const valid = items.filter((i) => i.serviceId && i.sessions > 0);
    if (name.trim().length < 2 || valid.length === 0) {
      setError("Informe o nome e ao menos um serviço no pacote.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      name: name.trim(),
      description: description || undefined,
      priceCents: reaisToCents(price),
      validityDays: Number(validity) || 90,
      items: valid.map((i) => ({
        serviceId: i.serviceId as Id<"services">,
        sessions: Number(i.sessions),
      })),
    };
    try {
      if (packageId) await update({ organizationId: orgId, packageId, ...payload, active });
      else await create({ organizationId: orgId, ...payload });
      setLoadedFor(null);
      setName("");
      setDescription("");
      setPrice("");
      setItems([{ serviceId: "", sessions: 1 }]);
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
          <DialogTitle>{packageId ? "Editar pacote" : "Novo pacote"}</DialogTitle>
          <DialogDescription>
            Cada serviço incluído no pacote gera créditos que o cliente consome durante os
            atendimentos. A validade define o prazo para usar os créditos desde a compra.
          </DialogDescription>
        </DialogHeader>

        <div className="scrollbar-slim max-h-[60vh] overflow-y-auto">
          <SectionTitle title="Identificação" />
          <div className="grid gap-3 px-1">
            <Input
              className="glass-input"
              placeholder="Nome do pacote"
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
                <Label className="text-xs">Preço (R$)</Label>
                <Input
                  className="glass-input mt-1"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Validade (dias)</Label>
                <Input
                  className="glass-input mt-1"
                  type="number"
                  value={validity}
                  onChange={(e) => setValidity(e.target.value)}
                />
              </div>
            </div>

            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Composição
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
                          {s.name} — {brl(s.priceCents)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    className="glass-input w-20"
                    value={it.sessions}
                    onChange={(e) =>
                      setItems(
                        items.map((x, j) =>
                          i === j ? { ...x, sessions: Number(e.target.value) } : x,
                        ),
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
              onClick={() => setItems([...items, { serviceId: "", sessions: 1 }])}
            >
              <Plus className="size-3.5" /> Adicionar serviço
            </Button>

            {packageId ? (
              <label className="flex items-center gap-2.5 text-xs text-muted-foreground">
                <Switch checked={active} onCheckedChange={setActive} />
                Pacote ativo nas vendas
              </label>
            ) : null}
            {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Salvando…" : "Salvar pacote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}