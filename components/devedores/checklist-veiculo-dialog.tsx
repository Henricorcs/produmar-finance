"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Car, Check, ChevronRight, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampoComSugestoes, valoresUsados } from "@/components/ui/campo-com-sugestoes";
import {
  salvarChecklistVeiculo,
  excluirChecklistVeiculo,
  type ChecklistVeiculoInput,
} from "@/app/(app)/devedores/actions";
import { cn, formatDate, localDateISO, mascaraCpfCnpj, mascaraTelefone } from "@/lib/utils";
import { enderecoDoDevedor } from "@/lib/devedor-endereco";
import { CIDADE_DA_CONFISSAO } from "@/lib/confissao-divida";
import { STICKY_FOOTER, FOOTER_CANCEL, FOOTER_SUBMIT } from "@/components/frota/frota-shared";
import type { VehicleDeliveryChecklist } from "@/lib/types";
import type { LoanWithDetails } from "@/app/(app)/devedores/page";

/** Um veículo da frota (tabela machines): a placa e o nome. */
export interface VeiculoDaFrota {
  id: string;
  name: string;
  plate: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  dividas: LoanWithDetails[];
  checklists: VehicleDeliveryChecklist[];
  veiculos: VeiculoDaFrota[];
}

/** Um devedor da lista — a dívida mais recente dele é de onde vêm os dados. */
interface DevedorDaLista {
  chave: string;
  loanId: string;
  nome: string;
  documento: string;
  rg: string;
  endereco: string;
  telefone: string;
}

type Form = Omit<ChecklistVeiculoInput, "loan_id">;

const VAZIO: Form = {
  buyer_name: "",
  buyer_document: "",
  buyer_rg: "",
  buyer_address: "",
  buyer_phone: "",
  vehicle_model: "",
  vehicle_plate: "",
  vehicle_year: "",
  vehicle_color: "",
  vehicle_chassis: "",
  vehicle_renavam: "",
  vehicle_km: "",
  delivery_place: "",
  delivery_date: "",
  notes: "",
};

/** "abc1d23" → "ABC1D23"; "abc1234" → "ABC-1234" (placa antiga com hífen). */
function mascaraPlaca(s: string): string {
  const t = s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  return /^[A-Z]{3}\d{4}$/.test(t) ? `${t.slice(0, 3)}-${t.slice(3)}` : t;
}

const soLetrasENumeros = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * CHECKLIST DE ENTREGA DE VEÍCULO — a folha que o comprador assina quando
 * recebe o veículo vendido. O comprador vem da lista de devedores (nome, CPF,
 * RG e endereço de uma vez) ou é digitado; o veículo pode vir da frota. Os
 * itens Sim/Não saem em branco na folha, para marcar à caneta na entrega.
 */
