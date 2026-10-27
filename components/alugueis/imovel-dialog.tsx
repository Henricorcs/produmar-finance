"use client";

import { useEffect, useState, useTransition } from "react";
import { Building2, Trash2 } from "lucide-react";
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
import { cn, upperKeepingCaret } from "@/lib/utils";
import {
  createRentalProperty,
  deleteRentalProperty,
  updateRentalProperty,
} from "@/app/(app)/alugueis/actions";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "./alugueis-shared";
import { RENTAL_KINDS, type RentalProperty } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Imóvel em edição — null cadastra um novo. */
  imovel: RentalProperty | null;
}

/**
 * O CADASTRO DO IMÓVEL.
 *
 * O código não é digitado: quem numera é o sistema, na ordem de cadastro. O
 * endereço vai separado porque é assim que ele entra no contrato — a cláusula
 * primeira monta a linha inteira a partir daqui.
 */
export function ImovelDialog({ open, onClose, imovel }: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [kind, setKind] = useState("casa");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [registration, setRegistration] = useState("");
  const [iptu, setIptu] = useState("");
  const [water, setWater] = useState("");
  const [power, setPower] = useState("");
  const [powerAccount, setPowerAccount] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(imovel?.name ?? "");
    setKind(imovel?.kind ?? "casa");
    setStreet(imovel?.street ?? "");
    setNumber(imovel?.number ?? "");
    setComplement(imovel?.complement ?? "");
    setDistrict(imovel?.district ?? "");
    // a cidade da casa é quase sempre a mesma; num cadastro novo já vem posta
    setCity(imovel?.city ?? "SÃO MATEUS DO MARANHÃO");
    setState(imovel?.state ?? "MA");
    setZip(imovel?.zip ?? "");
    setRegistration(imovel?.registration ?? "");
    setIptu(imovel?.iptu_code ?? "");
    setWater(imovel?.water_code ?? "");
    setPower(imovel?.power_code ?? "");
    setPowerAccount(imovel?.power_account ?? "");
    setNotes(imovel?.notes ?? "");
    setActive(imovel?.active ?? true);
    setErro(null);
  }, [open, imovel]);

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!street.trim() && !name.trim()) {
      setErro("Escreva pelo menos a rua ou um apelido para o imóvel");
      return;
    }
    startTransition(async () => {
      const input = {
        name,
        kind,
        street,
        number,
        complement,
        district,
        city,
        state,
        zip,
        registration,
        iptu_code: iptu,
        water_code: water,
        power_code: power,
        power_account: powerAccount,
        notes,
        active,
      };
      const r = imovel
        ? await updateRentalProperty(imovel.id, input)
        : await createRentalProperty(input);
      const falha = actionError(r);
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  function apagar() {
    if (!imovel) return;
    if (
      !confirm(
        `Apagar o imóvel nº ${imovel.code}? Os contratos e os pagamentos dele vão junto, e isso não tem volta.`
      )
    )
      return;
    setErro(null);
    startTransition(async () => {
      const falha = actionError(await deleteRentalProperty(imovel.id));
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
              <Building2 className="w-4 h-4" />
            </span>
            {imovel ? `Imóvel nº ${imovel.code}` : "Novo imóvel"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4">
          {!imovel && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              O código do imóvel é dado pelo sistema, na ordem de cadastro.
            </p>
          )}

          <div className="space-y-1.5">
            <Label>Tipo do imóvel</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {RENTAL_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setKind(k.value)}
                  className={cn(
                    "min-h-[40px] rounded-lg border text-[11px] font-semibold transition-colors px-1",
                    kind === k.value
                      ? "bg-produmar-600 border-produmar-600 text-white"
                      : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  )}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="im_apelido">Apelido</Label>
            <Input
              id="im_apelido"
              value={name}
              onChange={(e) => setName(upperKeepingCaret(e))}
              placeholder="ex: casa da frente, sala 02"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-[1fr_5rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="im_rua">Rua / avenida</Label>
              <Input
                id="im_rua"
                value={street}
                onChange={(e) => setStreet(upperKeepingCaret(e))}
                placeholder="ex: avenida antonio pereira aragão"
                autoCapitalize="characters"
                className="h-11 sm:h-10"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="im_num">Número</Label>
              <Input
                id="im_num"
                value={number}
                onChange={(e) => setNumber(upperKeepingCaret(e))}
                placeholder="1867"
                className="h-11 sm:h-10"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="im_compl">Complemento</Label>
            <Input
              id="im_compl"
              value={complement}
              onChange={(e) => setComplement(upperKeepingCaret(e))}
              placeholder="opcional — apto, bloco, fundos"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="im_bairro">Bairro</Label>
            <Input
              id="im_bairro"
              value={district}
              onChange={(e) => setDistrict(upperKeepingCaret(e))}
              placeholder="ex: centro"
              autoCapitalize="characters"
              className="h-11 sm:h-10"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-[1fr_4rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="im_cidade">Cidade</Label>
              <Input
                id="im_cidade"
                value={city}
                onChange={(e) => setCity(upperKeepingCaret(e))}
                autoCapitalize="characters"
                className="h-11 sm:h-10"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="im_uf">UF</Label>
              <Input
                id="im_uf"
                value={state}
                onChange={(e) => setState(upperKeepingCaret(e))}
                maxLength={2}
                autoCapitalize="characters"
                className="h-11 text-center sm:h-10"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="im_cep">CEP</Label>
            <Input
              id="im_cep"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="65470-000"
              className="h-11 tabular-nums sm:h-10"
              inputMode="numeric"
              autoComplete="off"
            />
          </div>

          {/* O que o contrato pede e ninguém acha na hora */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="im_matricula">Matrícula</Label>
              <Input
                id="im_matricula"
                value={registration}
                onChange={(e) => setRegistration(upperKeepingCaret(e))}
                placeholder="opcional"
                autoCapitalize="characters"
                className="h-11 sm:h-10"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="im_iptu">IPTU</Label>
              <Input
                id="im_iptu"
                value={iptu}
                onChange={(e) => setIptu(upperKeepingCaret(e))}
                placeholder="opcional"
                autoCapitalize="characters"
                className="h-11 sm:h-10"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="im_agua">Água (instalação)</Label>
              <Input
                id="im_agua"
                value={water}
                onChange={(e) => setWater(upperKeepingCaret(e))}
                placeholder="opcional"
                autoCapitalize="characters"
                className="h-11 sm:h-10"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="im_luz">Luz (instalação)</Label>
              <Input
                id="im_luz"
                value={power}
                onChange={(e) => setPower(upperKeepingCaret(e))}
                placeholder="opcional"
                autoCapitalize="characters"
                className="h-11 sm:h-10"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="im_conta_luz">Luz (conta contrato)</Label>
              <Input
                id="im_conta_luz"
                value={powerAccount}
                onChange={(e) => setPowerAccount(e.target.value)}
                placeholder="vai na procuração"
                inputMode="numeric"
                className="h-11 sm:h-10"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="im_obs">Observação</Label>
            <Textarea
              id="im_obs"
              value={notes}
              onChange={(e) => setNotes(upperKeepingCaret(e))}
              placeholder="opcional"
              rows={2}
              autoCapitalize="characters"
            />
          </div>

          {imovel && (
            <button
              type="button"
              onClick={() => setActive((v) => !v)}
              className={cn(
                "w-full text-left rounded-lg border px-3 py-2.5 transition-colors",
                active
                  ? "bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700"
                  : "bg-slate-100 border-slate-300 dark:bg-slate-800 dark:border-slate-600"
              )}
            >
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {active ? "Imóvel ativo" : "Imóvel inativo"}
              </span>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Inativo some da lista, mas o histórico dele fica.
              </p>
            </button>
          )}

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {erro}
            </p>
          )}

          <DialogFooter className={STICKY_FOOTER}>
            {imovel && (
              <button
                type="button"
                onClick={apagar}
                disabled={isPending}
                aria-label="Apagar imóvel"
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
              {isPending ? "Salvando..." : imovel ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
