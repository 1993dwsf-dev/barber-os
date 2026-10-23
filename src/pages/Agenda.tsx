import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ListPlus,
  MessageCircle,
  Phone,
  Trash2,
  UserX,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
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
import { EmptyState, Loading, PageHeader, SectionTitle, Tone } from "@/components/glass";
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_TONES,
  WEEKDAY_LABELS,
  brl,
  fmtDate,
  fmtPhone,
  whatsappLink,
} from "@/lib/format";
import { addDaysISO, todayISO, weekdayOf } from "@/lib/dates";
import { useOrg } from "@/lib/org-context";
import { cn } from "@/lib/utils";

type AgendaRow = {
  _id: Id<"appointments">;
  date: string;
  startTime: string;
  durationMin: number;
  priceCents: number;
  status: string;
  notes?: string;
  clientName: string;
  clientPhone: string;
  barberName: string;
  barberColor: string;
  serviceName: string;
  saleId?: Id<"sales">;
};

export default function Agenda() {
  const { orgId, canEdit } = useOrg();
  const [date, setDate] = useState(todayISO());
  const [barberId, setBarberId] = useState<string>("all");
  const [open, setOpen] = useState(false);

  const barbers = useQuery(api.barbers.list, orgId ? { organizationId: orgId } : "skip");
  const services = useQuery(api.services.list, orgId ? { organizationId: orgId } : "skip");
  const clients = useQuery(
    api.clients.list,
    orgId ? { organizationId: orgId, limit: 300, sort: "nome" } : "skip",
  );
  const waitlist = useQuery(
    api.appointments.listWaitlist,
    orgId ? { organizationId: orgId } : "skip",
  );
  const [clientQuery, setClientQuery] = useState("");
  const filteredClients = useQuery(
    api.clients.list,
    orgId && clientQuery.trim().length >= 2
      ? {
          organizationId: orgId,
          search: clientQuery.trim(),
          limit: 12,
          sort: "nome",
        }
      : "skip",
  );

  const rows = useQuery(
    api.appointments.agenda,
    orgId
      ? {
          organizationId: orgId,
          from: addDaysISO(date, -3),
          to: addDaysISO(date, 7),
          barberId: barberId !== "all" && barberId ? (barberId as Id<"barbers">) : undefined,
        }
      : "skip",
  );

  const setStatus = useMutation(api.appointments.setStatus);
  const addToWaitlist = useMutation(api.appointments.addToWaitlist);
  const updateWaitlist = useMutation(api.appointments.updateWaitlist);

  const dayRows = useMemo(
    () => (rows ?? []).filter((r) => r.date === date),
    [rows, date],
  );

  const week = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysISO(date, i)),
    [date],
  );

  if (!orgId) return <Loading />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Operação"
        title="Agenda"
        description="Organize os atendimentos e encaminhe a cobrança ao PDV. Cada agendamento gera somente uma venda vinculada."
        actions={
          canEdit("agenda") ? (
            <Button onClick={() => setOpen(true)}>
              <CalendarPlus className="size-4" /> Novo agendamento
            </Button>
          ) : null
        }
      />

      {/* Controles */}
      <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setDate(addDaysISO(date, -1))} aria-label="Dia anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || todayISO())}
            className="glass-input w-40"
          />
          <Button variant="ghost" size="icon" onClick={() => setDate(addDaysISO(date, 1))} aria-label="Próximo dia">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="sm" className="bg-white/60" onClick={() => setDate(todayISO())}>
            Hoje
          </Button>
        </div>

        <Select value={barberId} onValueChange={setBarberId}>
          <SelectTrigger className="glass-input w-48">
            <SelectValue placeholder="Todos os barbeiros" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os barbeiros</SelectItem>
            {(barbers ?? []).map((b) => (
              <SelectItem key={b._id} value={b._id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <p className="ml-auto text-sm text-muted-foreground">
          {fmtDate(date)} · {WEEKDAY_LABELS[weekdayOf(date)]}
        </p>
      </div>

      {/* Semana */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {week.map((d) => {
          const count = (rows ?? []).filter(
            (r) => r.date === d && r.status !== "cancelado",
          ).length;
          const isToday = d === todayISO();
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDate(d)}
              className={cn(
                "glass glass-interactive rounded-xl px-1 py-2.5 text-center transition-all",
                date === d ? "ring-2 ring-primary/60" : "",
              )}
            >
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {WEEKDAY_LABELS[weekdayOf(d)]}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-base font-semibold tabular-nums",
                  isToday ? "text-primary" : "text-foreground",
                )}
              >
                {d.slice(8, 10)}
              </p>
              <p className="text-[10px] text-muted-foreground">{count} atend.</p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        {/* Timeline do dia */}
        <section className="glass rounded-2xl">
          <SectionTitle
            title={`Atendimentos de ${fmtDate(date)}`}
            hint={`${dayRows.length} registro(s)`}
          />
          <div className="px-5 pb-5">
            {dayRows.length === 0 ? (
              <EmptyState
                title="Dia livre na agenda"
                description="Crie um agendamento ou mova um cliente da lista de espera."
                icon={Clock}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {dayRows.map((a) => (
                  <AppointmentCard
                    key={a._id}
                    row={a}
                    canEdit={canEdit("agenda")}
                    canCharge={canEdit("pos")}
                    onStatus={(status) =>
                      setStatus({ organizationId: orgId, appointmentId: a._id, status })
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Lista de espera */}
        <section className="glass rounded-2xl">
          <SectionTitle title="Lista de espera" hint="Clientes sem horário disponível" />
          <div className="px-5 pb-5">
            {(waitlist ?? []).filter((w) => w.status === "aguardando").length === 0 ? (
              <EmptyState
                title="Ninguém na espera"
                description="Quando um horário estiver lotado, coloque o cliente aqui para retomar depois."
                icon={ListPlus}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {(waitlist ?? [])
                  .filter((w) => w.status === "aguardando")
                  .map((w) => (
                    <li key={w._id} className="rounded-xl glass-chip px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                          {w.clientName}
                        </span>
                        <Badge variant="secondary" className="rounded-full text-[10px]">
                          {w.serviceName}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {w.barberName !== "—" ? `${w.barberName} · ` : ""}
                        {w.preferredDate ? `prefere ${fmtDate(w.preferredDate)}` : "sem preferência de data"}
                      </p>
                      {canEdit("agenda") ? (
                        <div className="mt-2 flex gap-1.5">
                          {w.clientPhone ? (
                            <a
                              href={whatsappLink(
                                w.clientPhone,
                                `Olá ${w.clientName}! Conseguimos um horário para você na barbearia.`,
                              )}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Button variant="outline" size="sm" className="bg-white/60">
                                <MessageCircle className="size-3.5" /> Avisar
                              </Button>
                            </a>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void updateWaitlist({
                                organizationId: orgId,
                                waitlistId: w._id,
                                status: "atendido",
                              })
                            }
                          >
                            <Check className="size-3.5" /> Atendido
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void updateWaitlist({
                                organizationId: orgId,
                                waitlistId: w._id,
                                status: "cancelado",
                              })
                            }
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
      </div>

      <NewAppointmentDialog
        open={open}
        onOpenChange={setOpen}
        date={date}
        barberId={barberId !== "all" ? barberId : undefined}
        barbers={barbers ?? []}
        services={services ?? []}
        clientOptions={(filteredClients?.clients ?? clients?.clients ?? []).map((c) => ({
          id: c._id,
          name: c.name,
          phone: c.phone,
        }))}
        clientQuery={clientQuery}
        setClientQuery={setClientQuery}
        onCreated={() => {
          setOpen(false);
          toast.success("Agendamento criado");
        }}
        onWaitlist={async (payload) => {
          await addToWaitlist({ organizationId: orgId, ...payload });
          toast.success("Cliente adicionado à lista de espera");
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AppointmentCard({
  row,
  canEdit,
  canCharge,
  onStatus,
}: {
  row: AgendaRow;
  canEdit: boolean;
  canCharge: boolean;
  onStatus: (status: "confirmado" | "em_atendimento" | "cancelado" | "falta") => void;
}) {

  return (
    <li className="rounded-xl glass-chip p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-14 shrink-0 text-base font-semibold tabular-nums text-foreground">
          {row.startTime}
        </span>
        <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: row.barberColor }} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{row.clientName}</span>
            <Tone className={APPOINTMENT_STATUS_TONES[row.status] ?? "glass-chip"}>
              {APPOINTMENT_STATUS_LABELS[row.status] ?? row.status}
            </Tone>
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {row.serviceName} · {row.barberName} · {row.durationMin} min
          </span>
        </span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {brl(row.priceCents)}
        </span>
      </div>

      {row.notes ? (
        <p className="mt-2 rounded-lg bg-white/50 px-2.5 py-1.5 text-xs text-muted-foreground">
          {row.notes}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <a href={whatsappLink(row.clientPhone, `Olá ${row.clientName}! Confirmamos seu horário?`)} target="_blank" rel="noreferrer">
          <Button variant="ghost" size="sm" className="h-8 text-xs">
            <MessageCircle className="size-3.5" /> Confirmar
          </Button>
        </a>
        {row.clientPhone ? (
          <a href={`tel:${row.clientPhone.replace(/\D/g, "")}`}>
            <Button variant="ghost" size="sm" className="h-8 text-xs">
              <Phone className="size-3.5" /> {fmtPhone(row.clientPhone)}
            </Button>
          </a>
        ) : null}

        {canEdit && row.status !== "concluido" && row.status !== "cancelado" ? (
          <>
            {row.status === "agendado" ? (
              <Button variant="outline" size="sm" className="h-8 bg-white/60 text-xs" onClick={() => onStatus("confirmado")}>
                <Check className="size-3.5" /> Confirmar
              </Button>
            ) : null}
            {row.status === "confirmado" ? (
              <Button variant="outline" size="sm" className="h-8 bg-white/60 text-xs" onClick={() => onStatus("em_atendimento")}>
                Iniciar atendimento
              </Button>
            ) : null}
            {canCharge ? (
              <Button size="sm" className="h-8 text-xs" asChild>
                <Link to={`/app/pdv?appointmentId=${row._id}`}>Cobrar no PDV</Link>
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onStatus("falta")}>
              <UserX className="size-3.5" /> Falta
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onStatus("cancelado")}>
              <Trash2 className="size-3.5" /> Cancelar
            </Button>
          </>
        ) : null}
      </div>

      {row.status === "concluido" && row.saleId ? (
        <p className="mt-2 text-xs text-emerald-700">
          Atendimento concluído e registrado no PDV.
        </p>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ */

function NewAppointmentDialog({
  open,
  onOpenChange,
  date,
  barberId,
  barbers,
  services,
  clientOptions,
  clientQuery,
  setClientQuery,
  onCreated,
  onWaitlist,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: string;
  barberId?: string;
  barbers: {
    _id: Id<"barbers">;
    name: string;
    schedule: { weekday: number; enabled: boolean; start: string; end: string }[];
  }[];
  services: { _id: Id<"services">; name: string; durationMin: number; priceCents: number }[];
  clientOptions: { id: Id<"clients">; name: string; phone: string }[];
  clientQuery: string;
  setClientQuery: (v: string) => void;
  onCreated: () => void;
  onWaitlist: (payload: {
    clientId: Id<"clients">;
    serviceId?: Id<"services">;
    barberId?: Id<"barbers">;
    preferredDate?: string;
    notes?: string;
  }) => Promise<void>;
}) {
  const { orgId } = useOrg();
  const create = useMutation(api.appointments.create);
  const [clientId, setClientId] = useState("");
  const [selectedBarber, setSelectedBarber] = useState(barberId ?? "");
  const [serviceId, setServiceId] = useState("");
  const [day, setDay] = useState(date);
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<"balcao" | "whatsapp" | "telefone" | "online" | "indicacao">("balcao");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedBarberProfile = barbers.find((b) => b._id === selectedBarber);
  const schedule = selectedBarberProfile?.schedule ?? [];
  const todaySchedule = schedule.find((d) => d.weekday === weekdayOf(day));
  const slots = todaySchedule?.enabled
    ? buildSlots(todaySchedule.start, todaySchedule.end)
    : Array.from({ length: 24 * 4 }, (_, i) => {
        const h = Math.floor(i / 4);
        const m = (i % 4) * 15;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      });

  async function submit() {
    if (!orgId) return;
    if (!clientId || !selectedBarber || !serviceId) {
      setError("Escolha cliente, barbeiro e serviço.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await create({
        organizationId: orgId,
        clientId: clientId as Id<"clients">,
        barberId: selectedBarber as Id<"barbers">,
        serviceId: serviceId as Id<"services">,
        date: day,
        startTime: time,
        notes: notes || undefined,
        source,
      });
      setNotes("");
      setError(null);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível agendar.");
    } finally {
      setBusy(false);
    }
  }

  async function submitWaitlist() {
    if (!orgId || !clientId) {
      setError("Escolha um cliente antes de adicionar à espera.");
      return;
    }
    await onWaitlist({
      clientId: clientId as Id<"clients">,
      serviceId: serviceId ? (serviceId as Id<"services">) : undefined,
      barberId: selectedBarber ? (selectedBarber as Id<"barbers">) : undefined,
      preferredDate: day,
      notes: notes || undefined,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo agendamento</DialogTitle>
          <DialogDescription>
            O sistema valida o horário de funcionamento e bloqueia conflitos na agenda do
            barbeiro.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div>
            <Label>Cliente</Label>
            <Input
              className="glass-input mt-1.5"
              placeholder="Busque pelo nome ou telefone"
              value={clientQuery}
              onChange={(e) => setClientQuery(e.target.value)}
            />
            <div className="scrollbar-slim mt-2 max-h-40 overflow-y-auto rounded-xl border border-white/70 bg-white/50 p-1">
              {clientOptions.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  {clientQuery.length >= 2 ? "Nenhum cliente encontrado." : "Digite para buscar."}
                </p>
              ) : (
                clientOptions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setClientId(c.id);
                      setClientQuery(c.name);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-accent/70",
                      clientId === c.id ? "bg-primary/12 font-medium text-primary" : "text-foreground",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="text-[11px] text-muted-foreground">{fmtPhone(c.phone)}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Barbeiro</Label>
              <Select value={selectedBarber} onValueChange={setSelectedBarber}>
                <SelectTrigger className="glass-input mt-1.5">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {barbers.map((b) => (
                    <SelectItem key={b._id} value={b._id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Serviço</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger className="glass-input mt-1.5">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name} — {brl(s.priceCents)} · {s.durationMin}min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" className="glass-input mt-1.5" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
            <div>
              <Label>Horário</Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger className="glass-input mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {slots.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Origem</Label>
              <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
                <SelectTrigger className="glass-input mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balcao">Balcão</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="telefone">Telefone</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="indicacao">Indicação</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea
              className="glass-input mt-1.5"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Preferências, observações do atendimento…"
            />
          </div>

          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="bg-white/60" onClick={submitWaitlist} disabled={busy}>
            <ListPlus className="size-4" /> Salvar na lista de espera
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Salvando…" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function buildSlots(start: string, end: string): string[] {
  const out: string[] = [];
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let minutes = sh * 60 + (sm || 0);
  const endMinutes = eh * 60 + (em || 0);
  while (minutes <= endMinutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    minutes += 15;
  }
  return out;
}