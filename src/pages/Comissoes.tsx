import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { BadgeCheck, Banknote, Check, Download, Percent, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, Loading, PageHeader, SectionTitle, StatCard, Tone } from "@/components/glass";
import { brl, downloadCSV, fmtDate, toCSV } from "@/lib/format";
import { monthRange, todayISO } from "@/lib/dates";
import { useOrg } from "@/lib/org-context";

const STATUS_TONES: Record<string, string> = {
  pendente: "border-amber-200 bg-amber-100 text-amber-700",
  aprovada: "border-sky-200 bg-sky-100 text-sky-700",
  paga: "border-emerald-200 bg-emerald-100 text-emerald-700",
};

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  paga: "Paga",
};

export default function Comissoes() {
  const { orgId, canEdit } = useOrg();
  const initial = monthRange(todayISO());
  const [from, setFrom] = useState(initial.start);
  const [to, setTo] = useState(initial.end);
  const [barberId, setBarberId] = useState("all");
  const [status, setStatus] = useState("all");

  const data = useQuery(
    api.commissions.list,
    orgId
      ? {
          organizationId: orgId,
          from,
          to,
          barberId: barberId !== "all" ? (barberId as Id<"barbers">) : undefined,
          status: status !== "all" ? (status as "pendente" | "aprovada" | "paga") : undefined,
          limit: 400,
        }
      : "skip",
  );
  const statements = useQuery(
    api.commissions.statements,
    orgId ? { organizationId: orgId, from, to } : "skip",
  );
  const barbers = useQuery(api.barbers.list, orgId ? { organizationId: orgId } : "skip");
  const approve = useMutation(api.commissions.approve);
  const pay = useMutation(api.commissions.pay);
  const payPeriod = useMutation(api.commissions.payPeriod);

  if (!orgId) return <Loading />;

  const rows = data?.commissions ?? [];
  const totals = data?.totals;

  function exportCsv() {
    downloadCSV(
      `comissoes-${from}_a_${to}.csv`,
      toCSV(
        ["Data", "Barbeiro", "Descrição", "Modelo", "Base", "Valor", "Status", "Pagamento"],
        rows.map((c) => [
          fmtDate(c.date),
          c.barberName,
          c.description,
          c.modelLabel,
          (c.baseCents / 100).toFixed(2).replace(".", ","),
          (c.amountCents / 100).toFixed(2).replace(".", ","),
          STATUS_LABELS[c.status] ?? c.status,
          c.paidDate ? fmtDate(c.paidDate) : "",
        ]),
      ),
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Gestão"
        title="Comissões"
        description="Comissões geradas automaticamente a cada venda de serviço, conforme o modelo de cada barbeiro. Aprove, pague por período e exporte."
        actions={
          <>
            <Button variant="outline" className="bg-white/60" onClick={exportCsv}>
              <Download className="size-4" /> CSV
            </Button>
            {canEdit("commissions") ? (
              <Button
                disabled={barberId === "all"}
                title={barberId === "all" ? "Selecione um barbeiro para pagar o período" : undefined}
                onClick={async () => {
                  await payPeriod({
                    organizationId: orgId,
                    barberId: barberId as Id<"barbers">,
                    from,
                    to,
                  });
                  toast.success("Período pago", {
                    description: "As comissões em aberto do barbeiro foram pagas.",
                  });
                }}
              >
                <Banknote className="size-4" /> Pagar período
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
        <Select value={barberId} onValueChange={setBarberId}>
          <SelectTrigger className="glass-input w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda a equipe</SelectItem>
            {(barbers ?? []).map((b) => (
              <SelectItem key={b._id} value={b._id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="glass-input w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
            <SelectItem value="aprovada">Aprovadas</SelectItem>
            <SelectItem value="paga">Pagas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total no período" value={brl(totals?.total ?? 0)} icon={Percent} />
        <StatCard label="Pendentes" value={brl(totals?.pendente ?? 0)} tone="warning" />
        <StatCard label="Aprovadas a pagar" value={brl(totals?.aprovada ?? 0)} />
        <StatCard label="Já pagas" value={brl(totals?.paga ?? 0)} tone="positive" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="glass rounded-2xl">
          <SectionTitle title="Lançamentos" hint={`${rows.length} comissão(ões)`} />
          <div className="px-5 pb-5">
            {!data ? (
              <Loading />
            ) : rows.length === 0 ? (
              <EmptyState
                title="Nenhuma comissão no período"
                description="As comissões são criadas automaticamente quando um serviço é vendido."
                icon={Percent}
              />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {rows.map((c) => (
                  <li key={c._id} className="flex flex-wrap items-center gap-3 rounded-xl glass-chip px-3 py-2.5">
                    <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {fmtDate(c.date)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {c.barberName}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {c.description} · {c.modelLabel} sobre {brl(c.baseCents)}
                      </span>
                    </span>
                    <Tone className={STATUS_TONES[c.status] ?? "glass-chip"}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </Tone>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {brl(c.amountCents)}
                    </span>
                    {canEdit("commissions") ? (
                      <div className="flex gap-0.5">
                        {c.status === "pendente" ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Aprovar"
                            onClick={async () => {
                              await approve({ organizationId: orgId, commissionId: c._id });
                              toast.success("Comissão aprovada");
                            }}
                          >
                            <Check className="size-3.5" />
                          </Button>
                        ) : null}
                        {c.status !== "paga" ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Pagar"
                            onClick={async () => {
                              await pay({ organizationId: orgId, commissionId: c._id });
                              toast.success("Comissão paga");
                            }}
                          >
                            <Wallet className="size-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="glass rounded-2xl">
          <SectionTitle title="Extrato por barbeiro" hint="Consolidado do período" />
          <div className="px-5 pb-5">
            {(statements ?? []).length === 0 ? (
              <EmptyState title="Sem movimento no período" icon={BadgeCheck} />
            ) : (
              <ul className="flex flex-col gap-2">
                {(statements ?? []).map((s) => (
                  <li key={s.barberId} className="rounded-xl glass-chip px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                        {s.barberName}
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums text-foreground">
                        {brl(s.totalCents)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      <span>{s.count} comissão(ões)</span>
                      <span className="text-emerald-600">pago {brl(s.paidCents)}</span>
                      <span className={s.pendingCents > 0 ? "text-amber-600" : ""}>
                        em aberto {brl(s.pendingCents)}
                      </span>
                      {canEdit("commissions") && s.pendingCents > 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-6 text-[11px]"
                          onClick={async () => {
                            await payPeriod({
                              organizationId: orgId,
                              barberId: s.barberId as Id<"barbers">,
                              from,
                              to,
                            });
                            toast.success(`${s.barberName}: período pago`);
                          }}
                        >
                          <Banknote className="size-3" /> Pagar
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}