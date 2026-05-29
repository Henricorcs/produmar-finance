"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, Loader2, AlertCircle } from "lucide-react";
import { signInAction } from "./actions";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signInAction(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="min-h-screen flex">
      {/* Lado esquerdo — hero brand */}
      <div className="hidden lg:flex lg:w-1/2 produmar-hero relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center">
              <Wallet className="w-7 h-7 text-produmar-600" />
            </div>
            <div>
              <div className="text-xl font-medium">PRODUMAR Finance</div>
              <div className="text-sm text-produmar-100">Controle financeiro</div>
            </div>
          </div>

          <div className="space-y-6">
            <h1 className="text-5xl font-medium leading-tight">
              Suas contas,<br />
              sob controle.
            </h1>
            <p className="text-produmar-100 text-lg max-w-md">
              Acompanhe receitas, despesas e fluxo de caixa da PRODUMAR em tempo real.
              Importe notas fiscais e extratos bancários em segundos.
            </p>
          </div>

          <div className="text-produmar-200 text-sm">
            PRODUMAR — Controle financeiro interno
          </div>
        </div>
      </div>

      {/* Lado direito — formulário */}
      <div className="flex-1 flex items-center justify-center p-6 produmar-gradient dark:bg-slate-950">
        <div className="w-full max-w-md">
          {/* Logo mobile */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-produmar-600 rounded-xl flex items-center justify-center">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div className="text-lg font-medium text-produmar-800 dark:text-slate-100">PRODUMAR Finance</div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-produmar-100 dark:border-slate-800 shadow-xl shadow-produmar-600/5 p-8">
            <h2 className="text-2xl font-medium text-produmar-800 dark:text-slate-100 mb-1">
              Bem-vindo de volta
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Entre com suas credenciais para continuar
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="seuemail@empresa.com.br"
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  minLength={6}
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 rounded-md text-sm text-red-700 dark:text-red-400">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={pending} size="lg">
                {pending && <Loader2 className="w-4 h-4 animate-spin" />}
                Entrar
              </Button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-500 dark:text-slate-500 mt-6">
            © {new Date().getFullYear()} PRODUMAR. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
