import { motion } from "framer-motion";
import { Link } from "react-router";
import {
  ArrowRight,
  BadgePercent,
  BarChart3,
  CalendarClock,
  Boxes,
  MessageCircle,
  Scissors,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const fade = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const MODULES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: CalendarClock,
    title: "Agenda inteligente",
    text: "Grade por barbeiro, bloqueio de horários, lista de espera e confirmação por WhatsApp.",
  },
  {
    icon: Users,
    title: "CRM de clientes",
    text: "Ficha completa, histórico, tags e pontos de fidelidade por cliente.",
  },
  {
    icon: Wallet,
    title: "PDV com pagamento dividido",
    text: "Venda de serviços e produtos, pagamento misto e baixa automática de estoque.",
  },
  {
    icon: Users,
    title: "Equipe e comissões",
    text: "Gestão de profissionais, atendimentos e comissões por serviço.",
  },
  {
    icon: Boxes,
    title: "Estoque e produtos",
    text: "Compras, movimentações, custo, margem e alerta automático de estoque mínimo.",
  },
  {
    icon: BarChart3,
    title: "Financeiro e comissões",
    text: "Caixa, despesas, fluxo de caixa e comissão da equipe por período.",
  },
];

const HIGHLIGHTS = [
  {
    icon: Sparkles,
    title: "Tudo conectado de verdade",
    text: "Concluir um atendimento gera venda, baixa estoque, comissão, caixa e pontos de fidelidade — sem planilha paralela.",
  },
  {
    icon: ShieldCheck,
    title: "Multiempresa de verdade",
    text: "Cada barbearia tem seus próprios dados, equipe e permissões. Isolamento aplicado no servidor, não só na interface.",
  },
  {
    icon: MessageCircle,
    title: "Relacionamento que retém",
    text: "Acompanhamento de clientes, lembretes de aniversário e contatos de relacionamento.",
  },
];

