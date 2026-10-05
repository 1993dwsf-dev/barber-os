import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Check,
  CreditCard,
  Minus,
  Package,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  User,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, Loading, PageHeader, SectionTitle, Tone } from "@/components/glass";
import { PAYMENT_LABELS, brl, centsToInput, fmtDate, reaisToCents } from "@/lib/format";
import { useOrg } from "@/lib/org-context";

type Kind = "servico" | "produto" | "pacote" | "plano";
type PayLine = { method: "dinheiro" | "debito" | "credito" | "pix"; amountCents: number };

type CartLine = {
  key: string;
  kind: Kind;
  refId: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  costCents: number;
  barberId?: string;
  coveredByCreditCents: number;
  clientPackageId?: string;
  membershipId?: string;
};

export default function Pdv() {
  const { orgId, org } = useOrg();
  const [term, setTerm] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [clientId, setClientId] = useState("");
  const [barberId, setBarberId] = useState("");
  const [discount, setDiscount] = useState("");
  const [payments, setPayments] = useState<PayLine[]>([{ method: "pix", amountCents: 0 }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<string | null>(null);

  const services = useQuery(api.services.list, orgId ? { organizationId: orgId } : "skip");
  const products = useQuery(api.products.list, orgId ? { organizationId: orgId } : "skip");
  const barbers = useQuery(api.barbers.list, orgId ? { organizationId: orgId } : "skip");
  const clients = useQuery(
    api.clients.list,
    orgId && term.length >= 2
      ? { organizationId: orgId, search: term, limit: 8, sort: "nome" }
      : "skip",
  );
  const clientPackages = useQuery(
    api.catalog.listClientPackages,
    orgId && clientId ? { organizationId: orgId, clientId: clientId as Id<"clients">, status: "ativo" } : "skip",
  );
  const memberships = useQuery(
    api.catalog.listMemberships,
    orgId && clientId
      ? { organizationId: orgId, clientId: clientId as Id<"clients">, status: "ativa" }
      : "skip",
  );
  const packages = useQuery(api.catalog.listPackages, orgId ? { organizationId: orgId } : "skip");
  const plans = useQuery(api.catalog.listPlans, orgId ? { organizationId: orgId } : "skip");
  const createSale = useMutation(api.sales.createSale);
  const recent = useQuery(
    api.sales.listSales,
    orgId ? { organizationId: orgId, limit: 12 } : "skip",
  );

  const methods = org?.settings.activePaymentMethods ?? ["pix"];
  const t = term.toLowerCase();

  const catalog = useMemo(() => {
    const rows: { kind: Kind; id: string; name: string; price: number; cost: number; extra?: string }[] = [];
    for (const s of services ?? []) {
      rows.push({ kind: "servico", id: s._id, name: s.name, price: s.priceCents, cost: 0, extra: `${s.durationMin} min` });
    }
    for (const p of products ?? []) {
      rows.push({
        kind: "produto",
        id: p._id,
        name: p.name,
        price: p.priceCents,
        cost: p.costCents,
        extra: `${p.stock} ${p.unit}`,
      });
    }
    for (const p of packages ?? []) {
      rows.push({ kind: "pacote", id: p._id, name: p.name, price: p.priceCents, cost: 0, extra: `${p.credits} créditos` });
    }
    for (const p of plans ?? []) {
      rows.push({ kind: "plano", id: p._id, name: p.name, price: p.priceCents, cost: 0, extra: "assinatura" });
    }
    if (!t) return rows.slice(0, 24);
    return rows.filter((r) => r.name.toLowerCase().includes(t)).slice(0, 24);
  }, [services, products, packages, plans, t]);

  if (!orgId) return <Loading />;

  function addLine(row: { kind: Kind; id: string; name: string; price: number; cost: number }) {
    setCart((prev) => {
      const existing = prev.find((l) => l.kind === row.kind && l.refId === row.id && !l.coveredByCreditCents);
      if (existing) {
        return prev.map((l) =>
          l.key === existing.key
            ? { ...l, qty: l.qty + (row.kind === "produto" ? 0 : 1) }
            : l,
        );
      }
      return [
        ...prev,
        {
          key: `${row.kind}-${row.id}-${Date.now()}`,
          kind: row.kind,
          refId: row.id,
          name: row.name,
          qty: row.kind === "produto" ? 1 : 1,
          unitPriceCents: row.price,
          costCents: row.cost,
          barberId: row.kind === "servico" ? barberId || undefined : undefined,
          coveredByCreditCents: 0,
        },
      ];
    });
  }

  function changeQty(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0),
    );
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  /** Usa um crédito do cliente para cobrir (totalmente) um serviço do carrinho. */
  function applyCredit(lineKey: string, source: { type: "pacote" | "plano"; id: string }) {
    setCart((prev) =>
      prev.map((l) => {
        if (l.key !== lineKey) return l;
        const total = l.qty * l.unitPriceCents;
        return {
          ...l,
          coveredByCreditCents: Math.min(total, l.unitPriceCents),
          clientPackageId: source.type === "pacote" ? source.id : undefined,
          membershipId: source.type === "plano" ? source.id : undefined,
        };
      }),
    );
  }

  const subtotal = cart.reduce((s, l) => s + l.qty * l.unitPriceCents, 0);
  const credits = cart.reduce((s, l) => s + l.coveredByCreditCents, 0);
  const discountCents = Math.min(reaisToCents(discount), Math.max(0, subtotal - credits));
  const total = subtotal - credits - discountCents;
  const paid = payments.reduce((s, p) => s + p.amountCents, 0);
  const missingPayment = payments.some((p) => p.amountCents === 0);
  const cashTotal = payments
    .filter((p) => p.method === "dinheiro")
    .reduce((s, p) => s + p.amountCents, 0);

  async function finalize() {
    if (!orgId) return;
    if (cart.length === 0) {
      setError("Adicione itens ao carrinho.");
      return;
    }
    if (discountCents > 0) setError("");
    setBusy(true);
    try {
      const result = await createSale({
        organizationId: orgId,
        clientId: clientId ? (clientId as Id<"clients">) : undefined,
        barberId: barberId ? (barberId as Id<"barbers">) : undefined,
        discountCents: discountCents || undefined,
        items: cart.map((l) => ({
          kind: l.kind,
          refId: l.refId,
          qty: l.qty,
          unitPriceCents: l.unitPriceCents,
          costCents: l.costCents,
          barberId: l.barberId ? (l.barberId as Id<"barbers">) : undefined,
          coveredByCreditCents: l.coveredByCreditCents || undefined,
          clientPackageId: l.clientPackageId ? (l.clientPackageId as Id<"clientPackages">) : undefined,
          membershipId: l.membershipId ? (l.membershipId as Id<"memberships">) : undefined,
        })),
        payments: payments
          .filter((p) => p.amountCents > 0)
          .map((p) => ({ method: p.method, amountCents: p.amountCents })),
      });
      setLastSale(`${result.saleId}`);
      setCart([]);
      setDiscount("");
      setPayments([{ method: "pix", amountCents: 0 }]);
      setError(null);
      toast.success("Venda registrada", {
        description: "Estoque, comissão, caixa e fidelidade foram atualizados.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível registrar a venda.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Operação"
        title="PDV"
        description="Venda de serviços, produtos, pacotes e planos com pagamento dividido, crédito de pacote e baixa automática de estoque."
      />

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        {/* Catálogo */}
        <div className="flex flex-col gap-4">
          <div className="glass rounded-2xl p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="glass-input pl-9"
                placeholder="Buscar item para vender…"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
            </div>
          </div>

          {term.length >= 2 && (clients?.clients.length ?? 0) > 0 ? (
            <section className="glass rounded-2xl">
              <SectionTitle title="Clientes encontrados" hint="Selecione para vincular a venda" />
              <ul className="flex flex-wrap gap-2 px-5 pb-5">
                {(clients?.clients ?? []).map((c) => (
                  <li key={c._id}>
                    <button
                      type="button"
                      onClick={() => {
                        setClientId(c._id);
                        setTerm("");
                      }}
                      className="rounded-xl glass-chip px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-white/80"
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="glass rounded-2xl">
            <SectionTitle title="Catálogo" hint="Clique para adicionar ao carrinho" />
            {catalog.length === 0 ? (
              <EmptyState title="Nenhum item encontrado" icon={Search} />
            ) : (
              <div className="grid gap-2 px-5 pb-5 sm:grid-cols-2">
                {catalog.map((row) => (
                  <button
                    key={`${row.kind}-${row.id}`}
                    type="button"
                    onClick={() => addLine(row)}
                    className="glass-chip flex items-center gap-3 rounded-xl px-3 py-2 text-left transition-all hover:-translate-y-0.5 hover:bg-white/80"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {row.name}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {row.kind === "servico"
                          ? "Serviço"
                          : row.kind === "produto"
                            ? "Produto"
                            : row.kind === "pacote"
                              ? "Pacote"
                              : "Plano"}{" "}
                        {row.extra ? `· ${row.extra}` : ""}
                      </span>
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums text-foreground">
                      {brl(row.price)}
                    </span>
                    <Plus className="size-4 shrink-0 text-primary" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="glass rounded-2xl">
            <SectionTitle title="Últimas vendas" />
            {(recent ?? []).length === 0 ? (
              <EmptyState title="Nenhuma venda registrada" icon={Receipt} />
            ) : (
              <ul className="flex flex-col gap-1 px-5 pb-5">
                {(recent ?? []).map((s) => (
                  <li key={s._id} className="flex items-center gap-3 rounded-lg px-2 py-1 text-[13px]">
                    <span className="tabular-nums text-muted-foreground">#{s.number}</span>
                    <span className="w-20 text-xs text-muted-foreground">{fmtDate(s.date)}</span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{s.clientName}</span>
                    <span className="text-xs text-muted-foreground">{s.barberName}</span>
                    <span className="text-[13px] font-semibold tabular-nums text-foreground">
                      {brl(s.totalCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Carrinho */}
        <div className="flex flex-col gap-4">
          <section className="glass sticky top-24 rounded-2xl">
            <SectionTitle title="Venda atual" hint={`${cart.length} item(ns)`} />
            <div className="grid gap-3 px-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Cliente</Label>
                  <Select
                    value={clientId || "none"}
                    onValueChange={(v) => {
                      setClientId(v === "none" ? "" : v);
                      setCart((prev) =>
                        prev.map((l) => ({ ...l, coveredByCreditCents: 0, clientPackageId: undefined, membershipId: undefined })),
                      );
                    }}
                  >
                    <SelectTrigger className="glass-input mt-1">
                      <SelectValue placeholder="Consumidor não identificado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Consumidor não identificado</SelectItem>
                      {clientId ? (
                        <SelectItem value={clientId}>
                          {clients?.clients.find((c) => c._id === clientId)?.name ?? "Cliente atual"}
                        </SelectItem>
                      ) : null}
                      <SelectItem value="reload" disabled>
                        Busque o cliente acima
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {clientId ? (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <User className="size-3" /> Cliente vinculado à venda
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label className="text-xs">Barbeiro (comissão)</Label>
                  <Select
                    value={barberId || "none"}
                    onValueChange={(v) => {
                      setBarberId(v === "none" ? "" : v);
                      setCart((prev) =>
                        prev.map((l) =>
                          l.kind === "servico" ? { ...l, barberId: v === "none" ? undefined : v } : l,
                        ),
                      );
                    }}
                  >
                    <SelectTrigger className="glass-input mt-1">
                      <SelectValue placeholder="Sem barbeiro" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem barbeiro</SelectItem>
                      {(barbers ?? []).map((b) => (
                        <SelectItem key={b._id} value={b._id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="px-5 pt-4">
              {cart.length === 0 ? (
                <EmptyState
                  title="Carrinho vazio"
                  description="Escolha itens do catálogo ao lado para iniciar a venda."
                  icon={ShoppingCart}
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {cart.map((l) => {
                    const creditsAvailable =
                      (clientPackages ?? []).filter((cp) => !cp.expired && cp.remaining > 0).length +
                      (memberships ?? []).filter((m) => m.creditsRemaining > 0).length;
                    return (
                      <li key={l.key} className="rounded-xl glass-chip px-3 py-2">
                        <div className="flex items-start gap-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-foreground">
                              {l.name}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {brl(l.unitPriceCents)} un.
                              {l.coveredByCreditCents > 0 ? (
                                <span className="ml-1 text-emerald-600">
                                  · {brl(l.coveredByCreditCents)} no crédito
                                </span>
                              ) : null}
                            </span>
                          </span>
                          <span className="text-[13px] font-semibold tabular-nums text-foreground">
                            {brl(l.qty * l.unitPriceCents - l.coveredByCreditCents)}
                          </span>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => changeQty(l.key, -1)}
                            aria-label="Diminuir"
                          >
                            <Minus className="size-3.5" />
                          </Button>
                          <span className="w-6 text-center text-xs tabular-nums text-foreground">
                            {l.qty}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => changeQty(l.key, 1)}
                            aria-label="Aumentar"
                          >
                            <Plus className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeLine(l.key)}
                            aria-label="Remover"
                            className="ml-auto"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>

                        {l.kind === "servico" && clientId && !l.coveredByCreditCents && creditsAvailable > 0 ? (
                          <CreditPicker
                            clientPackages={clientPackages ?? []}
                            memberships={memberships ?? []}
                            onPick={(source) => applyCredit(l.key, source)}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Totais */}
            <div className="px-5 pt-4">
              <div className="flex flex-col gap-1.5 border-t border-white/60 pt-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{brl(subtotal)}</span>
                </div>
                {credits > 0 ? (
                  <div className="flex justify-between text-emerald-600">
                    <span>Créditos aplicados</span>
                    <span className="tabular-nums">− {brl(credits)}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Desconto (R$)</span>
                  <Input
                    className="glass-input h-8 w-28 text-right"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                  />
                </div>
                <div className="flex justify-between border-t border-white/60 pt-2 text-base font-semibold text-foreground">
                  <span>Total</span>
                  <span className="tabular-nums">{brl(total)}</span>
                </div>
              </div>

              {/* Pagamento dividido */}
              <div className="mt-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <CreditCard className="size-3.5" /> Pagamento
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {payments.map((p, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Select
                        value={p.method}
                        onValueChange={(v) =>
                          setPayments(
                            payments.map((x, j) => (i === j ? { ...x, method: v as PayLine["method"] } : x)),
                          )
                        }
                      >
                        <SelectTrigger className="glass-input w-36">
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
                      <Input
                        className="glass-input text-right"
                        inputMode="decimal"
                        placeholder={i === 0 ? brl(total - paid).replace("R$ ", "") : "0,00"}
                        value={p.amountCents ? centsToInput(p.amountCents) : ""}
                        onChange={(e) =>
                          setPayments(
                            payments.map((x, j) =>
                              i === j ? { ...x, amountCents: reaisToCents(e.target.value) } : x,
                            ),
                          )
                        }
                      />
                      {payments.length > 1 ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setPayments(payments.filter((_, j) => j !== i))}
                          aria-label="Remover forma"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const next: PayLine["method"] =
                        payments.length === 0
                          ? "dinheiro"
                          : (["dinheiro", "debito", "credito", "pix"] as const).find(
                              (m) => methods.includes(m) && !payments.some((p) => p.method === m),
                            ) ?? "pix";
                      setPayments([...payments, { method: next, amountCents: 0 }]);
                    }}
                  >
                    <Plus className="size-3.5" /> Dividir pagamento
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setPayments((prev) =>
                        prev.map((x, i) => (i === 0 ? { ...x, amountCents: total - paid } : x)),
                      )
                    }
                  >
                    <Wallet className="size-3.5" /> Completar
                  </Button>
                </div>

                {cashTotal > 0 ? (
                  <p className="mt-2 text-[11px] text-amber-700">
                    Há {brl(cashTotal)} em dinheiro: abra o caixa antes de finalizar.
                  </p>
                ) : null}
              </div>

              {error ? (
                <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-600">
                  {error}
                </p>
              ) : null}

              <Button
                className="mt-4 w-full"
                disabled={busy || cart.length === 0 || missingPayment || paid !== total}
                onClick={finalize}
              >
                {busy ? "Registrando…" : `Finalizar venda · ${brl(total)}`}
              </Button>
              {cart.length > 0 && !missingPayment && paid !== total ? (
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  O pago ({brl(paid)}) precisa ser igual ao total ({brl(total)}).
                </p>
              ) : null}
              {lastSale ? (
                <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-emerald-600">
                  <Check className="size-3.5" /> Última venda registrada com sucesso.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function CreditPicker({
  clientPackages,
  memberships,
  onPick,
}: {
  clientPackages: {
    _id: Id<"clientPackages">;
    packageName: string;
    remaining: number;
    expired: boolean;
  }[];
  memberships: {
    _id: Id<"memberships">;
    planName: string;
    creditsRemaining: number;
  }[];
  onPick: (source: { type: "pacote" | "plano"; id: string }) => void;
}) {
  const options = [
    ...clientPackages
      .filter((c) => !c.expired && c.remaining > 0)
      .map((c) => ({
        type: "pacote" as const,
        id: c._id as string,
        label: `${c.packageName} · ${c.remaining} créditos`,
      })),
    ...memberships
      .filter((m) => m.creditsRemaining > 0)
      .map((m) => ({
        type: "plano" as const,
        id: m._id as string,
        label: `${m.planName} · ${m.creditsRemaining} créditos`,
      })),
  ];

  if (options.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <Tone className="border-primary/25 bg-primary/10 text-primary">
        <Package className="size-3" /> Usar crédito:
      </Tone>
      {options.map((o) => (
        <Button
          key={`${o.type}-${o.id}`}
          variant="outline"
          size="sm"
          className="h-7 bg-white/70 text-[11px]"
          onClick={() => onPick({ type: o.type, id: o.id })}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}