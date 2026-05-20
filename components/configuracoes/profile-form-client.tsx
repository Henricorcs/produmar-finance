"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateProfile } from "@/app/(app)/configuracoes/actions";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  financeiro: "Financeiro",
  visualizador: "Visualizador",
};

interface Props {
  fullName: string;
  email: string;
  role: string;
}

export function ProfileFormClient({ fullName, email, role }: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateProfile(formData);
      if (result && "error" in result) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({ type: "ok", text: "Perfil atualizado!" });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="full_name">Nome completo</Label>
        <Input id="full_name" name="full_name" defaultValue={fullName} />
      </div>
      <div className="flex items-center justify-between py-2 border-b border-produmar-50 dark:border-slate-800">
        <span className="text-sm text-slate-500 dark:text-slate-400">Email</span>
        <span className="text-sm font-medium text-produmar-800 dark:text-slate-200">{email}</span>
      </div>
      <div className="flex items-center justify-between py-2 border-b border-produmar-50 dark:border-slate-800">
        <span className="text-sm text-slate-500 dark:text-slate-400">Papel</span>
        <span className="text-sm font-medium text-produmar-800 dark:text-slate-200">{ROLE_LABELS[role] ?? role}</span>
      </div>

      {message && (
        <p
          className={`text-sm px-3 py-2 rounded-lg ${
            message.type === "ok"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
              : "bg-red-50 text-red-700 border border-red-100"
          }`}
        >
          {message.text}
        </p>
      )}

      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        {isPending ? "Salvando..." : "Salvar nome"}
      </Button>
    </form>
  );
}
