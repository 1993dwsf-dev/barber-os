import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  Percent,
  Plus,
  Scissors,
  TrendingUp,
  UserRound,
  UsersRound,
} from "lucide-react";
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
import { EmptyState, Loading, PageHeader, StatCard, Tone } from "@/components/glass";
import { WEEKDAY_LABELS, brl, fmtDate, fmtPhone, initials } from "@/lib/format";
import { monthRange, todayISO } from "@/lib/dates";
import { useOrg } from "@/lib/org-context";

type Schedule = { weekday: number; enabled: boolean; start: string; end: string };

const DEFAULT_SCHEDULE: Schedule[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  enabled: weekday >= 1 && weekday <= 6,
  start: "09:00",
  end: weekday === 6 ? "18:00" : "19:00",
}));

export default function Equipe() {
  const { orgId, canEdit } = useOrg();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Id<"barbers"> | null>(null);

  const period = monthRange(todayISO());
  const barbers = useQuery(
    api.barbers.list,
    orgId ? { organizationId: orgId, includeInactive: true } : "skip",
  );
  const perf = useQuery(
    api.barbers.performance,
    orgId ? { organizationId: orgId, from: period.start, to: period.end } : "skip",
  );

  if (!orgId) return <Loading />;

  const active = (barbers ?? []).filter((b) => b.status === "ativo");
  const totalRevenue = (perf ?? []).reduce((s, p) => s + p.revenueCents, 0);
  const totalPending = (perf ?? []).reduce((s, p) => s + p.pendingCommissionCents, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Equipe"
        title="Barbeiros"
        description="Cada profissional tem agenda, modelo de comissão próprio e histórico de desempenho calculado a partir das vendas reais."
        actions={
          canEdit("team") ? (
            <Button onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="size-4" /> Novo barbeiro
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Equipe ativa" value={active.length} icon={UsersRound} />
        <StatCard
          label="Receita do mês"
          value={brl(totalRevenue)}
          icon={TrendingUp}
          tone="positive"
          hint="Somente vendas com barbeiro vinculado"
        />
        <StatCard
          label="Comissões em aberto"
          value={brl(totalPending)}
          icon={Percent}
          tone="warning"
        />
        <StatCard
          label="Férias / inativos"
          value={(barbers ?? []).filter((b) => b.status !== "ativo").length}
          tone="neutral"
        />
      </div>

      <section className="glass rounded-2xl">
        <div className="px-5 py-4">
          {!barbers || !perf ? (
            <Loading />
          ) : barbers.length === 0 ? (
            <EmptyState
              title="Nenhum barbeiro cadastrado"
              description="Cadastre a equipe para começar a montar a agenda."
              icon={UserRound}
              action={
                canEdit("team") ? (
                  <Button onClick={() => setOpen(true)}>
                    <Plus className="size-4" /> Cadastrar barbeiro
                  </Button>
                ) : null
              }
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {barbers.map((b) => {
                const p = perf.find((x) => x.barber._id === b._id);
                return (
                  <li key={b._id} className="glass-chip rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                      <span
                        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-xs font-semibold text-white"
                        style={{ background: b.color ?? "#64748b" }}
                      >
                        {initials(b.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/app/barbeiros/${b._id}`}
                            className="truncate text-sm font-semibold text-foreground hover:underline"
                          >
                            {b.name}
                          </Link>
                          <Tone
                            className={
                              b.status === "ativo"
                                ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                                : b.status === "ferias"
                                  ? "border-amber-200 bg-amber-100 text-amber-700"
                                  : "border-zinc-200 bg-zinc-100 text-zinc-600"
                            }
                          >
                            {b.status}
                          </Tone>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {b.jobTitle ?? "Barbeiro"}
                          {b.phone ? ` · ${fmtPhone(b.phone)}` : ""}
                        </p>
                        {b.hireDate ? (
                          <p className="text-[11px] text-muted-foreground">
                            Na equipe desde {fmtDate(b.hireDate)}
                          </p>
                        ) : null}
                      </div>
                      {canEdit("team") ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(b._id);
                            setOpen(true);
                          }}
                        >
                          Editar
                        </Button>
                      ) : null}
                    </div>

                    {p ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          { label: "Atendimentos", value: String(p.completed) },
                          { label: "Receita", value: brl(p.revenueCents) },
                          { label: "Comissão", value: brl(p.commissionCents) },
                          { label: "Conclusão", value: `${p.completionRate}%` },
                        ].map((m) => (
                          <div key={m.label} className="rounded-xl bg-white/55 px-2.5 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {m.label}
                            </p>
                            <p className="text-[13px] font-semibold tabular-nums text-foreground">
                              {m.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <Badge variant="secondary" className="rounded-full">
                        Comissão:{" "}
                        {b.commissionModel === "percentual"
                          ? `${b.commissionValue ?? 0}%`
                          : b.commissionModel === "fixo"
                            ? `${brl(b.commissionValue ?? 0)} fixo`
                            : "herda da barbearia"}
                      </Badge>
                      <span className="flex items-center gap-1">
                        <CalendarClock className="size-3" />
                        {b.schedule.filter((d) => d.enabled).length} dia(s) de atendimento
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <BarberDialog
        open={open}
        onOpenChange={setOpen}
        barberId={editing}
        onSaved={() => {
          setOpen(false);
          toast.success("Barbeiro salvo");
        }}
      />
    </div>
  );
}

function BarberDialog({
  open,
  onOpenChange,
  barberId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  barberId: Id<"barbers"> | null;
  onSaved: () => void;
}) {
  const { orgId, org } = useOrg();
  const existing = useQuery(
    api.barbers.list,
    orgId && barberId ? { organizationId: orgId, includeInactive: true } : "skip",
  );
  const create = useMutation(api.barbers.create);
  const update = useMutation(api.barbers.update);
  const current = existing?.find((b) => b._id === barberId);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("Barbeiro");
  const [hireDate, setHireDate] = useState("");
  const [model, setModel] = useState<"herdar" | "percentual" | "fixo">("herdar");
  const [value, setValue] = useState("");
  const [color, setColor] = useState("#2563a8");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"ativo" | "inativo" | "ferias">("ativo");
  const [schedule, setSchedule] = useState<Schedule[]>(DEFAULT_SCHEDULE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Carrega os dados existentes ao abrir para edição.
  if (current && loadedFor !== current._id) {
    setLoadedFor(current._id);
    setName(current.name);
    setPhone(current.phone ?? "");
    setJobTitle(current.jobTitle ?? "Barbeiro");
    setHireDate(current.hireDate ?? "");
    setModel(current.commissionModel);
    setValue(current.commissionValue?.toString() ?? "");
    setColor(current.color ?? "#2563a8");
    setNotes(current.notes ?? "");
    setStatus(current.status);
    setSchedule(current.schedule);
  }

  async function submit() {
    if (!orgId) return;
    if (name.trim().length < 2) {
      setError("Informe o nome do barbeiro.");
      return;
    }
    setBusy(true);
    setError(null);
    const commissionValue = value.trim() ? Number(value.replace(",", ".")) : undefined;
    const payload = {
      name: name.trim(),
      phone: phone || undefined,
      jobTitle: jobTitle || undefined,
      hireDate: hireDate || undefined,
      commissionModel: model,
      commissionValue: model === "herdar" ? undefined : commissionValue,
      schedule,
      color,
      notes: notes || undefined,
    };
    try {
      if (barberId) {
        await update({ organizationId: orgId, barberId, ...payload, status });
      } else {
        await create({ organizationId: orgId, ...payload });
      }
      onSaved();
      setLoadedFor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{barberId ? "Editar barbeiro" : "Novo barbeiro"}</DialogTitle>
          <DialogDescription>
            A agenda e a comissão deste profissional alimentam os relatórios e o cálculo
            automático de comissões.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Nome</Label>
              <Input className="glass-input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Função</Label>
              <Input
                className="glass-input mt-1.5"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Barbeiro, Master, Colorista…"
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input className="glass-input mt-1.5" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label>Data de admissão</Label>
              <Input
                className="glass-input mt-1.5"
                type="date"
                value={hireDate}
                onChange={(e) => setHireDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Modelo de comissão</Label>
              <Select value={model} onValueChange={(v) => setModel(v as typeof model)}>
                <SelectTrigger className="glass-input mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="herdar">Herdar da barbearia</SelectItem>
                  <SelectItem value="percentual">Percentual</SelectItem>
                  <SelectItem value="fixo">Valor fixo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>
                {model === "percentual" ? "% sobre o serviço" : "Valor fixo (R$)"}
              </Label>
              <Input
                className="glass-input mt-1.5"
                disabled={model === "herdar"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                placeholder={model === "percentual" ? String(org?.settings.defaultCommissionValue ?? 40) : "0,00"}
              />
            </div>
            <div>
              <Label>Cor na agenda</Label>
              <Input
                className="glass-input mt-1.5"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
          </div>

          {barberId ? (
            <div>
              <Label>Situação</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger className="glass-input mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="ferias">Férias</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div>
            <Label className="flex items-center gap-1.5">
              <Scissors className="size-3.5" /> Horários de atendimento
            </Label>
            <div className="mt-2 grid gap-2">
              {schedule.map((d, i) => (
                <div key={d.weekday} className="flex items-center gap-3 rounded-xl glass-chip px-3 py-1.5">
                  <Switch
                    checked={d.enabled}
                    onCheckedChange={(v) =>
                      setSchedule(schedule.map((s, j) => (i === j ? { ...s, enabled: v } : s)))
                    }
                  />
                  <span className="w-20 text-xs text-foreground">{WEEKDAY_LABELS[d.weekday]}</span>
                  <Input
                    type="time"
                    className="glass-input h-8 w-28"
                    disabled={!d.enabled}
                    value={d.start}
                    onChange={(e) =>
                      setSchedule(schedule.map((s, j) => (i === j ? { ...s, start: e.target.value } : s)))
                    }
                  />
                  <Input
                    type="time"
                    className="glass-input h-8 w-28"
                    disabled={!d.enabled}
                    value={d.end}
                    onChange={(e) =>
                      setSchedule(schedule.map((s, j) => (i === j ? { ...s, end: e.target.value } : s)))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea className="glass-input mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Salvando…" : barberId ? "Salvar alterações" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}