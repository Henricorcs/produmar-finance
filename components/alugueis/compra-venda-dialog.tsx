"use client";

import { useEffect, useState, useTransition } from "react";
import { Landmark, Trash2 } from "lucide-react";
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
  apagarContratoCompraVenda,
  salvarContratoCompraVenda,
} from "@/app/(app)/alugueis/actions";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "./alugueis-shared";
import type { PropertySaleContract } from "@/lib/types";

const ESTADOS_CIVIS = ["SOLTEIRO", "CASADO", "UNIÃO ESTÁVEL", "DIVORCIADO", "VIÚVO"];

const REGIMES = [
  "COMUNHÃO PARCIAL DE BENS",
  "COMUNHÃO UNIVERSAL DE BENS",
  "SEPARAÇÃO TOTAL DE BENS",
  "PARTICIPAÇÃO FINAL NOS AQUESTOS",
];

const TIPOS = ["CASA", "TERRENO", "APARTAMENTO", "PONTO COMERCIAL", "GALPÃO", "SALA", "LOTE"];

/** Estados civis em que o cônjuge assina junto. */
function pedeConjuge(estado: string): boolean {
  return estado === "CASADO" || estado === "UNIÃO ESTÁVEL";
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Contrato em edição — null começa um novo. */
  contrato: PropertySaleContract | null;
}

/**
 * CONTRATO DE COMPRA E VENDA DE IMÓVEL.
 *
 * A PRODUMAR é sempre a compradora — os dados dela saem do contrato de
 * aluguel. Aqui se preenche o vendedor, o imóvel e as condições. Nada é
 * obrigatório: o que ficar em branco sai como linha para completar à caneta.
 */
