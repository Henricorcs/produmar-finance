"use client";

import { useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";
import { saveAlertConfig } from "@/app/(app)/configuracoes/actions";
import type { AlertType } from "@/lib/types";

interface AlertConfig {
  alert_type: AlertType;
  enabled: boolean;
  days_before: number | null;
}

interface Props {
  configs: AlertConfig[];
}

const ALERT_DEFINITIONS = [
  {
    type: "vencimento_proximo" as AlertType,
    label: "Vencimento próximo",
    description: "Receba alertas antes do vencimento de contas",
    dayOptions: [3, 7, 15],
  },
  {
    type: "vencido" as AlertType,
    label: "Contas vencidas",
    description: "Seja notificado quando uma conta vencer sem pagamento",
    dayOptions: null,
  },
  {
    type: "resumo_diario" as AlertType,
    label: "Resumo diário",
    description: "Receba um resumo financeiro todo dia às 8h",
    dayOptions: null,
  },
  {
    type: "resumo_semanal" as AlertType,
    label: "Resumo semanal",
    description: "Receba um resumo financeiro toda segunda-feira",
    dayOptions: null,
  },
] as const;

function isEnabled(configs: AlertConfig[], type: AlertType, days?: number | null): boolean {
  return configs.some(
    (c) => c.alert_type === type && c.enabled && (days === undefined || c.days_before === days)
  );
}

export function AlertConfigClient({ configs: initialConfigs }: Props) {
  const [configs, setConfigs] = useState<AlertConfig[]>(initialConfigs);
  const [isPending, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  function toggle(type: AlertType, days?: number | null) {
    const key = `${type}-${days ?? "null"}`;
    const currentEnabled = isEnabled(configs, type, days);
    const newEnabled = !currentEnabled;

    // Optimistic update
    setConfigs((prev) => {
      const existing = prev.find(
        (c) => c.alert_type === type && c.days_before === (days ?? null)
      );
      if (existing) {
        return prev.map((c) =>
          c.alert_type === type && c.days_before === (days ?? null)
            ? { ...c, enabled: newEnabled }
            : c
        );
      }
      return [...prev, { alert_type: type, enabled: newEnabled, days_before: days ?? null }];
    });

    setSavingKey(key);
    startTransition(async () => {
      await saveAlertConfig(type, newEnabled, days ?? null);
      setSavingKey(null);
    });
  }

  return (
    <div className="space-y-3">
      {ALERT_DEFINITIONS.map((def) => {
        if (def.dayOptions) {
          return (
            <div key={def.type} className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{def.label}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{def.description}</p>
              <div className="flex gap-2 flex-wrap">
                {def.dayOptions.map((days) => {
                  const enabled = isEnabled(configs, def.type, days);
                  const key = `${def.type}-${days}`;
                  return (
                    <button
                      key={days}
                      onClick={() => toggle(def.type, days)}
                      disabled={isPending && savingKey === key}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        enabled
                          ? "bg-produmar-600 border-produmar-600 text-white"
                          : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-produmar-300 hover:text-produmar-600"
                      }`}
                    >
                      {enabled ? (
                        <Bell className="w-3 h-3" />
                      ) : (
                        <BellOff className="w-3 h-3" />
                      )}
                      {days} dias antes
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }

        const enabled = isEnabled(configs, def.type);
        const key = `${def.type}-null`;

        return (
          <div
            key={def.type}
            className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0"
          >
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{def.label}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{def.description}</p>
            </div>
            <button
              onClick={() => toggle(def.type, null)}
              disabled={isPending && savingKey === key}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-produmar-500 focus:ring-offset-2 ${
                enabled ? "bg-produmar-600" : "bg-slate-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                  enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        );
      })}
      <p className="text-xs text-slate-400 pt-1">
        Os emails serão enviados via Resend (configurado na Fase 2 — requer chave de API).
      </p>
    </div>
  );
}
