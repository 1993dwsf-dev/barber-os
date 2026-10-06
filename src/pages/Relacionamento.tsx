import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  Check,
  MessageCircle,
  Plus,
  Repeat,
  Sparkles,
  Star,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, Loading, PageHeader, StatCard, Tone } from "@/components/glass";
import { fmtDate, fmtPhone, whatsappLink } from "@/lib/format";
import { addDaysISO, todayISO } from "@/lib/dates";
import { useOrg } from "@/lib/org-context";

const REASON_LABELS: Record<string, string> = {
  inatividade: "Inatividade",
  aniversario: "Aniversário",
  renovacao: "Renovação",
  falta: "Falta",
  pos_atendimento: "Pós-atendimento",
  personalizado: "Personalizado",
};

const PRIORITY_TONES: Record<string, string> = {
  alta: "border-rose-200 bg-rose-100 text-rose-600",
  media: "border-amber-200 bg-amber-100 text-amber-700",
  baixa: "border-zinc-200 bg-zinc-100 text-zinc-600",
};

export default function Relacionamento() {
  const { orgId } = useOrg();

  if (!orgId) return <Loading />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Relacionamento"
        title="Follow-ups e avaliações"
        description="Esta seção está temporariamente indisponível."
      />
      <section className="glass rounded-2xl p-5 text-center">
        <Repeat className="mx-auto size-8 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">
          Os follow-ups e avaliações de relacionamento estão fora do ar no momento.
        </p>
      </section>
    </div>
  );
}

function FollowupDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { orgId } = useOrg();
  const create = useMutation(api.crm.createFollowup);
  const clients = useQuery(
    api.clients.list,
    orgId ? { organizationId: orgId, limit: 300, sort: "nome" } : "skip",
  );
  const [clientId, setClientId] = useState("");
  const [reason, setReason] = useState<
    "inatividade" | "aniversario" | "renovacao" | "falta" | "pos_atendimento" | "personalizado"
  >("personalizado");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState(addDaysISO(todayISO(), 3));
  const [priority, setPriority] = useState<"baixa" | "media" | "alta">("media");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong">
        <DialogHeader>
          <DialogTitle>Novo follow-up</DialogTitle>
          <DialogDescription>
            Tarefa de relacionamento com prazo e prioridade.
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
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Motivo</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
                <SelectTrigger className="glass-input mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REASON_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Prazo</Label>
              <Input
                type="date"
                className="glass-input mt-1"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger className="glass-input mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Input
            className="glass-input"
            placeholder="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
          <Button
            disabled={busy || !clientId || title.trim().length < 2}
            onClick={async () => {
              if (!orgId) return;
              setBusy(true);
              setError(null);
              try {
                await create({
                  organizationId: orgId,
                  clientId: clientId as Id<"clients">,
                  reason,
                  title: title.trim(),
                  notes: notes || undefined,
                  dueDate,
                  priority,
                });
                setTitle("");
                setNotes("");
                onSaved();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Não foi possível criar.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Criando…" : "Criar follow-up"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeedbackDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { orgId } = useOrg();
  const createFeedback = useMutation(api.crm.createFeedback);
  const clients = useQuery(
    api.clients.list,
    orgId ? { organizationId: orgId, limit: 300, sort: "nome" } : "skip",
  );
  const [clientId, setClientId] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = (clients?.clients ?? []).find((c) => c._id === clientId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong">
        <DialogHeader>
          <DialogTitle>Nova avaliação</DialogTitle>
          <DialogDescription>
            Avaliações abaixo de 3 estrelas geram automaticamente um follow-up.
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
                    {c.name} {c.phone ? `· ${fmtPhone(c.phone)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Nota</Label>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} estrelas`}
                  className="rounded-lg p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={`size-6 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-amber-200"}`}
                  />
                </button>
              ))}
              <span className="ml-2 self-center text-xs text-muted-foreground">{rating}/5</span>
            </div>
          </div>
          <Textarea
            className="glass-input"
            placeholder="Comentário do cliente"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <Textarea
            className="glass-input"
            placeholder="Notas internas"
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
          />
          {selected && rating <= 2 ? (
            <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
              Um follow-up de recuperação será criado para {selected.name}.
            </p>
          ) : null}
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            disabled={busy || !clientId}
            onClick={async () => {
              if (!orgId) return;
              setBusy(true);
              setError(null);
              try {
                await createFeedback({
                  organizationId: orgId,
                  clientId: clientId as Id<"clients">,
                  rating,
                  comment: comment || undefined,
                  internalNotes: internalNotes || undefined,
                });
                setComment("");
                setInternalNotes("");
                onSaved();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Não foi possível registrar.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Registrando…" : "Registrar avaliação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}