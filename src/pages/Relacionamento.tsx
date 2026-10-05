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
  const { orgId, canEdit } = useOrg();
  const [status, setStatus] = useState("pendente");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [open, setOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const followups = useQuery(
    api.crm.listFollowups,
    orgId
      ? {
          organizationId: orgId,
          status: status === "all" ? undefined : (status as "pendente" | "em_andamento" | "concluido" | "descartado"),
          onlyOverdue: onlyOverdue || undefined,
        }
      : "skip",
  );
  const feedback = useQuery(api.crm.listFeedback, orgId ? { organizationId: orgId } : "skip");
  const generate = useMutation(api.crm.generateSuggestions);
  const update = useMutation(api.crm.updateFollowup);

  if (!orgId) return <Loading />;

  const rows = followups ?? [];
  const overdue = rows.filter((f) => f.overdue).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Relacionamento"
        title="Follow-ups e avaliações"
        description="Tarefas de relacionamento geradas por inatividade, aniversário, renovação e faltas — além das avaliações dos atendimentos."
        actions={
          canEdit("crm") ? (
            <>
              <Button
                variant="outline"
                className="bg-white/60"
                disabled={suggesting}
                onClick={async () => {
                  setSuggesting(true);
                  try {
                    const res = await generate({ organizationId: orgId });
                    toast.success(`${res} sugestão(ões) criada(s)`, {
                      description: "Tarefas sem duplicidade geradas a partir dos dados dos clientes.",
                    });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Falha ao gerar sugestões");
                  } finally {
                    setSuggesting(false);
                  }
                }}
              >
                <Sparkles className="size-4" />
                {suggesting ? "Analisando…" : "Gerar sugestões"}
              </Button>
              <Button variant="outline" className="bg-white/60" onClick={() => setFeedbackOpen(true)}>
                <Star className="size-4" /> Nova avaliação
              </Button>
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" /> Novo follow-up
              </Button>
            </>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tarefas abertas"
          value={rows.filter((f) => f.status === "pendente" || f.status === "em_andamento").length}
          icon={Repeat}
        />
        <StatCard label="Atrasadas" value={overdue} tone="danger" icon={AlertCircle} />
        <StatCard
          label="Avaliação média"
          value={(feedback?.average ?? 0).toFixed(1)}
          hint={`${feedback?.count ?? 0} avaliação(ões)`}
          icon={Star}
          tone="positive"
        />
        <StatCard
          label="Avaliações baixas (1–2)"
          value={
            (feedback?.distribution ?? []).filter((d) => d.rating <= 2).reduce((s, d) => s + d.count, 0)
          }
          tone="warning"
        />
      </div>

      <Tabs defaultValue="followups" className="glass rounded-2xl p-5">
        <TabsList className="glass-chip">
          <TabsTrigger value="followups">Follow-ups</TabsTrigger>
          <TabsTrigger value="feedback">Avaliações</TabsTrigger>
        </TabsList>

        <TabsContent value="followups" className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="glass-input w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendentes</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="concluido">Concluídos</SelectItem>
                <SelectItem value="descartado">Descartados</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={onlyOverdue ? "default" : "outline"}
              size="sm"
              className={onlyOverdue ? "" : "bg-white/60"}
              onClick={() => setOnlyOverdue((v) => !v)}
            >
              <AlertCircle className="size-3.5" /> Só atrasadas
            </Button>
          </div>

          {!followups ? (
            <Loading />
          ) : rows.length === 0 ? (
            <EmptyState
              title="Nenhum follow-up nesta visão"
              description="Use “Gerar sugestões” para criar tarefas automáticas de relacionamento."
              icon={Repeat}
            />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {rows.map((f) => (
                <li key={f._id} className="flex flex-wrap items-center gap-3 rounded-xl glass-chip px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/app/clientes/${f.clientId}`}
                        className="truncate text-[13px] font-medium text-foreground hover:underline"
                      >
                        {f.clientName}
                      </Link>
                      <Tone className={PRIORITY_TONES[f.priority] ?? "glass-chip"}>
                        {f.priority}
                      </Tone>
                      <Tone className="border-primary/25 bg-primary/10 text-primary">
                        {REASON_LABELS[f.reason] ?? f.reason}
                      </Tone>
                      {f.overdue ? (
                        <Tone className="border-rose-200 bg-rose-100 text-rose-600">atrasada</Tone>
                      ) : null}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {f.title}
                      {f.notes ? ` · ${f.notes}` : ""}
                    </span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    prazo {fmtDate(f.dueDate)}
                  </span>
                  {f.clientPhone ? (
                    <a
                      href={whatsappLink(
                        f.clientPhone,
                        `Olá ${f.clientName}! ${f.title}`,
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
                  {canEdit("crm") ? (
                    <div className="flex gap-0.5">
                      {f.status !== "concluido" ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Concluir"
                            onClick={async () => {
                              await update({
                                organizationId: orgId,
                                followupId: f._id,
                                status: "concluido",
                              });
                              toast.success("Follow-up concluído");
                            }}
                          >
                            <Check className="size-3.5" />
                          </Button>
                          {f.status === "pendente" ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Iniciar"
                              onClick={async () => {
                                await update({
                                  organizationId: orgId,
                                  followupId: f._id,
                                  status: "em_andamento",
                                });
                              }}
                            >
                              <ThumbsUp className="size-3.5" />
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Descartar"
                        onClick={async () => {
                          await update({
                            organizationId: orgId,
                            followupId: f._id,
                            status: "descartado",
                          });
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
        </TabsContent>

        <TabsContent value="feedback" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div>
              {(feedback?.feedback.length ?? 0) === 0 ? (
                <EmptyState title="Nenhuma avaliação registrada" icon={Star} />
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {(feedback?.feedback ?? []).map((f) => (
                    <li key={f._id} className="rounded-xl glass-chip px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`size-3 ${i < Math.round(f.rating) ? "fill-amber-400 text-amber-400" : "text-amber-200"}`}
                            />
                          ))}
                        </span>
                        <Link
                          to={`/app/clientes/${f.clientId}`}
                          className="text-[13px] font-medium text-foreground hover:underline"
                        >
                          {f.clientName}
                        </Link>
                        <span className="text-[11px] text-muted-foreground">
                          {f.serviceName} · {f.barberName}
                        </span>
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {fmtDate(f.date)}
                        </span>
                      </div>
                      {f.comment ? (
                        <p className="mt-1 text-xs text-foreground/80">“{f.comment}”</p>
                      ) : null}
                      {f.internalNotes ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Nota interna: {f.internalNotes}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <section className="glass-chip rounded-2xl p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Distribuição
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {(feedback?.distribution ?? []).map((d) => (
                    <li key={d.rating} className="flex items-center gap-2 text-[13px]">
                      <span className="w-8 text-foreground">{d.rating}★</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/70">
                        <div
                          className="h-full rounded-full bg-amber-400"
                          style={{
                            width: `${
                              feedback && feedback.count > 0 ? (d.count / feedback.count) * 100 : 0
                            }%`,
                          }}
                        />
                      </div>
                      <span className="w-6 text-right text-xs text-muted-foreground">{d.count}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="glass-chip rounded-2xl p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Melhores avaliações
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {(feedback?.byBarber ?? []).slice(0, 5).map((b) => (
                    <li key={b.barberId} className="flex items-center gap-2 text-[13px]">
                      <span className="min-w-0 flex-1 truncate text-foreground">{b.barberName}</span>
                      <span className="tabular-nums text-muted-foreground">{b.average.toFixed(1)}★</span>
                      <span className="text-[11px] text-muted-foreground">({b.count})</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="glass-chip rounded-2xl p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Por serviço
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {(feedback?.byService ?? []).slice(0, 5).map((s) => (
                    <li key={s.serviceId} className="flex items-center gap-2 text-[13px]">
                      <span className="min-w-0 flex-1 truncate text-foreground">{s.serviceName}</span>
                      <span className="tabular-nums text-muted-foreground">{s.average.toFixed(1)}★</span>
                      <span className="text-[11px] text-muted-foreground">({s.count})</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <FollowupDialog
        open={open}
        onOpenChange={setOpen}
        onSaved={() => {
          setOpen(false);
          toast.success("Follow-up criado");
        }}
      />
      <FeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        onSaved={() => {
          setFeedbackOpen(false);
          toast.success("Avaliação registrada");
        }}
      />
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