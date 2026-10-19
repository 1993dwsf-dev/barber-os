import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  CalendarPlus,
  Cake,
  MessageCircle,
  NotebookPen,
  Phone,
  Save,
  Star,
  Ticket,
  TrendingUp,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, KeyValue, Loading, SectionTitle, StatCard, Tone } from "@/components/glass";
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_TONES,
  PAYMENT_LABELS,
  brl,
  fmtDate,
  fmtPhone,
  initials,
  whatsappLink,
} from "@/lib/format";
import { useOrg } from "@/lib/org-context";

export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orgId, canEdit } = useOrg();
  const data = useQuery(
    api.clients.profile,
    orgId && id ? { organizationId: orgId, clientId: id as Id<"clients"> } : "skip",
  );

  if (!id || !orgId) return <Loading />;
  if (!data) return <Loading label="Abrindo a ficha do cliente" />;

  const c = data.client;
  const media = brl(
    c.totalVisits > 0 ? Math.round(c.totalSpentCents / c.totalVisits) : 0,
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="glass rounded-2xl p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-base font-semibold text-primary">
              {initials(c.name)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">{c.name}</h1>
                {c.status === "inativo" ? (
                  <Tone className="border-zinc-200 bg-zinc-100 text-zinc-600">Inativo</Tone>
                ) : null}
                {c.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="rounded-full text-[10px]">
                    {t}
                  </Badge>
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Phone className="size-3.5" /> {fmtPhone(c.phone)}
                </span>
                {c.email ? <span>{c.email}</span> : null}
                {c.birthDate ? (
                  <span className="flex items-center gap-1">
                    <Cake className="size-3.5" /> {fmtDate(c.birthDate)}
                  </span>
                ) : null}
                {c.lastVisitDate ? (
                  <span>
                    Última visita: {fmtDate(c.lastVisitDate)}
                    {c.inactiveDays !== null ? ` (há ${c.inactiveDays} dias)` : ""}
                  </span>
                ) : (
                  <span className="text-amber-600">Nunca foi atendido</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="bg-white/60" asChild>
              <a
                href={whatsappLink(
                  c.phone,
                  `Olá ${c.name}! Passando da barbearia para saber do seu próximo horário.`,
                )}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            </Button>
            <Button variant="ghost" onClick={() => navigate("/app/clientes")}>
              <ArrowLeft className="size-4" /> Voltar
            </Button>
          </div>
        </div>

        {data.nextAppointment ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl glass-chip px-3 py-2 text-xs">
            <CalendarPlus className="size-3.5 text-primary" />
            Próximo atendimento: <strong>{fmtDate(data.nextAppointment.date)}</strong> às{" "}
            <strong>{data.nextAppointment.startTime}</strong>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Visitas" value={c.totalVisits} icon={Users} />
        <StatCard label="Total gasto" value={brl(c.totalSpentCents)} icon={TrendingUp} tone="positive" />
        <StatCard label="Ticket médio" value={media} />
        <StatCard
          label="Pontos de fidelidade"
          value={data.loyaltyAccount?.points ?? 0}
          icon={Star}
          tone="primary"
          hint={
            data.loyaltyAccount
              ? `${data.loyaltyAccount.totalEarned} ganhos · ${data.loyaltyAccount.totalRedeemed} resgatados`
              : "Sem conta de fidelidade"
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Tabs defaultValue="agenda" className="glass rounded-2xl p-5">
          <TabsList className="glass-chip">
            <TabsTrigger value="agenda">Agendamentos</TabsTrigger>
            <TabsTrigger value="vendas">Vendas</TabsTrigger>
            <TabsTrigger value="pacotes">Pacotes</TabsTrigger>
            <TabsTrigger value="fidelidade">Fidelidade</TabsTrigger>
          </TabsList>

          <TabsContent value="agenda" className="mt-4">
            {data.appointments.length === 0 ? (
              <EmptyState title="Sem agendamentos" icon={CalendarPlus} />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {data.appointments.map((a) => (
                  <li key={a._id} className="flex flex-wrap items-center gap-2 rounded-xl glass-chip px-3 py-2">
                    <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {fmtDate(a.date)} {a.startTime}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                      {a.serviceName} · {a.barberName}
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
          </TabsContent>

          <TabsContent value="vendas" className="mt-4">
            {data.sales.length === 0 ? (
              <EmptyState title="Nenhuma venda registrada" />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {data.sales.map(({ sale, items, payments }) => (
                  <li key={sale._id} className="rounded-xl glass-chip px-3 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="tabular-nums text-muted-foreground">#{sale.number}</span>
                      <span className="tabular-nums text-muted-foreground">{fmtDate(sale.date)}</span>
                      <span className="ml-auto font-semibold tabular-nums text-foreground">
                        {brl(sale.totalCents)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[13px] text-foreground">
                      {items.map((i) => `${i.quantity}x ${i.name}`).join(" · ")}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {payments.map((p) => PAYMENT_LABELS[p.method]).join(" + ") || "sem pagamento"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="pacotes" className="mt-4 flex flex-col gap-4">
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                Pacotes de serviços
              </p>
              {data.packages.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum pacote ativo.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {data.packages.map(({ clientPackage, package: pkg }) => (
                    <li key={clientPackage._id} className="rounded-xl glass-chip px-3 py-2 text-[13px]">
                      <div className="flex items-center gap-2">
                        <Ticket className="size-3.5 text-primary" />
                        <span className="min-w-0 flex-1 truncate text-foreground">
                          {pkg?.name ?? "Pacote"}
                        </span>
                        <Tone className="glass-chip text-muted-foreground">
                          {clientPackage.creditsTotal - clientPackage.creditsUsed}/
                          {clientPackage.creditsTotal} créditos
                        </Tone>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Comprado em {fmtDate(clientPackage.purchaseDate)} · validade até{" "}
                        {fmtDate(clientPackage.expiryDate)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                Assinaturas
              </p>
              {data.memberships.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma assinatura.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {data.memberships.map(({ membership, plan }) => (
                    <li key={membership._id} className="rounded-xl glass-chip px-3 py-2 text-[13px]">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-foreground">
                          {plan?.name ?? "Plano"}
                        </span>
                        <Tone
                          className={
                            membership.status === "ativa"
                              ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                              : "border-zinc-200 bg-zinc-100 text-zinc-600"
                          }
                        >
                          {membership.status}
                        </Tone>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {brl(membership.priceCents)}/mês · renova em{" "}
                        {fmtDate(membership.renewalDate)} ·{" "}
                        {Math.max(0, membership.creditsTotal - membership.creditsUsed)} créditos
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          <TabsContent value="fidelidade" className="mt-4">
            {data.loyaltyTransactions.length === 0 ? (
              <EmptyState title="Sem movimentações de pontos" icon={Star} />
            ) : (
              <ul className="flex flex-col gap-1">
                {data.loyaltyTransactions.map((t) => (
                  <li key={t._id} className="flex items-center gap-2 rounded-xl glass-chip px-3 py-1.5 text-[13px]">
                    <span className="tabular-nums text-muted-foreground">{fmtDate(t.date)}</span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{t.reason}</span>
                    <span
                      className={`font-semibold tabular-nums ${
                        t.points >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {t.points >= 0 ? "+" : ""}
                      {t.points}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex flex-col gap-4">
          <EditClientCard
            clientId={c._id}
            initial={{
              name: c.name,
              phone: c.phone,
              email: c.email ?? "",
              birthDate: c.birthDate ?? "",
              tags: c.tags.join(", "),
              notes: c.notes ?? "",
              status: c.status,
            }}
            canEdit={canEdit("clients")}
          />

          <section className="glass rounded-2xl">
            <SectionTitle title="Anotações" hint="Histórico de relacionamento" />
            <div className="px-5 pb-5">
              <AddNote clientId={c._id} canEdit={canEdit("clients")} />
              {data.notes.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Nenhuma anotação registrada ainda.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {data.notes.map((n) => (
                    <li key={n._id} className="rounded-xl glass-chip px-3 py-2">
                      <p className="text-[13px] text-foreground">{n.body}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {new Date(n.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="glass rounded-2xl">
            <SectionTitle title="Resumo" />
            <div className="divide-y divide-white/50 px-5 pb-5">
              <KeyValue label="Serviços favoritos">
                {data.favoriteServices.length > 0
                  ? data.favoriteServices.map((f) => f.name).join(", ")
                  : "—"}
              </KeyValue>
              <KeyValue label="Avaliação média">
                {data.avgRating ? `${data.avgRating.toFixed(1)} / 5` : "sem avaliações"}
              </KeyValue>
              <KeyValue label="Cadastrado em">
                {new Date(c.createdAt).toLocaleDateString("pt-BR")}
              </KeyValue>
              <KeyValue label="Follow-ups abertos">              {data.followups.filter((f) =>
                f.status === "pendente" || f.status === "em_andamento"
              ).length}

              </KeyValue>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function EditClientCard({
  clientId,
  initial,
  canEdit,
}: {
  clientId: Id<"clients">;
  initial: {
    name: string;
    phone: string;
    email: string;
    birthDate: string;
    tags: string;
    notes: string;
    status: "ativo" | "inativo";
  };
  canEdit: boolean;
}) {
  const { orgId } = useOrg();
  const update = useMutation(api.clients.update);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);

  if (!canEdit) {
    return (
      <section className="glass rounded-2xl">
        <SectionTitle title="Dados do cliente" />
        <div className="divide-y divide-white/50 px-5 pb-5">
          <KeyValue label="Nome">{form.name}</KeyValue>
          <KeyValue label="Telefone">{fmtPhone(form.phone)}</KeyValue>
          <KeyValue label="E-mail">{form.email || "—"}</KeyValue>
          <KeyValue label="Nascimento">{form.birthDate ? fmtDate(form.birthDate) : "—"}</KeyValue>
          <KeyValue label="Etiquetas">{form.tags || "—"}</KeyValue>
          <KeyValue label="Observações">{form.notes || "—"}</KeyValue>
        </div>
      </section>
    );
  }

  return (
    <section className="glass rounded-2xl">
      <SectionTitle title="Dados do cliente" hint="Edição permitida pelo seu perfil" />
      <form
        className="grid gap-3 px-5 pb-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!orgId) return;
          setBusy(true);
          try {
            await update({
              organizationId: orgId,
              clientId,
              name: form.name,
              phone: form.phone,
              email: form.email || undefined,
              birthDate: form.birthDate || undefined,
              tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
              notes: form.notes || undefined,
              status: form.status,
            });
            toast.success("Cliente atualizado");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Falha ao salvar");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <Label className="text-xs">Nome</Label>
          <Input
            className="glass-input mt-1"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Telefone</Label>
            <Input
              className="glass-input mt-1"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Nascimento</Label>
            <Input
              className="glass-input mt-1"
              type="date"
              value={form.birthDate}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Etiquetas (vírgula)</Label>
          <Input
            className="glass-input mt-1"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Observações</Label>
          <Textarea
            className="glass-input mt-1"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <Select
          value={form.status}
          onValueChange={(v) => setForm({ ...form, status: v as "ativo" | "inativo" })}
        >
          <SelectTrigger className="glass-input">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ativo">Cliente ativo</SelectItem>
            <SelectItem value="inativo">Cliente inativo</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={busy}>
          <Save className="size-4" /> {busy ? "Salvando…" : "Salvar alterações"}
        </Button>
      </form>
    </section>
  );
}

function AddNote({ clientId, canEdit }: { clientId: Id<"clients">; canEdit: boolean }) {
  const { orgId } = useOrg();
  const addNote = useMutation(api.clients.addNote);
  const [body, setBody] = useState("");
  if (!orgId || !canEdit) return null;

  return (
    <div className="flex gap-2">
      <Textarea
        className="glass-input"
        placeholder="Registrar uma anotação sobre o cliente…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <Button
        size="sm"
        disabled={body.trim().length < 2}
        onClick={async () => {
          await addNote({ organizationId: orgId, clientId, body: body.trim() });
          setBody("");
          toast.success("Anotação registrada");
        }}
      >
        <NotebookPen className="size-4" />
      </Button>
    </div>
  );
}