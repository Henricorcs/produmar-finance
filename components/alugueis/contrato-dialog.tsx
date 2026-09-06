"use client";

import { useEffect, useState, useTransition } from "react";
import { FileSignature, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { actionError } from "@/lib/action-result";
import {
  cn,
  formatBRLInput,
  localDateISO,
  parseMoney,
  primeiraMaiuscula,
  upperKeepingCaret,
  valorPorExtenso,
} from "@/lib/utils";
import {
  createRentalContract,
  deleteRentalContract,
  updateRentalContract,
} from "@/app/(app)/alugueis/actions";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "./alugueis-shared";
import {
  rentalKindLabel,
  type RentalContractView,
  type RentalProperty,
} from "@/lib/types";

/** "2026-07-30" + 12 meses → "2027-07-30" (o término que o contrato pede). */
function somaMeses(iso: string, meses: number): string {
  if (!iso || !meses) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(y, m - 1 + meses, 1);
  // dia 31 num mês curto cai no último dia daquele mês
  const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(d, ultimo));
  return localDateISO(base);
}

const ESTADOS_CIVIS = ["SOLTEIRO", "CASADO", "DIVORCIADO", "VIÚVO", "UNIÃO ESTÁVEL"];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Contrato em edição — null cadastra um novo. */
  contrato: RentalContractView | null;
  /** Imóvel já escolhido (veio da ficha dele). */
  presetPropertyId?: string | null;
  properties: RentalProperty[];
}

/**
 * O CONTRATO DE LOCAÇÃO.
 *
 * O que se preenche aqui é exatamente o que estava escrito à mão no contrato de
 * vocês: o inquilino com RG, CPF, naturalidade, estado civil e profissão; o
 * prazo; o dia do vencimento; o valor. Preenchido uma vez, o contrato sai
 * impresso pronto — e a cobrança de cada mês passa a nascer daqui.
 */
