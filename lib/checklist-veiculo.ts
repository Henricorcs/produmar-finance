import { dataPorExtenso } from "./utils";
import { CIDADE_DA_CONFISSAO } from "./confissao-divida";
import { ASSINA_PELA_PRODUMAR } from "./compra-venda-contrato";
import type { VehicleDeliveryChecklist } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// O CHECKLIST DE ENTREGA DE VEÍCULO — o que a folha impressa e o PDF de
// compartilhar dizem, num lugar só: os dois saem sempre iguais.
// ─────────────────────────────────────────────────────────────────────────────

/** Quem vende e entrega: a PRODUMAR, como na confissão de dívida. */
export const VENDEDOR_DO_CHECKLIST = "PRODUMAR SERVIÇOS LTDA";
export const REPRESENTANTE_DO_VENDEDOR = ASSINA_PELA_PRODUMAR;

/** Os itens conferidos na entrega — Sim / Não e observação, à caneta. */
export const ITENS_DO_CHECKLIST = [
  "Documento do veículo (CRLV)",
  "Chave reserva",
  "Manual do proprietário",
  "Estepe",
  "Macaco",
  "Chave de roda",
  "Triângulo",
  "Extintor",
  "Tapetes",
  "Rádio / multimídia",
  "Pneus em bom estado",
  "Lataria e pintura sem avarias",
  "Faróis e lanternas funcionando",
];

export const NIVEIS_DE_COMBUSTIVEL = ["Reserva", "1/4", "1/2", "3/4", "Cheio"];

export type ChecklistParaFolha = Pick<
  VehicleDeliveryChecklist,
  | "buyer_name"
  | "buyer_document"
  | "buyer_rg"
  | "buyer_address"
  | "buyer_phone"
  | "vehicle_model"
  | "vehicle_plate"
  | "vehicle_year"
  | "vehicle_color"
  | "vehicle_chassis"
  | "vehicle_renavam"
  | "vehicle_km"
  | "delivery_place"
  | "delivery_date"
  | "notes"
>;

export function ehCnpjDoComprador(c: ChecklistParaFolha): boolean {
  return (c.buyer_document ?? "").replace(/\D/g, "").length === 14;
}

/** A declaração de recebimento que o comprador assina. */
export function declaracaoDoChecklist(c: ChecklistParaFolha): string {
  const veiculo = [c.vehicle_model, c.vehicle_plate && `placa ${c.vehicle_plate}`].filter(Boolean).join(", ");
  return (
    `Declaro, para os devidos fins, que recebi de ${VENDEDOR_DO_CHECKLIST} o veículo acima descrito` +
    `${veiculo ? ` (${veiculo})` : ""}, nas condições indicadas neste checklist, que conferi pessoalmente ` +
    "item por item no ato da entrega, assumindo a partir desta data e hora a responsabilidade pela sua " +
    "guarda e uso."
  );
}

/** "SÃO MATEUS DO MARANHÃO, 19 de novembro de 2026. Hora: _____:_____" */
export function localEDataDoChecklist(c: ChecklistParaFolha): string {
  const local = (c.delivery_place?.trim() || CIDADE_DA_CONFISSAO).toUpperCase();
  return `${local}, ${dataPorExtenso(c.delivery_date)}. Hora: _____:_____`;
}

/** "checklist-entrega-abc1d23-joao-da-silva.pdf" */
export function nomeDoPdfDoChecklist(c: ChecklistParaFolha): string {
  const slug = [c.vehicle_plate, c.buyer_name]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `checklist-entrega${slug ? `-${slug}` : ""}.pdf`;
}
