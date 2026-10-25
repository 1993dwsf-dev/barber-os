import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, HandCoins, Wallet } from "lucide-react";
import { useOrg } from "@/lib/org-context";
import { brl, fmtDate } from "@/lib/format";
import { todayISO } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/glass";

const STATUS: Record<string, string> = {
  agendado: "Agendado", confirmado: "Confirmado", em_atendimento: "Em atendimento",
  concluido: "Concluído", cancelado: "Cancelado", falta: "Falta",
};
const COMMISSION: Record<string, string> = {
  pendente: "Pendente", aprovada: "Aprovada", paga: "Paga",
};

export default function BarberWorkspace() {
  const { orgId } = useOrg();
  const [busy, setBusy] = useState<string | null>(null);
  const data = useQuery(api.barberPortal.myWorkspace,
    orgId ? { organizationId: orgId } : "skip");
  const update = useMutation(api.barberPortal.updateMyAppointment);

  if (!data || !orgId) return <Loading label="Carregando seu espaço" />;
  if (!data.linked) return (
    <section className="glass rounded-2xl p-7">
      <h1 className="text-xl font-semibold">Seu acesso foi criado</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        O proprietário de {data.organizationName} precisa vincular sua conta ao cadastro
        profissional em Configurações → Equipe → Vincular barbeiro.
        Até isso acontecer, nenhum atendimento ou valor será mostrado.
      </p>
    </section>
  );

  const today = todayISO();
  const todayAppointments = data.appointments.filter(a => a.date === today);
  const completed = data.appointments.filter(a => a.status === "concluido");
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-primary">{data.organizationName}</p>
        <h1 className="mt-1 text-2xl font-semibold">Meu espaço · {data.profile.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aqui você acompanha somente seus atendimentos e suas comissões.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Atendimentos hoje", value: String(todayAppointments.length), icon: CalendarDays },
          { title: "Concluídos no período", value: String(completed.length), icon: CheckCircle2 },
          { title: "Comissões pendentes (30 dias)", value: brl(data.totals.pendingCents), icon: HandCoins },
          { title: "Comissões pagas (30 dias)", value: brl(data.totals.paidCents), icon: Wallet },
        ].map(item => (
          <div key={item.title} className="glass rounded-2xl p-4">
            <item.icon className="mb-3 size-5 text-primary" />
            <p className="text-xs text-muted-foreground">{item.title}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{item.value}</p>
          </div>
        ))}
      </div>
      <section className="glass rounded-2xl p-5">
        <h2 className="text-base font-semibold">Minha agenda</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Atendimentos de 7 dias atrás até os próximos 30 dias
        </p>
        {data.appointments.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">Nenhum atendimento neste período.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {data.appointments.map(a => (
              <div className="glass-chip flex flex-wrap items-center gap-3 rounded-xl p-3" key={a.id}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.clientName} · {a.serviceName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmtDate(a.date)} às {a.startTime} · {a.durationMin} minutos
                  </p>
                </div>
                <Badge variant="secondary">{STATUS[a.status] ?? a.status}</Badge>
                {a.status === "agendado" || a.status === "confirmado" ? (
                  <Button size="sm" variant="outline" disabled={busy === a.id}
                    onClick={async () => {
                      setBusy(a.id);
                      try {
                        await update({
                          organizationId: orgId,
                          appointmentId: a.id,
                          status: a.status === "agendado" ? "confirmado" : "em_atendimento",
                        });
                        toast.success("Atendimento atualizado");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Falha ao atualizar");
                      } finally { setBusy(null); }
                    }}
                  >{a.status === "agendado" ? "Confirmar" : "Iniciar"}</Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Conclusão e cobrança permanecem exclusivas do PDV da barbearia.
        </p>
      </section>
      <section className="glass rounded-2xl p-5">
        <h2 className="text-base font-semibold">Minhas comissões</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Últimos 30 dias · Total {brl(data.totals.totalCents)}
        </p>
        {data.commissions.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">Sem comissões neste período.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {data.commissions.map(c => (
              <li key={c.id} className="glass-chip flex flex-wrap items-center gap-3 rounded-xl p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{c.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{fmtDate(c.date)} · {COMMISSION[c.status] ?? c.status}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{brl(c.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
