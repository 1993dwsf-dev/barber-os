import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  DoorClosed,
  DoorOpen,
  Scale,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { EmptyState, Loading, PageHeader, SectionTitle, StatCard, Tone } from "@/components/glass";
import { PAYMENT_LABELS, brl, centsToInput, fmtDate, reaisToCents } from "@/lib/format";
import { todayISO } from "@/lib/dates";
import { useOrg } from "@/lib/org-context";

const MOVEMENT_LABELS: Record<string, string> = {
  venda: "Venda",
  entrada: "Entrada",
  saida: "Saída",
  retirada: "Retirada",
  despesa: "Despesa",
  estorno: "Estorno",
};

export default function Caixa() {
  const { orgId, canEdit } = useOrg();
  const [openOpen, setOpenOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const session = useQuery(api.cash.currentSession, orgId ? { organizationId: orgId } : "skip");
  const history = useQuery(
    api.cash.listSessions,
    orgId ? { organizationId: orgId, limit: 20 } : "skip",
  );
  const openSession = useMutation(api.cash.openSession);
  const closeSession = useMutation(api.cash.closeSession);

  if (!orgId) return <Loading />;

  const expected = session?.expectedCents ?? 0;
  const countedCents = reaisToCents(counted);
  const variance = countedCents - expected;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Operação"
        title="Caixa"
        description="Controle de sessões de caixa: abertura, entradas e saídas, conferência e fechamento com divergência registrada."
        actions={
          canEdit("cash") && session ? (
            <>
              <Button variant="outline" className="bg-white/60" onClick={() => setMovementOpen(true)}>
                <ArrowUpCircle className="size-4" /> Entrada / saída
              </Button>
              <Button onClick={() => setCloseOpen(true)}>
                <DoorClosed className="size-4" /> Fechar caixa
              </Button>
            </>
          ) : canEdit("cash") ? (
            <Button onClick={() => setOpenOpen(true)}>
              <DoorOpen className="size-4" /> Abrir caixa
            </Button>
          ) : null
        }
      />

      {!session ? (
        <section className="glass rounded-2xl">
          <EmptyState
            title="Nenhuma sessão de caixa aberta"
            description="Abra o caixa com o valor inicial para registrar vendas em dinheiro."
            icon={DoorOpen}
            action={
              canEdit("cash") ? (
                <Button onClick={() => setOpenOpen(true)}>
                  <DoorOpen className="size-4" /> Abrir caixa
                </Button>
              ) : null
            }
          />
        </section>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Esperado em caixa"
              value={brl(expected)}
              icon={Wallet}
              hint={`Abertura ${brl(session.session.openingBalanceCents)} · ${session.openDays} dia(s)`}
            />
            <StatCard
              label="Vendas de hoje"
              value={session.todaySales}
              hint="Todas as formas de pagamento do dia"
            />
            <StatCard
              label="Movimentações"
              value={session.movements.length}
              icon={Scale}
              hint="Lançamentos manuais desta sessão"
            />
            <StatCard
              label="Entradas em dinheiro"
              value={brl(
                session.movements
                  .filter((m) => m.type === "venda" || m.type === "entrada")
                  .reduce((s, m) => s + m.amountCents, 0),
              )}
              icon={ArrowUpCircle}
              tone="positive"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="glass rounded-2xl">
              <SectionTitle title="Recebimentos de hoje por forma" hint={fmtDate(todayISO())} />
              <ul className="flex flex-col gap-2 px-5 pb-5">
                {Object.entries(session.todayByMethod).map(([method, cents]) => (
                  <li key={method} className="flex items-center gap-3 rounded-xl glass-chip px-3 py-2">
                    <span className="min-w-0 flex-1 text-[13px] text-foreground">
                      {PAYMENT_LABELS[method] ?? method}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {brl(cents)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="glass rounded-2xl">
              <SectionTitle title="Movimentações da sessão" hint="Entrada, saída e retirada" />
              <div className="scrollbar-slim max-h-80 overflow-y-auto px-5 pb-5">
                {session.movements.length === 0 ? (
                  <EmptyState title="Nenhuma movimentação manual" icon={Scale} />
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {session.movements.map((m) => {
                      const isIn = m.type === "venda" || m.type === "entrada";
                      return (
                        <li key={m._id} className="flex items-center gap-2 text-[13px]">
                          <span
                            className={`flex size-6 shrink-0 items-center justify-center rounded-lg ${
                              isIn ? "bg-emerald-500/12 text-emerald-600" : "bg-rose-500/12 text-rose-600"
                            }`}
                          >
                            {isIn ? (
                              <ArrowUpCircle className="size-3.5" />
                            ) : (
                              <ArrowDownCircle className="size-3.5" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-foreground">{m.description}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {MOVEMENT_LABELS[m.type]} · {m.userName}
                            </span>
                          </span>
                          <span
                            className={`text-[13px] font-semibold tabular-nums ${
                              isIn ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {isIn ? "+" : "−"}
                            {brl(m.amountCents)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </div>

          <section className="glass rounded-2xl">
            <SectionTitle title="Histórico de sessões" hint="Fechamentos anteriores" />
            {(history ?? []).length === 0 ? (
              <EmptyState title="Nenhum histórico ainda" />
            ) : (
              <ul className="flex flex-col gap-1.5 px-5 pb-5">
                {(history ?? []).map((s) => (
                  <li key={s._id} className="flex flex-wrap items-center gap-3 rounded-xl glass-chip px-3 py-2 text-[13px]">
                    <span className="w-24 text-muted-foreground">{fmtDate(s.openedDate)}</span>
                    <Tone
                      className={
                        s.status === "aberto"
                          ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                          : "border-zinc-200 bg-zinc-100 text-zinc-600"
                      }
                    >
                      {s.status}
                    </Tone>
                    <span className="text-muted-foreground">abertura {brl(s.openingBalanceCents)}</span>
                    {s.status === "fechado" ? (
                      <>
                        <span className="text-muted-foreground">contado {brl(s.countedCents ?? 0)}</span>
                        <span
                          className={`font-medium ${
                            (s.varianceCents ?? 0) === 0
                              ? "text-emerald-600"
                              : (s.varianceCents ?? 0) > 0
                                ? "text-emerald-600"
                                : "text-rose-600"
                          }`}
                        >
                          diferença {brl(s.varianceCents ?? 0)}
                        </span>
                      </>
                    ) : (
                      <span className="text-emerald-600">em aberto</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* Abrir sessão */}
      <Dialog open={openOpen} onOpenChange={setOpenOpen}>
        <DialogContent className="glass-strong">
          <DialogHeader>
            <DialogTitle>Abrir caixa</DialogTitle>
            <DialogDescription>
              Informe o valor inicial em dinheiro que está na gaveta.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Valor de abertura (R$)</Label>
              <Input
                className="glass-input mt-1"
                inputMode="decimal"
                placeholder="0,00"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
              />
            </div>
            {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await openSession({ organizationId: orgId, openingBalanceCents: reaisToCents(opening) });
                  setOpenOpen(false);
                  setOpening("");
                  toast.success("Caixa aberto");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Não foi possível abrir.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Abrindo…" : "Abrir sessão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movimentação */}
      <MovementDialog
        open={movementOpen}
        onOpenChange={setMovementOpen}
        onSaved={() => {
          setMovementOpen(false);
          toast.success("Movimentação registrada");
        }}
      />

      {/* Fechar sessão */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="glass-strong">
          <DialogHeader>
            <DialogTitle>Fechar caixa</DialogTitle>
            <DialogDescription>
              Conte o dinheiro da gaveta e registre o valor. A diferença entre o esperado e o
              contado fica registrada na auditoria.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex items-center justify-between rounded-xl glass-chip px-3 py-2 text-sm">
              <span className="text-muted-foreground">Esperado</span>
              <span className="font-semibold tabular-nums text-foreground">{brl(expected)}</span>
            </div>
            <div>
              <Label className="text-xs">Valor contado (R$)</Label>
              <Input
                className="glass-input mt-1"
                inputMode="decimal"
                placeholder={centsToInput(expected)}
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
              />
            </div>
            <div
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                variance === 0 ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/12 text-amber-700"
              }`}
            >
              <Scale className="size-4" />
              Diferença: <strong className="tabular-nums">{brl(variance)}</strong>
              {variance !== 0 ? <AlertTriangle className="ml-auto size-4" /> : <Check className="ml-auto size-4" />}
            </div>
            <Textarea
              className="glass-input"
              placeholder="Observações do fechamento"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await closeSession({
                    organizationId: orgId,
                    countedCents,
                    notes: notes || undefined,
                  });
                  setCloseOpen(false);
                  setCounted("");
                  setNotes("");
                  toast.success("Caixa fechado", {
                    description: variance === 0 ? "Sem divergência." : `Diferença de ${brl(variance)}.`,
                  });
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Não foi possível fechar.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Fechando…" : "Confirmar fechamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const add = useMutation(api.cash.addMovement);
  const [type, setType] = useState<"entrada" | "saida" | "retirada">("entrada");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong">
        <DialogHeader>
          <DialogTitle>Movimentação de caixa</DialogTitle>
          <DialogDescription>
            Registrar entradas, saídas e retiradas de dinheiro do caixa.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger className="glass-input mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">Entrada</SelectItem>
                <SelectItem value="saida">Saída</SelectItem>
                <SelectItem value="retirada">Retirada do proprietário</SelectItem>
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
          <div>
            <Label className="text-xs">Descrição</Label>
            <Input
              className="glass-input mt-1"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: troco para o fornecedor"
            />
          </div>
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            disabled={busy || description.trim().length < 2}
            onClick={async () => {
              if (!orgId) return;
              setBusy(true);
              setError(null);
              try {
                await add({
                  organizationId: orgId,
                  type,
                  amountCents: reaisToCents(amount),
                  description: description.trim(),
                });
                setAmount("");
                setDescription("");
                onSaved();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Não foi possível registrar.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Registrando…" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}