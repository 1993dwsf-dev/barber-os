import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarCheck,
  CalendarClock,
  Cake,
  Info,
  PackageX,
  Percent,
  Receipt,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useMemo } from "react";
import { EmptyState, Loading, PageHeader, SectionTitle, StatCard, Tone } from "@/components/glass";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { APPOINTMENT_STATUS_LABELS, PAYMENT_LABELS, brl, fmtDate, fmtPhone, whatsappLink } from "@/lib/format";
import { todayISO } from "@/lib/dates";
import { useOrg } from "@/lib/org-context";

const METHOD_COLORS: Record<string, string> = {
  dinheiro: "oklch(0.56 0.105 238)",
  debito: "oklch(0.68 0.096 205)",
  credito: "oklch(0.48 0.07 262)",
  pix: "oklch(0.75 0.096 178)",
};

const axisProps = {
  stroke: "oklch(0.62 0.02 250)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

const tooltipStyle = {
  contentStyle: {
    borderRadius: 14,
    border: "1px solid oklch(1 0 0 / 0.8)",
    background: "oklch(1 0 0 / 0.92)",
    backdropFilter: "blur(12px)",
    fontSize: 12,
    boxShadow: "0 16px 34px -22px oklch(0.36 0.06 255 / 0.5)",
  },
  labelStyle: { fontWeight: 600, fontSize: 12 },
} as const;

export default function Dashboard() {
  const { orgId, org, canEdit } = useOrg();
  const data = useQuery(api.dashboard.dashboard, orgId ? { organizationId: orgId } : "skip");

  const charts = useMemo(() => {
    if (!data) return null;
    return {
      revenueByDay: data.charts.revenueByDay.map((d) => ({ ...d, value: d.value / 100 })),
      profitTrend: data.charts.profitTrend.map((d) => ({
        ...d,
        revenue: d.revenue / 100,
        expenses: d.expenses / 100,
        profit: d.profit / 100,
      })),
      byMethod: data.charts.revenueByMethod
        .filter((m) => m.value > 0)
        .map((m) => ({ ...m, value: m.value / 100 })),
      byService: data.charts.revenueByService.map((s) => ({ ...s, value: s.value / 100 })),
      byBarber: data.charts.revenueByBarber,
      expensesByCategory: data.charts.expensesByCategory.map((e) => ({
        ...e,
        cents: e.cents / 100,
      })),
      appointmentsTrend: data.charts.appointmentsTrend,
      productSales: data.charts.productSales.map((p) => ({
        ...p,
        revenue: p.revenue / 100,
        cost: p.cost / 100,
        marginCents: p.marginCents / 100,
      })),
      retention: data.charts.retention,
    };
  }, [data]);

  if (!data || !charts) return <Loading label="Montando seu painel" />;

  const k = data.kpis;
  const deltaUp = (k.deltaPercent ?? 0) >= 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={data.isDemo ? "Ambiente demo" : "Painel de controle"}
        title={`Bom dia, ${org?.name ?? "barbearia"}`}
        description={`Movimento de ${fmtDate(data.today)} — todo número abaixo vem direto das vendas, agendamentos e custos registrados no sistema.`}
        actions={
          <>
            <Button asChild variant="outline" className="bg-white/60">
              <Link to="/app/relatorios">
                <TrendingUp className="size-4" /> Relatórios
              </Link>
            </Button>
            {canEdit("pos") ? (
              <Button asChild>
                <Link to="/app/pdv">
                  <Receipt className="size-4" /> Nova venda
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Faturamento hoje"
          value={brl(k.revenueToday)}
          icon={Wallet}
          hint={`${k.salesCountToday} venda(s) · ticket médio ${brl(k.averageTicket)}`}
        />
        <StatCard
          label="Faturamento do mês"
          value={brl(k.revenueMonth)}
          icon={TrendingUp}
          tone="positive"
          hint={
            k.deltaPercent === null ? (
              "Sem mês anterior para comparar"
            ) : (
              <span className={deltaUp ? "text-emerald-600" : "text-rose-600"}>
                {deltaUp ? "▲" : "▼"} {Math.abs(k.deltaPercent)}% vs. mês anterior
              </span>
            )
          }
        />
        <StatCard
          label="Despesas do mês"
          value={brl(k.expensesMonth)}
          icon={TrendingDown}
          tone="warning"
          hint={`Resultado estimado ${brl(k.netProfit)} (margem ${k.profitMargin}%)`}
        />

      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Agenda de hoje"
          value={`${k.completedToday}/${k.appointmentsToday}`}
          icon={CalendarCheck}
          hint={`${k.clientsServedToday} cliente(s) atendido(s) · ${k.noShowRate}% de faltas`}
        />
        <StatCard
          label="Clientes ativos"
          value={k.activeClients}
          icon={Users}
          hint={`${k.inactiveClients} sem atendimento há ${data.month ? "mais de 45 dias" : "muito tempo"}`}
        />
        <StatCard
          label="Comissões a pagar"
          value={brl(k.pendingCommissionsCents)}
          icon={Percent}
          tone={k.pendingCommissionsCents > 0 ? "warning" : "neutral"}
          hint={`Já pago no mês: ${brl(k.paidCommissionsCents)}`}
        />
        <StatCard
          label="Estoque"
          value={brl(k.inventoryCostCents)}
          icon={PackageX}
          tone={k.lowStockCount > 0 ? "danger" : "neutral"}
          hint={`${k.lowStockCount} item(ns) abaixo do mínimo · venda ${brl(k.inventoryRetailCents)}`}
        />
      </div>

      {/* Agenda + atenção */}
      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <section className="glass rounded-2xl">
          <SectionTitle
            title="Próximos atendimentos"
            hint={fmtDate(data.today)}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/agenda">
                  Ver agenda <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            }
          />
          <div className="px-5 pb-5">
            {data.agenda.upcoming.length === 0 ? (
              <EmptyState
                title="Nenhum atendimento pendente"
                description="Quando houver agendamentos para hoje, eles aparecem aqui."
                icon={CalendarClock}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {data.agenda.upcoming.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-xl glass-chip px-3 py-2.5"
                  >
                    <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {a.time}
                    </span>
                    <span
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{ background: a.barberColor }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {a.clientName}
                        </span>
                        {a.startingSoon ? (
                          <Tone className="border-amber-200 bg-amber-100 text-amber-700">
                            em breve
                          </Tone>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {a.serviceName} · {a.barberName}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                      {brl(a.priceCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl glass-chip p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Caixa
                </p>
                {data.agenda.openSession ? (
                  <p className="mt-1 text-sm font-medium text-foreground">
                    Aberto · esperado {brl(data.agenda.openSession.expectedCents)}
                  </p>
                ) : (
                  <Button asChild variant="outline" size="sm" className="mt-1 bg-white/60">
                    <Link to="/app/caixa">Abrir caixa</Link>
                  </Button>
                )}
              </div>
              <div className="rounded-xl glass-chip p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Último fechamento
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {data.agenda.lastClosedSession
                    ? `${fmtDate(data.agenda.lastClosedSession.openedDate)} · diferença ${brl(
                        data.agenda.lastClosedSession.varianceCents ?? 0,
                      )}`
                    : "Nenhum fechamento registrado"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="glass rounded-2xl">
          <SectionTitle
            title="Precisa de atenção"
            hint="Gerado a partir dos registros atuais"
            action={
              canEdit("clients") ? (
                <Button asChild variant="ghost" size="sm">
                  <Link to="/app/clientes">Abrir clientes</Link>
                </Button>
              ) : null
            }
          />
          <div className="px-5 pb-5">
            {data.attention.length === 0 ? (
              <EmptyState
                title="Tudo em dia"
                description="Nenhum alerta operacional no momento."
                icon={Info}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {data.attention.map((a) => (
                  <li key={a.key}>
                    <Link
                      to={a.link}
                      className="flex items-start gap-3 rounded-xl glass-chip px-3 py-2.5 transition-colors hover:bg-white/75"
                    >
                      <span
                        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${
                          a.severity === "critico"
                            ? "bg-rose-500/12 text-rose-600"
                            : a.severity === "alerta"
                              ? "bg-amber-500/14 text-amber-700"
                              : "bg-primary/10 text-primary"
                        }`}
                      >
                        <AlertTriangle className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-foreground">
                            {a.title}
                          </span>
                          <Badge variant="secondary" className="shrink-0 rounded-full text-[10px]">
                            {a.count}
                          </Badge>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {a.detail}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="glass rounded-2xl">
          <SectionTitle title="Receita dos últimos 14 dias" hint="Somente pagamentos em dinheiro, cartão e PIX" />
          <div className="h-64 px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.revenueByDay} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revDay" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.56 0.105 238)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="oklch(0.56 0.105 238)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.8 0.02 250)" vertical={false} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={58} tickFormatter={(v: number) => `${v}k`} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="oklch(0.54 0.104 238)"
                  strokeWidth={2}
                  fill="url(#revDay)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="glass rounded-2xl">
          <SectionTitle title="Receita x despesa (6 meses)" hint="Resultado do período" />
          <div className="h-64 px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.profitTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.8 0.02 250)" vertical={false} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={58} tickFormatter={(v: number) => `${v / 1000}k`} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="revenue" name="Receita" fill="oklch(0.56 0.105 238)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expenses" name="Despesas" fill="oklch(0.75 0.09 88)" radius={[6, 6, 0, 0]} />
                <Line type="monotone" dataKey="profit" name="Resultado" stroke="oklch(0.48 0.07 262)" strokeWidth={2} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="glass rounded-2xl">
          <SectionTitle title="Receita por forma de pagamento" hint="Mês corrente" />
          <div className="h-64 px-2 pb-4">
            {charts.byMethod.length === 0 ? (
              <EmptyState title="Sem recebimentos no mês" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={charts.byMethod}
                    dataKey="value"
                    nameKey="method"
                    innerRadius="52%"
                    outerRadius="80%"
                    paddingAngle={3}
                    stroke="oklch(1 0 0 / 0.7)"
                  >
                    {charts.byMethod.map((m) => (
                      <Cell key={m.method} fill={METHOD_COLORS[m.method] ?? "oklch(0.6 0.02 250)"} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v: number, n: string) => [
                      `R$ ${v.toLocaleString("pt-BR")}`,
                      PAYMENT_LABELS[n] ?? n,
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(v: string) => PAYMENT_LABELS[v] ?? v}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="glass rounded-2xl">
          <SectionTitle title="Receita por serviço" hint="Top 8 do mês" />
          <div className="h-64 px-2 pb-4">
            {charts.byService.length === 0 ? (
              <EmptyState title="Sem serviços vendidos" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={charts.byService}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.8 0.02 250)" horizontal={false} />
                  <XAxis type="number" {...axisProps} tickFormatter={(v: number) => `${v / 1000}k`} />
                  <YAxis type="category" dataKey="name" {...axisProps} width={120} />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`} />
                  <Bar dataKey="value" fill="oklch(0.68 0.096 205)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="glass rounded-2xl">
          <SectionTitle title="Despesas por categoria" hint="Mês corrente" />
          <div className="h-64 px-2 pb-4">
            {charts.expensesByCategory.length === 0 ? (
              <EmptyState title="Nenhuma despesa no mês" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={charts.expensesByCategory}
                    dataKey="cents"
                    nameKey="category"
                    innerRadius="52%"
                    outerRadius="80%"
                    paddingAngle={3}
                    stroke="oklch(1 0 0 / 0.7)"
                  >
                    {charts.expensesByCategory.map((e, i) => (
                      <Cell
                        key={e.category}
                        fill={[
                          "oklch(0.56 0.105 238)",
                          "oklch(0.68 0.096 205)",
                          "oklch(0.48 0.07 262)",
                          "oklch(0.75 0.096 178)",
                          "oklch(0.8 0.09 88)",
                        ][i % 5]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="glass rounded-2xl">
          <SectionTitle title="Movimento da agenda (14 dias)" hint="Concluídos, faltas e cancelamentos" />
          <div className="h-64 px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.appointmentsTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.8 0.02 250)" vertical={false} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={34} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="concluidos" name="Concluídos" stackId="a" fill="oklch(0.62 0.09 160)" />
                <Bar dataKey="faltas" name="Faltas" stackId="a" fill="oklch(0.62 0.16 28)" />
                <Bar dataKey="cancelados" name="Cancelados" stackId="a" fill="oklch(0.72 0.04 250)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Listas auxiliares */}
      <div className="grid gap-4 xl:grid-cols-3">
        <section className="glass rounded-2xl">
          <SectionTitle title="Desempenho da equipe" hint="Mês corrente" />
          <div className="px-5 pb-5">
            {charts.byBarber.length === 0 ? (
              <EmptyState title="Sem vendas no mês" />
            ) : (
              <ul className="flex flex-col gap-2.5">
                {charts.byBarber.map((b) => (
                  <li key={b.name} className="rounded-xl glass-chip px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: b.color }} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                        {b.name}
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums text-foreground">
                        {brl(b.value)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {b.completed} concluído(s) · {b.noShow} falta(s) · {b.appointments} na agenda
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="glass rounded-2xl">
          <SectionTitle
            title="Produtos mais vendidos"
            hint="Receita e margem"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/produtos">Abrir</Link>
              </Button>
            }
          />
          <div className="px-5 pb-5">
            {charts.productSales.length === 0 ? (
              <EmptyState title="Nenhum produto vendido" />
            ) : (
              <ul className="flex flex-col gap-2">
                {charts.productSales.map((p) => (
                  <li key={p.name} className="flex items-center gap-3 text-[13px]">
                    <span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.quantity} un</span>
                    <span className="w-20 text-right font-medium tabular-nums text-foreground">
                      {brl(p.revenue * 100)}
                    </span>
                    <span className="w-16 text-right text-xs tabular-nums text-emerald-600">
                      {brl(p.marginCents * 100)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="glass rounded-2xl">
          <SectionTitle title="Aniversários e renovações" hint="Próximos 7 dias" />
          <div className="flex flex-col gap-4 px-5 pb-5">
            <div>
              {data.birthdaysSoon.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum aniversário na semana.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {data.birthdaysSoon.map((b) => (
                    <li key={b.name} className="flex items-center gap-2 text-[13px]">
                      <Cake className="size-3.5 shrink-0 text-primary" />
                      <Link
                        to={`/app/clientes?q=${encodeURIComponent(b.name)}`}
                        className="min-w-0 flex-1 truncate text-foreground hover:underline"
                      >
                        {b.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {b.days === 0 ? "hoje" : `em ${b.days}d`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            </div>
          </div>
        </section>
      </div>

      {/* Situação de fidelidade e estoque */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass rounded-2xl">
          <SectionTitle title="Clientes e fidelidade" hint="Mesma base de dados da operação" />
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
            {[
              { label: "Clientes ativos", value: k.activeClients },
              { label: "Follow-ups pendentes", value: k.pendingFollowups },
              { label: "Atrasados", value: k.overdueFollowups },
              { label: "Avaliação média", value: k.avgRating ? `${k.avgRating.toFixed(1)} / 5` : "—" },
              { label: "Avaliações no mês", value: k.feedbackCount },
              { label: "Vendas no mês", value: k.salesCountMonth },
            ].map((s) => (
              <div key={s.label} className="rounded-xl glass-chip p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">{s.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="glass rounded-2xl">
          <SectionTitle
            title="Itens abaixo do estoque mínimo"
            hint={`${k.lowStockCount} item(ns)`}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/produtos">Repor</Link>
              </Button>
            }
          />
          <div className="px-5 pb-5">
            {data.lowStock.length === 0 ? (
              <EmptyState title="Estoque saudável" description="Nenhum item abaixo do mínimo." />
            ) : (
              <ul className="flex flex-col gap-2">
                {data.lowStock.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-xl glass-chip px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{p.name}</span>
                    <span
                      className={`text-xs font-medium ${
                        p.stock <= 0 ? "text-rose-600" : "text-amber-600"
                      }`}
                    >
                      {p.stock} {p.unit}
                    </span>
                    <span className="text-xs text-muted-foreground">mín. {p.minStock}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Consultas rápidas por telefone / status */}
      <section className="glass rounded-2xl">
        <SectionTitle title="Atendimentos de hoje por status" hint={fmtDate(todayISO())} />
        <div className="flex flex-wrap gap-2 px-5 pb-5">
          {Object.entries(APPOINTMENT_STATUS_LABELS).map(([key, label]) => (
            <Tone key={key} className="glass-chip text-muted-foreground">
              {label}
            </Tone>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            Contatos podem ser acionados direto pelo WhatsApp — {fmtPhone("(11) 90000-0000")}
          </span>
        </div>
      </section>
    </div>
  );
}