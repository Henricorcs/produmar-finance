import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/auth";
import { enderecoCurto } from "@/lib/alugueis-contrato";
import {
  JUROS_PADRAO,
  MULTA_PADRAO,
  barrasDoBoleto,
  boletoEmAberto,
  boletoNoBanco,
  boletoAvulso,
  linhaDigitavelFormatada,
  rotuloDoTitulo,
  tituloDoBoleto,
} from "@/lib/alugueis-boletos";
import { formatBRL, formatDate } from "@/lib/utils";
import { CarneBarra } from "@/components/alugueis/carne-barra";
import { dadosDoCarne } from "@/lib/carne-pdf";
import type { RentalBoleto, RentalContractView } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * O CARNÊ DO ALUGUEL — os boletos em aberto do contrato, três por folha A4,
 * para recortar e entregar ao inquilino. Cada um leva a linha digitável, o
 * código de barras (o banco lê) e o QR do Pix. O PDF oficial de cada boleto
 * continua na Cora (link na tela de Boletos).
 */
export default async function ImprimirBoletosPage({
  params,
  searchParams,
}: {
  params: { id: string };
  /** ?b=<id do boleto> imprime só ele (o avulso, por exemplo). */
  searchParams: { b?: string };
}) {
  const supabase = createClient();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  const [contratoRes, boletosRes] = await Promise.all([
    supabase.from("v_rental_contracts").select("*").eq("id", params.id).single(),
    supabase.from("rental_boletos").select("*").eq("contract_id", params.id).order("due_date"),
  ]);

  const contrato = contratoRes.data as RentalContractView | null;
  const boletos = ((boletosRes.data as RentalBoleto[]) ?? []).filter(
    // sem ?b: o carnê das mensalidades (o avulso sai pelo botão dele)
    (b) => boletoEmAberto(b) && (searchParams.b ? b.id === searchParams.b : !boletoAvulso(b))
  );

  if (!contrato || boletos.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-lg font-semibold text-slate-700">
            {contrato ? "Nenhum boleto em aberto neste contrato" : "Contrato não encontrado"}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            Os boletos são gerados em Aluguéis → Imóveis → Boletos.
          </p>
        </div>
      </div>
    );
  }

  const qrs = await Promise.all(
    boletos.map((b) =>
      b.pix_emv ? QRCode.toString(b.pix_emv, { type: "svg", margin: 0, errorCorrectionLevel: "M" }) : null
    )
  );

  const multa = contrato.late_fee_percent ?? MULTA_PADRAO;
  const juros = contrato.interest_percent ?? JUROS_PADRAO;
  const endereco = enderecoCurto(contrato);

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; }
          @page { size: A4; margin: 8mm 10mm; }
          .folha { box-shadow: none !important; margin: 0 !important; padding: 0 !important; }
        }
        body { font-family: Arial, Helvetica, sans-serif; background: #f1f5f9; color: #0f172a; }
        .boleto { break-inside: avoid; }
        .boleto:nth-child(3n) { break-after: page; }
        .qr svg { width: 100%; height: 100%; }
      `}</style>

      <CarneBarra
        titulo={
          boletos.length === 1 && searchParams.b
            ? `Boleto · ${tituloDoBoleto(boletos[0])} · ${contrato.tenant_name}`
            : `Carnê · ${contrato.tenant_name} · ${boletos.length} boleto(s)`
        }
        carne={dadosDoCarne(contrato, boletos)}
      />

      <div className="folha max-w-[794px] mx-auto my-6 bg-white shadow-xl p-6 print:p-0">
        {boletos.map((b, i) => (
          <section key={b.id} className="boleto pb-3 mb-3 border-b border-dashed border-slate-400 last:border-b-0">
            <div className="border-2 border-slate-800 rounded p-3">
              <div className="flex items-start justify-between gap-3 border-b border-slate-300 pb-1.5">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">
                    {boletoNoBanco(b)
                      ? "Beneficiário"
                      : boletoAvulso(b)
                        ? "Boleto avulso · pagar a"
                        : "Carnê de aluguel · pagar a"}
                  </p>
                  <p className="text-sm font-bold">PRODUMAR SERVIÇOS LTDA</p>
                </div>
                <div className="text-right min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">{rotuloDoTitulo(b)}</p>
                  <p className={`text-sm font-bold truncate ${boletoAvulso(b) ? "" : "capitalize"}`}>
                    {tituloDoBoleto(b)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-x-3 gap-y-1 py-1.5 text-[11px] border-b border-slate-300">
                <div className="col-span-2 min-w-0">
                  <p className="text-[9px] uppercase text-slate-500">Inquilino (pagador)</p>
                  <p className="font-semibold truncate">{contrato.tenant_name}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase text-slate-500">Vencimento</p>
                  <p className="text-sm font-bold tabular-nums">{formatDate(b.due_date)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase text-slate-500">Valor</p>
                  <p className="text-sm font-bold tabular-nums">{formatBRL(Number(b.amount))}</p>
                </div>
                <div className="col-span-4 min-w-0">
                  <p className="text-[9px] uppercase text-slate-500">Imóvel</p>
                  <p className="truncate">
                    nº {contrato.property_code}
                    {endereco ? ` · ${endereco}` : ""}
                  </p>
                </div>
              </div>

              {!boletoNoBanco(b) ? (
                <div className="pt-2 space-y-2 text-[11px]">
                  <p className="text-[10px] text-slate-600 leading-snug">
                    Pagamento direto à PRODUMAR (Pix, transferência ou dinheiro). Depois do vencimento: multa de{" "}
                    {multa}% e juros de {juros}% ao mês.
                  </p>
                  <div className="grid grid-cols-2 gap-4 pt-3">
                    <p className="border-t border-slate-500 pt-0.5 text-[9px] uppercase text-slate-500">
                      Recebido em ____/____/________
                    </p>
                    <p className="border-t border-slate-500 pt-0.5 text-[9px] uppercase text-slate-500">
                      Assinatura de quem recebeu
                    </p>
                  </div>
                </div>
              ) : (
              <div className="flex gap-3 pt-2">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="font-mono text-[13px] font-bold tracking-tight break-all">
                    {linhaDigitavelFormatada(b.digitable_line)}
                  </p>
                  {b.barcode && <CodigoDeBarras codigo={b.barcode} />}
                  <p className="text-[10px] text-slate-600 leading-snug">
                    Depois do vencimento: multa de {multa}% e juros de {juros}% ao mês. Pague no aplicativo do
                    banco lendo o código de barras, ou pelo Pix com o QR ao lado. Nosso número {b.our_number ?? "—"}.
                  </p>
                </div>
                {qrs[i] && (
                  <div className="w-[30mm] flex-shrink-0 text-center">
                    <div className="qr w-[28mm] h-[28mm] mx-auto" dangerouslySetInnerHTML={{ __html: qrs[i]! }} />
                    <p className="text-[9px] font-semibold text-slate-600 mt-0.5">Pague com Pix</p>
                  </div>
                )}
              </div>
              )}
            </div>
            {b.pdf_url && (
              <a
                href={b.pdf_url}
                target="_blank"
                rel="noreferrer"
                className="no-print inline-block mt-1 text-[11px] text-produmar-700 underline"
              >
                PDF oficial deste boleto na Cora
              </a>
            )}
          </section>
        ))}
      </div>
    </>
  );
}

/** O código de barras do boleto (Intercalado 2 de 5), no tamanho do padrão: 103 × 13 mm. */
function CodigoDeBarras({ codigo }: { codigo: string }) {
  const larguras = barrasDoBoleto(codigo);
  if (larguras.length === 0) return null;
  const total = larguras.reduce((s, w) => s + w, 0);
  let x = 0;
  const barras: { x: number; w: number }[] = [];
  larguras.forEach((w, i) => {
    if (i % 2 === 0) barras.push({ x, w });
    x += w;
  });
  return (
    <svg
      viewBox={`0 0 ${total} 50`}
      preserveAspectRatio="none"
      style={{ width: "103mm", maxWidth: "100%", height: "13mm" }}
      shapeRendering="crispEdges"
      aria-label="Código de barras do boleto"
    >
      {barras.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={50} fill="#000" />
      ))}
    </svg>
  );
}
