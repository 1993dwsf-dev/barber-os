import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, Loader2, Mail, Scissors } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

type Step = "signIn" | "signUp" | "verify" | "resetRequest" | "resetVerify" | "otpRequest" | "otpVerify";
const googleEnabled = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === "true";
// Escopo limitado ao piloto. Login Google é a única opção visível, sem alterar a homologação.
const googleOnly = import.meta.env.VITE_MVP_GOOGLE_ONLY === "true";
const isStaging = import.meta.env.VITE_STAGING_ONLY === "true";
// Habilitar somente com BARBER_EMAIL_PROVIDER=manual no Convex comercial.
const manualCodes = import.meta.env.VITE_MANUAL_CODE_DELIVERY_ENABLED === "true" ||
  (import.meta.env.VITE_PRODUCTION_ENABLED === "true" &&
   import.meta.env.VITE_STAGING_ONLY === "false");

function safeReturnTo(value: string | null, fallback: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

function credentials(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

export default function AuthV2({ redirectAfterAuth = "/app" }: { redirectAfterAuth?: string }) {
  const { signIn, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = safeReturnTo(params.get("returnTo"), redirectAfterAuth);

  const [step, setStep] = useState<Step>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate(redirect, { replace: true });
  }, [authLoading, isAuthenticated, navigate, redirect]);

  function move(next: Step) {
    setStep(next);
    setError(null);
    setPassword("");
    setNewPassword("");
    setCode("");
  }

  function errorMessage(fallback: string) {
    setError(fallback);
  }

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === "signUp" && (password.length < 10 || password.length > 128 || !/[a-zA-Z]/.test(password) || !/\d/.test(password))) {
        setError("Use uma senha de 10 a 128 caracteres, com letras e números.");
        return;
      }
      const done = await signIn("password", credentials({
        email: email.trim().toLowerCase(),
        password,
        flow: step,
      }));
      if (!done.signingIn) {
        setPassword("");
        setCode("");
        setStep("verify");
      } else {
        navigate(redirect, { replace: true });
      }
    } catch {
      errorMessage(step === "signUp"
        ? "Não foi possível criar a conta. Confira o e-mail ou utilize o acesso anterior."
        : "E-mail ou senha incorretos, ou conta não verificada.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("password", credentials({ email: email.trim().toLowerCase(), code, flow: "email-verification" }));
      navigate(redirect, { replace: true });
    } catch {
      errorMessage("O código é inválido ou expirou. Solicite uma nova verificação.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("password", credentials({ email: email.trim().toLowerCase(), flow: "reset" }));
      setCode("");
      setStep("resetVerify");
    } catch {
      errorMessage("Não foi possível enviar o código. Confira seu e-mail.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (newPassword.length < 10 || newPassword.length > 128 || !/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
        setError("Use uma senha de 10 a 128 caracteres, com letras e números.");
        return;
      }
      await signIn("password", credentials({
        email: email.trim().toLowerCase(), code, newPassword, flow: "reset-verification",
      }));
      navigate(redirect, { replace: true });
    } catch {
      errorMessage("Código inválido ou expirado. Solicite outro código.");
    } finally {
      setBusy(false);
    }
  }

  async function handleOtpRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("email-otp", credentials({ email: email.trim().toLowerCase() }));
      setStep("otpVerify");
      setCode("");
    } catch {
      errorMessage("Não foi possível enviar o código de acesso.");
    } finally {
      setBusy(false);
    }
  }

  async function handleOtpVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("email-otp", credentials({ email: email.trim().toLowerCase(), code }));
      navigate(redirect, { replace: true });
    } catch {
      errorMessage("Código inválido ou expirado.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signIn("google", { redirectTo: redirect });
    } catch {
      errorMessage("Não foi possível iniciar o login Google. Verifique a configuração OAuth.");
      setBusy(false);
    }
  }

  const titles: Record<Step, string> = {
    signIn: "Entre na sua barbearia",
    signUp: "Crie sua conta",
    verify: "Confirme seu e-mail",
    resetRequest: "Recuperar senha",
    resetVerify: "Crie uma nova senha",
    otpRequest: "Acesso por código",
    otpVerify: "Confira seu e-mail",
  };
  const codeStep = step === "verify" || step === "resetVerify" || step === "otpVerify";
  const passwordStep = step === "signIn" || step === "signUp";

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="aurora" />
      <div className="glass relative z-10 w-full max-w-md rounded-3xl p-6 sm:p-8">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Voltar ao site
        </Link>
        <div className="mt-6 inline-flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Scissors className="size-6" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-foreground">{googleOnly ? "Entre no Barber OS" : titles[step]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {step === "signIn" && (googleOnly
            ? "Use sua conta Google. A criação de uma barbearia exige convite individual."
            : googleEnabled ? "Entre com seu e-mail e senha ou continue com o Google." : "Entre com seu e-mail e senha.")}
          {step === "signUp" && (manualCodes
            ? "Após criar a conta, solicite o código de ativação ao suporte pelo contato utilizado na contratação."
            : "Seu e-mail será verificado antes do primeiro acesso.")}
          {step === "resetRequest" && (manualCodes
            ? "Solicite ao suporte a recuperação de senha. O código será entregue após confirmação da sua identidade."
            : "Enviaremos um código para redefinir sua senha.")}
          {step === "otpRequest" && "Use o código por e-mail durante a migração de contas existentes."}
          {codeStep && (manualCodes
            ? <>Código solicitado para <strong>{email}</strong>. Entre em contato com o suporte pelo canal combinado. Não compartilhe o código recebido.</>
            : <>Enviamos um código para <strong>{email}</strong>.</>)}
        </p>

        {error && <div role="alert" className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-600">{error}</div>}

        {!googleOnly && (passwordStep || step === "otpRequest" || step === "resetRequest") && (
          <form onSubmit={passwordStep ? handlePassword : step === "otpRequest" ? handleOtpRequest : handleResetRequest} className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-xs font-medium">E-mail</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="login-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required className="glass-input pl-9" placeholder="voce@barbearia.com.br" disabled={busy} />
              </div>
            </div>
            {passwordStep && (
              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium">Senha</label>
                <div className="relative">
                  <Input id="login-password" type={showPassword ? "text" : "password"} autoComplete={step === "signUp" ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} minLength={step === "signUp" ? 10 : undefined} required className="glass-input pr-10" disabled={busy} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {step === "signUp" && <p className="mt-1 text-xs text-muted-foreground">De 10 a 128 caracteres, com letras e números.</p>}
              </div>
            )}
            <Button className="w-full" type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              {step === "signIn" ? "Entrar" : step === "signUp" ? "Criar conta" : "Enviar código"}
            </Button>
          </form>
        )}

        {!googleOnly && codeStep && (
          <form className="mt-6 space-y-4" onSubmit={step === "verify" ? handleVerify : step === "resetVerify" ? handleResetVerify : handleOtpVerify}>
            <div>
              <label htmlFor="auth-code" className="mb-1.5 block text-xs font-medium">Código de verificação</label>
              <Input id="auth-code" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={step === "otpVerify" ? 6 : 8} value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ""))} placeholder={step === "otpVerify" ? "6 dígitos" : "8 dígitos"} required disabled={busy} />
            </div>
            {step === "resetVerify" && (
              <div>
                <label htmlFor="new-password" className="mb-1.5 block text-xs font-medium">Nova senha</label>
                <Input id="new-password" type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={e => setNewPassword(e.target.value)} required disabled={busy} />
              </div>
            )}
            <Button className="w-full" type="submit" disabled={busy || code.length !== (step === "otpVerify" ? 6 : 8)}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              {step === "resetVerify" ? "Salvar nova senha" : "Verificar código"}
            </Button>
          </form>
        )}

        {(googleOnly || (step === "signIn" && googleEnabled)) && googleEnabled && (
          <div className="mt-5">
            {!googleOnly && (
              <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />ou<span className="h-px flex-1 bg-border" />
              </div>
            )}
            <Button type="button" className="w-full" variant="outline" disabled={busy} onClick={handleGoogle}>
              <span aria-hidden="true" className="text-base font-bold">G</span> Entrar com Google
            </Button>
          </div>
        )}

        {googleOnly && !googleEnabled && (
          <p role="alert" className="mt-6 rounded-xl border border-destructive/30 p-3 text-sm text-destructive">
            Login Google indisponível neste ambiente. Solicite suporte ao administrador.
          </p>
        )}

        {!googleOnly && <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
          {step === "signIn" && <>
            <button type="button" className="text-primary hover:underline" onClick={() => move("signUp")}>Criar conta</button>
            <button type="button" className="text-primary hover:underline" onClick={() => move("resetRequest")}>Esqueci minha senha</button>
            {!manualCodes && <button type="button" className="text-primary hover:underline" onClick={() => move("otpRequest")}>Entrar com código</button>}
          </>}
          {step !== "signIn" && <button type="button" className="text-primary hover:underline" onClick={() => move("signIn")}>Voltar para entrar</button>}
          {step === "verify" && <button type="button" className="text-primary hover:underline" onClick={() => move("signUp")}>Solicitar novo código</button>}
          {step === "resetVerify" && <button type="button" className="text-primary hover:underline" onClick={() => move("resetRequest")}>Solicitar outro código</button>}
        </div>}

        {isStaging && !googleOnly && (
          <p className="mt-6 rounded-xl bg-amber-500/10 p-3 text-center text-xs text-muted-foreground">
            Ambiente de homologação: acesso restrito ao e-mail autorizado. Não utilize dados reais de clientes.
          </p>
        )}
        {googleOnly && (
          <p className="mt-6 rounded-xl bg-primary/5 p-3 text-center text-xs text-muted-foreground">
            Piloto fechado. Entre com o e-mail Google que recebeu o convite da plataforma.
            O acesso à barbearia só é concedido depois de validar seu convite.
          </p>
        )}
      </div>
    </main>
  );
}
