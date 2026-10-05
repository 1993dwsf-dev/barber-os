import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  History,
  PackagePlus,
  Warehouse,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { brl, centsToInput, fmtDate, reaisToCents } from "@/lib/format";
import { addDaysISO, todayISO } from "@/lib/dates";
import { useOrg } from "@/lib/org-context";

const MOVEMENT_LABELS: Record<string, string> = {
  compra: "Compra",
  venda: "Venda",
  ajuste: "Ajuste",
  devolucao: "Devolução",
  correcao: "Correção",
  outro: "Outro",
};

export default function Estoque() {
  const { orgId, canEdit } = useOrg();
  const [open, setOpen] = useState(false);

  const summary = useQuery(api.products.summary, orgId ? { organizationId: orgId } : "skip");
  const products = useQuery(
    api.products.list,
    orgId ? { organizationId: orgId, includeInactive: true } : "skip",
  );
  const movements = useQuery(
    api.products.movements,
    orgId ? { organizationId: orgId, from: addDaysISO(todayISO(), -60) } : "skip",
  );

  if (!orgId) return <Loading />;

  const lowStock = (products ?? []).filter((p) => p.active && p.stock <= p.minStock);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Estoque"
        title="Controle de estoque"
        description="Entradas, saídas e ajustes de cada produto. Vendas feitas no PDV geram a saída automaticamente."
        actions={
          canEdit("inventory") ? (
            <Button onClick={() => setOpen(true)}>
              <PackagePlus className="size-4" /> Nova movimentação
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Valor em custo"
          value={brl(summary?.costValueCents ?? 0)}
          icon={Warehouse}
        />
        <StatCard
          label="Valor em venda"
          value={brl(summary?.retailValueCents ?? 0)}
          tone="positive"
          hint={`Lucro potencial ${brl((summary?.retailValueCents ?? 0) - (summary?.costValueCents ?? 0))}`}
        />
        <StatCard
          label="Itens abaixo do mínimo"
          value={summary?.lowStock ?? 0}
          tone="warning"
          icon={ArrowDownCircle}
        />
        <StatCard
          label="Itens sem estoque"
          value={summary?.outOfStock ?? 0}
          tone="danger"
          icon={Boxes}
        />
      </div>

      {lowStock.length > 0 ? (
        <section className="glass rounded-2xl border-l-4 border-l-amber-400/70">
          <SectionTitle
            title="Reposição necessária"
            hint="Produtos no limite ou abaixo do estoque mínimo"
          />
          <ul className="flex flex-col gap-2 px-5 pb-5">
            {lowStock.map((p) => (
              <li
                key={p._id}
                className="flex flex-wrap items-center gap-3 rounded-xl glass-chip px-3 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{p.name}</span>
                <Tone
                  className={
                    p.stock <= 0
                      ? "border-rose-200 bg-rose-100 text-rose-600"
                      : "border-amber-200 bg-amber-100 text-amber-700"
                  }
                >
                  {p.stock} {p.unit}
                </Tone>
                <span className="text-xs text-muted-foreground">mínimo {p.minStock}</span>
                <span className="text-sm font-medium tabular-nums text-foreground">
                  {brl(p.priceCents)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Tabs defaultValue="posicao" className="glass rounded-2xl p-5">
        <TabsList className="glass-chip">
          <TabsTrigger value="posicao">Posição de estoque</TabsTrigger>
          <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
        </TabsList>

        <TabsContent value="posicao" className="mt-4">
          {(products ?? []).length === 0 ? (
            <EmptyState title="Nenhum produto cadastrado" icon={Boxes} />
          ) : (
            <ul className="flex flex-col gap-2">
              {(products ?? []).map((p) => (
                <li key={p._id} className="flex flex-wrap items-center gap-3 rounded-xl glass-chip px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
                      <Badge variant="secondary" className="rounded-full text-[10px]">
                        {p.category}
                      </Badge>
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {brl(p.stockValueCents)} em custo · {brl(p.retailValueCents)} em venda
                    </span>
                  </span>
                  <div className="w-40">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/70">
                      <div
                        className={`h-full rounded-full ${
                          p.stock <= 0 ? "bg-rose-500" : p.lowStock ? "bg-amber-500" : "bg-primary"
                        }`}
                        style={{
                          width: `${Math.min(100, p.minStock > 0 ? (p.stock / (p.minStock * 3)) * 100 : 100)}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-right text-[10px] text-muted-foreground">
                      {p.stock} {p.unit} · mín. {p.minStock}
                    </p>
                  </div>
                  <span className="w-24 text-right text-sm font-semibold tabular-nums text-foreground">
                    {brl(p.priceCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="movimentacoes" className="mt-4">
          {(movements ?? []).length === 0 ? (
            <EmptyState
              title="Sem movimentações no período"
              description="Registre compras e ajustes para acompanhar o histórico."
              icon={History}
            />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {(movements ?? []).map((m) => {
                const isOut = m.type === "venda";
                return (
                  <li key={m._id} className="flex flex-wrap items-center gap-3 rounded-xl glass-chip px-3 py-2 text-[13px]">
                    <span className="w-20 shrink-0 tabular-nums text-xs text-muted-foreground">
                      {fmtDate(m.date)}
                    </span>
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-lg ${
                        isOut ? "bg-rose-500/12 text-rose-600" : "bg-emerald-500/12 text-emerald-600"
                      }`}
                    >
                      {isOut ? (
                        <ArrowDownCircle className="size-3.5" />
                      ) : (
                        <ArrowUpCircle className="size-3.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{m.productName}</span>
                    <Badge variant="secondary" className="rounded-full text-[10px]">
                      {MOVEMENT_LABELS[m.type] ?? m.type}
                    </Badge>
                    <span
                      className={`w-16 text-right font-semibold tabular-nums ${
                        isOut ? "text-rose-600" : "text-emerald-600"
                      }`}
                    >
                      {isOut ? "−" : "+"}
                      {m.quantity}
                    </span>
                    <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                      {m.unitCostCents ? brl(m.unitCostCents) : "—"}
                    </span>
                    {m.reference ? (
                      <span className="w-28 truncate text-right text-[11px] text-muted-foreground">
                        {m.reference}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <MovementDialog
        open={open}
        onOpenChange={setOpen}
        onSaved={() => {
          setOpen(false);
          toast.success("Movimentação registrada");
        }}
      />
    </div>
  );
}

function MovementDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { orgId } = useOrg();
  const products = useQuery(api.products.list, orgId ? { organizationId: orgId } : "skip");
  const addMovement = useMutation(api.products.addMovement);
  const [productId, setProductId] = useState("");
  const [type, setType] = useState<"compra" | "ajuste" | "devolucao" | "correcao" | "outro">(
    "compra",
  );
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong">
        <DialogHeader>
          <DialogTitle>Nova movimentação</DialogTitle>
          <DialogDescription>
            Compras somam ao estoque; ajustes e correções aplicam a quantidade informada
            (use valor negativo paraReducer).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs">Produto</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="glass-input mt-1">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {(products ?? []).map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name} — {p.stock} {p.unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger className="glass-input mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compra">Compra</SelectItem>
                  <SelectItem value="ajuste">Ajuste</SelectItem>
                  <SelectItem value="correcao">Correção</SelectItem>
                  <SelectItem value="devolucao">Devolução</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Quantidade</Label>
              <Input
                className="glass-input mt-1"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Custo unitário (R$)</Label>
              <Input
                className="glass-input mt-1"
                inputMode="decimal"
                placeholder={centsToInput(0)}
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Documento / nota</Label>
              <Input
                className="glass-input mt-1"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>
          <Textarea
            className="glass-input"
            placeholder="Observações"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={async () => {
              if (!orgId) return;
              if (!productId) {
                setError("Selecione o produto.");
                return;
              }
              setBusy(true);
              setError(null);
              try {
                await addMovement({
                  organizationId: orgId,
                  productId: productId as Id<"products">,
                  quantity: Number(quantity) || 0,
                  type,
                  unitCostCents: unitCost ? reaisToCents(unitCost) : undefined,
                  reference: reference || undefined,
                  notes: notes || undefined,
                });
                setQuantity("1");
                setReference("");
                setNotes("");
                onSaved();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Não foi possível registrar.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Registrando…" : "Registrar movimentação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}