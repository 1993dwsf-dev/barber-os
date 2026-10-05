import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Clock, Percent, Plus, Scissors, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { EmptyState, Loading, PageHeader, StatCard, Tone } from "@/components/glass";
import { brl, centsToInput, reaisToCents } from "@/lib/format";
import { useOrg } from "@/lib/org-context";

export default function Servicos() {
  const { orgId, canEdit, org } = useOrg();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Id<"services"> | null>(null);

  const services = useQuery(
    api.services.list,
    orgId ? { organizationId: orgId, includeInactive: true } : "skip",
  );
  const categories = useQuery(api.services.categories, orgId ? { organizationId: orgId } : "skip");

  if (!orgId) return <Loading />;

  const list = (services ?? []).filter((s) => {
    if (category !== "all" && s.category !== category) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const byCategory = list.reduce<Record<string, typeof list>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  const avgPrice = list.length
    ? Math.round(list.reduce((s, x) => s + x.priceCents, 0) / list.length)
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Catálogo"
        title="Serviços"
        description="Preço, duração e regra de comissão de cada serviço. Esses valores alimentam a agenda, o PDV e o cálculo de comissões."
        actions={
          canEdit("catalog") ? (
            <Button onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="size-4" /> Novo serviço
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Serviços cadastrados" value={(services ?? []).length} icon={Scissors} />
        <StatCard
          label="Ativos"
          value={(services ?? []).filter((s) => s.active).length}
          tone="positive"
        />
        <StatCard
          label="Preço médio"
          value={brl(avgPrice)}
          hint={`Padrão de comissão: ${
            org?.settings.defaultCommissionModel === "fixo"
              ? "valor fixo"
              : `${org?.settings.defaultCommissionValue ?? 0}%`
          }`}
        />
      </div>

      <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="glass-input pl-9"
            placeholder="Buscar serviço…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="glass-input w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {(categories ?? []).map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">{list.length} serviço(s)</span>
      </div>

      {list.length === 0 ? (
        <section className="glass rounded-2xl">
          <EmptyState
            title="Nenhum serviço encontrado"
            description="Ajuste a busca ou cadastre o primeiro serviço do catálogo."
            icon={Scissors}
            action={
              canEdit("catalog") ? (
                <Button onClick={() => setOpen(true)}>
                  <Plus className="size-4" /> Novo serviço
                </Button>
              ) : null
            }
          />
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {Object.entries(byCategory).map(([cat, items]) => (
            <section key={cat} className="glass rounded-2xl">
              <div className="flex items-center justify-between border-b px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">{cat}</h2>
                <Badge variant="secondary" className="rounded-full text-[10px]">
                  {items.length}
                </Badge>
              </div>
              <ul className="flex flex-col gap-2 p-5">
                {items.map((s) => (
                  <li key={s._id} className="flex flex-wrap items-center gap-3 rounded-xl glass-chip px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">{s.name}</span>
                        {!s.active ? (
                          <Tone className="border-zinc-200 bg-zinc-100 text-zinc-600">Inativo</Tone>
                        ) : null}
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" /> {s.durationMin} min
                        </span>
                        <span className="flex items-center gap-1">
                          <Percent className="size-3" />
                          {s.commissionModel === "herdar"
                            ? "herda"
                            : s.commissionModel === "percentual"
                              ? `${s.commissionValue ?? 0}%`
                              : brl(s.commissionValue ?? 0)}
                        </span>
                        {s.description ? <span className="truncate">{s.description}</span> : null}
                      </span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {brl(s.priceCents)}
                    </span>
                    {canEdit("catalog") ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(s._id);
                          setOpen(true);
                        }}
                      >
                        Editar
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ServiceDialog
        open={open}
        onOpenChange={setOpen}
        serviceId={editing}
        onSaved={() => {
          setOpen(false);
          toast.success("Serviço salvo");
        }}
      />
    </div>
  );
}

function ServiceDialog({
  open,
  onOpenChange,
  serviceId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  serviceId: Id<"services"> | null;
  onSaved: () => void;
}) {
  const { orgId, org } = useOrg();
  const services = useQuery(
    api.services.list,
    orgId && serviceId ? { organizationId: orgId, includeInactive: true } : "skip",
  );
  const categories = useQuery(api.services.categories, orgId ? { organizationId: orgId } : "skip");
  const create = useMutation(api.services.create);
  const update = useMutation(api.services.update);
  const current = (services ?? []).find((s) => s._id === serviceId);

  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("30");
  const [price, setPrice] = useState("");
  const [model, setModel] = useState<"herdar" | "percentual" | "fixo">("herdar");
  const [value, setValue] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (current && loadedFor !== current._id) {
    setLoadedFor(current._id);
    setCategory(current.category);
    setName(current.name);
    setDescription(current.description ?? "");
    setDuration(String(current.durationMin));
    setPrice(centsToInput(current.priceCents));
    setModel(current.commissionModel);
    setValue(current.commissionValue?.toString() ?? "");
    setActive(current.active);
  }

  async function submit() {
    if (!orgId) return;
    if (name.trim().length < 2 || !category) {
      setError("Informe nome e categoria.");
      return;
    }
    setBusy(true);
    setError(null);
    const commissionValue = value.trim() ? Number(value.replace(",", ".")) : undefined;
    const payload = {
      category,
      name: name.trim(),
      description: description || undefined,
      durationMin: Number(duration) || 30,
      priceCents: reaisToCents(price),
      commissionModel: model,
      commissionValue: model === "herdar" ? undefined : commissionValue,
    };
    try {
      if (serviceId) await update({ organizationId: orgId, serviceId, ...payload, active });
      else await create({ organizationId: orgId, ...payload });
      setLoadedFor(null);
      setName("");
      setDescription("");
      setPrice("");
      setValue("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong">
        <DialogHeader>
          <DialogTitle>{serviceId ? "Editar serviço" : "Novo serviço"}</DialogTitle>
          <DialogDescription>
            Duração e preço são aplicados automaticamente na agenda e no PDV.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="glass-input mt-1.5">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(categories ?? []).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome</Label>
              <Input className="glass-input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Duração (minutos)</Label>
              <Input
                className="glass-input mt-1.5"
                type="number"
                min={5}
                step={5}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div>
              <Label>Preço (R$)</Label>
              <Input
                className="glass-input mt-1.5"
                inputMode="decimal"
                placeholder="0,00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div>
              <Label>Comissão</Label>
              <Select value={model} onValueChange={(v) => setModel(v as typeof model)}>
                <SelectTrigger className="glass-input mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="herdar">Herdar da barbearia</SelectItem>
                  <SelectItem value="percentual">Percentual</SelectItem>
                  <SelectItem value="fixo">Valor fixo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{model === "percentual" ? "Percentual" : "Valor (R$)"}</Label>
              <Input
                className="glass-input mt-1.5"
                disabled={model === "herdar"}
                inputMode="decimal"
                placeholder={model === "percentual" ? String(org?.settings.defaultCommissionValue ?? 40) : "0,00"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea
              className="glass-input mt-1.5"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {serviceId ? (
            <label className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <Switch checked={active} onCheckedChange={setActive} />
              Serviço ativo (aparece na agenda e no PDV)
            </label>
          ) : null}
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}