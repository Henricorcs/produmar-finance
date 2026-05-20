"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { signInAction, signUpAction } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result =
        mode === "signin" ? await signInAction(formData) : await signUpAction(formData);
      if (result?.error) setError(result.error);
      if ((result as any)?.ok) {
        setSuccess("Cadastro feito! Verifique seu email para confirmar e depois faça login.");
        setMode("signin");
      }
    });
  }

  return (
    <div className="min-h-screen flex">
      {/* Lado esquerdo - hero brand */}
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
              <div className="text-xl font-medium">ILNET Finance</div>
              <div className="text-sm text-produmar-100">Controle financeiro</div>
            </div>
          </div>

          <div className="space-y-6">
            <h1 className="text-5xl font-medium leading-tight">
              Suas contas,<br />
              sob controle.
            </h1>
            <p className="text-produmar-100 text-lg max-w-md">
              Acompanhe receitas, despesas e fluxo de caixa da ILNET em tempo real.
              Importe notas fiscais e extratos bancários em segundos.
            </p>
          </div>

          <div className="text-produmar-200 text-sm">
            ILNET Telecom — São Mateus do Maranhão
          </div>
        </div>
      </div>

      {/* Lado direito - form */}
      <div className="flex-1 flex items-center justify-center p-6 produmar-gradient dark:bg-slate-950">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-produmar-600 rounded-xl flex items-center justify-center">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div className="text-lg font-medium text-produmar-800">ILNET Finance</div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-produmar-100 dark:border-slate-800 shadow-xl shadow-produmar-600/5 p-8">
            <h2 className="text-2xl font-medium text-produmar-800 dark:text-slate-100 mb-1">
              {mode === "signin" ? "Bem-vindo de volta" : "Criar conta"}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              {mode === "signin"
                ? "Entre com suas credenciais para continuar"
                : "Preencha seus dados para começar"}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <Label htmlFor="full_name">Nome completo</Label>
                  <Input
                    id="full_name"
                    name="full_name"
                    type="text"
                    placeholder="José Silva"
                    required
                    autoComplete="name"
                  />
                </div>
              )}

              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="seuemail@ilnet.com.br"
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
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-md text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-md text-sm text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={pending} size="lg">
                {pending && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === "signin" ? "Entrar" : "Criar conta"}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-produmar-100 dark:border-slate-800 text-center text-sm text-slate-600 dark:text-slate-400">
              {mode === "signin" ? (
                <>
                  Não tem conta?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setError(null);
                      setSuccess(null);
                    }}
                    className="text-produmar-600 font-medium hover:underline"
                  >
                    Criar conta
                  </button>
                </>
              ) : (
                <>
                  Já tem conta?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setError(null);
                      setSuccess(null);
                    }}
                    className="text-produmar-600 font-medium hover:underline"
                  >
                    Entrar
                  </button>
                </>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-slate-500 dark:text-slate-500 mt-6">
            © {new Date().getFullYear()} ILNET Telecom. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
