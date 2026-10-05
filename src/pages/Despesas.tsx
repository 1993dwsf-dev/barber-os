import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { FileText, Paperclip, Plus, Receipt, Trash2, TrendingDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { EmptyState, Loading, PageHeader, SectionTitle, StatCard, Tone } from "@/components/glass";
import { PAYMENT_LABELS, brl, downloadCSV, fmtDate, reaisToCents, toCSV } from "@/lib/format";
import { addDaysISO, monthRange, todayISO } from "@/lib/dates";
import { useOrg } from "@/lib/org-context";

export default function Despesas() {
  const { orgId, canEdit, org } = useOrg();
  const period = monthRange(todayISO());
  const [from, setFrom] = useState(period.start);
  const [to, setTo] = useState(period.end);
  const [category, setCategory] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Id<"expenses"> | null>(null);

  const data = useQuery(
    api.expenses.list,
    orgId ? { organizationId: orgId, from, to, category: category !== "all" ? category : undefined } : "skip",
  );
  const remove = useMutation(api.expenses.remove);

  if (!orgId) return <Loading />;

  const expenses = data?.expenses ?? [];
  const total = data?.total ?? 0;

  function exportCsv() {
    downloadCSV(
      `despesas-${from}_a_${to}.csv`,
      toCSV(
        ["Data", "Categoria", "Fornecedor", "Descrição", "Valor", "Forma", "Recorrente"],
        expenses.map((e) => [
          fmtDate(e.date),
          e.category,
          e.supplier ?? "",
          e.description,
          (e.amountCents / 100).toFixed(2).replace(".", ","),
          PAYMENT_LABELS[e.method] ?? e.method,
          e.recurring ? "Sim" : "Não",
        ]),
      ),
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Gestão"
        title="Despesas"
        description="Custos da barbearia por categoria e forma de pagamento. Despesas pagas em dinheiro entram automaticamente na sessão de caixa."
        actions={
          <>
            <Button variant="outline" className="bg-white/60" onClick={exportCsv}>
              <FileText className="size-4" /> CSV
            </Button>
            {canEdit("expenses") ? (
              <Button onClick={() => { setEditing(null); setOpen(true); }}>
                <Plus className="size-4" /> Nova despesa
              </Button>
            ) : null}
          </>
        }
      />

      <div className="glass flex flex-wrap items-end gap-3 rounded-2xl p-3">
        <div>
          <span className="text-xs text-muted-foreground">De</span>
          <Input type="date" className="glass-input mt-1 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Até</span>
          <Input type="date" className="glass-input mt-1 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="bg-white/60" onClick={() => setFrom(addDaysISO(todayISO(), -30))}>
            30 dias
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="bg-white/60"
            onClick={() => {
              const p = monthRange(todayISO());
              setFrom(p.start);
              setTo(p.end);
            }}
          >
            Este mês
          </Button>
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="glass-input w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {(org?.settings.expenseCategories ?? []).map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total no período" value={brl(total)} icon={TrendingDown} tone="warning" />
        <StatCard label="Lançamentos" value={expenses.length} icon={Receipt} />
        <StatCard
          label="Maior categoria"
          value={data?.byCategory[0]?.category ?? "—"}
          hint={brl(data?.byCategory[0]?.cents ?? 0)}
        />
        <StatCard
          label="Média por lançamento"
          value={brl(expenses.length ? Math.round(total / expenses.length) : 0)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="glass rounded-2xl">
          <SectionTitle title="Lançamentos" hint={`${expenses.length} registro(s)`} />
          <div className="px-5 pb-5">
            {!data ? (
              <Loading />
            ) : expenses.length === 0 ? (
              <EmptyState
                title="Nenhuma despesa no período"
                description="Registre aluguéis, contas e insumos para acompanhar o resultado."
                icon={Receipt}
              />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {expenses.map((e) => (
                  <li key={e._id} className="flex flex-wrap items-center gap-3 rounded-xl glass-chip px-3 py-2.5">
                    <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {fmtDate(e.date)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {e.description}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {e.category}
                        {e.supplier ? ` · ${e.supplier}` : ""} · {PAYMENT_LABELS[e.method]}
                      </span>
                    </span>
                    {e.recurring ? (
                      <Tone className="border-primary/25 bg-primary/10 text-primary">recorrente</Tone>
                    ) : null}
                    {e.hasFile ? (
                      <Paperclip className="size-3.5 text-muted-foreground" aria-label="Possui anexo" />
                    ) : null}
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {brl(e.amountCents)}
                    </span>
                    {canEdit("expenses") ? (
                      <div className="flex gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Editar"
                          onClick={() => {
                            setEditing(e._id);
                            setOpen(true);
                          }}
                        >
                          <FileText className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Excluir"
                          onClick={async () => {
                            await remove({ organizationId: orgId, expenseId: e._id });
                            toast.success("Despesa removida");
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="glass rounded-2xl">
          <SectionTitle title="Por categoria" hint="Participação no total do período" />
          <div className="px-5 pb-5">
            {(data?.byCategory.length ?? 0) === 0 ? (
              <EmptyState title="Sem dados no período" />
            ) : (
              <ul className="flex flex-col gap-3">
                {(data?.byCategory ?? []).map((c) => {
                  const pct = total > 0 ? Math.round((c.cents / total) * 100) : 0;
                  return (
                    <li key={c.category}>
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-foreground">{c.category}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {brl(c.cents)} · {pct}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/70">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      <ExpenseDialog
        open={open}
        onOpenChange={setOpen}
        expenseId={editing}
        categories={org?.settings.expenseCategories ?? []}
        onSaved={() => {
          setOpen(false);
          toast.success("Despesa salva");
        }}
      />
    </div>
  );
}

function ExpenseDialog({
  open,
  onOpenChange,
  expenseId,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expenseId: Id<"expenses"> | null;
  categories: string[];
  onSaved: () => void;
}) {
  const { orgId } = useOrg();
  const list = useQuery(
    api.expenses.list,
    orgId && expenseId
      ? { organizationId: orgId, from: "1970-01-01", to: addDaysISO(todayISO(), 3650) }
      : "skip",
  );
  const create = useMutation(api.expenses.create);
  const update = useMutation(api.expenses.update);
  const current = (list?.expenses ?? []).find((e) => e._id === expenseId);

  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"dinheiro" | "debito" | "credito" | "pix">("pix");
  const [recurring, setRecurring] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (current && loadedFor !== current._id) {
    setLoadedFor(current._id);
    setDate(current.date);
    setCategory(current.category);
    setSupplier(current.supplier ?? "");
    setDescription(current.description);
    setAmount((current.amountCents / 100).toFixed(2).replace(".", ","));
    setMethod(current.method);
    setRecurring(current.recurring);
    setNotes(current.notes ?? "");
  }

  async function submit() {
    if (!orgId) return;
    if (!category || description.trim().length < 2 || !amount) {
      setError("Informe categoria, descrição e valor.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      date,
      category,
      supplier: supplier || undefined,
      description: description.trim(),
      amountCents: reaisToCents(amount),
      method,
      recurring,
      notes: notes || undefined,
    };
    try {
      if (expenseId) await update({ organizationId: orgId, expenseId, ...payload });
      else await create({ organizationId: orgId, ...payload });
      setLoadedFor(null);
      setDescription("");
      setAmount("");
      setSupplier("");
      setNotes("");
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
          <DialogTitle>{expenseId ? "Editar despesa" : "Nova despesa"}</DialogTitle>
          <DialogDescription>
            Despesas pagas em dinheiro são automaticamente lançadas no caixa aberto.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" className="glass-input mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
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
              <Input className="glass-input mt-1" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
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
            <div>
              <Label className="text-xs">Forma de pagamento</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                <SelectTrigger className="glass-input mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["dinheiro", "debito", "credito", "pix"] as const).map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-end gap-2.5 pb-2 text-xs text-muted-foreground">
              <Switch checked={recurring} onCheckedChange={setRecurring} />
              Despesa recorrente
            </label>
          </div>
          <Input
            className="glass-input"
            placeholder="Descrição"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Textarea
            className="glass-input"
            placeholder="Observações"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Salvando…" : "Salvar despesa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}