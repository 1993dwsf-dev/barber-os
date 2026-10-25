import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, FileText, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, Loading, PageHeader, SectionTitle, StatCard } from "@/components/glass";
import {
  PAYMENT_LABELS,
  brl,
  downloadCSV,
  fmtDate,
  toCSV,
} from "@/lib/format";
import { addDaysISO, monthRange, monthOffsetISO, todayISO } from "@/lib/dates";
import { useOrg } from "@/lib/org-context";

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
  },
} as const;

const PALETTE = [
  "oklch(0.56 0.105 238)",
  "oklch(0.68 0.096 205)",
  "oklch(0.48 0.07 262)",
  "oklch(0.75 0.096 178)",
  "oklch(0.8 0.09 88)",
];

const real = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export default function Relatorios() {
  const { orgId, org } = useOrg();
  const thisMonth = monthRange(todayISO());
  const lastMonth = monthRange(monthOffsetISO(todayISO(), -1));
  const [from, setFrom] = useState(lastMonth.start);
  const [to, setTo] = useState(thisMonth.end);

  const bundle = useQuery(
    api.reports.bundle,
    orgId ? { organizationId: orgId, from, to } : "skip",
  );

  if (!orgId) return <Loading />;

  const s = bundle?.summary;

  const presets = [
    { label: "Este mês", get: () => { const p = monthRange(todayISO()); return [p.start, p.end] as const; } },
    { label: "Mês passado", get: () => { const p = monthRange(monthOffsetISO(todayISO(), -1)); return [p.start, p.end] as const; } },
    { label: "Últimos 30 dias", get: () => [addDaysISO(todayISO(), -29), todayISO()] as const },
    { label: "Últimos 90 dias", get: () => [addDaysISO(todayISO(), -89), todayISO()] as const },
  ];

  const download = (filename: string, headers: string[], rows: (string | number)[][]) =>
    downloadCSV(`${filename}-${from}_a_${to}.csv`, toCSV(headers, rows));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Gestão"
        title="Relatórios"
        description="Consolidado do período com receita, custos, resultado, desempenho da equipe e relatórios CSV para abrir no Excel."
        actions={
          <Button
            onClick={() =>
              download(
                `resumo-${org?.name ?? "barbearia"}`,
                ["Indicador", "Valor"],
                [
                  ["Período", `${from} a ${to}`],
                  ["Receita", real(s?.revenueCents ?? 0)],
                  ["Receita de serviços", real(s?.serviceRevenue ?? 0)],
                  ["Receita de produtos", real(s?.productRevenue ?? 0)],
                  ["Custo dos produtos", real(s?.productCost ?? 0)],
                  ["Despesas", real(s?.expensesCents ?? 0)],
                  ["Comissões accruadas", real(s?.commissionsAccruedCents ?? 0)],
                  ["Comissões pagas", real(s?.commissionsPaidCents ?? 0)],
                  ["Lucro bruto", real(s?.grossProfit ?? 0)],
                  ["Resultado do período", real(s?.netProfit ?? 0)],
                  ["Margem", `${s?.profitMargin ?? 0}%`],
                  ["Ticket médio", real(s?.averageTicket ?? 0)],
                  ["Vendas", s?.salesCount ?? 0],
                  ["Agendamentos", s?.appointmentsCount ?? 0],
                ],
              )
            }
          >
            <Download className="size-4" /> Exportar resumo
          </Button>
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
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <Button
              key={p.label}
              variant="outline"
              size="sm"
              className="bg-white/60"
              onClick={() => {
                const [f, t] = p.get();
                setFrom(f);
                setTo(t);
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {bundle ? `${bundle.sales.length} venda(s) · ${bundle.expenses.length} despesa(s)` : "carregando…"}
        </span>
      </div>

      {!bundle || !s ? (
        <Loading label="Montando o relatório" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Receita do período" value={brl(s.revenueCents)} icon={TrendingUp} tone="positive" />
            <StatCard
              label="Despesas"
              value={brl(s.expensesCents)}
              tone="warning"
              hint={`${s.appointmentsCount} agendamento(s) no período`}
            />
            <StatCard
              label="Resultado"
              value={brl(s.netProfit)}
              tone={s.netProfit >= 0 ? "positive" : "danger"}
              hint={`Margem de ${s.profitMargin}%`}
            />
            <StatCard label="Ticket médio" value={brl(s.averageTicket)} hint={`${s.salesCount} venda(s)`} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            <StatCard label="Serviços" value={brl(s.serviceRevenue)} />
            <StatCard label="Produtos" value={brl(s.productRevenue)} hint={`Margem ${brl(s.productMarginCents)}`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="glass rounded-2xl">
              <SectionTitle title="Receita por dia" />
              <div className="h-64 px-2 pb-4">
                {bundle.aggregates.revenueByDay.length === 0 ? (
                  <EmptyState title="Sem vendas no período" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={bundle.aggregates.revenueByDay.map((d) => ({
                        ...d,
                        cents: d.cents / 100,
                      }))}
                      margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.8 0.02 250)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        {...axisProps}
                        tickFormatter={(v: string) => v.slice(8, 10) + "/" + v.slice(5, 7)}
                      />
                      <YAxis {...axisProps} width={58} tickFormatter={(v: number) => `${v / 1000}k`} />
                      <Tooltip
                        {...tooltipStyle}
                        formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`}
                        labelFormatter={(v: string) => fmtDate(v)}
                      />
                      <Bar dataKey="cents" fill="oklch(0.56 0.105 238)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className="glass rounded-2xl">
              <SectionTitle title="Receita por forma de pagamento" />
              <div className="h-64 px-2 pb-4">
                {bundle.aggregates.revenueByMethod.length === 0 ? (
                  <EmptyState title="Sem recebimentos no período" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={bundle.aggregates.revenueByMethod.map((m) => ({
                          ...m,
                          cents: m.cents / 100,
                        }))}
                        dataKey="cents"
                        nameKey="method"
                        innerRadius="52%"
                        outerRadius="80%"
                        paddingAngle={3}
                      >
                        {bundle.aggregates.revenueByMethod.map((m, i) => (
                          <Cell key={m.method} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        {...tooltipStyle}
                        formatter={(v: number, n: string) => [
                          `R$ ${v.toLocaleString("pt-BR")}`,
                          PAYMENT_LABELS[n] ?? n,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className="glass rounded-2xl">
              <SectionTitle title="Despesas por categoria" />
              <div className="h-64 px-2 pb-4">
                {bundle.aggregates.expensesByCategory.length === 0 ? (
                  <EmptyState title="Sem despesas no período" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={bundle.aggregates.expensesByCategory.map((c) => ({
                        ...c,
                        cents: c.cents / 100,
                      }))}
                      margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.8 0.02 250)" horizontal={false} />
                      <XAxis type="number" {...axisProps} tickFormatter={(v: number) => `${v / 1000}k`} />
                      <YAxis type="category" dataKey="category" {...axisProps} width={110} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`} />
                      <Bar dataKey="cents" fill="oklch(0.75 0.09 88)" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className="glass rounded-2xl">
              <SectionTitle title="Receita por barbeiro" />
              <div className="h-64 px-2 pb-4">
                {bundle.aggregates.revenueByBarber.length === 0 ? (
                  <EmptyState title="Sem vendas com barbeiro no período" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={bundle.aggregates.revenueByBarber.map((b) => ({
                        ...b,
                        revenue: b.revenue / 100,
                      }))}
                      margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.8 0.02 250)" vertical={false} />
                      <XAxis dataKey="name" {...axisProps} />
                      <YAxis {...axisProps} width={58} tickFormatter={(v: number) => `${v / 1000}k`} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`} />
                      <Bar dataKey="revenue" fill="oklch(0.68 0.096 205)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          </div>

          <section className="glass rounded-2xl">
            <SectionTitle title="Serviços mais vendidos" hint="Receita e quantidade no período" />
            <div className="h-64 px-2 pb-4">
              {bundle.aggregates.revenueByService.length === 0 ? (
                <EmptyState title="Sem serviços vendidos no período" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={bundle.aggregates.revenueByService.map((s) => ({
                      ...s,
                      revenue: s.revenue / 100,
                    }))}
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.8 0.02 250)" vertical={false} />
                    <XAxis dataKey="name" {...axisProps} angle={-20} textAnchor="end" height={56} />
                    <YAxis {...axisProps} width={58} tickFormatter={(v: number) => `${v / 1000}k`} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`} />
                    <Line type="monotone" dataKey="revenue" stroke="oklch(0.48 0.07 262)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <Tabs defaultValue="vendas" className="glass rounded-2xl p-5">
            <TabsList className="glass-chip">
              <TabsTrigger value="vendas">Vendas</TabsTrigger>
              <TabsTrigger value="agenda">Agendamentos</TabsTrigger>
              <TabsTrigger value="despesas">Despesas</TabsTrigger>
              <TabsTrigger value="comissoes">Comissões</TabsTrigger>
              <TabsTrigger value="estoque">Estoque</TabsTrigger>
              <TabsTrigger value="clientes">Clientes</TabsTrigger>
            </TabsList>

            <TabsContent value="vendas" className="mt-4">
              <div className="mb-3 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white/60"
                  onClick={() =>
                    download(
                      "vendas",
                      ["Número", "Data", "Cliente", "Barbeiro", "Itens", "Total", "Pago"],
                      bundle.sales.map((sale) => [
                        sale.number,
                        fmtDate(sale.date),
                        sale.clientName,
                        sale.barberName,
                        sale.items.map((i) => `${i.quantity}x ${i.name}`).join(" | "),
                        real(sale.totalCents),
                        real(sale.paidCents),
                      ]),
                    )
                  }
                >
                  <Download className="size-3.5" /> CSV
                </Button>
              </div>
              {bundle.sales.length === 0 ? (
                <EmptyState title="Nenhuma venda no período" />
              ) : (
                <ul className="scrollbar-slim max-h-[26rem] overflow-y-auto">
                  {bundle.sales.map((sale) => (
                    <li key={sale._id} className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-1.5 text-[13px]">
                      <span className="tabular-nums text-muted-foreground">#{sale.number}</span>
                      <span className="w-20 text-xs text-muted-foreground">{fmtDate(sale.date)}</span>
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {sale.clientName} · {sale.barberName}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {brl(sale.totalCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="agenda" className="mt-4">
              <div className="mb-3 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white/60"
                  onClick={() =>
                    download(
                      "agendamentos",
                      ["Data", "Horário", "Cliente", "Serviço", "Barbeiro", "Status", "Valor"],
                      bundle.appointments.map((a) => [
                        fmtDate(a.date),
                        a.startTime,
                        a.clientName,
                        a.serviceName,
                        a.barberName,
                        a.status,
                        real(a.priceCents),
                      ]),
                    )
                  }
                >
                  <Download className="size-3.5" /> CSV
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Agendamentos", value: s.appointmentsCount },
                  { label: "Concluídos", value: s.completedCount },
                  { label: "Faltas", value: s.noShowCount },
                  { label: "Cancelados", value: s.cancelledCount },
                ].map((x) => (
                  <div key={x.label} className="rounded-xl glass-chip p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {x.label}
                    </p>
                    <p className="text-xl font-semibold text-foreground">{x.value}</p>
                  </div>
                ))}
              </div>
              <ul className="scrollbar-slim mt-3 max-h-[20rem] overflow-y-auto">
                {bundle.appointments.map((a) => (
                  <li key={a._id} className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-1.5 text-[13px]">
                    <span className="w-24 text-xs text-muted-foreground">{fmtDate(a.date)}</span>
                    <span className="w-12 text-xs text-muted-foreground">{a.startTime}</span>
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {a.clientName} · {a.serviceName} · {a.barberName}
                    </span>
                    <Badge variant="secondary" className="rounded-full text-[10px]">
                      {a.status}
                    </Badge>
                    <span className="text-xs tabular-nums text-muted-foreground">{brl(a.priceCents)}</span>
                  </li>
                ))}
              </ul>
            </TabsContent>

            <TabsContent value="despesas" className="mt-4">
              <div className="mb-3 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white/60"
                  onClick={() =>
                    download(
                      "despesas",
                      ["Data", "Categoria", "Fornecedor", "Descrição", "Valor", "Pagamento"],
                      bundle.expenses.map((e) => [
                        fmtDate(e.date),
                        e.category,
                        e.supplier ?? "",
                        e.description,
                        real(e.amountCents),
                        PAYMENT_LABELS[e.method] ?? e.method,
                      ]),
                    )
                  }
                >
                  <Download className="size-3.5" /> CSV
                </Button>
              </div>
              {bundle.expenses.length === 0 ? (
                <EmptyState title="Nenhuma despesa no período" />
              ) : (
                <ul className="scrollbar-slim max-h-[24rem] overflow-y-auto">
                  {bundle.expenses.map((e) => (
                    <li key={e._id} className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-1.5 text-[13px]">
                      <span className="w-20 text-xs text-muted-foreground">{fmtDate(e.date)}</span>
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {e.description} · {e.category}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {brl(e.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="comissoes" className="mt-4">
              <div className="mb-3 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white/60"
                  onClick={() =>
                    download(
                      "comissoes",
                      ["Data", "Barbeiro", "Descrição", "Base", "Valor", "Status"],
                      bundle.commissions.map((c) => [
                        fmtDate(c.date),
                        c.barberName,
                        c.description,
                        real(c.baseCents),
                        real(c.amountCents),
                        c.status,
                      ]),
                    )
                  }
                >
                  <Download className="size-3.5" /> CSV
                </Button>
              </div>
              {bundle.commissions.length === 0 ? (
                <EmptyState title="Nenhuma comissão no período" />
              ) : (
                <ul className="scrollbar-slim max-h-[24rem] overflow-y-auto">
                  {bundle.commissions.map((c) => (
                    <li key={c._id} className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-1.5 text-[13px]">
                      <span className="w-20 text-xs text-muted-foreground">{fmtDate(c.date)}</span>
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {c.barberName} · {c.description}
                      </span>
                      <Badge variant="secondary" className="rounded-full text-[10px]">
                        {c.status}
                      </Badge>
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {brl(c.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="estoque" className="mt-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Valor em custo {brl(s.inventoryCostValue)} · em venda {brl(s.inventoryRetailValue)}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white/60"
                  onClick={() =>
                    download(
                      "estoque",
                      ["SKU", "Produto", "Categoria", "Estoque", "Mínimo", "Custo", "Venda", "Margem %"],
                      bundle.inventory.map((p) => [
                        p.sku ?? "",
                        p.name,
                        p.category,
                        p.stock,
                        p.minStock,
                        real(p.costCents),
                        real(p.priceCents),
                        p.marginPercent.toFixed(1),
                      ]),
                    )
                  }
                >
                  <Download className="size-3.5" /> CSV
                </Button>
              </div>
              <ul className="scrollbar-slim max-h-[24rem] overflow-y-auto">
                {bundle.inventory.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-1.5 text-[13px]">
                    <span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>
                    {p.lowStock ? (
                      <Badge className="rounded-full bg-amber-500/15 text-[10px] text-amber-700">baixo</Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {p.stock} {p.unit} · mín. {p.minStock}
                    </span>
                    <span className="w-24 text-right text-sm font-semibold tabular-nums text-foreground">
                      {brl(p.costValueCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </TabsContent>

            <TabsContent value="clientes" className="mt-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {s.clientsInPeriod} cliente(s) compraram no período · {s.activeClients} ativos no total
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white/60"
                  onClick={() =>
                    download(
                      "clientes",
                      ["Cliente", "Telefone", "Status", "Visitas", "Gasto total", "Gasto no período", "Última visita"],
                      bundle.clients.map((c) => [
                        c.name,
                        c.phone,
                        c.status,
                        c.totalVisits,
                        real(c.totalSpentCents),
                        real(c.periodSpendCents),
                        c.lastVisitDate ? fmtDate(c.lastVisitDate) : "",
                      ]),
                    )
                  }
                >
                  <Download className="size-3.5" /> CSV
                </Button>
              </div>
              <ul className="scrollbar-slim max-h-[24rem] overflow-y-auto">
                {bundle.clients.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-1.5 text-[13px]">
                    <span className="min-w-0 flex-1 truncate text-foreground">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.totalVisits} visita(s)</span>
                    <span className="text-xs text-muted-foreground">
                      última {c.lastVisitDate ? fmtDate(c.lastVisitDate) : "—"}
                    </span>
                    <span className="w-24 text-right text-sm font-semibold tabular-nums text-foreground">
                      {brl(c.periodSpendCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </TabsContent>
          </Tabs>

          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <FileText className="size-3.5" />
            Todos os valores são calculados a partir dos registros de venda, pagamento,
            despesa e comissão gravados no banco para {org?.name}.
          </p>
        </>
      )}
    </div>
  );
}