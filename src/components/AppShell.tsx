import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useOrg } from "@/lib/org-context";
import { initials } from "@/lib/format";
import type { Cap } from "@/lib/rbac";
import {
  Bell,
  Boxes,
  CalendarDays,
  ChevronDown,
  CreditCard,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Percent,
  Plus,
  Receipt,
  Repeat,
  Scissors,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Loading } from "@/components/glass";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  cap: Cap;
  end?: boolean;
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Operação",
    items: [
      { to: "/app", label: "Painel", icon: LayoutDashboard, cap: "dashboard", end: true },
      { to: "/app/agenda", label: "Agenda", icon: CalendarDays, cap: "agenda" },
      { to: "/app/pdv", label: "PDV", icon: ShoppingBag, cap: "pos" },
      { to: "/app/caixa", label: "Caixa", icon: Receipt, cap: "cash" },
    ],
  },
  {
    label: "Relacionamento",
    items: [
      { to: "/app/clientes", label: "Clientes", icon: Users, cap: "clients" },
      { to: "/app/relacionamento", label: "Follow-ups", icon: Repeat, cap: "crm" },
      { to: "/app/fidelidade", label: "Fidelidade", icon: Star, cap: "loyalty" },
    ],
  },
  {
    label: "Equipe",
    items: [{ to: "/app/equipe", label: "Barbeiros", icon: UsersRound, cap: "team" }],
  },
  {
    label: "Catálogo",
    items: [
      { to: "/app/servicos", label: "Serviços", icon: Scissors, cap: "catalog" },
      { to: "/app/pacotes", label: "Pacotes", icon: Package, cap: "packages" },
      { to: "/app/assinaturas", label: "Assinaturas", icon: CreditCard, cap: "memberships" },
      { to: "/app/produtos", label: "Produtos", icon: Boxes, cap: "products" },
      { to: "/app/estoque", label: "Estoque", icon: Package, cap: "inventory" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { to: "/app/despesas", label: "Despesas", icon: Receipt, cap: "expenses" },
      { to: "/app/comissoes", label: "Comissões", icon: Percent, cap: "commissions" },
      { to: "/app/relatorios", label: "Relatórios", icon: TrendingUp, cap: "reports" },
      { to: "/app/configuracoes", label: "Configurações", icon: Settings, cap: "settings" },
    ],
  },
];

const MOBILE_NAV: NavItem[] = [
  { to: "/app", label: "Painel", icon: LayoutDashboard, cap: "dashboard", end: true },
  { to: "/app/agenda", label: "Agenda", icon: CalendarDays, cap: "agenda" },
  { to: "/app/pdv", label: "PDV", icon: ShoppingBag, cap: "pos" },
  { to: "/app/clientes", label: "Clientes", icon: Users, cap: "clients" },
];