export function CompraVendaDialog({ open, onClose, contrato }: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  // vendedor
  const [nome, setNome] = useState("");
  const [doc, setDoc] = useState("");
  const [rg, setRg] = useState("");
  const [nacionalidade, setNacionalidade] = useState("");
  const [estadoCivil, setEstadoCivil] = useState("");
  const [regime, setRegime] = useState("");
  const [profissao, setProfissao] = useState("");
  const [endereco, setEndereco] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");

  // cônjuge
  const [cNome, setCNome] = useState("");
  const [cDoc, setCDoc] = useState("");
  const [cRg, setCRg] = useState("");
  const [cNacionalidade, setCNacionalidade] = useState("");
  const [cProfissao, setCProfissao] = useState("");

  // imóvel
  const [tipo, setTipo] = useState("");
  const [imovelEndereco, setImovelEndereco] = useState("");
  const [area, setArea] = useState("");
  const [matricula, setMatricula] = useState("");
  const [cartorio, setCartorio] = useState("");
  const [iptu, setIptu] = useState("");
  const [descricao, setDescricao] = useState("");

  // preço e condições
  const [preco, setPreco] = useState("");
  const [pagamento, setPagamento] = useState("");
  const [posse, setPosse] = useState("");
  const [prazoEscritura, setPrazoEscritura] = useState("30");
  const [multa, setMulta] = useState("10");
  const [cidade, setCidade] = useState("São Mateus do Maranhão/MA");
  const [assinatura, setAssinatura] = useState(localDateISO());
  const [adicionais, setAdicionais] = useState("");

  useEffect(() => {
    if (!open) return;
    const c = contrato;
    setNome(c?.seller_name ?? "");
    setDoc(c?.seller_document ?? "");
    setRg(c?.seller_rg ?? "");
    setNacionalidade(c?.seller_nationality ?? (c ? "" : "BRASILEIRA"));
    setEstadoCivil(c?.seller_marital_status ?? "");
    setRegime(c?.seller_property_regime ?? "");
    setProfissao(c?.seller_profession ?? "");
    setEndereco(c?.seller_address ?? "");
    setTelefone(c?.seller_phone ?? "");
    setEmail(c?.seller_email ?? "");

    setCNome(c?.spouse_name ?? "");
    setCDoc(c?.spouse_document ?? "");
    setCRg(c?.spouse_rg ?? "");
    setCNacionalidade(c?.spouse_nationality ?? (c ? "" : "BRASILEIRA"));
    setCProfissao(c?.spouse_profession ?? "");

    setTipo(c?.property_kind ?? "");
    setImovelEndereco(c?.property_address ?? "");
    setArea(c?.property_area ?? "");
    setMatricula(c?.property_registration ?? "");
    setCartorio(c?.property_registry_office ?? "");
    setIptu(c?.property_iptu_code ?? "");
    setDescricao(c?.property_description ?? "");

    setPreco(c && Number(c.price) > 0 ? formatBRLInput(Number(c.price)) : "");
    setPagamento(c?.payment_terms ?? "");
    setPosse(c?.possession_date ?? "");
    setPrazoEscritura(c ? (c.deed_days ? String(c.deed_days) : "") : "30");
    setMulta(
      c
        ? c.penalty_percent
          ? String(c.penalty_percent).replace(".", ",")
          : ""
        : "10"
    );
    setCidade(c?.forum_city ?? "São Mateus do Maranhão/MA");
    setAssinatura(c ? (c.signed_at ?? "") : localDateISO());
    setAdicionais(c?.notes ?? "");
    setErro(null);
  }, [open, contrato]);

  const valor = parseMoney(preco);
  const mostraConjuge = pedeConjuge(estadoCivil) || !!cNome.trim();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    startTransition(async () => {
      const input = {
        seller_name: nome,
        seller_document: doc,
        seller_rg: rg,
        seller_nationality: nacionalidade,
        seller_marital_status: estadoCivil,
        seller_property_regime: pedeConjuge(estadoCivil) ? regime : "",
        seller_profession: profissao,
        seller_address: endereco,
        seller_phone: telefone,
        seller_email: email,

        // solteiro, divorciado ou viúvo não leva cônjuge para o papel
        spouse_name: mostraConjuge ? cNome : "",
        spouse_document: mostraConjuge ? cDoc : "",
        spouse_rg: mostraConjuge ? cRg : "",
        spouse_nationality: mostraConjuge ? cNacionalidade : "",
        spouse_profession: mostraConjuge ? cProfissao : "",

        property_kind: tipo,
        property_address: imovelEndereco,
        property_area: area,
        property_registration: matricula,
        property_registry_office: cartorio,
        property_iptu_code: iptu,
        property_description: descricao,

        price: valor,
        payment_terms: pagamento,
        possession_date: posse,
        deed_days: parseInt(prazoEscritura, 10) || null,
        penalty_percent: parseMoney(multa) || null,
        forum_city: cidade,
        signed_at: assinatura,
        notes: adicionais,
      };
      const r = await salvarContratoCompraVenda(contrato?.id ?? null, input);
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
        `Apagar o contrato de compra e venda${contrato.seller_name ? ` com ${contrato.seller_name}` : ""}? Isso não tem volta.`
      )
    )
      return;
    setErro(null);
    startTransition(async () => {
      const falha = actionError(await apagarContratoCompraVenda(contrato.id));
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              <Landmark className="w-4 h-4" />
            </span>
            {contrato ? "Contrato de compra e venda" : "Novo contrato de compra e venda"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
              COMPRADORA
            </p>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              PRODUMAR SERVIÇOS LTDA
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              CNPJ, endereço e a sócia que assina saem do contrato de aluguel (Modelo do
              contrato).
            </p>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Nenhum campo é obrigatório: o que ficar em branco sai no papel como linha para
            completar à caneta.
          </p>

          {/* ── O vendedor ─────────────────────────────────────────────── */}
          <Secao titulo="O vendedor" />

          <Campo id="cv_nome" label="Nome completo">
            <Input
              id="cv_nome"
              value={nome}
              onChange={(e) => setNome(upperKeepingCaret(e))}
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo id="cv_doc" label="CPF / CNPJ">
              <Input
                id="cv_doc"
                value={doc}
                onChange={(e) => setDoc(e.target.value)}
                placeholder="000.000.000-00"
                className="h-11 tabular-nums sm:h-10"
                inputMode="numeric"
                autoComplete="off"
              />
            </Campo>
            <Campo id="cv_rg" label="RG">
              <Input
                id="cv_rg"
                value={rg}
                onChange={(e) => setRg(upperKeepingCaret(e))}
                placeholder="com o órgão"
                autoCapitalize="characters"
                className="h-11 sm:h-10"
                autoComplete="off"
              />
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo id="cv_nac" label="Nacionalidade">
              <Input
                id="cv_nac"
                value={nacionalidade}
                onChange={(e) => setNacionalidade(upperKeepingCaret(e))}
                autoCapitalize="characters"
                className="h-11 sm:h-10"
                autoComplete="off"
              />
            </Campo>
            <Campo id="cv_prof" label="Profissão">
              <Input
                id="cv_prof"
                value={profissao}
                onChange={(e) => setProfissao(upperKeepingCaret(e))}
                autoCapitalize="characters"
                className="h-11 sm:h-10"
                autoComplete="off"
              />
            </Campo>
          </div>

          <div className="space-y-1.5">
            <Label>Estado civil</Label>
            <Chips opcoes={ESTADOS_CIVIS} valor={estadoCivil} onChange={setEstadoCivil} />
          </div>

          {pedeConjuge(estadoCivil) && (
            <div className="space-y-1.5">
              <Label>Regime de bens</Label>
              <Chips opcoes={REGIMES} valor={regime} onChange={setRegime} />
            </div>
          )}

          <Campo id="cv_end" label="Endereço onde mora">
            <Textarea
              id="cv_end"
              value={endereco}
              onChange={(e) => setEndereco(upperKeepingCaret(e))}
              placeholder="rua, nº, bairro, cidade/uf, cep"
              rows={2}
              autoCapitalize="characters"
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo id="cv_fone" label="Telefone">
              <Input
                id="cv_fone"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="opcional"
                className="h-11 sm:h-10"
                inputMode="tel"
                autoComplete="off"
              />
            </Campo>
            <Campo id="cv_email" label="E-mail">
              <Input
                id="cv_email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="opcional"
                className="h-11 sm:h-10"
                inputMode="email"
                autoComplete="off"
              />
            </Campo>
          </div>

          {/* ── O cônjuge ──────────────────────────────────────────────── */}
          {mostraConjuge && (
            <>
              <Secao titulo="O cônjuge do vendedor" />
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Vendedor casado: o cônjuge assina junto. Sem essa assinatura a venda pode ser
                anulada (só a separação total de bens dispensa).
              </p>
              <Campo id="cv_cnome" label="Nome completo">
                <Input
                  id="cv_cnome"
                  value={cNome}
                  onChange={(e) => setCNome(upperKeepingCaret(e))}
                  autoCapitalize="characters"
                  className="h-11 sm:h-10"
                  autoComplete="off"
                />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo id="cv_cdoc" label="CPF">
                  <Input
                    id="cv_cdoc"
                    value={cDoc}
                    onChange={(e) => setCDoc(e.target.value)}
                    placeholder="000.000.000-00"
                    className="h-11 tabular-nums sm:h-10"
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </Campo>
                <Campo id="cv_crg" label="RG">
                  <Input
                    id="cv_crg"
                    value={cRg}
                    onChange={(e) => setCRg(upperKeepingCaret(e))}
                    autoCapitalize="characters"
                    className="h-11 sm:h-10"
                    autoComplete="off"
                  />
                </Campo>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Campo id="cv_cnac" label="Nacionalidade">
                  <Input
                    id="cv_cnac"
                    value={cNacionalidade}
                    onChange={(e) => setCNacionalidade(upperKeepingCaret(e))}
                    autoCapitalize="characters"
                    className="h-11 sm:h-10"
                    autoComplete="off"
                  />
                </Campo>
                <Campo id="cv_cprof" label="Profissão">
                  <Input
                    id="cv_cprof"
                    value={cProfissao}
                    onChange={(e) => setCProfissao(upperKeepingCaret(e))}
                    autoCapitalize="characters"
                    className="h-11 sm:h-10"
                    autoComplete="off"
                  />
                </Campo>
              </div>
            </>
          )}

          {/* ── O imóvel ───────────────────────────────────────────────── */}
          <Secao titulo="O imóvel" />

          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Chips opcoes={TIPOS} valor={tipo} onChange={setTipo} />
          </div>

          <Campo id="cv_iend" label="Endereço do imóvel">
            <Textarea
              id="cv_iend"
              value={imovelEndereco}
              onChange={(e) => setImovelEndereco(upperKeepingCaret(e))}
              placeholder="rua, nº, bairro, cidade/uf, cep"
              rows={2}
              autoCapitalize="characters"
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo id="cv_area" label="Área">
              <Input
                id="cv_area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="ex: 360,00 m²"
                className="h-11 sm:h-10"
                autoComplete="off"
              />
            </Campo>
            <Campo id="cv_mat" label="Matrícula">
              <Input
                id="cv_mat"
                value={matricula}
                onChange={(e) => setMatricula(upperKeepingCaret(e))}
                autoCapitalize="characters"
                className="h-11 sm:h-10"
                autoComplete="off"
              />
            </Campo>
          </div>

          <Campo id="cv_cart" label="Cartório de registro">
            <Input
              id="cv_cart"
              value={cartorio}
              onChange={(e) => setCartorio(e.target.value)}
              placeholder="Cartório de Registro de Imóveis de São Mateus do Maranhão/MA"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </Campo>

          <Campo id="cv_iptu" label="Inscrição do IPTU">
            <Input
              id="cv_iptu"
              value={iptu}
              onChange={(e) => setIptu(upperKeepingCaret(e))}
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </Campo>

          <Campo
            id="cv_desc"
            label="Medidas, confrontações e benfeitorias"
            dica="Como está na matrícula: frente, fundos, laterais, com quem faz divisa e o que tem construído."
          >
            <Textarea
              id="cv_desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="ex: medindo 12 m de frente por 30 m de fundos, limitando-se ao norte com..."
              rows={3}
            />
          </Campo>

          {/* ── Preço ──────────────────────────────────────────────────── */}
          <Secao titulo="Preço e pagamento" />

          <Campo id="cv_preco" label="Preço do imóvel (R$)">
            <Input
              id="cv_preco"
              value={preco}
              onChange={(e) => setPreco(formatBRLInput(e.target.value))}
              placeholder="0,00"
              className="h-11 text-base tabular-nums font-semibold sm:h-10"
              inputMode="decimal"
              autoComplete="off"
            />
            {valor > 0 && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {primeiraMaiuscula(valorPorExtenso(valor))} — é assim que sai no contrato.
              </p>
            )}
          </Campo>

          <Campo
            id="cv_pag"
            label="Forma de pagamento"
            dica="Escreva como vai ser pago: à vista, entrada e parcelas, banco e conta do vendedor..."
          >
            <Textarea
              id="cv_pag"
              value={pagamento}
              onChange={(e) => setPagamento(e.target.value)}
              placeholder="ex: à vista, por transferência bancária para a conta do vendedor, na assinatura deste contrato"
              rows={3}
            />
          </Campo>

          {/* ── Prazos ─────────────────────────────────────────────────── */}
          <Secao titulo="Prazos e assinatura" />

          <div className="grid grid-cols-2 gap-3">
            <Campo id="cv_posse" label="Entrega da posse">
              <Input
                id="cv_posse"
                type="date"
                value={posse}
                onChange={(e) => setPosse(e.target.value)}
                className="h-11 sm:h-10"
              />
            </Campo>
            <Campo id="cv_ass" label="Data da assinatura">
              <Input
                id="cv_ass"
                type="date"
                value={assinatura}
                onChange={(e) => setAssinatura(e.target.value)}
                className="h-11 sm:h-10"
              />
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo id="cv_escr" label="Escritura em até (dias)">
              <Input
                id="cv_escr"
                value={prazoEscritura}
                onChange={(e) => setPrazoEscritura(e.target.value.replace(/\D/g, "").slice(0, 3))}
                className="h-11 tabular-nums sm:h-10"
                inputMode="numeric"
                autoComplete="off"
              />
            </Campo>
            <Campo id="cv_multa" label="Multa (% do preço)">
              <Input
                id="cv_multa"
                value={multa}
                onChange={(e) => setMulta(e.target.value.replace(/[^\d,]/g, "").slice(0, 5))}
                className="h-11 tabular-nums sm:h-10"
                inputMode="decimal"
                autoComplete="off"
              />
            </Campo>
          </div>

          <Campo id="cv_cid" label="Cidade (foro e assinatura)">
            <Input
              id="cv_cid"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </Campo>

          <Campo
            id="cv_adic"
            label="Cláusulas adicionais"
            dica="Opcional. Entra como uma cláusula a mais, antes do foro."
          >
            <Textarea
              id="cv_adic"
              value={adicionais}
              onChange={(e) => setAdicionais(e.target.value)}
              rows={2}
            />
          </Campo>

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
              {isPending ? "Salvando..." : "Salvar"}
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

function Campo({
  id,
  label,
  dica,
  children,
}: {
  id: string;
  label: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {dica && <p className="text-[11px] text-slate-400 dark:text-slate-500">{dica}</p>}
    </div>
  );
}

/** Escolha de um valor por chip — tocar de novo no escolhido limpa. */
function Chips({
  opcoes,
  valor,
  onChange,
}: {
  opcoes: string[];
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(valor === o ? "" : o)}
          className={cn(
            "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
            valor === o
              ? "bg-produmar-600 border-produmar-600 text-white"
              : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