export function ContratoDialog({
  open,
  onClose,
  contrato,
  presetPropertyId,
  properties,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [propertyId, setPropertyId] = useState("");

  const [tenantName, setTenantName] = useState("");
  const [tenantDoc, setTenantDoc] = useState("");
  const [tenantRg, setTenantRg] = useState("");
  const [tenantBirthplace, setTenantBirthplace] = useState("");
  const [tenantMarital, setTenantMarital] = useState("");
  const [tenantProfession, setTenantProfession] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [tenantAddress, setTenantAddress] = useState("");

  const [guarantorName, setGuarantorName] = useState("");
  const [guarantorDoc, setGuarantorDoc] = useState("");
  const [guarantorPhone, setGuarantorPhone] = useState("");
  const [guarantorAddress, setGuarantorAddress] = useState("");

  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState("5");
  const [deposit, setDeposit] = useState("");
  const [purpose, setPurpose] = useState("residencial");

  const [startDate, setStartDate] = useState(localDateISO());
  const [months, setMonths] = useState("12");
  const [endDate, setEndDate] = useState("");
  const [signedAt, setSignedAt] = useState(localDateISO());

  const [notes, setNotes] = useState("");
  const [encerrado, setEncerrado] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPropertyId(contrato?.property_id ?? presetPropertyId ?? "");

    setTenantName(contrato?.tenant_name ?? "");
    setTenantDoc(contrato?.tenant_document ?? "");
    setTenantRg(contrato?.tenant_rg ?? "");
    setTenantBirthplace(contrato?.tenant_birthplace ?? "");
    setTenantMarital(contrato?.tenant_marital_status ?? "");
    setTenantProfession(contrato?.tenant_profession ?? "");
    setTenantPhone(contrato?.tenant_phone ?? "");
    setTenantAddress(contrato?.tenant_address ?? "");

    setGuarantorName(contrato?.guarantor_name ?? "");
    setGuarantorDoc(contrato?.guarantor_document ?? "");
    setGuarantorPhone(contrato?.guarantor_phone ?? "");
    setGuarantorAddress(contrato?.guarantor_address ?? "");

    setAmount(contrato ? formatBRLInput(Number(contrato.monthly_amount)) : "");
    setDueDay(String(contrato?.due_day ?? 5));
    setDeposit(
      contrato && Number(contrato.deposit_amount) > 0
        ? formatBRLInput(Number(contrato.deposit_amount))
        : ""
    );
    setPurpose(contrato?.purpose ?? "residencial");

    setStartDate(contrato?.start_date ?? localDateISO());
    setMonths(contrato?.months ? String(contrato.months) : "12");
    setEndDate(contrato?.end_date ?? "");
    setSignedAt(contrato?.signed_at ?? localDateISO());

    setNotes(contrato?.notes ?? "");
    setEncerrado(contrato?.status === "encerrado");
    setErro(null);
  }, [open, contrato, presetPropertyId]);

  /** O término sai da conta início + prazo — dá para corrigir na mão depois. */
  function recalcularFim(inicio: string, meses: string) {
    const n = parseInt(meses, 10);
    if (!inicio || !n) return;
    setEndDate(somaMeses(inicio, n));
  }

  const valor = parseMoney(amount);

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!propertyId) {
      setErro("Escolha o imóvel");
      return;
    }
    if (!tenantName.trim()) {
      setErro("Escreva o nome do inquilino");
      return;
    }
    if (valor <= 0) {
      setErro("Informe o valor do aluguel");
      return;
    }

    startTransition(async () => {
      const input = {
        property_id: propertyId,
        tenant_name: tenantName,
        tenant_document: tenantDoc,
        tenant_rg: tenantRg,
        tenant_birthplace: tenantBirthplace,
        tenant_marital_status: tenantMarital,
        tenant_profession: tenantProfession,
        tenant_phone: tenantPhone,
        tenant_address: tenantAddress,
        guarantor_name: guarantorName,
        guarantor_document: guarantorDoc,
        guarantor_phone: guarantorPhone,
        guarantor_address: guarantorAddress,
        monthly_amount: valor,
        due_day: parseInt(dueDay, 10) || 5,
        deposit_amount: parseMoney(deposit),
        purpose,
        start_date: startDate,
        end_date: endDate,
        months: parseInt(months, 10) || null,
        signed_at: signedAt,
        status: encerrado ? ("encerrado" as const) : ("ativo" as const),
        notes,
      };
      const r = contrato
        ? await updateRentalContract(contrato.id, input)
        : await createRentalContract(input);
      const falha = actionError(r);
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  function apagar() {
    if (!contrato) return;
    if (
      !confirm(
        `Apagar o contrato de ${contrato.tenant_name}? Os pagamentos lançados nele vão junto, e isso não tem volta.`
      )
    )
      return;
    setErro(null);
    startTransition(async () => {
      const falha = actionError(await deleteRentalContract(contrato.id));
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
              <FileSignature className="w-4 h-4" />
            </span>
            {contrato ? "Editar contrato" : "Novo contrato"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4">
          {/* O imóvel */}
          {presetPropertyId ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Imóvel:{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                nº {properties.find((p) => p.id === presetPropertyId)?.code ?? "—"}
              </span>
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label>Imóvel *</Label>
              <SearchableSelect
                items={properties}
                value={propertyId}
                onChange={setPropertyId}
                getId={(p) => p.id}
                getLabel={(p) =>
                  `nº ${p.code} · ${p.name || p.street || rentalKindLabel(p.kind)}`
                }
                placeholder="Escolha o imóvel"
                searchPlaceholder="Buscar pelo código, apelido ou rua..."
                emptyMessage="Nenhum imóvel cadastrado"
              />
            </div>
          )}

          <Secao titulo="O inquilino" />

          <div className="space-y-1.5">
            <Label htmlFor="ct_nome">Nome *</Label>
            <Input
              id="ct_nome"
              value={tenantName}
              onChange={(e) => setTenantName(upperKeepingCaret(e))}
              placeholder="nome completo"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ct_cpf">CPF / CNPJ</Label>
              <Input
                id="ct_cpf"
                value={tenantDoc}
                onChange={(e) => setTenantDoc(e.target.value)}
                placeholder="000.000.000-00"
                className="h-11 tabular-nums sm:h-10"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ct_rg">RG</Label>
              <Input
                id="ct_rg"
                value={tenantRg}
                onChange={(e) => setTenantRg(upperKeepingCaret(e))}
                placeholder="com o órgão"
                autoCapitalize="characters"
                className="h-11 sm:h-10"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct_natural">Naturalidade</Label>
            <Input
              id="ct_natural"
              value={tenantBirthplace}
              onChange={(e) => setTenantBirthplace(upperKeepingCaret(e))}
              placeholder="ex: vargem grande/ma"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Estado civil</Label>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {ESTADOS_CIVIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setTenantMarital(tenantMarital === e ? "" : e)}
                  className={cn(
                    "flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                    tenantMarital === e
                      ? "bg-produmar-600 border-produmar-600 text-white"
                      : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct_prof">Profissão</Label>
            <Input
              id="ct_prof"
              value={tenantProfession}
              onChange={(e) => setTenantProfession(upperKeepingCaret(e))}
              placeholder="ex: mecânico"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct_end">Onde mora hoje</Label>
            <Textarea
              id="ct_end"
              value={tenantAddress}
              onChange={(e) => setTenantAddress(upperKeepingCaret(e))}
              placeholder="rua, nº, bairro, cidade/uf, cep"
              rows={2}
              autoCapitalize="characters"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              É o endereço que entra na qualificação do locatário, no contrato.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct_fone">Telefone</Label>
            <Input
              id="ct_fone"
              value={tenantPhone}
              onChange={(e) => setTenantPhone(e.target.value)}
              placeholder="opcional"
              className="h-11 sm:h-10"
              inputMode="tel"
              autoComplete="off"
            />
          </div>

          <Secao titulo="O aluguel" />

          <div className="space-y-1.5">
            <Label htmlFor="ct_valor">Valor do aluguel (R$) *</Label>
            <Input
              id="ct_valor"
              value={amount}
              onChange={(e) => setAmount(formatBRLInput(e.target.value))}
              placeholder="0,00"
              className="h-11 text-base tabular-nums font-semibold sm:h-10"
              inputMode="decimal"
              autoComplete="off"
            />
            {valor > 0 && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {primeiraMaiuscula(valorPorExtenso(valor))} — é assim que sai no
                contrato.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ct_dia">Vence todo dia *</Label>
              <Input
                id="ct_dia"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
                placeholder="5"
                className="h-11 tabular-nums text-center text-base font-semibold sm:h-10"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ct_caucao">Caução (R$)</Label>
              <Input
                id="ct_caucao"
                value={deposit}
                onChange={(e) => setDeposit(formatBRLInput(e.target.value))}
                placeholder="opcional"
                className="h-11 tabular-nums sm:h-10"
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Uso do imóvel</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: "residencial", label: "Residencial" },
                { v: "comercial", label: "Comercial" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setPurpose(o.v)}
                  className={cn(
                    "min-h-[44px] rounded-lg border text-xs font-semibold transition-colors",
                    purpose === o.v
                      ? "bg-produmar-600 border-produmar-600 text-white"
                      : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              É o que a cláusula sexta do contrato diz sobre o uso.
            </p>
          </div>

          <Secao titulo="O prazo" />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ct_inicio">Início *</Label>
              <Input
                id="ct_inicio"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  recalcularFim(e.target.value, months);
                }}
                className="h-11 tabular-nums sm:h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ct_meses">Prazo (meses)</Label>
              <Input
                id="ct_meses"
                value={months}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                  setMonths(v);
                  recalcularFim(startDate, v);
                }}
                placeholder="12"
                className="h-11 tabular-nums text-center sm:h-10"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct_fim">Término</Label>
            <Input
              id="ct_fim"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-11 tabular-nums sm:h-10"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Sai sozinho da conta início + prazo. Dá para corrigir na mão.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct_assinatura">Data da assinatura</Label>
            <Input
              id="ct_assinatura"
              type="date"
              value={signedAt}
              onChange={(e) => setSignedAt(e.target.value)}
              className="h-11 tabular-nums sm:h-10"
            />
          </div>

          <Secao titulo="O fiador (quando tem)" />

          <div className="space-y-1.5">
            <Label htmlFor="ct_fiador">Nome do fiador</Label>
            <Input
              id="ct_fiador"
              value={guarantorName}
              onChange={(e) => setGuarantorName(upperKeepingCaret(e))}
              placeholder="opcional"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </div>

          {guarantorName.trim() && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ct_fiador_cpf">CPF</Label>
                  <Input
                    id="ct_fiador_cpf"
                    value={guarantorDoc}
                    onChange={(e) => setGuarantorDoc(e.target.value)}
                    className="h-11 tabular-nums sm:h-10"
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ct_fiador_fone">Telefone</Label>
                  <Input
                    id="ct_fiador_fone"
                    value={guarantorPhone}
                    onChange={(e) => setGuarantorPhone(e.target.value)}
                    className="h-11 sm:h-10"
                    inputMode="tel"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct_fiador_end">Endereço do fiador</Label>
                <Textarea
                  id="ct_fiador_end"
                  value={guarantorAddress}
                  onChange={(e) => setGuarantorAddress(upperKeepingCaret(e))}
                  rows={2}
                  autoCapitalize="characters"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ct_obs">Observação</Label>
            <Textarea
              id="ct_obs"
              value={notes}
              onChange={(e) => setNotes(upperKeepingCaret(e))}
              placeholder="opcional"
              rows={2}
              autoCapitalize="characters"
            />
          </div>

          {contrato && (
            <button
              type="button"
              onClick={() => setEncerrado((v) => !v)}
              className={cn(
                "w-full text-left rounded-lg border px-3 py-2.5 transition-colors",
                encerrado
                  ? "bg-slate-100 border-slate-300 dark:bg-slate-800 dark:border-slate-600"
                  : "bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700"
              )}
            >
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {encerrado ? "Contrato encerrado" : "Contrato ativo"}
              </span>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Encerrado para de gerar aluguel no mês; o histórico fica.
              </p>
            </button>
          )}

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {erro}
            </p>
          )}

          <DialogFooter className={STICKY_FOOTER}>
            {contrato && (
              <button
                type="button"
                onClick={apagar}
                disabled={isPending}
                aria-label="Apagar contrato"
                className="h-11 px-4 rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40 sm:h-10"
              >
                <Trash2 className="w-4 h-4 inline" />
              </button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
              className={cn(FOOTER_CANCEL, "h-11 sm:h-10")}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
            >
              {isPending ? "Salvando..." : contrato ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Secao({ titulo }: { titulo: string }) {
  return (
    <p className="text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
      {titulo.toUpperCase()}
    </p>
  );
}
