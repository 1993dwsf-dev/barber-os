import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ArrowLeft, ArrowRight, CalendarDays, ChartColumnIncreasing, CheckCircle2,
  ClipboardList, Package, RotateCcw, Scissors, ShoppingCart, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type View = "resumo" | "agenda" | "clientes" | "pdv" | "estoque" | "relatorios";
type Appointment = { id: number; client: string; service: string; barber: string; time: string; status: string };
type Sale = { id: number; item: string; amount: number; method: string };
type Product = { id: number; name: string; price: number; quantity: number };

const tabs: { key: View; name: string; icon: typeof CalendarDays }[] = [
  { key: "resumo", name: "Visão geral", icon: ChartColumnIncreasing },
  { key: "agenda", name: "Agenda", icon: CalendarDays },
  { key: "clientes", name: "Clientes", icon: Users },
  { key: "pdv", name: "PDV", icon: ShoppingCart },
  { key: "estoque", name: "Estoque", icon: Package },
  { key: "relatorios", name: "Relatórios", icon: ClipboardList },
];

const demoClients = [
  { name: "Rafael Costa", visits: 14, favorite: "Corte + Barba" },
  { name: "Bruno Martins", visits: 8, favorite: "Corte masculino" },
  { name: "André Oliveira", visits: 21, favorite: "Barba" },
  { name: "Lucas Ferreira", visits: 6, favorite: "Corte + Barba" },
];

const initialAppointments: Appointment[] = [
  { id: 1, client: "Rafael Costa", service: "Corte + Barba", barber: "Pedro", time: "09:00", status: "Concluído" },
  { id: 2, client: "Bruno Martins", service: "Corte masculino", barber: "João", time: "10:00", status: "Confirmado" },
  { id: 3, client: "André Oliveira", service: "Barba", barber: "Pedro", time: "11:30", status: "Confirmado" },
  { id: 4, client: "Lucas Ferreira", service: "Corte + Barba", barber: "João", time: "14:00", status: "Agendado" },
];

const initialSales: Sale[] = [
  { id: 1, item: "Corte + Barba", amount: 75, method: "Pix" },
  { id: 2, item: "Corte masculino", amount: 45, method: "Cartão" },
  { id: 3, item: "Pomada modeladora", amount: 35, method: "Dinheiro" },
];

const initialProducts: Product[] = [
  { id: 1, name: "Pomada modeladora", price: 35, quantity: 8 },
  { id: 2, name: "Óleo para barba", price: 42, quantity: 5 },
  { id: 3, name: "Shampoo profissional", price: 39, quantity: 2 },
];

const money = (amount: number) => new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL",
}).format(amount);

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/90 p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

/**
 * Apresentação comercial totalmente isolada: somente estado React em memória,
 * sem chamadas Convex e SEM escrita em backend ou uso de dados reais.
 */
