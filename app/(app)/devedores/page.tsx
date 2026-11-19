import { createClient } from "@/lib/supabase/server";
import { DevedoresPageClient } from "@/components/devedores/devedores-page-client";
import type {
  Loan,
  LoanInstallment,
  LoanPayment,
  LoanAttachment,
  LoanBoleto,
  VehicleDeliveryChecklist,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export type LoanWithDetails = Loan & {
  loan_payments: LoanPayment[];
  loan_installments: LoanInstallment[];
  loan_attachments: LoanAttachment[];
  /** Os boletos da dívida (migration 139) — vazio enquanto ela não roda. */
  loan_boletos: LoanBoleto[];
};

export default async function DevedoresPage() {
  const supabase = createClient();

  const [{ data }, boletosRes, checklistsRes, veiculosRes] = await Promise.all([
    supabase
      .from("loans")
      .select("*, loan_payments(*), loan_installments(*), loan_attachments(*)")
      .order("loan_date", { ascending: false })
      .order("loan_number", { ascending: false }),
    // À parte, e não no select de cima: sem a migration 139 a tabela não existe
    // e o select inteiro cairia — aqui só os boletos vêm vazios.
    supabase.from("loan_boletos").select("*").order("due_date", { ascending: true }),
    // Os checklists de entrega de veículo (migration 150) — à parte pelo mesmo
    // motivo: sem a migration só a lista vem vazia.
    supabase
      .from("vehicle_delivery_checklists")
      .select("*")
      .order("delivery_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
    // Os veículos da frota: a placa e o nome a um toque no checklist
    supabase.from("machines").select("id, name, plate").order("name"),
  ]);

  const boletos = boletosRes.error ? [] : ((boletosRes.data as LoanBoleto[]) ?? []);
  const loans = ((data as Omit<LoanWithDetails, "loan_boletos">[]) ?? []).map((l) => ({
    ...l,
    loan_boletos: boletos.filter((b) => b.loan_id === l.id),
  }));

  const checklists = checklistsRes.error ? [] : ((checklistsRes.data as VehicleDeliveryChecklist[]) ?? []);
  const veiculos = veiculosRes.error
    ? []
    : ((veiculosRes.data as { id: string; name: string; plate: string | null }[]) ?? []);

  return <DevedoresPageClient loans={loans} checklists={checklists} veiculos={veiculos} />;
}
