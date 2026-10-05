import { motion } from "framer-motion";
import { ArrowLeft, Scissors } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="aurora" />
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass relative z-10 w-full max-w-lg rounded-3xl p-8 text-center"
      >
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Scissors className="size-5" />
        </span>
        <p className="mt-6 text-5xl font-semibold tracking-tight text-foreground">404</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
          Essa página não existe
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          O endereço acessado não corresponde a nenhuma rota do BarberFlow OS. Talvez o link
          esteja com dígito trocado.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Button asChild>
            <Link to="/app">
              <ArrowLeft className="size-4" /> Ir para o painel
            </Link>
          </Button>
          <Button asChild variant="outline" className="bg-white/60">
            <Link to="/">Voltar ao site</Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}