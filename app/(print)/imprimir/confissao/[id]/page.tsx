import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/auth";
import { ConfissaoPrint } from "@/components/devedores/confissao-print";
import { documentoAssinado } from "@/lib/documentos-assinados";
import type { Loan, LoanInstallment, LoanPayment, RentalContractTemplate } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * A CONFISSÃO DE DÍVIDA IMPRESSA, feita da dívida de Devedores: o valor, o que
 * já foi pago e as parcelas em aberto vêm dela; a qualificação da PRODUMAR
 * vem do modelo do contrato de aluguel (como na compra e venda).
 */
export default async function ImprimirConfissaoPage({ params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  const supabase = createClient();
  const [dividaRes, modeloRes] = await Promise.all([
    supabase.from("loans").select("*, loan_installments(*), loan_payments(*)").eq("id", params.id).single(),
    supabase.from("rental_contract_templates").select("*").eq("active", true).order("created_at").limit(1),
  ]);

  const linha = dividaRes.data as
    | (Loan & { loan_installments: LoanInstallment[]; loan_payments: LoanPayment[] })
    | null;

  if (dividaRes.error || !linha) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-lg font-semibold text-slate-700">Dívida não encontrada</p>
          <p className="text-sm text-slate-500 mt-1">Ela pode ter sido apagada.</p>
        </div>
      </div>
    );
  }

  const { loan_installments, loan_payments, ...loan } = linha;
  const modelo = ((modeloRes.data as RentalContractTemplate[]) ?? [])[0]?.body ?? null;
  const assinado = await documentoAssinado(supabase, "confissao_divida", loan.id);

  return (
    <ConfissaoPrint
      divida={{ loan: loan as Loan, installments: loan_installments ?? [], payments: loan_payments ?? [] }}
      modeloAluguel={modelo}
      assinado={assinado}
    />
  );
}
