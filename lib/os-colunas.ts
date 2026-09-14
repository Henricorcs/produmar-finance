// ─────────────────────────────────────────────────────────────────────────────
// AS COLUNAS DA OS, SEM A ASSINATURA
// ─────────────────────────────────────────────────────────────────────────────
// A assinatura de quem recebeu o serviço fica na própria OS (service_orders.
// signature), gravada como IMAGEM em texto — um PNG inteiro por OS finalizada,
// uns 20 KB cada.
//
// Toda lista que pedia a OS com `select("*")` levava a assinatura junto, sem
// mostrá-la em lugar nenhum: quem desenha a assinatura é só a folha impressa da
// OS (/imprimir/os/[id]), que busca a sua própria OS inteira. Medido em
// 14/09/2026: 102 das 157 OS tinham assinatura, 2.172 KB ao todo — e a tela de
// Relatórios mandava TUDO isso para o celular a cada abertura (84% dos 2,6 MB
// da tela). Operações, 337 KB dos 398 KB. E cresce a cada OS finalizada.
//
// Por isso as listas pedem as colunas pelo nome. O PostgREST não sabe dizer
// "tudo menos esta", então a lista abaixo é a tabela inteira MENOS a
// assinatura, conferida contra o banco na mesma data.
//
// COLUNA NOVA EM service_orders PRECISA ENTRAR AQUI — senão ela chega vazia nas
// telas de lista (a folha impressa continua vendo, porque usa `*`).
// ─────────────────────────────────────────────────────────────────────────────

export const COLUNAS_OS_SEM_ASSINATURA = [
  "id",
  "order_number",
  "type",
  "freight_type",
  "status",
  "client_name",
  "client_document",
  "client_phone",
  "machine_id",
  "pickup_location_id",
  "delivery_address",
  "service_description",
  "issue_date",
  "delivery_date",
  "total_amount",
  "transaction_id",
  "notes",
  "created_by",
  "created_at",
  "updated_at",
  "hourmeter_start",
  "hourmeter_end",
  "received_by",
  "km_start",
  "km_end",
  "hourly_rate",
  "service_cost",
  "fuel_cost",
  "billing_mode",
  "freight_value",
  "trips_count",
  "start_time",
  "end_time",
  "end_latitude",
  "end_longitude",
  "end_location_accuracy",
  "origin_address",
  "assigned_to",
  "completion_notes",
  "finalized_by",
  "obra_id",
  "supply_obra_id",
].join(", ");