function BrandMark({ small }: { small?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm",
          small ? "size-8" : "size-9",
        )}
      >
        <Scissors className={small ? "size-4" : "size-[18px]"} />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold tracking-tight text-foreground">
          BarberFlow <span className="text-primary">OS</span>
        </span>
        {!small ? (
          <span className="block text-[11px] text-muted-foreground">
            Sistema operacional para barbearias
          </span>
        ) : null}
      </span>
    </span>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useOrg();
  return (
    <nav className="flex flex-col gap-5 px-3">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((i) => can(i.cap));
        if (items.length === 0) return null;
        return (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground",
                      )
                    }
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function GlobalSearch() {
  const { orgId } = useOrg();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const results = useQuery(
    api.search.globalSearch,
    orgId && term.trim().length >= 2 ? { organizationId: orgId, q: term, limit: 6 } : "skip",
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-global-search
          className="group flex h-9 w-full max-w-md items-center gap-2 rounded-xl glass-input px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-white/80"
        >
          <Search className="size-4 shrink-0" />
          <span className="truncate">Buscar cliente, serviço ou produto…</span>
          <kbd className="ml-auto hidden rounded-md border bg-white/70 px-1.5 py-0.5 text-[10px] font-medium sm:inline">
            /
          </kbd>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="glass-strong w-[min(92vw,28rem)] p-0">
        <div className="border-b p-2">
          <Input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Digite pelo menos 2 caracteres"
            className="glass-input border-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="scrollbar-slim max-h-80 overflow-y-auto p-1.5">
          {term.trim().length < 2 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              A busca cobre clientes, barbeiros, serviços, produtos, pacotes, planos e
              agendamentos de hoje.
            </p>
          ) : results === undefined ? (
            <Loading label="Buscando" />
          ) : results.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nada encontrado para “{term}”.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {results.map((r) => (
                <li key={`${r.type}-${r.link}-${r.title}`}>
                  <button
                    type="button"
                    onClick={() => {
                      navigate(r.link);
                      setTerm("");
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/70"
                  >
                    <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary/70">
                      {r.type}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {r.title}
                      </span>
                      {r.subtitle ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.subtitle}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationsBell() {
  const { orgId } = useOrg();
  const navigate = useNavigate();
  const data = useQuery(
    api.notifications.list,
    orgId ? { organizationId: orgId, limit: 30 } : "skip",
  );
  const markAllRead = useMutation(api.notifications.markAllRead);
  const update = useMutation(api.notifications.update);

  const severityTone: Record<string, string> = {
    critico: "bg-rose-500",
    alerta: "bg-amber-500",
    info: "bg-primary",
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative rounded-xl"
          aria-label="Alertas"
        >
          <Bell className="size-4" />
          {data?.unread ? (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {data.unread > 9 ? "9+" : data.unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="glass-strong w-[min(94vw,24rem)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Alertas</p>
          {data?.unread ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => void markAllRead({ organizationId: orgId! })}
            >
              Marcar todos como lidos
            </Button>
          ) : null}
        </div>
        <div className="scrollbar-slim max-h-96 overflow-y-auto p-1.5">
          {!data ? (
            <Loading />
          ) : data.notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              Nenhum alerta por aqui.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {data.notifications.map((n) => (
                <li key={n._id}>
                  <div className="flex items-start gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-accent/60">
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        severityTone[n.severity] ?? "bg-primary",
                      )}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        void update({
                          organizationId: orgId!,
                          notificationId: n._id,
                          action: "ler",
                        });
                        if (n.link) navigate(n.link);
                      }}
                    >
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {n.title}
                      </span>
                      <span className="block text-xs leading-relaxed text-muted-foreground">
                        {n.message}
                      </span>
                    </button>
                    {n.status === "nao_lida" ? (
                      <button
                        type="button"
                        aria-label="Resolver"
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        onClick={() =>
                          void update({
                            organizationId: orgId!,
                            notificationId: n._id,
                            action: "resolver",
                          })
                        }
                      >
                        <Plus className="size-3.5 rotate-45" />
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function OrgSwitcher() {
  const { memberships, org, role, select, can } = useOrg();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-xl glass-input px-2.5 py-1.5 text-left transition-colors hover:bg-white/85"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-[11px] font-semibold text-primary">
            {initials(org?.name ?? "BF")}
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block max-w-[10rem] truncate text-[13px] font-semibold leading-tight text-foreground">
              {org?.name ?? "Selecione uma unidade"}
            </span>
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              {org?.isDemo ? "Ambiente demo" : role ?? ""}
            </span>
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="glass-strong w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Unidades</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.org._id}
            onSelect={() => select(m.org._id)}
            className="gap-2.5"
          >
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-lg text-[11px] font-semibold",
                m.org._id === org?._id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {initials(m.org.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{m.org.name}</span>
              <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                {m.role}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
        {can("settings") ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/app/configuracoes")}>
              <Settings className="size-4" /> Configurações da unidade
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void signOut();
            navigate("/");
          }}
        >
          <LogOut className="size-4" /> Sair da conta
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { loading, org, can, canEdit } = useOrg();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);

  // Atalho "/" foca a busca global.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey) return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (typing) return;
      e.preventDefault();
      document.querySelector<HTMLButtonElement>("[data-global-search]")?.click();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const quickActions = useMemo(
    () =>
      [
        canEdit("agenda") ? { to: "/app/agenda", label: "Novo agendamento" } : null,
        canEdit("pos") ? { to: "/app/pdv", label: "Nova venda" } : null,
        canEdit("clients") ? { to: "/app/clientes", label: "Novo cliente" } : null,
      ].filter(Boolean) as { to: string; label: string }[],
    [canEdit],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loading label="Carregando sua unidade" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">
        <div className="glass m-3 flex h-[calc(100vh-1.5rem)] flex-col gap-4 rounded-2xl p-4">
          <Link to="/app" className="block">
            <BrandMark />
          </Link>
          <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto pb-2">
            <NavItems />
          </div>
          <div className="glass-chip rounded-xl p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="size-3.5" /> Dica
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Registre atendimentos direto pelo PDV: a venda, o caixa, a comissão e a
              fidelidade são atualizados sozinhos.
            </p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-4">
          <div className="glass flex items-center gap-2 rounded-2xl px-3 py-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Abrir menu"
                >
                  <Menu className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="glass-strong w-72 p-0">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <div className="flex h-full flex-col gap-4 p-4">
                  <BrandMark />
                  <div className="scrollbar-slim -mr-2 flex-1 overflow-y-auto pr-2">
                    <NavItems onNavigate={() => setMobileOpen(false)} />
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <Link to="/app" className="lg:hidden">
              <BrandMark small />
            </Link>

            <div className="hidden min-w-0 flex-1 md:block">
              <GlobalSearch />
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              {quickActions.length > 0 ? (
                <Button asChild size="sm" className="hidden sm:inline-flex">
                  <Link to={quickActions[0].to}>{quickActions[0].label}</Link>
                </Button>
              ) : null}
              <NotificationsBell />
              <div className="hidden h-6 w-px bg-border sm:block" />
              <OrgSwitcher />
              <span className="hidden size-8 items-center justify-center rounded-xl bg-primary/12 text-[11px] font-semibold text-primary xl:flex">
                {initials(user?.name ?? user?.email ?? "BF")}
              </span>
            </div>
          </div>
          {org?.isDemo ? (
            <p className="mt-2 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
              <Badge variant="secondary" className="rounded-full">
                Demo
              </Badge>
              Ambiente de demonstração com dados fictícios — nenhum registro é real.
            </p>
          ) : null}
        </header>

        <main ref={mainRef} className="min-w-0 flex-1 px-3 pb-24 pt-5 sm:px-5 lg:pb-10">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>

      {/* Navegação mobile inferior */}
      <nav className="glass-strong fixed inset-x-0 bottom-0 z-30 border-t px-2 py-1.5 lg:hidden">
        <ul className="mx-auto flex max-w-lg items-center justify-between">
          {MOBILE_NAV.filter((i) => can(i.cap)).map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-medium transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground",
                    )
                  }
                >
                  <item.icon className="size-4" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          <li>
            <NavLink
              to="/app/relatorios"
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )
              }
            >
              <HandCoins className="size-4" />
              Mais
            </NavLink>
          </li>
        </ul>
      </nav>
    </div>
  );
}

/** Wrapper padrão das rotas autenticadas. */
export function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}