export function ChecklistVeiculoDialog({ open, onClose, dividas, checklists, veiculos }: Props) {
  const [isPending, startTransition] = useTransition();
  /** "lista" = os já feitos; "form" = preenchendo; "pronto" = salvo, imprimir. */
  const [tela, setTela] = useState<"lista" | "form" | "pronto">("lista");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [loanId, setLoanId] = useState<string | null>(null);
  const [f, setF] = useState<Form>(VAZIO);
  const [salvoId, setSalvoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mudar = (campo: keyof Form, valor: string) => setF((x) => ({ ...x, [campo]: valor }));

  function novo() {
    setEditandoId(null);
    setLoanId(null);
    setF({ ...VAZIO, delivery_date: localDateISO(), delivery_place: CIDADE_DA_CONFISSAO.toUpperCase() });
    setError(null);
    setTela("form");
  }

  function editar(c: VehicleDeliveryChecklist) {
    setEditandoId(c.id);
    setLoanId(c.loan_id);
    setF({
      buyer_name: c.buyer_name,
      buyer_document: c.buyer_document ?? "",
      buyer_rg: c.buyer_rg ?? "",
      buyer_address: c.buyer_address ?? "",
      buyer_phone: c.buyer_phone ?? "",
      vehicle_model: c.vehicle_model ?? "",
      vehicle_plate: c.vehicle_plate ?? "",
      vehicle_year: c.vehicle_year ?? "",
      vehicle_color: c.vehicle_color ?? "",
      vehicle_chassis: c.vehicle_chassis ?? "",
      vehicle_renavam: c.vehicle_renavam ?? "",
      vehicle_km: c.vehicle_km ?? "",
      delivery_place: c.delivery_place ?? "",
      delivery_date: c.delivery_date,
      notes: c.notes ?? "",
    });
    setError(null);
    setTela("form");
  }

  useEffect(() => {
    if (!open) return;
    setSalvoId(null);
    // sem nenhum feito ainda, abre direto no formulário
    if (checklists.length === 0) novo();
    else setTela("lista");
    // só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Os devedores cadastrados, um por pessoa, com os dados da dívida mais recente. */
  const devedores = useMemo(() => {
    const vistos = new Map<string, DevedorDaLista>();
    const recentes = [...dividas].sort((a, b) => (a.loan_date < b.loan_date ? 1 : -1));
    for (const l of recentes) {
      const doc = (l.borrower_document ?? "").replace(/\D/g, "");
      const chave = doc || l.borrower_name.trim().toUpperCase();
      if (!chave || vistos.has(chave)) continue;
      vistos.set(chave, {
        chave,
        loanId: l.id,
        nome: l.borrower_name.trim(),
        documento: mascaraCpfCnpj(l.borrower_document ?? ""),
        rg: l.borrower_rg ?? "",
        endereco: enderecoDoDevedor(l),
        telefone: mascaraTelefone(l.borrower_phone ?? ""),
      });
    }
    return Array.from(vistos.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [dividas]);

  /** Escolheu um devedor: nome, CPF, RG, endereço e telefone de uma vez. */
  function puxarDevedor(d: DevedorDaLista) {
    setLoanId(d.loanId);
    setF((x) => ({
      ...x,
      buyer_name: d.nome,
      buyer_document: d.documento,
      buyer_rg: d.rg,
      buyer_address: d.endereco,
      buyer_phone: d.telefone,
    }));
  }

  /** As sugestões de cada campo: o que já foi escrito (e a frota, no veículo). */
  const sugestoes = useMemo(() => {
    const de = (k: keyof VehicleDeliveryChecklist) =>
      checklists.map((c) => c[k] as string | null | undefined);
    return {
      nome: valoresUsados([...devedores.map((d) => d.nome), ...de("buyer_name")]),
      modelo: valoresUsados([...veiculos.map((v) => v.name), ...de("vehicle_model")]),
      placa: valoresUsados(
        [...veiculos.map((v) => v.plate), ...de("vehicle_plate")].map((p) => (p ? mascaraPlaca(p) : p))
      ),
      cor: valoresUsados(de("vehicle_color")),
      local: valoresUsados([CIDADE_DA_CONFISSAO.toUpperCase(), ...de("delivery_place")]),
    };
  }, [checklists, devedores, veiculos]);

  /** Escolheu a placa ou o nome de um veículo da frota: o outro vem junto. */
  function puxarVeiculo(por: "placa" | "modelo", valor: string) {
    const alvo = valor.trim().toUpperCase();
    const v = veiculos.find((x) =>
      por === "placa"
        ? soLetrasENumeros(x.plate ?? "") === soLetrasENumeros(alvo)
        : x.name.trim().toUpperCase() === alvo
    );
    setF((x) => ({
      ...x,
      vehicle_plate: por === "placa" ? mascaraPlaca(valor) : v?.plate ? mascaraPlaca(v.plate) : x.vehicle_plate,
      vehicle_model: por === "modelo" ? valor : v ? v.name.toUpperCase() : x.vehicle_model,
    }));
  }

  function salvar() {
    if (!f.buyer_name.trim()) return setError("Escreva o nome de quem está recebendo o veículo");
    setError(null);
    startTransition(async () => {
      const r = await salvarChecklistVeiculo(editandoId, { ...f, loan_id: loanId });
      if ("error" in r && r.error) return setError(r.error);
      if ("id" in r && r.id) {
        setSalvoId(r.id);
        setTela("pronto");
      }
    });
  }

  function excluir(c: VehicleDeliveryChecklist) {
    if (!confirm(`Excluir o checklist de ${c.buyer_name}${c.vehicle_plate ? ` (${c.vehicle_plate})` : ""}?`)) return;
    startTransition(async () => {
      const r = await excluirChecklistVeiculo(c.id);
      if ("error" in r && r.error) setError(r.error);
    });
  }

  const devedorEscolhido = devedores.find((d) => d.loanId === loanId)?.chave ?? "";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="w-5 h-5 text-produmar-600" />
            {tela === "pronto"
              ? "Checklist pronto"
              : tela === "form"
                ? editandoId
                  ? "Corrigir checklist"
                  : "Novo checklist de entrega"
                : "Checklist de entrega de veículo"}
          </DialogTitle>
        </DialogHeader>

        {/* OS JÁ FEITOS — imprimir de novo, corrigir ou excluir */}
        {tela === "lista" && (
          <div className="space-y-3">
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              A folha que o comprador assina quando recebe o veículo vendido.
            </p>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {checklists.map((c) => (
                <div key={c.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {c.buyer_name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {formatDate(c.delivery_date)}
                      {c.vehicle_model ? ` · ${c.vehicle_model}` : ""}
                      {c.vehicle_plate ? ` · ${c.vehicle_plate}` : ""}
                    </p>
                  </div>
                  <a
                    href={`/imprimir/checklist-veiculo/${c.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Imprimir"
                    className="p-2 rounded-lg text-produmar-700 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-produmar-950/40"
                  >
                    <Printer className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => editar(c)}
                    title="Corrigir"
                    className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => excluir(c)}
                    disabled={isPending}
                    title="Excluir"
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* O FORMULÁRIO */}
        {tela === "form" && (
          <div className="space-y-5">
            <section className="space-y-3">
              <h3 className="text-xs font-bold tracking-wide text-slate-500 dark:text-slate-400">COMPRADOR</h3>
              {devedores.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="ck_devedor">Puxar da lista de devedores</Label>
                  <select
                    id="ck_devedor"
                    value={devedorEscolhido}
                    onChange={(e) => {
                      const d = devedores.find((x) => x.chave === e.target.value);
                      if (d) puxarDevedor(d);
                      else setLoanId(null);
                    }}
                    className="w-full h-12 rounded-md border border-produmar-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-base text-slate-900 dark:text-slate-100"
                  >
                    <option value="">— não está na lista (digitar abaixo) —</option>
                    {devedores.map((d) => (
                      <option key={d.chave} value={d.chave}>
                        {d.nome}
                        {d.documento ? ` · ${d.documento}` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Escolhido, preenche nome, CPF, RG, endereço e telefone. Dá para corrigir embaixo.
                  </p>
                </div>
              )}
              <Campo rotulo="Nome de quem recebe *" id="ck_nome">
                <CampoComSugestoes
                  id="ck_nome"
                  value={f.buyer_name}
                  onChange={(e) => {
                    mudar("buyer_name", e.target.value.toUpperCase());
                    setLoanId(null);
                  }}
                  sugestoes={sugestoes.nome}
                  onEscolher={(nome) => {
                    const d = devedores.find((x) => x.nome.toUpperCase() === nome.toUpperCase());
                    if (d) puxarDevedor(d);
                    else mudar("buyer_name", nome);
                  }}
                  placeholder="nome completo"
                  autoCapitalize="characters"
                  className="h-12 text-base"
                />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="CPF ou CNPJ" id="ck_doc">
                  <Input
                    id="ck_doc"
                    value={f.buyer_document}
                    onChange={(e) => mudar("buyer_document", mascaraCpfCnpj(e.target.value))}
                    inputMode="numeric"
                    autoComplete="off"
                    className="h-12 text-base"
                  />
                </Campo>
                <Campo rotulo="RG e órgão" id="ck_rg">
                  <Input
                    id="ck_rg"
                    value={f.buyer_rg}
                    onChange={(e) => mudar("buyer_rg", e.target.value.toUpperCase())}
                    placeholder="123456 SSP/MA"
                    autoCapitalize="characters"
                    autoComplete="off"
                    className="h-12 text-base"
                  />
                </Campo>
              </div>
              <Campo rotulo="Endereço" id="ck_end">
                <Textarea
                  id="ck_end"
                  value={f.buyer_address}
                  onChange={(e) => mudar("buyer_address", e.target.value.toUpperCase())}
                  rows={2}
                  autoCapitalize="characters"
                  className="text-base"
                />
              </Campo>
              <Campo rotulo="Telefone" id="ck_tel">
                <Input
                  id="ck_tel"
                  value={f.buyer_phone}
                  onChange={(e) => mudar("buyer_phone", mascaraTelefone(e.target.value))}
                  inputMode="tel"
                  autoComplete="off"
                  className="h-12 text-base"
                />
              </Campo>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-bold tracking-wide text-slate-500 dark:text-slate-400">VEÍCULO</h3>
              <Campo rotulo="Marca e modelo" id="ck_modelo">
                <CampoComSugestoes
                  id="ck_modelo"
                  value={f.vehicle_model}
                  onChange={(e) => mudar("vehicle_model", e.target.value.toUpperCase())}
                  sugestoes={sugestoes.modelo}
                  onEscolher={(v) => puxarVeiculo("modelo", v)}
                  placeholder="ex: FIAT STRADA"
                  autoCapitalize="characters"
                  className="h-12 text-base"
                />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Placa" id="ck_placa">
                  <CampoComSugestoes
                    id="ck_placa"
                    value={f.vehicle_plate}
                    onChange={(e) => mudar("vehicle_plate", mascaraPlaca(e.target.value))}
                    sugestoes={sugestoes.placa}
                    onEscolher={(v) => puxarVeiculo("placa", v)}
                    placeholder="ABC1D23"
                    autoCapitalize="characters"
                    semDitado
                    className="h-12 text-base"
                  />
                </Campo>
                <Campo rotulo="Ano" id="ck_ano">
                  <Input
                    id="ck_ano"
                    value={f.vehicle_year}
                    onChange={(e) => mudar("vehicle_year", e.target.value.replace(/[^\d/]/g, "").slice(0, 9))}
                    placeholder="2020/2021"
                    inputMode="numeric"
                    autoComplete="off"
                    className="h-12 text-base"
                  />
                </Campo>
                <Campo rotulo="Cor" id="ck_cor">
                  <CampoComSugestoes
                    id="ck_cor"
                    value={f.vehicle_color}
                    onChange={(e) => mudar("vehicle_color", e.target.value.toUpperCase())}
                    sugestoes={sugestoes.cor}
                    onEscolher={(v) => mudar("vehicle_color", v)}
                    autoCapitalize="characters"
                    className="h-12 text-base"
                  />
                </Campo>
                <Campo rotulo="Km na entrega" id="ck_km">
                  <Input
                    id="ck_km"
                    value={f.vehicle_km}
                    onChange={(e) => mudar("vehicle_km", e.target.value.replace(/[^\d.]/g, ""))}
                    inputMode="numeric"
                    autoComplete="off"
                    className="h-12 text-base"
                  />
                </Campo>
              </div>
              <Campo rotulo="Chassi" id="ck_chassi">
                <Input
                  id="ck_chassi"
                  value={f.vehicle_chassis}
                  onChange={(e) => mudar("vehicle_chassis", soLetrasENumeros(e.target.value).slice(0, 17))}
                  autoCapitalize="characters"
                  autoComplete="off"
                  semDitado
                  className="h-12 text-base tracking-wide"
                />
              </Campo>
              <Campo rotulo="Renavam" id="ck_renavam">
                <Input
                  id="ck_renavam"
                  value={f.vehicle_renavam}
                  onChange={(e) => mudar("vehicle_renavam", e.target.value.replace(/\D/g, "").slice(0, 11))}
                  inputMode="numeric"
                  autoComplete="off"
                  className="h-12 text-base"
                />
              </Campo>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-bold tracking-wide text-slate-500 dark:text-slate-400">ENTREGA</h3>
              <div className="grid grid-cols-[1fr_9.5rem] gap-3">
                <Campo rotulo="Local" id="ck_local">
                  <CampoComSugestoes
                    id="ck_local"
                    value={f.delivery_place}
                    onChange={(e) => mudar("delivery_place", e.target.value.toUpperCase())}
                    sugestoes={sugestoes.local}
                    onEscolher={(v) => mudar("delivery_place", v)}
                    autoCapitalize="characters"
                    className="h-12 text-base"
                  />
                </Campo>
                <Campo rotulo="Dia *" id="ck_data">
                  <Input
                    id="ck_data"
                    type="date"
                    value={f.delivery_date}
                    onChange={(e) => mudar("delivery_date", e.target.value)}
                    className="h-12"
                  />
                </Campo>
              </div>
              <Campo rotulo="Observações (saem na folha)" id="ck_obs">
                <Textarea
                  id="ck_obs"
                  value={f.notes}
                  onChange={(e) => mudar("notes", e.target.value.toUpperCase())}
                  rows={2}
                  placeholder="opcional"
                  autoCapitalize="characters"
                  className="text-base"
                />
              </Campo>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Os itens (documento, chave reserva, estepe, pneus...) saem na folha com Sim / Não em branco,
                para marcar à caneta na hora da entrega.
              </p>
            </section>
          </div>
        )}

        {/* SALVO — abrir a folha */}
        {tela === "pronto" && salvoId && (
          <div className="space-y-3">
            <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <Check className="w-4 h-4" />
              Checklist gravado.
            </p>
            <a
              href={`/imprimir/checklist-veiculo/${salvoId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl border-2 border-produmar-200 dark:border-produmar-800 bg-produmar-50/60 dark:bg-produmar-950/30 px-4 py-3"
            >
              <Printer className="w-6 h-6 text-produmar-600 dark:text-produmar-400 flex-shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">
                  Abrir a folha para imprimir
                </span>
                <span className="block text-[12px] text-slate-600 dark:text-slate-300">
                  Uma folha A4: o comprador confere, marca e assina.
                </span>
              </span>
              <ChevronRight className="w-5 h-5 text-produmar-500 flex-shrink-0" />
            </a>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 px-3 py-2 rounded-lg border border-red-100 dark:border-red-900/50">
            {error}
          </p>
        )}

        <DialogFooter className={STICKY_FOOTER}>
          {tela === "lista" && (
            <>
              <Button type="button" variant="outline" onClick={onClose} className={cn(FOOTER_CANCEL, "h-11")}>
                Fechar
              </Button>
              <Button type="button" onClick={novo} className={cn(FOOTER_SUBMIT, "h-11")}>
                <Plus className="w-4 h-4" />
                Novo checklist
              </Button>
            </>
          )}
          {tela === "form" && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => (checklists.length > 0 ? setTela("lista") : onClose())}
                disabled={isPending}
                className={cn(FOOTER_CANCEL, "h-11")}
              >
                {checklists.length > 0 ? "Voltar" : "Cancelar"}
              </Button>
              <Button type="button" onClick={salvar} disabled={isPending} className={cn(FOOTER_SUBMIT, "h-11")}>
                {isPending ? "Salvando..." : "Salvar e imprimir"}
              </Button>
            </>
          )}
          {tela === "pronto" && (
            <Button type="button" onClick={onClose} className="flex-1 h-11">
              Concluir
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ rotulo, id, children }: { rotulo: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
    </div>
  );
}
