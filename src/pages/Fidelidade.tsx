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
  const { orgId } = useOrg();

  if (!orgId) return <Loading />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Relacionamento"
        title="Fidelidade"
        description="Esta seção está temporariamente indisponível."
      />
      <section className="glass rounded-2xl p-5 text-center">
        <Star className="mx-auto size-8 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">
          A gestão de pontos e benefícios de fidelidade está fora do ar no momento.
        </p>
      </section>
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