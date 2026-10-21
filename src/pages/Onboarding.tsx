import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { useNavigate } from "react-router";
import {
  ArrowRight,
  KeyRound,
  Loader2,
  Scissors,
  Sparkles,
  Store,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOrg } from "@/lib/org-context";
import { useAuth } from "@/hooks/use-auth";

const STEPS = [
  "Identidade da barbearia",
  "Horário de funcionamento",
  "Equipe e barbeiros",
  "Serviços e preços",
  "Produtos e estoque",
  "Clientes",
  "Forma de pagamento",
  "Pronto para atender",
];

export default function Onboarding() {
  const { select, memberships } = useOrg();
  const createOrganization = useMutation(api.orgs.createOrganization);
  const joinByInviteCode = useMutation(api.orgs.joinByInviteCode);
  const enterDemoMode = useMutation(api.orgs.enterDemoMode);
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const [mode, setMode] = useState<"create" | "join" | "demo">("create");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const orgId = await createOrganization({
        name,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
      });
      select(orgId);
      toast.success("Barbearia criada!", {
        description: "Agora cadastre a equipe e o catálogo em Configurações.",
      });
      navigate("/app/configuracoes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar a barbearia.");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await joinByInviteCode({ code: code.trim().toUpperCase() });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      select(result.organizationId);
      toast.success("Você entrou na unidade!");
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código inválido.");
    } finally {
      setBusy(false);
    }
  }

  function handleSignOut() {
    // Volta para o site primeiro; a sessão é limpa em seguida.
    navigate("/");
    try {
      window.localStorage.removeItem("barberflow:org");
    } catch {
      // localStorage pode estar bloqueado em iframes restritos.
    }
    void signOut().catch(() => {});
  }

  async function handleDemo() {
    setBusy(true);
    setError(null);
    try {
      const orgId = await enterDemoMode({});
      select(orgId);
      toast.success("Ambiente demo carregado", {
        description: "Uma barbearia fictícia com 45 dias de histórico.",
      });
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao abrir o demo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="aurora" />
      <div className="relative z-10 grid w-full max-w-5xl gap-4 lg:grid-cols-[1fr_1.1fr]">
        {/* Coluna de contexto */}
        <aside className="flex flex-col gap-5 rounded-3xl glass p-7">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Scissors className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Vamos configurar sua barbearia
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              O BarberFlow OS guarda cada operação no banco: quando você concluir um
              atendimento, a venda, o caixa, a comissão e a fidelidade são gravados juntos.
            </p>
          </div>
          <ol className="mt-2 flex flex-col gap-2">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-sm">
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ${
                    i === 0
                      ? "bg-primary text-primary-foreground"
                      : "glass-chip text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </span>
                <span className={i === 0 ? "font-medium text-foreground" : "text-muted-foreground"}>
                  {s}
                </span>
              </li>
            ))}
          </ol>
          {memberships.length > 0 ? (
            <button
              type="button"
              onClick={() => navigate("/app")}
              className="mt-auto text-xs text-primary underline-offset-4 hover:underline"
            >
              Voltar para {memberships[0].org.name}
            </button>
          ) : null}
        </aside>

        {/* Formulário */}
        <main className="glass rounded-3xl p-6 sm:p-8">
          <div className="flex gap-2">
            {(
              [
                { id: "create", label: "Criar barbearia" },
                { id: "join", label: "Tenho um convite" },
                { id: "demo", label: "Ver o demo" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setMode(t.id);
                  setError(null);
                }}
                className={`flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                  mode === t.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "glass-chip text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {error ? (
            <p className="mt-4 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-600">
              {error}
            </p>
          ) : null}

          {mode === "create" ? (
            <form onSubmit={handleCreate} className="mt-6 flex flex-col gap-4">
              <div>
                <Label htmlFor="ob-name">Nome da barbearia</Label>
                <Input
                  id="ob-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Barbearia Navalha de Ouro"
                  className="glass-input mt-1.5"
                  required
                  disabled={busy}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="ob-phone">WhatsApp</Label>
                  <Input
                    id="ob-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 98765-4321"
                    className="glass-input mt-1.5"
                    disabled={busy}
                  />
                </div>
                <div>
                  <Label htmlFor="ob-email">E-mail de contato</Label>
                  <Input
                    id="ob-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contato@barbearia.com.br"
                    className="glass-input mt-1.5"
                    disabled={busy}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="ob-address">Endereço</Label>
                <Textarea
                  id="ob-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Rua, número, bairro, cidade/UF"
                  className="glass-input mt-1.5"
                  disabled={busy}
                />
              </div>
              <Button type="submit" className="mt-2" disabled={busy || name.trim().length < 2}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Store className="size-4" />}
                Criar barbearia
                {!busy ? <ArrowRight className="size-4" /> : null}
              </Button>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Você será o proprietário. Horário de funcionamento, catálogo e regras
                comerciais vêm com valores padrão e podem ser ajustados depois em
                Configurações.
              </p>
            </form>
          ) : null}

          {mode === "join" ? (
            <form onSubmit={handleJoin} className="mt-6 flex flex-col gap-4">
              <div>
                <Label htmlFor="ob-code">Código de convite</Label>
                <Input
                  id="ob-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={12}
                  className="glass-input mt-1.5 text-center text-lg font-semibold tracking-[0.3em]"
                  required
                  disabled={busy}
                />
              </div>
              <Button type="submit" disabled={busy || code.trim().length < 4}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                Entrar na unidade
              </Button>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Peça o código ao proprietário da barbearia. Ele fica em Configurações →
                Equipe → Código de convite.
              </p>
            </form>
          ) : null}

          {mode === "demo" ? (
            <div className="mt-6 flex flex-col gap-4">
              <div className="glass-chip rounded-2xl p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles className="size-4 text-primary" /> Ambiente de demonstração
                </p>
                <ul className="mt-3 flex flex-col gap-2 text-[13px] text-muted-foreground">
                  <li>• Barbearia fictícia “Barbearia Navalha de Ouro”, em São Paulo</li>
                  <li>• 4 barbeiros, 25 clientes, 45 dias de agenda e vendas</li>
                  <li>• Agenda, vendas, fidelidade, despesas e comissões</li>
                  <li>• Você pode redefinir ou limpar os dados a qualquer momento</li>
                </ul>
              </div>
              <Button type="button" onClick={handleDemo} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Abrir ambiente demo
              </Button>
            </div>
          ) : null}

          <div className="mt-8 border-t pt-4 text-center">
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Sair da conta
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}