const STEPS = [
  { n: "01", title: "Crie sua unidade", text: "Nome, endereço, horário de funcionamento e catálogo base." },
  { n: "02", title: "Cadastre a equipe", text: "Barbeiros com agenda e modelo de comissão próprio." },
  { n: "03", title: "Popule clientes", text: "Histórico, preferências e fidelidade prontos para atendimento." },
  { n: "04", title: "Trabalhe", text: "Agenda, PDV e caixa operam juntos desde o primeiro dia." },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 inline-flex items-center gap-2 rounded-full glass-chip px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
      <span className="size-1.5 rounded-full bg-primary" />
      {children}
    </p>
  );
}

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="aurora" />

      {/* Topbar */}
      <header className="relative z-10 px-4 pt-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-2xl glass px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Scissors className="size-[18px]" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold tracking-tight text-foreground">
                Barber <span className="text-primary">OS</span>
              </span>
              <span className="hidden text-[11px] text-muted-foreground sm:block">
                Sistema operacional para barbearias
              </span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#recursos" className="transition-colors hover:text-foreground">
              Recursos
            </a>
            <a href="#modulos" className="transition-colors hover:text-foreground">
              Módulos
            </a>
            <a href="#comecar" className="transition-colors hover:text-foreground">
              Como começar
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="rounded-xl">
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild size="sm" className="rounded-xl">
              <Link to="/auth">
                Criar conta
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 px-4 pt-14 pb-6 sm:px-6 sm:pt-20">
        <div className="mx-auto max-w-6xl">
          <motion.div initial="hidden" animate="show" className="mx-auto max-w-3xl text-center">
            <motion.div variants={fade} custom={0}>
              <Badge className="glass-chip rounded-full px-3 py-1 text-[11px] font-medium text-primary">
                <Sparkles className="mr-1 size-3.5" />
                Feito para barbearias brasileiras
              </Badge>
            </motion.div>
            <motion.h1
              variants={fade}
              custom={1}
              className="mt-6 text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-6xl"
            >
              A barbearia inteira em{" "}
              <span className="text-brand-gradient">um só sistema</span>
            </motion.h1>
            <motion.p
              variants={fade}
              custom={2}
              className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
            >
              Agenda, CRM, PDV, caixa, estoque, comissões e fidelidade integrados. Um
              atendimento concluído atualiza faturamento, estoque e comissão na hora — sem
              planilha, sem retrabalho, sem número inventado.
            </motion.p>
            <motion.div
              variants={fade}
              custom={3}
              className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <Button asChild size="lg" className="h-11 rounded-xl px-6">
                <Link to="/auth">
                  Começar agora
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 rounded-xl bg-white/60 px-6">
                <Link to="/auth">Entrar na minha barbearia</Link>
              </Button>
            </motion.div>
            <motion.p variants={fade} custom={4} className="mt-4 text-xs text-muted-foreground">
              Ou entre como visitante e conheça o ambiente demo com dados de exemplo.
            </motion.p>
          </motion.div>

          {/* Painel flutuante */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="glass mt-14 rounded-3xl p-3 sm:p-4"
          >
            <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
              <div className="rounded-2xl bg-white/55 p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">Faturamento da semana</p>
                  <Badge className="rounded-full bg-emerald-500/12 text-emerald-700">
                    +18,4%
                  </Badge>
                </div>
                <div className="mt-5 flex h-40 items-end gap-2 sm:h-48">
                  {[42, 58, 47, 72, 64, 88, 76].map((h, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-2">
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-primary/70 to-primary/25"
                        style={{ height: `${h}%` }}
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {["seg", "ter", "qua", "qui", "sex", "sáb", "dom"][i]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {[
                  { icon: CalendarClock, label: "Atendimentos hoje", value: "18", tone: "text-primary bg-primary/10" },
                  { icon: Wallet, label: "Ticket médio", value: "R$ 86,00", tone: "text-emerald-700 bg-emerald-500/12" },
                  { icon: Star, label: "Clientes fidelizados", value: "64", tone: "text-amber-700 bg-amber-500/14" },
                ].map((kpi) => (
                  <div key={kpi.label} className="flex items-center gap-3 rounded-2xl bg-white/55 p-4">
                    <span className={`flex size-9 items-center justify-center rounded-xl ${kpi.tone}`}>
                      <kpi.icon className="size-4" />
                    </span>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {kpi.label}
                      </p>
                      <p className="text-lg font-semibold text-foreground">{kpi.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Números */}
      <section id="recursos" className="relative z-10 px-4 py-10 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { value: "19", label: "módulos integrados" },
            { value: "6", label: "perfis de permissão" },
            { value: "BRL", label: "moeda, PIX e WhatsApp nativos" },
            { value: "100%", label: "dos números vêm do banco" },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.06 }}
              className="glass glass-interactive rounded-2xl p-5"
            >
              <p className="text-2xl font-semibold tracking-tight text-foreground">{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Destaques */}
      <section className="relative z-10 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionLabel>Diferenciais</SectionLabel>
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Menos abas abertas, mais barberia rodando
          </h2>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {HIGHLIGHTS.map((h, i) => (
              <motion.article
                key={h.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="glass glass-interactive rounded-2xl p-6"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <h.icon className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-foreground">{h.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{h.text}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* Módulos */}
      <section id="modulos" className="relative z-10 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionLabel>Módulos</SectionLabel>
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Tudo que a operação exige, no mesmo lugar
          </h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m, i) => (
              <motion.div
                key={m.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: i * 0.05 }}
                className="glass glass-interactive flex gap-3.5 rounded-2xl p-5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <m.icon className="size-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{m.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                    {m.text}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Como começar */}
      <section id="comecar" className="relative z-10 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="glass overflow-hidden rounded-3xl">
            <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-2 lg:items-center">
              <div>
                <SectionLabel>Como começar</SectionLabel>
                <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Da cadeira ao painel em quatro passos
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Configure uma vez. Depois é só atender — o sistema cuida do resto.
                </p>
                <Button asChild size="lg" className="mt-6 h-11 rounded-xl px-6">
                  <Link to="/auth">
                    Criar minha barbearia
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
              <ol className="flex flex-col gap-3">
                {STEPS.map((s) => (
                  <li key={s.n} className="glass-chip flex items-start gap-4 rounded-2xl p-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground">
                      {s.n}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{s.title}</p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                        {s.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="relative z-10 px-4 pb-16 pt-6 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="glass relative overflow-hidden rounded-3xl px-6 py-14 text-center sm:px-12">
            <div className="aurora" />
            <div className="relative z-10">
              <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Sua barbearia merece um sistema, não uma planilha
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Comece com o ambiente demo e conheça o Barber OS com dados de uma
                barbearia fictícia, ou crie a sua unidade em menos de dois minutos.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-11 rounded-xl px-6">
                  <Link to="/auth">
                    Começar agora
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-11 rounded-xl bg-white/60 px-6"
                >
                  <Link to="/auth">Ver ambiente demo</Link>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                {[
                  { icon: BadgePercent, label: "Comissões por modelo" },
                  { icon: CalendarClock, label: "Agenda integrada" },
                  { icon: Wallet, label: "Caixa e pagamentos" },
                ].map((f) => (
                  <span key={f.label} className="flex items-center gap-1.5">
                    <f.icon className="size-3.5 text-primary" />
                    {f.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Barber OS — feito para barbearias.</p>
          <p>Valores em reais (BRL) · datas DD/MM/AAAA · agendamento, vendas e caixa integrados.</p>
          <p className="flex items-center gap-4">
            <Link to="/privacidade" className="transition-colors hover:text-foreground">
              Privacidade
            </Link>
            <Link to="/termos" className="transition-colors hover:text-foreground">
              Termos
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}