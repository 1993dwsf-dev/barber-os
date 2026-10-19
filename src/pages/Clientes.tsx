import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, Loading, PageHeader, StatCard, Tone } from "@/components/glass";
import { brl, fmtDate, fmtPhone, initials } from "@/lib/format";
import { useOrg } from "@/lib/org-context";

const PAGE_SIZE = 20;

export default function Clientes() {
  const { orgId, canEdit } = useOrg();
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(search);
  const [tag, setTag] = useState("all");
  const [filter, setFilter] = useState<"todos" | "inativos" | "novos" | "vip">("todos");
  const [sort, setSort] = useState<"nome" | "recorrencia" | "gasto" | "ultima">("nome");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);

  // Debounce simples da busca.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const tags = useQuery(api.clients.tags, orgId ? { organizationId: orgId } : "skip");
  const data = useQuery(
    api.clients.list,
    orgId
      ? {
          organizationId: orgId,
          search: debounced.trim() || undefined,
          tag: tag !== "all" ? tag : undefined,
          filter: filter === "todos" ? undefined : filter,
          sort,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        }
      : "skip",
  );

  const all = useQuery(
    api.clients.list,
    orgId ? { organizationId: orgId, limit: 1000, sort: "gasto" } : "skip",
  );

  const summary = useMemo(() => {
    const list = all?.clients ?? [];
    return {
      total: all?.total ?? 0,
      active: list.filter((c) => c.status === "ativo").length,
      revenue: list.reduce((s, c) => s + c.totalSpentCents, 0),
      vip: list.filter((c) => c.tags.includes("VIP")).length,
    };
  }, [all]);

  if (!orgId) return <Loading />;

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Relacionamento"
        title="Clientes"
        description="Base única de clientes: histórico de atendimentos, gasto, etiquetas e pontos de fidelidade."
        actions={
          canEdit("clients") ? (
            <Button onClick={() => setOpen(true)}>
              <UserPlus className="size-4" /> Novo cliente
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total de clientes" value={summary.total} icon={Users} />
        <StatCard label="Ativos" value={summary.active} tone="positive" />
        <StatCard label="Receita acumulada" value={brl(summary.revenue)} icon={Plus} />
        <StatCard label="Clientes VIP" value={summary.vip} tone="primary" />
      </div>

      <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone…"
          className="glass-input w-full sm:w-72"
        />
        <Select value={tag} onValueChange={setTag}>
          <SelectTrigger className="glass-input w-40">
            <SelectValue placeholder="Etiqueta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as etiquetas</SelectItem>
            {(tags ?? []).map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filter} onValueChange={(v) => { setFilter(v as typeof filter); setPage(0); }}>
          <SelectTrigger className="glass-input w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="inativos">Inativos</SelectItem>
            <SelectItem value="novos">Novos (30 dias)</SelectItem>
            <SelectItem value="vip">VIP</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="glass-input w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nome">Ordenar por nome</SelectItem>
            <SelectItem value="gasto">Maior gasto</SelectItem>
            <SelectItem value="ultima">Visita mais recente</SelectItem>
            <SelectItem value="recorrencia">Mais visitas</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="size-3.5" />
          {total} cliente(s)
        </span>
      </div>

      <section className="glass rounded-2xl">
        <div className="px-5 py-4">
          {!data ? (
            <Loading />
          ) : data.clients.length === 0 ? (
            <EmptyState
              title="Nenhum cliente encontrado"
              description="Ajuste os filtros ou cadastre um novo cliente."
              icon={Users}
            />
          ) : (
            <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {data.clients.map((c) => (
                <li key={c._id}>
                  <Link
                    to={`/app/clientes/${c._id}`}
                    className="glass-chip flex items-start gap-3 rounded-2xl p-3 transition-all hover:-translate-y-0.5 hover:bg-white/80"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-xs font-semibold text-primary">
                      {initials(c.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">
                          {c.name}
                        </span>
                        {c.status === "inativo" ? (
                          <Tone className="border-zinc-200 bg-zinc-100 text-zinc-600">Inativo</Tone>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {fmtPhone(c.phone)}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        {c.tags.slice(0, 3).map((t) => (
                          <Badge key={t} variant="secondary" className="rounded-full text-[10px]">
                            {t}
                          </Badge>
                        ))}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>{c.totalVisits} visita(s)</span>
                        <span>{brl(c.totalSpentCents)}</span>
                        {c.lastVisitDate ? (
                          <span>
                            última: {fmtDate(c.lastVisitDate)}
                            {c.inactiveDays !== null && c.inactiveDays > 45 ? (
                              <span className="ml-1 text-amber-600">({c.inactiveDays}d)</span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-amber-600">sem atendimento</span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="size-4" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {page + 1} de {pages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima <ChevronRight className="size-4" />
          </Button>
        </div>
      </section>

      <NewClientDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => {
          setOpen(false);
          toast.success("Cliente cadastrado");
        }}
      />
    </div>
  );
}

function NewClientDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const { orgId } = useOrg();
  const create = useMutation(api.clients.create);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!orgId) return;
    if (name.trim().length < 2 || phone.replace(/\D/g, "").length < 8) {
      setError("Informe nome e telefone válido.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await create({
        organizationId: orgId,
        name: name.trim(),
        phone: phone.trim(),
        email: email || undefined,
        birthDate: birthDate || undefined,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        notes: notes || undefined,
        consentMarketing: consent,
      });
      setName("");
      setPhone("");
      setEmail("");
      setBirthDate("");
      setTags("");
      setNotes("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível cadastrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong">
        <DialogHeader>
          <DialogTitle>Novo cliente</DialogTitle>
          <DialogDescription>
            O telefone precisa estar completo (DDD + número) para o botão de WhatsApp
            funcionar.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label>Nome completo</Label>
            <Input className="glass-input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>WhatsApp</Label>
              <Input
                className="glass-input mt-1.5"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 98765-4321"
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                className="glass-input mt-1.5"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Nascimento</Label>
              <Input
                className="glass-input mt-1.5"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Etiquetas (separadas por vírgula)</Label>
              <Input
                className="glass-input mt-1.5"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="VIP, Barba, Quizaca"
              />
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea className="glass-input mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <label className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
            Autoriza o contato por WhatsApp para campanhas e avisos.
          </label>
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Salvando…" : "Cadastrar cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}