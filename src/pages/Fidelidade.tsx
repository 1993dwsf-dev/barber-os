import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Gift, Plus, Search, Sparkles, Star, Trophy } from "lucide-react";
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
import { brl, centsToInput, fmtDate, reaisToCents } from "@/lib/format";
import { useOrg } from "@/lib/org-context";

export default function Fidelidade() {
  const { orgId, canEdit } = useOrg();
  const [search, setSearch] = useState("");
  const [rewardOpen, setRewardOpen] = useState(false);
  const [adjust, setAdjust] = useState<{ id: Id<"clients">; name: string; points: number } | null>(null);

  const accounts = useQuery(
    api.loyalty.accounts,
    orgId ? { organizationId: orgId, search: search || undefined, limit: 200 } : "skip",
  );
  const rewards = useQuery(api.loyalty.listRewards, orgId ? { organizationId: orgId } : "skip");
  const transactions = useQuery(
    api.loyalty.transactions,
    orgId ? { organizationId: orgId } : "skip",
  );
  const createReward = useMutation(api.loyalty.createReward);
  const updateReward = useMutation(api.loyalty.updateReward);
  const redeem = useMutation(api.loyalty.redeem);
  const adjustPoints = useMutation(api.loyalty.adjustPoints);

  if (!orgId) return <Loading />;

  const settings = accounts?.settings;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Relacionamento"
        title="Fidelidade"
        description="Pontos acumulados a cada compra, resgates de benefícios e ajuste manual com registro em auditoria."
        actions={
          canEdit("loyalty") ? (
            <Button onClick={() => setRewardOpen(true)}>
              <Plus className="size-4" /> Novo benefício
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Clientes com pontos"
          value={accounts?.totalClients ?? 0}
          icon={Star}
        />
        <StatCard
          label="Pontos em circulação"
          value={(accounts?.totalPoints ?? 0).toLocaleString("pt-BR")}
          icon={Sparkles}
          tone="primary"
        />
        <StatCard
          label="Pontos por real"
          value={settings?.loyaltyPointsPerReal ?? 0}
          hint={`Bônus a cada ${settings?.loyaltyVisitRule.visits ?? 0} visitas: ${settings?.loyaltyVisitRule.points ?? 0} pts`}
        />
        <StatCard
          label="Benefícios ativos"
          value={(rewards ?? []).filter((r) => r.active).length}
          icon={Gift}
        />
      </div>

      <Tabs defaultValue="pontos" className="glass rounded-2xl p-5">
        <TabsList className="glass-chip">
          <TabsTrigger value="pontos">Clientes</TabsTrigger>
          <TabsTrigger value="beneficios">Benefícios</TabsTrigger>
          <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
        </TabsList>

        <TabsContent value="pontos" className="mt-4">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="glass-input pl-9"
              placeholder="Buscar cliente…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {(accounts?.accounts.length ?? 0) === 0 ? (
            <EmptyState title="Nenhum cliente com pontos" icon={Trophy} />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {(accounts?.accounts ?? []).map((a, i) => (
                <li key={a._id} className="flex flex-wrap items-center gap-3 rounded-xl glass-chip px-3 py-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-[11px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <Link
                    to={`/app/clientes/${a.clientId}`}
                    className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground hover:underline"
                  >
                    {a.clientName}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    ganhou {a.totalEarned} · resgatou {a.totalRedeemed}
                  </span>
                  <span className="w-16 text-right text-sm font-semibold tabular-nums text-primary">
                    {a.points}
                  </span>
                  {canEdit("loyalty") ? (
                    <div className="flex gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAdjust({ id: a.clientId, name: a.clientName, points: a.points })}
                      >
                        Ajustar
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="beneficios" className="mt-4">
          {(rewards ?? []).length === 0 ? (
            <EmptyState
              title="Nenhum benefício cadastrado"
              description="Crie descontos, serviços grátis ou produtos para resgatar com pontos."
              icon={Gift}
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {(rewards ?? []).map((r) => (
                <li key={r._id} className="glass-chip rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                      <Gift className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {r.name}
                        </span>
                        {!r.active ? (
                          <Tone className="border-zinc-200 bg-zinc-100 text-zinc-600">Inativo</Tone>
                        ) : null}
                      </span>
                      {r.description ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {r.kind === "desconto"
                          ? "Desconto"
                          : r.kind === "servico_gratis"
                            ? "Serviço grátis"
                            : "Produto"}{" "}
                        {r.valueCents ? `· ${brl(r.valueCents)}` : ""}
                      </p>
                    </div>
                    <Badge className="rounded-full">{r.pointsCost} pts</Badge>
                  </div>
                  {canEdit("loyalty") ? (
                    <div className="mt-3 flex gap-2">
                      <RewardRedeemButton rewardId={r._id} pointsCost={r.pointsCost} name={r.name} />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await updateReward({
                            organizationId: orgId,
                            rewardId: r._id,
                            active: !r.active,
                          });
                          toast.success(r.active ? "Benefício desativado" : "Benefício ativado");
                        }}
                      >
                        {r.active ? "Desativar" : "Ativar"}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="movimentacoes" className="mt-4">
          {(transactions ?? []).length === 0 ? (
            <EmptyState title="Sem movimentações de pontos" />
          ) : (
            <ul className="flex flex-col gap-1">
              {(transactions ?? []).slice(0, 120).map((t) => (
                <li key={t._id} className="flex items-center gap-2 rounded-xl glass-chip px-3 py-1.5 text-[13px]">
                  <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {fmtDate(t.date)}
                  </span>
                  <Link
                    to={`/app/clientes/${t.clientId}`}
                    className="min-w-0 flex-1 truncate text-foreground hover:underline"
                  >
                    {t.clientName}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {t.reason}
                  </span>
                  <span
                    className={`font-semibold tabular-nums ${
                      t.points >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {t.points >= 0 ? "+" : ""}
                    {t.points}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <RewardDialog
        open={rewardOpen}
        onOpenChange={setRewardOpen}
        onSaved={() => {
          setRewardOpen(false);
          toast.success("Benefício criado");
        }}
      />

      <AdjustDialog
        target={adjust}
        onClose={() => setAdjust(null)}
        onSave={async (points, reason) => {
          if (!adjust) return;
          await adjustPoints({
            organizationId: orgId,
            clientId: adjust.id,
            points,
            reason,
          });
          toast.success("Pontos ajustados");
          setAdjust(null);
        }}
      />
    </div>
  );
}

function RewardRedeemButton({
  rewardId,
  pointsCost,
  name,
}: {
  rewardId: Id<"loyaltyRewards">;
  pointsCost: number;
  name: string;
}) {
  const { orgId } = useOrg();
  const redeem = useMutation(api.loyalty.redeem);
  const clients = useQuery(
    api.loyalty.accounts,
    orgId ? { organizationId: orgId, limit: 300 } : "skip",
  );
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = (clients?.accounts ?? []).filter((a) => a.points >= pointsCost);

  return (
    <>
      <Button size="sm" variant="outline" className="bg-white/60" onClick={() => setOpen(true)}>
        Resgatar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-strong">
          <DialogHeader>
            <DialogTitle>Resgatar “{name}”</DialogTitle>
            <DialogDescription>
              {pointsCost} pontos serão descontados da conta do cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="glass-input">
                <SelectValue placeholder="Selecione o cliente" />
              </SelectTrigger>
              <SelectContent>
                {eligible.map((a) => (
                  <SelectItem key={a._id} value={a.clientId}>
                    {a.clientName} · {a.points} pts
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {eligible.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum cliente tem pontos suficientes para este benefício.
              </p>
            ) : null}
            {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button
              disabled={busy || !clientId}
              onClick={async () => {
                if (!orgId || !clientId) return;
                setBusy(true);
                setError(null);
                try {
                  await redeem({ organizationId: orgId, clientId: clientId as Id<"clients">, rewardId });
                  setOpen(false);
                  toast.success("Resgate registrado");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Não foi possível resgatar.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Resgatando…" : "Confirmar resgate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AdjustDialog({
  target,
  onClose,
  onSave,
}: {
  target: { id: Id<"clients">; name: string; points: number } | null;
  onClose: () => void;
  onSave: (points: number, reason: string) => Promise<void>;
}) {
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("Ajuste manual");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-strong">
        <DialogHeader>
          <DialogTitle>Ajustar pontos</DialogTitle>
          <DialogDescription>
            {target ? `${target.name} · saldo atual ${target.points} pontos` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs">Pontos (use negativo para remover)</Label>
            <Input
              className="glass-input mt-1"
              type="number"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Motivo</Label>
            <Input className="glass-input mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || Number(points) === 0}
            onClick={async () => {
              setBusy(true);
              await onSave(Number(points), reason || "Ajuste manual");
              setPoints("");
              setBusy(false);
            }}
          >
            {busy ? "Aplicando…" : "Aplicar ajuste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RewardDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { orgId } = useOrg();
  const createReward = useMutation(api.loyalty.createReward);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pointsCost, setPointsCost] = useState("");
  const [kind, setKind] = useState<"desconto" | "servico_gratis" | "produto">("desconto");
  const [value, setValue] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong">
        <DialogHeader>
          <DialogTitle>Novo benefício</DialogTitle>
          <DialogDescription>
            Benefícios podem ser um desconto, um serviço grátis ou um produto.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Input
            className="glass-input"
            placeholder="Nome do benefício"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Textarea
            className="glass-input"
            placeholder="Descrição"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Custo em pontos</Label>
              <Input
                className="glass-input mt-1"
                type="number"
                value={pointsCost}
                onChange={(e) => setPointsCost(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <SelectTrigger className="glass-input mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desconto">Desconto</SelectItem>
                  <SelectItem value="servico_gratis">Serviço grátis</SelectItem>
                  <SelectItem value="produto">Produto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Valor (R$)</Label>
              <Input
                className="glass-input mt-1"
                inputMode="decimal"
                placeholder={centsToInput(0)}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <Switch checked={active} onCheckedChange={setActive} />
            Benefício ativo
          </label>
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            disabled={busy || name.trim().length < 2 || !pointsCost}
            onClick={async () => {
              if (!orgId) return;
              setBusy(true);
              setError(null);
              try {
                await createReward({
                  organizationId: orgId,
                  name: name.trim(),
                  description: description || undefined,
                  pointsCost: Number(pointsCost),
                  kind,
                  valueCents: value ? reaisToCents(value) : undefined,
                });
                setName("");
                setDescription("");
                setPointsCost("");
                setValue("");
                onSaved();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Não foi possível salvar.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Salvando…" : "Criar benefício"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}