export default function PublicDemo() {
  const [view, setView] = useState<View>("resumo");
  const [appointments, setAppointments] = useState(initialAppointments);
  const [sales, setSales] = useState(initialSales);
  const [products, setProducts] = useState(initialProducts);
  const [notice, setNotice] = useState("");
  const revenue = useMemo(() => sales.reduce((sum, sale) => sum + sale.amount, 0), [sales]);
  const lowStock = products.filter(p => p.quantity <= 3).length;

  function reset() {
    setAppointments(initialAppointments);
    setSales(initialSales);
    setProducts(initialProducts);
    setNotice("Demonstração reiniciada com os dados fictícios originais.");
    setView("resumo");
  }

  function bookAppointment() {
    const next = Math.max(...appointments.map(a => a.id)) + 1;
    const times = ["15:00", "15:30", "16:00", "16:30", "17:00", "17:30"];
    setAppointments(prev => [...prev, {
      id: next, client: "Cliente de exemplo", service: "Corte masculino",
      barber: "Pedro", time: times[(next - 5) % times.length], status: "Agendado",
    }]);
    setNotice("Agendamento fictício adicionado. Nenhuma informação foi salva em banco de dados.");
  }

  function simulateSale() {
    const product = products.find(p => p.id === 1);
    if (!product || product.quantity <= 0) {
      setNotice("O estoque fictício deste produto acabou. Use Reiniciar demonstração.");
      return;
    }
    setSales(prev => [...prev, {
      id: Math.max(...prev.map(s => s.id)) + 1,
      item: product.name, amount: product.price, method: "Pix",
    }]);
    setProducts(prev => prev.map(p => p.id === product.id
      ? { ...p, quantity: p.quantity - 1 } : p));
    setNotice("Venda fictícia registrada: valor atualizado no relatório e uma unidade abatida do estoque.");
    setView("pdv");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-card/90">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Scissors className="size-5" />
            </span>
            Barber <span className="text-primary">OS</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline"><Link to="/"><ArrowLeft className="size-4" /> Voltar ao site</Link></Button>
            <Button asChild size="sm"><Link to="/auth">Já sou cliente <ArrowRight className="size-4" /></Link></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
                Demonstração interativa — dados fictícios
              </span>
              <h1 className="mt-3 text-2xl font-bold sm:text-3xl">Conheça o Barber OS</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Explore como uma barbearia pode organizar agenda, clientes, vendas e estoque.
                Este é um tour interativo: as ações abaixo são simuladas e não gravam dados.
                Após a contratação, você terá acesso ao sistema completo com os dados do seu negócio.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={reset}>
              <RotateCcw className="size-4" /> Reiniciar demonstração
            </Button>
          </div>
        </div>

        <div className="mt-6 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Módulos da demonstração">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={view === tab.key}
                onClick={() => { setView(tab.key); setNotice(""); }}
                className={"flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors " +
                  (view === tab.key ? "border-primary bg-primary text-primary-foreground" :
                    "border-border bg-card hover:bg-accent")}
              >
                <Icon className="size-4" />{tab.name}
              </button>
            );
          })}
        </div>

        {notice && <p role="status" className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">{notice}</p>}

        {view === "resumo" && (
          <section className="mt-5 space-y-5" aria-label="Visão geral fictícia">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric label="Faturamento de exemplo" value={money(revenue)} detail="Vendas fictícias nesta sessão" />
              <Metric label="Agendamentos" value={String(appointments.length)} detail="Agenda de demonstração" />
              <Metric label="Clientes cadastrados" value={String(demoClients.length)} detail="Cadastros ilustrativos" />
              <Metric label="Estoque baixo" value={String(lowStock)} detail="Produtos com até 3 unidades" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-5">
                <h2 className="font-semibold">Próximos atendimentos</h2>
                <div className="mt-3 space-y-2">
                  {appointments.slice(-4).map(a => (
                    <div key={a.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted/60 p-3 text-sm">
                      <span><strong>{a.time}</strong> · {a.client}<span className="block text-xs text-muted-foreground">{a.service} · {a.barber}</span></span>
                      <span className="text-xs text-muted-foreground">{a.status}</span>
                    </div>
                  ))}
                </div>
                <Button className="mt-4" size="sm" variant="outline" onClick={() => setView("agenda")}>Abrir agenda <ArrowRight className="size-4" /></Button>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <h2 className="font-semibold">Experimente uma operação</h2>
                <p className="mt-2 text-sm text-muted-foreground">Veja, na prática, como uma venda altera o faturamento e o estoque da demonstração.</p>
                <Button className="mt-4" size="sm" onClick={simulateSale}>Simular venda de pomada · {money(35)}</Button>
                <p className="mt-3 text-xs text-muted-foreground">Nenhum pagamento é feito ou cobrado. Dados só existem nesta página.</p>
              </div>
            </div>
          </section>
        )}

        {view === "agenda" && (
          <section className="mt-5 rounded-2xl border border-border bg-card p-4 sm:p-6" aria-label="Agenda fictícia">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-xl font-semibold">Agenda de atendimentos</h2><p className="text-sm text-muted-foreground">Agendamentos de exemplo de Pedro e João</p></div>
              <Button onClick={bookAppointment} size="sm"><CalendarDays className="size-4" /> Simular agendamento</Button>
            </div>
            <div className="mt-5 space-y-2">
              {appointments.map(a => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 p-3 text-sm">
                  <div className="flex items-center gap-3"><span className="rounded-lg bg-primary/10 px-3 py-2 font-bold text-primary">{a.time}</span>
                    <span><strong>{a.client}</strong><span className="block text-xs text-muted-foreground">{a.service} · {a.barber}</span></span></div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs">{a.status}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {view === "clientes" && (
          <section className="mt-5 rounded-2xl border border-border bg-card p-4 sm:p-6" aria-label="Clientes fictícios">
            <h2 className="text-xl font-semibold">Clientes</h2>
            <p className="mt-1 text-sm text-muted-foreground">Exemplos de histórico e preferências dos clientes</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {demoClients.map(client => (
                <div key={client.name} className="rounded-xl border border-border/70 p-4">
                  <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">{client.name.charAt(0)}</span>
                    <div><p className="font-semibold">{client.name}</p><p className="text-xs text-muted-foreground">{client.visits} visitas · Preferência: {client.favorite}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {view === "pdv" && (
          <section className="mt-5 rounded-2xl border border-border bg-card p-4 sm:p-6" aria-label="PDV fictício">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-xl font-semibold">Ponto de venda</h2><p className="text-sm text-muted-foreground">Vendas de exemplo; nenhuma transação financeira real</p></div>
              <Button onClick={simulateSale} size="sm"><ShoppingCart className="size-4" /> Simular venda de pomada</Button>
            </div>
            <div className="mt-5 divide-y divide-border/60">
              {sales.map(sale => (
                <div key={sale.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div><p className="font-medium">{sale.item}</p><p className="text-xs text-muted-foreground">Pagamento ilustrativo: {sale.method}</p></div>
                  <strong>{money(sale.amount)}</strong>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border pt-4"><strong>Total ilustrativo</strong><strong className="text-lg text-primary">{money(revenue)}</strong></div>
          </section>
        )}

        {view === "estoque" && (
          <section className="mt-5 rounded-2xl border border-border bg-card p-4 sm:p-6" aria-label="Estoque fictício">
            <h2 className="text-xl font-semibold">Produtos e estoque</h2>
            <p className="mt-1 text-sm text-muted-foreground">Venda simulada de pomada desconta automaticamente uma unidade</p>
            <div className="mt-5 space-y-2">
              {products.map(p => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 p-3 text-sm">
                  <span><strong>{p.name}</strong><span className="block text-xs text-muted-foreground">Preço de exemplo: {money(p.price)}</span></span>
                  <span className={p.quantity <= 3 ? "font-semibold text-amber-600" : "font-medium"}>{p.quantity} unidades</span>
                </div>
              ))}
            </div>
            <Button onClick={simulateSale} size="sm" className="mt-4" variant="outline">Simular venda e atualizar estoque</Button>
          </section>
        )}

        {view === "relatorios" && (
          <section className="mt-5 rounded-2xl border border-border bg-card p-4 sm:p-6" aria-label="Relatórios fictícios">
            <h2 className="text-xl font-semibold">Relatórios e resultados</h2>
            <p className="mt-1 text-sm text-muted-foreground">Totais calculados exclusivamente a partir dos dados desta simulação</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Metric label="Receita ilustrativa" value={money(revenue)} detail="Soma das vendas simuladas" />
              <Metric label="Quantidade de vendas" value={String(sales.length)} detail="Registros fictícios" />
              <Metric label="Ticket médio" value={money(revenue / sales.length)} detail="Receita dividida por vendas" />
            </div>
            <div className="mt-5 space-y-3">
              {sales.map(sale => (
                <div key={sale.id} className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
                  <span>{sale.item} <span className="text-muted-foreground">· {sale.method}</span></span>
                  <span className="font-medium">{money(sale.amount)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4 text-sm">
          <div className="flex items-start gap-2 text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>Tour ilustrativo, sem login, sem dados pessoais e sem conexão com o banco dos clientes. As mudanças desaparecem ao atualizar.</span>
          </div>
          <Button asChild size="sm" variant="outline"><Link to="/">Voltar à apresentação <ArrowRight className="size-4" /></Link></Button>
        </div>
      </main>
    </div>
  );
}
