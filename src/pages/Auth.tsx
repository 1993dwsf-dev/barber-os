import AuthV2 from "./AuthV2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, ArrowRight, Loader2, Mail, Scissors, Sparkles, UserX } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

const isStaging = import.meta.env.VITE_STAGING_ONLY === "true";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(returnTo: string | null, fallback = "/dashboard") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

const HIGHLIGHTS = [
  "Agenda com bloqueio de horário e lista de espera",
  "PDV com pagamento dividido e baixa automática de estoque",
  "Comissões, caixa e fidelidades atualizados no atendimento",
  "Relatórios com exportação em CSV",
];

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
    } catch (err) {
      console.error("Email sign-in error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível enviar o código. Tente novamente.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch (err) {
      console.error("OTP verification error:", err);
      setError("O código digitado não confere. Confira e tente novamente.");
      setOtp("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (err) {
      console.error("Guest login error:", err);
      setError(
        `Não foi possível entrar como visitante: ${
          err instanceof Error ? err.message : "erro desconhecido"
        }`,
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="aurora" />

      <div className="relative z-10 grid w-full max-w-5xl gap-4 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        {/* Painel de apresentação */}
        <aside className="hidden flex-col gap-6 rounded-3xl glass p-8 lg:flex">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Scissors className="size-5" />
            </span>
            <span>
              <span className="block text-base font-semibold tracking-tight text-foreground">
                Barber <span className="text-primary">OS</span>
              </span>
              <span className="block text-[11px] text-muted-foreground">
                Sistema operacional para barbearias
              </span>
            </span>
          </Link>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
            Sua barbearia em um só lugar
          </h1>
          <ul className="flex flex-col gap-3">
            {HIGHLIGHTS.map((h) => (
              <li key={h} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                {h}
              </li>
            ))}
          </ul>
          <p className="glass-chip mt-auto rounded-2xl p-4 text-xs leading-relaxed text-muted-foreground">
            {isStaging
              ? "Homologação: acesso restrito ao e-mail autorizado. Não use dados reais."
              : "Entre com seu e-mail para criar sua barbearia ou experimente o ambiente de demonstração."}
          </p>
        </aside>

        {/* Formulário */}
        <main className="glass rounded-3xl p-6 sm:p-8">
          <Link
            to="/"
            className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Voltar ao site
          </Link>

          {step === "signIn" ? (
            <>
              <div className="lg:hidden">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Scissors className="size-5" />
                </span>
              </div>
              <h2 className="mt-4 text-xl font-semibold tracking-tight text-foreground lg:mt-0">
                Entre na sua barbearia
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enviamos um código de 6 dígitos para o seu e-mail. Sem senha para lembrar.
              </p>

              <form onSubmit={handleEmailSubmit} className="mt-6">
                <label htmlFor="auth-email" className="text-xs font-medium text-foreground">
                  E-mail
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="auth-email"
                      name="email"
                      placeholder="voce@barbearia.com.br"
                      type="email"
                      className="glass-input pl-9"
                      disabled={isLoading}
                      required
                    />
                  </div>
                  <Button type="submit" size="icon" disabled={isLoading} aria-label="Enviar código">
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ArrowRight className="size-4" />
                    )}
                  </Button>
                </div>

                {error ? (
                  <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-600">
                    {error}
                  </p>
                ) : null}

                {!isStaging && (
                  <>
                <div className="my-5 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    ou
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full bg-white/60"
                  onClick={handleGuestLogin}
                  disabled={isLoading}
                >
                  <UserX className="size-4" />
                  Entrar como visitante (ambiente demo)
                </Button>
                  </>
                )}
              </form>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Confira seu e-mail
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enviamos o código de acesso para <strong>{step.email}</strong>.
              </p>
              <form onSubmit={handleOtpSubmit} className="mt-6">
                <input type="hidden" name="email" value={step.email} />
                <input type="hidden" name="code" value={otp} />
                <div className="flex justify-center">
                  <InputOTP
                    value={otp}
                    onChange={setOtp}
                    maxLength={6}
                    disabled={isLoading}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && otp.length === 6 && !isLoading) {
                        (e.target as HTMLElement).closest("form")?.requestSubmit();
                      }
                    }}
                  >
                    <InputOTPGroup>
                      {Array.from({ length: 6 }).map((_, index) => (
                        <InputOTPSlot key={index} index={index} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                {error ? (
                  <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-center text-xs text-rose-600">
                    {error}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  className="mt-6 w-full"
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Verificando…
                    </>
                  ) : (
                    <>
                      Verificar código
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-2 w-full"
                  onClick={() => setStep("signIn")}
                  disabled={isLoading}
                >
                  Usar outro e-mail
                </Button>
              </form>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  if (import.meta.env.VITE_AUTH_V2_ENABLED === "true" || import.meta.env.VITE_MVP_GOOGLE_ONLY === "true") {
    return <AuthV2 {...props} />;
  }
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}