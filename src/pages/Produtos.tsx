import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  History,
  PackagePlus,
  Plus,
  Search,
  TrendingUp,
  Truck,
  Warehouse,
} from "lucide-react";
import { useState } from "react";
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

export default function Produtos() {
  const { orgId, canEdit, org } = useOrg();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Id<"products"> | null>(null);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);

  const products = useQuery(
    api.products.list,
    orgId ? { organizationId: orgId, includeInactive: true } : "skip",
  );
  const summary = useQuery(api.products.summary, orgId ? { organizationId: orgId } : "skip");
  const movements = useQuery(
    api.products.movements,
    orgId ? { organizationId: orgId, from: addDaysISO(todayISO(), -60) } : "skip",
  );
  const suppliers = useQuery(api.products.listSuppliers, orgId ? { organizationId: orgId } : "skip");

  if (!orgId) return <Loading />;

  const categories = [...new Set((products ?? []).map((p) => p.category))];
  const list = (products ?? []).filter((p) => {
    if (category !== "all" && p.category !== category) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const lowStock = (products ?? []).filter((p) => p.active && p.stock <= p.minStock);
  const costValue = summary?.costValueCents ?? 0;
  const retailValue = summary?.retailValueCents ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Catálogo"
        title="Produtos e estoque"
        description="Cadastre produtos com preço de custo, preço de venda e estoque mínimo. As vendas no PDV baixam o estoque automaticamente; entradas e ajustes ficam na aba Movimentações."
        actions={
          canEdit("products") ? (
            <>
              <Button variant="outline" className="bg-white/60" onClick={() => setSupplierOpen(true)}>
                <Truck className="size-4" /> Fornecedor
              </Button>
              {canEdit("inventory") ? (
                <Button variant="outline" className="bg-white/60" onClick={() => setMovementOpen(true)}>
                  <PackagePlus className="size-4" /> Movimentação
                </Button>
              ) : null}
              <Button
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus className="size-4" /> Novo produto
              </Button>
            </>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Produtos ativos" value={summary?.totalProducts ?? 0} icon={Boxes} />
        <StatCard label="Valor em custo" value={brl(costValue)} icon={Warehouse} />
        <StatCard
          label="Valor em venda"
          value={brl(retailValue)}
          icon={TrendingUp}
          tone="positive"
          hint={`Lucro potencial ${brl(retailValue - costValue)}`}
        />
        <StatCard
          label="Abaixo do mínimo"
          value={summary?.lowStock ?? 0}
          tone="warning"
          icon={ArrowDownCircle}
          hint={`${summary?.outOfStock ?? 0} sem estoque`}
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

      <Tabs defaultValue="produtos" className="glass rounded-2xl p-5">
        <TabsList className="glass-chip">
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
        </TabsList>

        <TabsContent value="produtos" className="mt-4">
          <div className="flex flex-wrap items-center gap-2 pb-4">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="glass-input pl-9"
                placeholder="Buscar produto…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="glass-input w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ml-auto text-xs text-muted-foreground">{list.length} produto(s)</span>
          </div>

          {list.length === 0 ? (
            <EmptyState
              title="Nenhum produto encontrado"
              description="Cadastre o primeiro produto para controlar o estoque."
              icon={Boxes}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {list.map((p) => (
                <li
                  key={p._id}
                  className="flex flex-wrap items-center gap-3 rounded-xl glass-chip px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
                      <Badge variant="secondary" className="rounded-full text-[10px]">
                        {p.category}
                      </Badge>
                      {!p.active ? (
                        <Tone className="border-zinc-200 bg-zinc-100 text-zinc-600">Inativo</Tone>
                      ) : null}
                      {p.lowStock ? (
                        <Tone
                          className={
                            p.stock <= 0
                              ? "border-rose-200 bg-rose-100 text-rose-600"
                              : "border-amber-200 bg-amber-100 text-amber-700"
                          }
                        >
                          {p.stock <= 0 ? "sem estoque" : "estoque baixo"}
                        </Tone>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      custo {brl(p.costCents)} · margem {p.marginPercent.toFixed(0)}% ·{" "}
                      {brl(p.stockValueCents)} em estoque
                    </span>
                  </span>
                  <div className="w-36">
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
                  {canEdit("products") ? (
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
                  ) : null}
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
                  <li
                    key={m._id}
                    className="flex flex-wrap items-center gap-3 rounded-xl glass-chip px-3 py-2 text-[13px]"
                  >
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

      <ProductDialog
        open={open}
        onOpenChange={setOpen}
        productId={editing}
        categories={org?.settings.productCategories ?? []}
        onSaved={() => {
          setOpen(false);
          toast.success("Produto salvo");
        }}
      />
      <SupplierDialog
        open={supplierOpen}
        onOpenChange={setSupplierOpen}
        onSaved={() => {
          setSupplierOpen(false);
          toast.success("Fornecedor cadastrado");
        }}
      />
      <MovementDialog
        open={movementOpen}
        onOpenChange={setMovementOpen}
        onSaved={() => {
          setMovementOpen(false);
          toast.success("Movimentação registrada");
        }}
      />
      {(suppliers ?? []).length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Fornecedores: {(suppliers ?? []).map((s) => s.name).join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function ProductDialog({
  open,
  onOpenChange,
  productId,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: Id<"products"> | null;
  categories: string[];
  onSaved: () => void;
}) {
  const { orgId } = useOrg();
  const products = useQuery(
    api.products.list,
    orgId && productId ? { organizationId: orgId, includeInactive: true } : "skip",
  );
  const suppliers = useQuery(api.products.listSuppliers, orgId ? { organizationId: orgId } : "skip");
  const create = useMutation(api.products.create);
  const update = useMutation(api.products.update);
  const current = (products ?? []).find((p) => p._id === productId);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [supplierId, setSupplierId] = useState("none");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [minStock, setMinStock] = useState("2");
  const [unit, setUnit] = useState("un");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (current && loadedFor !== current._id) {
    setLoadedFor(current._id);
    setName(current.name);
    setCategory(current.category);
    setSupplierId(current.supplierId ?? "none");
    setCost(centsToInput(current.costCents));
    setPrice(centsToInput(current.priceCents));
    setStock(String(current.stock));
    setMinStock(String(current.minStock));
    setUnit(current.unit);
    setNotes(current.notes ?? "");
    setActive(current.active);
  }

  async function submit() {
    if (!orgId) return;
    if (!name.trim() || !category) {
      setError("Informe o nome e a categoria do produto.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (productId) {
        await update({
          organizationId: orgId,
          productId,
          name,
          category,
          supplierId: supplierId === "none" ? undefined : (supplierId as Id<"suppliers">),
          costCents: reaisToCents(cost),
          priceCents: reaisToCents(price),
          minStock: Number(minStock) || 0,
          unit,
          notes: notes || undefined,
          active,
        });
      } else {
        await create({
          organizationId: orgId,
          name,
          category,
          supplierId: supplierId === "none" ? undefined : (supplierId as Id<"suppliers">),
          costCents: reaisToCents(cost),
          priceCents: reaisToCents(price),
          stock: Number(stock) || 0,
          minStock: Number(minStock) || 0,
          unit,
          notes: notes || undefined,
        });
      }
      setLoadedFor(null);
      setName("");
      setCost("");
      setPrice("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{productId ? "Editar produto" : "Novo produto"}</DialogTitle>
          <DialogDescription>
            Alterações de preço e cadastro não movimentam o estoque — registre entradas e ajustes na
            aba Movimentações.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input className="glass-input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="glass-input mt-1">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fornecedor</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="glass-input mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem fornecedor</SelectItem>
                  {(suppliers ?? []).map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Preço de custo (R$)</Label>
              <Input
                className="glass-input mt-1"
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Preço de venda (R$)</Label>
              <Input
                className="glass-input mt-1"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            {!productId ? (
              <div>
                <Label className="text-xs">Estoque inicial</Label>
                <Input
                  className="glass-input mt-1"
                  type="number"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                />
              </div>
            ) : null}
            <div>
              <Label className="text-xs">Estoque mínimo</Label>
              <Input
                className="glass-input mt-1"
                type="number"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Unidade</Label>
              <Input
                className="glass-input mt-1"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="un, frasco, ml…"
              />
            </div>
          </div>
          <Textarea
            className="glass-input"
            placeholder="Observações"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {productId ? (
            <label className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <Switch checked={active} onCheckedChange={setActive} />
              Produto ativo
            </label>
          ) : null}
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Salvando…" : "Salvar produto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupplierDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { orgId } = useOrg();
  const create = useMutation(api.products.createSupplier);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong">
        <DialogHeader>
          <DialogTitle>Novo fornecedor</DialogTitle>
          <DialogDescription>
            Fornecedores ajudam a rastrear compras e reposição de estoque.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Input
            className="glass-input"
            placeholder="Nome do fornecedor"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            className="glass-input"
            placeholder="Telefone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Input
            className="glass-input"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Textarea
            className="glass-input"
            placeholder="Observações"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            disabled={busy || name.trim().length < 2}
            onClick={async () => {
              if (!orgId) return;
              setBusy(true);
              await create({
                organizationId: orgId,
                name: name.trim(),
                phone: phone || undefined,
                email: email || undefined,
                notes: notes || undefined,
              });
              setName("");
              setPhone("");
              setEmail("");
              setNotes("");
              onSaved();
            }}
          >
            {busy ? "Salvando…" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
            Compras somam ao estoque; ajustes e correções aplicam a quantidade informada (use valor
            negativo para dar baixa).
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
