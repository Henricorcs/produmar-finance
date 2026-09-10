import type { MachineServicoStatus, ServiceOrderStatus } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// EM QUE PÉ A OS ESTÁ
//
// O sistema tem duas famílias de OS, e cada uma guarda o andamento de um jeito:
//
//   • a OS de serviço (service_orders, do módulo Operações) tem quatro estados
//     no banco: pendente, em andamento, entregue, cancelado;
//   • a OS da ficha do veículo (machine_servicos) tem só dois — aberta ou
//     concluída. Quem responde se ela já COMEÇOU é o `started_at`, gravado
//     quando o operador toca em INICIAR no painel dele.
//
// Para quem cobra o serviço, porém, "OS parada" é uma coisa só. Este arquivo é
// o lugar onde as duas viram a MESMA palavra — assim "pendente" quer dizer o
// mesmo em qualquer relatório, e não uma coisa na Frota e outra em Relatórios.
// ─────────────────────────────────────────────────────────────────────────────

export type SituacaoOs = "pendente" | "andamento" | "finalizada" | "cancelada";

export const SITUACAO_LABEL: Record<SituacaoOs, string> = {
  pendente:   "Pendente",
  andamento:  "Em andamento",
  finalizada: "Finalizada",
  cancelada:  "Cancelada",
};

/** No plural, para os selos de contagem ("3 pendentes"). */
export const SITUACAO_PLURAL: Record<SituacaoOs, string> = {
  pendente:   "pendentes",
  andamento:  "em andamento",
  finalizada: "finalizadas",
  cancelada:  "canceladas",
};

export const SITUACAO_STYLE: Record<SituacaoOs, string> = {
  pendente:   "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  andamento:  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  finalizada: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  cancelada:  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

/** A OS do módulo Operações traduzida para a situação comum. */
export function situacaoDoServico(status: ServiceOrderStatus): SituacaoOs {
  if (status === "entregue") return "finalizada";
  if (status === "em_andamento") return "andamento";
  if (status === "cancelado") return "cancelada";
  return "pendente";
}

/** A OS da ficha do veículo traduzida para a situação comum. */
export function situacaoDaMaquina(
  status: MachineServicoStatus,
  startedAt?: string | null
): SituacaoOs {
  if (status === "concluida") return "finalizada";
  return startedAt ? "andamento" : "pendente";
}
