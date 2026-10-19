import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Building2,
  Clock,
  Copy,
  FileDown,
  FileText,
  History,
  Info,
  KeyRound,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, Loading, PageHeader, SectionTitle, Tone } from "@/components/glass";
import { APP_ROLES, ROLE_LABELS } from "@/lib/rbac";
import type { AppRole } from "@/lib/rbac";
import { PAYMENT_LABELS } from "@/lib/format";
import { useOrg } from "@/lib/org-context";

export default function Configuracoes() {
  const { orgId, org, role, canEdit } = useOrg();
  const [tab, setTab] = useState("unidade");

  const audit = useQuery(
    api.notifications.listAudit,
    orgId ? { organizationId: orgId, limit: 80 } : "skip",
  );

  if (!orgId || !org) return <Loading />;

  const editable = canEdit("settings");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Gestão"
        title="Configurações"
        description="Dados da barbearia, horário de funcionamento, regras comerciais, equipe com permissões e trilha de auditoria."
      />

      <Tabs value={tab} onValueChange={setTab} className="glass rounded-2xl p-5">
        <TabsList className="glass-chip">
          <TabsTrigger value="unidade">Barbearia</TabsTrigger>
          <TabsTrigger value="horario">Horário</TabsTrigger>
          <TabsTrigger value="regras">Regras</TabsTrigger>
          <TabsTrigger value="equipe">Equipe</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
        </TabsList>

        <TabsContent value="unidade" className="mt-4">
          <ProfileForm
            key={org._id}
            orgId={orgId}
            initial={{
              name: org.name,
              phone: org.phone ?? "",
              email: org.email ?? "",
              address: org.address ?? "",
            }}
            editable={editable}
          />
        </TabsContent>

        <TabsContent value="horario" className="mt-4">
          <BusinessHoursForm key={`h-${org._id}`} orgId={orgId} editable={editable} />
        </TabsContent>

        <TabsContent value="regras" className="mt-4">
          <SettingsForm key={`s-${org._id}`} orgId={orgId} editable={editable} />
        </TabsContent>

        <TabsContent value="equipe" className="mt-4">
          <TeamSection orgId={orgId} isOwner={role === "owner"} canEditSettings={editable} />
          <InviteSection orgId={orgId} canEdit={editable} />
        </TabsContent>

        <TabsContent value="auditoria" className="mt-4">
          <section className="glass-chip rounded-2xl p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <History className="size-3.5" /> Últimas ações
            </p>
            {(audit ?? []).length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">Nenhum registro de auditoria.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1.5">
                {(audit ?? []).map((a) => (
                  <li key={a._id} className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="w-36 shrink-0 text-[11px] text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString("pt-BR")}
                    </span>
                    <Tone className="border-primary/25 bg-primary/10 text-primary">{a.module}</Tone>
                    <span className="min-w-0 flex-1 text-foreground">{a.summary}</span>
                    <span className="text-[11px] text-muted-foreground">{a.userName ?? "sistema"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>

        <TabsContent value="dados" className="mt-4">
          <DataSection orgId={orgId} editable={editable} compact />
        </TabsContent>

        <TabsContent value="backup" className="mt-4">
          <BackupSection orgId={orgId} editable={editable} />
        </TabsContent>
      </Tabs>

      {org.isDemo ? <DemoSection orgId={orgId} editable={editable} /> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- */

function ProfileForm({
  orgId,
  initial,
  editable,
}: {
  orgId: Id<"organizations">;
  initial: { name: string; phone: string; email: string; address: string };
  editable: boolean;
}) {
  const update = useMutation(api.orgs.updateOrganization);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);

  return (
    <section className="glass-chip rounded-2xl p-5">
      <SectionTitle
        title="Dados da barbearia"
        hint="Aparecem nos recibos, relatórios e comunicações"
        action={
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 className="size-3.5" /> Barbearia
          </span>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label className="text-xs">Nome</Label>
          <Input
            className="glass-input mt-1"
            disabled={!editable}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">WhatsApp</Label>
          <Input
            className="glass-input mt-1"
            disabled={!editable}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">E-mail</Label>
          <Input
            className="glass-input mt-1"
            disabled={!editable}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Endereço</Label>
          <Textarea
            className="glass-input mt-1"
            disabled={!editable}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>
      </div>
      {editable ? (
        <Button
          className="mt-4"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await update({
                organizationId: orgId,
                name: form.name,
                phone: form.phone || undefined,
                email: form.email || undefined,
                address: form.address || undefined,
              });
              toast.success("Dados atualizados");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Falha ao salvar");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Save className="size-4" /> {busy ? "Salvando…" : "Salvar alterações"}
        </Button>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Seu perfil não permite alterar as configurações da unidade.
        </p>
      )}
    </section>
  );
}

function BusinessHoursForm({
  orgId,
  editable,
}: {
  orgId: Id<"organizations">;
  editable: boolean;
}) {
  const { org } = useOrg();
  const update = useMutation(api.orgs.updateOrganization);
  const [hours, setHours] = useState(org?.businessHours ?? []);
  const [busy, setBusy] = useState(false);

  return (
    <section className="glass-chip rounded-2xl p-5">
      <SectionTitle
        title="Horário de funcionamento"
        hint="A agenda só permite agendamentos dentro destas faixas"
        action={
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> Fuso horário: (UTC/GMT -04:00) America/Manaus
          </span>
        }
      />
      <ul className="flex flex-col gap-2">
        {hours.map((d, i) => (
          <li key={d.weekday} className="flex items-center gap-3 rounded-xl bg-white/55 px-3 py-2">
            <Switch
              checked={d.enabled}
              disabled={!editable}
              onCheckedChange={(v) =>
                setHours(hours.map((h, j) => (i === j ? { ...h, enabled: v } : h)))
              }
            />
            <DayName weekday={d.weekday} />
            <Input
              type="time"
              className="glass-input h-8 w-32"
              disabled={!editable || !d.enabled}
              value={d.start}
              onChange={(e) =>
                setHours(hours.map((h, j) => (i === j ? { ...h, start: e.target.value } : h)))
              }
            />
            <span className="text-xs text-muted-foreground">até</span>
            <Input
              type="time"
              className="glass-input h-8 w-32"
              disabled={!editable || !d.enabled}
              value={d.end}
              onChange={(e) =>
                setHours(hours.map((h, j) => (i === j ? { ...h, end: e.target.value } : h)))
              }
            />
            <span className="ml-auto text-xs text-muted-foreground">
              {d.enabled ? "Atende" : "Fechado"}
            </span>
          </li>
        ))}
      </ul>
      {editable ? (
        <Button
          className="mt-4"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await update({ organizationId: orgId, businessHours: hours });
              toast.success("Horário atualizado");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Falha ao salvar");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Save className="size-4" /> {busy ? "Salvando…" : "Salvar horário"}
        </Button>
      ) : null}
    </section>
  );
}

function dayName(weekday: number) {
  return [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
  ][weekday] ?? "";
}

function DayName({ weekday }: { weekday: number }) {
  return <span className="w-28 text-sm text-foreground">{dayName(weekday)}</span>;
}

function SettingsForm({ orgId, editable }: { orgId: Id<"organizations">; editable: boolean }) {
  const { org } = useOrg();
  const update = useMutation(api.orgs.updateOrganization);
  const [s, setS] = useState(org?.settings);
  const [busy, setBusy] = useState(false);

  if (!s) return <Loading />;

  const methods = ["dinheiro", "debito", "credito", "pix"] as const;

  return (
    <div className="flex flex-col gap-4">
      <section className="glass-chip rounded-2xl p-5">
        <SectionTitle
          title="Comissões padrão"
          hint="Regra de comissão usada por padrão na unidade"
          action={<Settings2 className="size-4 text-muted-foreground" />}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Modelo</Label>
            <Select
              value={s.defaultCommissionModel}
              disabled={!editable}
              onValueChange={(v) =>
                setS({
                  ...s,
                  defaultCommissionModel: v as "herdar" | "percentual" | "fixo",
                })
              }
            >
              <SelectTrigger className="glass-input mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentual">Percentual</SelectItem>
                <SelectItem value="fixo">Valor fixo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">
              {s.defaultCommissionModel === "fixo" ? "Valor (R$)" : "Percentual (%)"}
            </Label>
            <Input
              className="glass-input mt-1"
              type="number"
              disabled={!editable}
              value={s.defaultCommissionValue}
              onChange={(e) =>
                setS({ ...s, defaultCommissionValue: Number(e.target.value) || 0 })
              }
            />
          </div>
          <div>
            <Label className="text-xs">Intervalo da agenda (min)</Label>
            <Input
              className="glass-input mt-1"
              type="number"
              step={5}
              disabled={!editable}
              value={s.appointmentSlotMin}
              onChange={(e) => setS({ ...s, appointmentSlotMin: Number(e.target.value) || 15 })}
            />
          </div>
        </div>
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-white/55 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>
            <strong className="font-semibold text-foreground">Como funciona o “Herdar”:</strong>{" "}
            cada serviço e cada barbeiro pode ter a própria comissão ou escolher “Herdar” para
            aproveitar a regra do nível acima. O serviço herdado usa a comissão do barbeiro; se o
            barbeiro também estiver como “Herdar”, vale a regra padrão definida aqui. Isso evita
            repetir o mesmo percentual em cada cadastro: mude só esta regra e toda a equipe que
            “herda” acompanha automaticamente.
          </span>
        </p>
      </section>

      <section className="glass-chip rounded-2xl p-5">
        <SectionTitle title="Fidelidade" hint="Pontos por real gasto e bônus por frequência" />
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Pontos por R$ 1</Label>
            <Input
              className="glass-input mt-1"
              type="number"
              step="0.5"
              disabled={!editable}
              value={s.loyaltyPointsPerReal}
              onChange={(e) => setS({ ...s, loyaltyPointsPerReal: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <Label className="text-xs">Bônus a cada N visitas</Label>
            <Input
              className="glass-input mt-1"
              type="number"
              disabled={!editable}
              value={s.loyaltyVisitRule.visits}
              onChange={(e) =>
                setS({
                  ...s,
                  loyaltyVisitRule: { ...s.loyaltyVisitRule, visits: Number(e.target.value) || 0 },
                })
              }
            />
          </div>
          <div>
            <Label className="text-xs">Pontos do bônus</Label>
            <Input
              className="glass-input mt-1"
              type="number"
              disabled={!editable}
              value={s.loyaltyVisitRule.points}
              onChange={(e) =>
                setS({
                  ...s,
                  loyaltyVisitRule: { ...s.loyaltyVisitRule, points: Number(e.target.value) || 0 },
                })
              }
            />
          </div>
        </div>
      </section>

      <section className="glass-chip rounded-2xl p-5">
        <SectionTitle title="Formas de pagamento ativas" hint="Aparecem no PDV e no caixa" />
        <div className="flex flex-wrap gap-2">
          {methods.map((m) => {
            const active = s.activePaymentMethods.includes(m);
            return (
              <button
                key={m}
                type="button"
                disabled={!editable}
                onClick={() =>
                  setS({
                    ...s,
                    activePaymentMethods: active
                      ? s.activePaymentMethods.filter((x) => x !== m)
                      : [...s.activePaymentMethods, m],
                  })
                }
                className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "glass-chip text-muted-foreground"
                }`}
              >
                {PAYMENT_LABELS[m]}
              </button>
            );
          })}
        </div>
      </section>

      <section className="glass-chip rounded-2xl p-5">
        <SectionTitle title="Políticas e operação" />
        <div className="flex flex-col gap-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="block text-foreground">Alerta de estoque mínimo</span>
              <span className="text-xs text-muted-foreground">
                Cria um alerta quando um produto chega ao mínimo
              </span>
            </span>
            <Switch
              checked={s.lowStockAlerts}
              disabled={!editable}
              onCheckedChange={(v) => setS({ ...s, lowStockAlerts: v })}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="block text-foreground">Permitir estoque negativo</span>
              <span className="text-xs text-muted-foreground">
                Libera vendas mesmo sem saldo em estoque
              </span>
            </span>
            <Switch
              checked={s.allowNegativeStock}
              disabled={!editable}
              onCheckedChange={(v) => setS({ ...s, allowNegativeStock: v })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Dias de inatividade para alerta</Label>
              <Input
                className="glass-input mt-1"
                type="number"
                disabled={!editable}
                value={s.inactivityDays}
                onChange={(e) => setS({ ...s, inactivityDays: Number(e.target.value) || 30 })}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Política de cancelamento</Label>
            <Textarea
              className="glass-input mt-1"
              disabled={!editable}
              value={s.cancellationPolicy}
              onChange={(e) => setS({ ...s, cancellationPolicy: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Política de faltas</Label>
            <Textarea
              className="glass-input mt-1"
              disabled={!editable}
              value={s.noShowPolicy}
              onChange={(e) => setS({ ...s, noShowPolicy: e.target.value })}
            />
          </div>
        </div>
      </section>

      {editable ? (
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await update({ organizationId: orgId, settings: s });
              toast.success("Regras atualizadas");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Falha ao salvar");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Save className="size-4" /> {busy ? "Salvando…" : "Salvar regras"}
        </Button>
      ) : null}
    </div>
  );
}

function TeamSection({
  orgId,
  isOwner,
  canEditSettings,
}: {
  orgId: Id<"organizations">;
  isOwner: boolean;
  canEditSettings: boolean;
}) {
  const barbers = useQuery(api.barbers.list, { organizationId: orgId, includeInactive: true });
  const updateRole = useMutation(api.orgs.updateMemberRole);
  const removeMember = useMutation(api.orgs.removeMember);
  const linkToMember = useMutation(api.barbers.linkToMember);

  return (
    <section className="glass-chip rounded-2xl p-5">
      <SectionTitle
        title="Equipe e permissões"
        hint="Cada perfil enxerga e edita um conjunto diferente de módulos"
        action={
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" /> {members?.length ?? 0} membro(s)
          </span>
        }
      />
      {(members ?? []).length === 0 ? (
        <EmptyState title="Nenhum membro" icon={UserPlus} />
      ) : (
        <ul className="flex flex-col gap-2">
          {(members ?? []).map((m) => (
            <li key={m._id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white/55 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-foreground">{m.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {m.email || "sem e-mail"}
                  {m.barberId
                    ? ` · vinculado a ${(barbers ?? []).find((b) => b._id === m.barberId)?.name ?? "barbeiro"}`
                    : ""}
                </span>
              </span>
              <Select
                value={m.role}
                disabled={!isOwner}
                onValueChange={async (v) => {
                  try {
                    await updateRole({
                      organizationId: orgId,
                      memberId: m._id,
                      role: v as AppRole,
                    });
                    toast.success("Permissão atualizada");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Falha ao alterar papel");
                  }
                }}
              >
                <SelectTrigger className="glass-input w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APP_ROLES.filter((r) => r !== "viewer" || m.role === "viewer").map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Tone className="glass-chip text-muted-foreground">
                edita {RBAC_SUMMARY[m.role as AppRole]}
              </Tone>
              {canEditSettings && !m.barberId ? (
                <Select
                  value="none"
                  onValueChange={async (v) => {
                    if (v === "none") return;
                    await linkToMember({
                      organizationId: orgId,
                      memberId: m._id,
                      barberId: v as Id<"barbers">,
                    });
                    toast.success("Vínculo criado");
                  }}
                >
                  <SelectTrigger className="glass-input w-40">
                    <SelectValue placeholder="Vincular" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Vincular barbeiro</SelectItem>
                    {(barbers ?? []).map((b) => (
                      <SelectItem key={b._id} value={b._id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {isOwner && m.role !== "owner" ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remover membro"
                  onClick={async () => {
                    try {
                      await removeMember({ organizationId: orgId, memberId: m._id });
                      toast.success("Membro removido");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Falha ao remover");
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DataSection({ orgId, editable, compact = false }: { orgId: Id<"organizations">; editable: boolean; compact?: boolean }) {
  return (
    <section className={compact ? "glass-chip rounded-2xl p-4" : "glass-chip rounded-2xl p-5"}>
      <SectionTitle
        title="Backup e portabilidade"
        hint="Baixe uma cópia completa dos dados desta unidade"
        action={<FileDown className="size-4 text-muted-foreground" />}
      />
      <div className="flex flex-wrap items-center gap-2">
        <BackupButton orgId={orgId} editable={editable} />
      </div>
      {!compact ? (
        <>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            O arquivo inclui clientes, agenda, vendas, caixa, despesas, estoque, pacotes,
            assinaturas, fidelidade e trilha de auditoria. Cada exportação fica registrada na
            auditoria com usuário e horário.
          </p>
          {!editable ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Somente proprietário e administrador podem exportar os dados.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function BackupSection({ orgId, editable }: { orgId: Id<"organizations">; editable: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <section className="glass-chip rounded-2xl p-5">
        <SectionTitle
          title="Exportação"
          hint="Baixe uma cópia local dos dados desta unidade"
          action={<FileDown className="size-4 text-muted-foreground" />}
        />
        <BackupButton orgId={orgId} editable={editable} />
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          O arquivo JSON inclui os registros de todas as tabelas vinculadas à unidade. Esse é o
          seu backup portátil: use para guardar uma cópia externa, migrar ou atender pedidos de
          portabilidade/exclusão de dados do cliente.
        </p>
        {!editable ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Somente proprietário e administrador podem gerar a exportação.
          </p>
        ) : null}
      </section>

      <section className="glass-chip rounded-2xl p-5">
        <SectionTitle
          title="Privacidade e LGPD"
          hint="Documentos publicados e como atender pedidos de titulares"
          action={<FileText className="size-4 text-muted-foreground" />}
        />
        <ul className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
          <li>
            Política de Privacidade:{" "}
            <Link to="/privacidade" className="font-medium text-primary hover:underline">
              /privacidade
            </Link>
          </li>
          <li>
            Termos de Uso:{" "}
            <Link to="/termos" className="font-medium text-primary hover:underline">
              /termos
            </Link>
          </li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Pedidos de acesso, correção, portabilidade ou exclusão de dados de um cliente podem ser
          atendidos aqui: gere o backup da unidade e, quando necessário, exclua o cadastro do
          cliente em Clientes. Lembre-se de que registros financeiros e fiscais podem ter prazo
          legal de guarda.
        </p>
      </section>
    </div>
  );
}

function BackupButton({
  orgId,
  editable,
}: {
  orgId: Id<"organizations">;
  editable: boolean;
}) {
  const exportData = useMutation(api.backup.exportOrganizationData);
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const snapshot = await exportData({ organizationId: orgId });
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `barberflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup gerado", {
        description: `${snapshot.totalRows} registros exportados${
          snapshot.truncated.length > 0
            ? ` · tabelas limitadas: ${snapshot.truncated.join(", ")}`
            : ""
        }.`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao exportar os dados");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      className="bg-white/60"
      disabled={!editable || busy}
      onClick={handleExport}
    >
      <FileDown className="size-4" /> {busy ? "Gerando…" : "Exportar dados (JSON)"}
    </Button>
  );
}

const RBAC_SUMMARY: Record<AppRole, string> = {
  owner: "tudo",
  admin: "tudo",
  manager: "operação",
  barber: "agenda e clientes",
  cashier: "vendas e caixa",
  viewer: "somente leitura",
};

function InviteSection({ orgId, canEdit }: { orgId: Id<"organizations">; canEdit: boolean }) {
  const { org } = useOrg();
  const regenerate = useMutation(api.orgs.regenerateInviteCode);
  const [copied, setCopied] = useState(false);

  return (
    <section className="glass-chip mt-4 rounded-2xl p-5">
      <SectionTitle
        title="Código de convite"
        hint="Compartilhe com quem vai entrar na unidade"
        action={<KeyRound className="size-4 text-muted-foreground" />}
      />
      <div className="flex flex-wrap items-center gap-3">
        <span className="glass-input rounded-xl px-4 py-2 text-lg font-semibold tracking-[0.3em] text-primary">
          {org?.inviteCode ?? "—"}
        </span>
        <Button
          variant="outline"
          className="bg-white/60"
          onClick={async () => {
            if (!org?.inviteCode) return;
            await navigator.clipboard?.writeText(org.inviteCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          <Copy className="size-4" /> {copied ? "Copiado" : "Copiar"}
        </Button>
        {canEdit ? (
          <Button
            variant="ghost"
            onClick={async () => {
              await regenerate({ organizationId: orgId });
              toast.success("Novo código gerado");
            }}
          >
            <RefreshCw className="size-4" /> Gerar novo
          </Button>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        A pessoa entra em Onboarding → “Tenho um convite”. O primeiro usuário a entrar com um
        código novo pode ser definido como gerente pelo proprietário.
      </p>
    </section>
  );
}

function DemoSection({ orgId, editable }: { orgId: Id<"organizations">; editable: boolean }) {
  const reset = useMutation(api.orgs.resetDemoData);
  const clear = useMutation(api.orgs.clearDemoData);
  const [busy, setBusy] = useState<"reset" | "clear" | null>(null);

  if (!editable) return null;

  return (
    <section className="glass rounded-2xl border-l-4 border-l-primary/50">
      <SectionTitle
        title="Dados de demonstração"
        hint="Recrie ou remova a base fictícia desta unidade"
        action={<span className="text-xs text-muted-foreground">Ambiente demo</span>}
      />
      <div className="flex flex-wrap gap-2 px-5 pb-5">
        <Button
          variant="outline"
          className="bg-white/60"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("reset");
            try {
              await reset({ organizationId: orgId });
              toast.success("Dados demo recriados");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Falha ao recriar");
            } finally {
              setBusy(null);
            }
          }}
        >
          <RefreshCw className="size-4" /> {busy === "reset" ? "Recriando…" : "Recriar dados"}
        </Button>
        <Button
          variant="ghost"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("clear");
            try {
              await clear({ organizationId: orgId });
              toast.success("Dados demo removidos", {
                description: "A unidade ficou sem clientes, vendas e agenda.",
              });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Falha ao limpar");
            } finally {
              setBusy(null);
            }
          }}
        >
          <Trash2 className="size-4" /> {busy === "clear" ? "Limpando…" : "Limpar tudo"}
        </Button>
      </div>
      <p className="px-5 pb-5 text-[11px] text-muted-foreground">
        Todas as ações nesta base fictícia ficam registradas na auditoria.
      </p>
    </section>
  );
}