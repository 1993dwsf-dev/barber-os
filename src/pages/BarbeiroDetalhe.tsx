import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { ArrowLeft, CalendarClock, MessageCircle, Percent, Scissors, TrendingUp } from "lucide-react";
import { Link, useParams } from "react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Loading, PageHeader, SectionTitle, StatCard, Tone } from "@/components/glass";
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_TONES,
  WEEKDAY_LABELS,
  brl,
  fmtDate,
  fmtPhone,
  initials,
  whatsappLink,
} from "@/lib/format";
import { addDaysISO, todayISO } from "@/lib/dates";
import { useOrg } from "@/lib/org-context";

export default function BarbeiroDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { orgId } = useOrg();
  const [from, setFrom] = useState(addDaysISO(todayISO(), -30));
  const [to, setTo] = useState(todayISO());

  const barbers = useQuery(
    api.barbers.list,
    orgId ? { organizationId: orgId, includeInactive: true } : "skip",
  );
  const perf = useQuery(
    api.barbers.performance,
    orgId && id
      ? { organizationId: orgId, barberId: id as Id<"barbers">, from, to }
      : "skip",
  );
  const agenda = useQuery(
    api.appointments.agenda,
    orgId && id ? { organizationId: orgId, from, to, barberId: id as Id<"barbers"> } : "skip",
  );

  if (!orgId || !id) return <Loading />;

  const barber = (barbers ?? []).find((b) => b._id === id);
  const row = (perf ?? []).find((p) => p.barber._id === id);
  if (!barbers) return <Loading />;
  if (!barber) {
    return (
      <EmptyState
        title="Barbeiro não encontrado"
        description="O registro pode ter sido removido desta unidade."
        action={
          <Button asChild variant="outline">
            <Link to="/app/equipe">Voltar para a equipe</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Equipe"
        title={barber.name}
        description={`${barber.jobTitle ?? "Barbeiro"}${barber.hireDate ? ` · desde ${fmtDate(barber.hireDate)}` : ""}`}
        actions={
          <>
            {barber.phone ? (
              <Button asChild variant="outline" className="bg-white/60">
                <a
                  href={whatsappLink(barber.phone, `Olá ${barber.name}!`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="size-4" /> {fmtPhone(barber.phone)}
                </a>
              </Button>
            ) : null}
            <Button asChild variant="ghost">
              <Link to="/app/equipe">
                <ArrowLeft className="size-4" /> Equipe
              </Link>
            </Button>
          </>
        }
      />

      <div className="glass flex flex-wrap items-end gap-3 rounded-2xl p-3">
        <div>
          <span className="text-xs text-muted-foreground">De</span>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="glass-input mt-1 w-40"
          />
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Até</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="glass-input mt-1 w-40"
          />
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Scissors className="size-3.5" />
          {barber.schedule.filter((d) => d.enabled).length} dia(s) de atendimento por semana
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Atendimentos concluídos"
          value={row?.completed ?? 0}
          hint={`${row?.appointments ?? 0} agendado(s) · ${row?.completionRate ?? 0}% concluído`}
          icon={CalendarClock}
        />
        <StatCard
          label="Receita no período"
          value={brl(row?.revenueCents ?? 0)}
          icon={TrendingUp}
          tone="positive"
          hint={`Ticket médio ${brl(row?.averageTicketCents ?? 0)}`}
        />
        <StatCard
          label="Comissões"
          value={brl(row?.commissionCents ?? 0)}
          icon={Percent}
          tone="warning"
          hint={`${brl(row?.pendingCommissionCents ?? 0)} em aberto`}
        />
        <StatCard
          label="Faltas"
          value={row?.noShow ?? 0}
          tone={row && row.noShow > 0 ? "danger" : "neutral"}
          hint={`${row?.cancelled ?? 0} cancelamento(s)`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="glass rounded-2xl">
          <SectionTitle title="Atendimentos do período" hint={`${(agenda ?? []).length} registro(s)`} />
          <div className="px-5 pb-5">
            {(agenda ?? []).length === 0 ? (
              <EmptyState title="Sem atendimentos no período" icon={CalendarClock} />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {(agenda ?? []).slice(0, 60).map((a) => (
                  <li key={a._id} className="flex flex-wrap items-center gap-2 rounded-xl glass-chip px-3 py-2">
                    <span className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {fmtDate(a.date)} {a.startTime}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                      {a.clientName} · {a.serviceName}
                    </span>
                    <Tone className={APPOINTMENT_STATUS_TONES[a.status] ?? "glass-chip"}>
                      {APPOINTMENT_STATUS_LABELS[a.status] ?? a.status}
                    </Tone>
                    <span className="text-xs font-medium tabular-nums text-foreground">
                      {brl(a.priceCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="glass rounded-2xl">
          <SectionTitle title="Ficha do profissional" />
          <div className="px-5 pb-5">
            <div className="mb-4 flex items-center gap-3">
              <span
                className="flex size-12 items-center justify-center rounded-2xl text-sm font-semibold text-white"
                style={{ background: barber.color ?? "#64748b" }}
              >
                {initials(barber.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{barber.name}</p>
                <p className="text-xs text-muted-foreground">{barber.email ?? "Sem e-mail"}</p>
              </div>
            </div>

            <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              Horários
            </p>
            <ul className="flex flex-col gap-1">
              {barber.schedule.map((d) => (
                <li
                  key={d.weekday}
                  className="flex items-center justify-between rounded-lg px-2 py-1 text-xs"
                >
                  <span className={d.enabled ? "text-foreground" : "text-muted-foreground"}>
                    {WEEKDAY_LABELS[d.weekday]}
                  </span>
                  <span className={d.enabled ? "text-foreground" : "text-muted-foreground"}>
                    {d.enabled ? `${d.start} — ${d.end}` : "Fechado"}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-[11px] uppercase tracking-wide text-muted-foreground">
              Comissão
            </p>
            <p className="mt-1 text-sm text-foreground">
              {barber.commissionModel === "percentual"
                ? `${barber.commissionValue ?? 0}% sobre o serviço`
                : barber.commissionModel === "fixo"
                  ? `${brl(barber.commissionValue ?? 0)} por atendimento`
                  : "Herdando o padrão da barbearia"}
            </p>

            {barber.notes ? (
              <>
                <p className="mt-4 text-[11px] uppercase tracking-wide text-muted-foreground">
                  Observações
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-foreground">{barber.notes}</p>
              </>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}