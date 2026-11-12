"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Baby,
  Camera,
  Check,
  CheckSquare,
  CloudOff,
  Square,
  Syringe,
  ImagePlus,
  RefreshCw,
  Trash2,
  Upload,
  WifiOff,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatDate, localDateISO, upperKeepingCaret } from "@/lib/utils";
import { aplicarPendencia, requestCalfBirth } from "@/app/(app)/vaqueiro/actions";
import {
  PARTO_SPECIES_OPTIONS,
  SPECIES_META,
  SexPicker,
  speciesOf,
  youngNoun,
} from "@/components/animais/animal-shared";
import type {
  AnimalSex,
  AnimalSpecies,
  ProtocoloItemAplicado,
  ProtocoloNascimentoItem,
  ProtocoloPendencia,
} from "@/lib/types";
import { comprimirImagem } from "@/lib/comprimir-imagem";
import {
  filaApagar,
  filaFunciona,
  filaGuardar,
  filaLimparAntigos,
  filaListar,
  novoId,
  type NascimentoGuardado,
} from "@/lib/fila-nascimentos";

/** De quanto em quanto tempo tenta sozinho, quando tem coisa esperando. */
const TENTAR_DE_NOVO_A_CADA = 30_000;

interface Props {
  /**
   * O celular deste usuário é do vaqueiro? Só nele o sistema instala a cópia
   * da tela para abrir sem rede. No aparelho do patrão (que às vezes abre esta
   * tela só para conferir) nada é guardado — ele anda pelo sistema inteiro, e
   * tela guardada onde não precisa é tela velha aparecendo depois.
   */
  podeOffline?: boolean;
  /**
   * O protocolo do nascimento que o dono montou, de todos os bichos. A tela
   * mostra só o do bicho escolhido e não deixa salvar sem marcar tudo.
   */
  protocolo?: ProtocoloNascimentoItem[];
  /** O protocolo que ELE deixou de aplicar e ainda não deu baixa (migration 138). */
  pendencias?: ProtocoloPendencia[];
}

type ResultadoEnvio = { ok: true } | { erro: string } | { semRede: true };

/** Manda UM nascimento para o servidor e diz no que deu. */
async function enviarNascimento(registro: NascimentoGuardado): Promise<ResultadoEnvio> {
  const fd = new FormData();
  fd.append("client_id", registro.id);
  fd.append("mother_tag", registro.mother_tag);
  fd.append("birth_date", registro.birth_date);
  fd.append("calf_sex", registro.calf_sex);
  // O que ficou guardado antes desta versão da tela não tem o bicho marcado:
  // aquilo é bovino, o único que a tela conhecia.
  fd.append("species", speciesOf(registro.species));
  if (registro.protocolo && registro.protocolo.length > 0) {
    fd.append("protocolo", JSON.stringify(registro.protocolo));
  }
  if (registro.protocolo_pendente && registro.protocolo_pendente.length > 0) {
    fd.append("protocolo_pendente", JSON.stringify(registro.protocolo_pendente));
  }
  if (registro.caracteristicas) fd.append("caracteristicas", registro.caracteristicas);
  if (registro.foto) {
    fd.append(
      "photo",
      new File([registro.foto], registro.foto_nome || "foto.jpg", {
        type: registro.foto.type || "image/jpeg",
      })
    );
  }
  if (registro.foto_mae) {
    fd.append(
      "mother_photo",
      new File([registro.foto_mae], registro.foto_mae_nome || "mae.jpg", {
        type: registro.foto_mae.type || "image/jpeg",
      })
    );
  }

  try {
    const resposta = await requestCalfBirth(fd);
    if (resposta && "error" in resposta && resposta.error) return { erro: resposta.error };
    return { ok: true };
  } catch {
    // O pedido nem saiu do celular: isso é falta de sinal, não erro de
    // cadastro. Fica na fila para a próxima — sem gastar tentativa à toa.
    return { semRede: true };
  }
}

/**
 * Como a fila chama o que foi anotado: "Cordeiro fêmea", "Potro macho". Quem
 * foi guardado antes de a tela perguntar o bicho é bovino — era o único que
 * ela conhecia.
 */
function nomeDoNascimento(r: NascimentoGuardado): string {
  const nomes = SPECIES_META[speciesOf(r.species)];
  return `${nomes.youngMale} ${r.calf_sex === "macho" ? "macho" : "fêmea"}`;
}

export function VaqueiroClient({ podeOffline = false, protocolo = [], pendencias = [] }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [motherTag, setMotherTag] = useState("");
  const [calfSex, setCalfSex] = useState<AnimalSex>("femea");
  /**
   * Que bicho nasceu. Antes a tela só sabia falar de gado, e o cordeiro da
   * ovelha chegava no patrão escrito "bezerro" — sem como saber que bicho era
   * aquele da foto.
   */
  const [species, setSpecies] = useState<AnimalSpecies>("bovino");
  /** Os itens do protocolo que ele já marcou como aplicados (pelo id). */
  const [aplicados, setAplicados] = useState<Set<string>>(new Set());
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  /** A foto da MÃE — opcional, vai para a ficha dela quando o patrão lançar. */
  const [fotoMae, setFotoMae] = useState<File | null>(null);
  const [fotoMaeUrl, setFotoMaeUrl] = useState<string | null>(null);
  /** Como reconhecer a cria: pinta na testa, mancha no lombo... */
  const [caracteristicas, setCaracteristicas] = useState("");

  /** As pendências que ele já deu baixa agora (somem da tela na hora). */
  const [baixadas, setBaixadas] = useState<Set<string>>(new Set());
  const [baixando, setBaixando] = useState<string | null>(null);
  const [erroPendencia, setErroPendencia] = useState<string | null>(null);
  const pendenciasAbertas = pendencias.filter((p) => !baixadas.has(p.id));

  /** Tudo que está no celular: o que espera rede e o que já subiu. */
  const [fila, setFila] = useState<NascimentoGuardado[]>([]);
  /** Este aparelho sabe guardar? Se não souber, volta ao envio direto. */
  const [guardaNoCelular, setGuardaNoCelular] = useState(false);
  const [temRede, setTemRede] = useState(true);
  const [enviandoFila, setEnviandoFila] = useState(false);
  /** Trava para dois disparos não mandarem o mesmo bezerro duas vezes. */
  const enviando = useRef(false);

  const today = localDateISO();
  const pendentes = fila.filter((r) => !r.enviado_em);
  const enviados = fila.filter((r) => r.enviado_em);

  // Como se chama o filhote do bicho escolhido. Fica na forma do macho —
  // "foto do cordeiro", "sexo do potro" — que é a que cabe depois do "do".
  const filhote = youngNoun(species);
  const filhoteMaiusculo = SPECIES_META[speciesOf(species)].youngMale;

  // O protocolo é do BICHO: o bezerro toma uma coisa, o leitão outra.
  const protocoloDoBicho = protocolo.filter((i) => i.species === species);
  const faltaAplicar = protocoloDoBicho.filter((i) => !aplicados.has(i.id));

  /** A fotografia do que foi aplicado — é isto que viaja com o nascimento. */
  function protocoloMarcado(): ProtocoloItemAplicado[] {
    return protocoloDoBicho
      .filter((i) => aplicados.has(i.id))
      .map((i) => ({ medicine: i.medicine, dose: i.dose }));
  }

  function alternarAplicado(id: string) {
    setAplicados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  // Trocou de bicho: a marcação era do protocolo do outro, começa de novo.
  useEffect(() => {
    setAplicados(new Set());
  }, [species]);

  // Libera a URL do objeto quando troca ou some a foto — evita vazar memória.
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);
  useEffect(() => {
    return () => {
      if (fotoMaeUrl) URL.revokeObjectURL(fotoMaeUrl);
    };
  }, [fotoMaeUrl]);

  // ── Sinal: a tela avisa quando está sem rede, para ele não achar que travou ─
  useEffect(() => {
    const conferir = () => setTemRede(navigator.onLine);
    conferir();
    window.addEventListener("online", conferir);
    window.addEventListener("offline", conferir);
    return () => {
      window.removeEventListener("online", conferir);
      window.removeEventListener("offline", conferir);
    };
  }, []);

  // ── A cópia da tela no celular, para o app ABRIR sem rede ──────────────────
  useEffect(() => {
    if (!podeOffline) return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sem a cópia ele ainda cadastra offline com a tela já aberta — só não
      // consegue ABRIR o app no mato. Não é motivo para atrapalhar a tela.
    });
  }, [podeOffline]);

  /**
   * Sobe o que está esperando, um por um. Para na primeira falta de sinal:
   * insistir sem rede só gasta bateria.
   */
  const esvaziarFila = useCallback(async () => {
    if (enviando.current) return;
    enviando.current = true;
    setEnviandoFila(true);
    let subiuAlgum = false;
    try {
      const guardados = await filaListar();
      for (const registro of guardados) {
        if (registro.enviado_em) continue;
        if (typeof navigator !== "undefined" && !navigator.onLine) break;

        const resultado = await enviarNascimento(registro);
        if ("semRede" in resultado) break;

        if ("erro" in resultado) {
          await filaGuardar({
            ...registro,
            erro: resultado.erro,
            tentativas: registro.tentativas + 1,
          });
          continue;
        }

        // Subiu: guarda o comprovante e joga as fotos fora — elas já estão no
        // servidor, e foto guardada à toa enche o celular do vaqueiro.
        await filaGuardar({
          ...registro,
          foto: null,
          foto_mae: null,
          enviado_em: Date.now(),
          erro: null,
        });
        subiuAlgum = true;
      }
      setFila(await filaListar());
      // O que subiu pode ter deixado protocolo pendente: busca a lista nova
      if (subiuAlgum) router.refresh();
    } catch {
      // Fila quebrada no meio do caminho: o que está gravado continua gravado
      // e a próxima tentativa pega tudo de novo.
    } finally {
      enviando.current = false;
      setEnviandoFila(false);
    }
  }, [router]);

  // ── Ao abrir: lê o que ficou de ontem e tenta mandar ───────────────────────
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!(await filaFunciona())) return;
      if (!vivo) return;
      setGuardaNoCelular(true);
      try {
        await filaLimparAntigos();
        const guardados = await filaListar();
        if (!vivo) return;
        setFila(guardados);
        if (guardados.some((r) => !r.enviado_em)) esvaziarFila();
      } catch {
        // paciência: a tela abre igual
      }
    })();
    return () => {
      vivo = false;
    };
  }, [esvaziarFila]);

  // ── Voltou o sinal, ou ele voltou para o app: tenta de novo ────────────────
  useEffect(() => {
    if (!guardaNoCelular) return;

    const tentar = () => {
      if (typeof navigator !== "undefined" && navigator.onLine) esvaziarFila();
    };
    const aoVoltarParaOApp = () => {
      if (document.visibilityState === "visible") tentar();
    };

    window.addEventListener("online", tentar);
    document.addEventListener("visibilitychange", aoVoltarParaOApp);
    return () => {
      window.removeEventListener("online", tentar);
      document.removeEventListener("visibilitychange", aoVoltarParaOApp);
    };
  }, [guardaNoCelular, esvaziarFila]);

  // Rede de segurança: no pasto o sinal vai e volta sem o celular avisar
  // direito, então de meio em meio minuto tenta sozinho enquanto houver coisa.
  useEffect(() => {
    if (pendentes.length === 0) return;
    const relogio = setInterval(() => {
      if (typeof navigator !== "undefined" && navigator.onLine) esvaziarFila();
    }, TENTAR_DE_NOVO_A_CADA);
    return () => clearInterval(relogio);
  }, [pendentes.length, esvaziarFila]);

  async function handlePhotoChange(file: File | null) {
    // Encolhe no próprio celular antes de subir: no 4G do pasto o envio de uma
    // foto de câmera inteira demora demais, e para ver o bezerro 1600px sobra.
    const foto = file ? await comprimirImagem(file) : null;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhoto(foto);
    setPhotoUrl(foto ? URL.createObjectURL(foto) : null);
  }

  async function handleFotoMaeChange(file: File | null) {
    const foto = file ? await comprimirImagem(file) : null;
    if (fotoMaeUrl) URL.revokeObjectURL(fotoMaeUrl);
    setFotoMae(foto);
    setFotoMaeUrl(foto ? URL.createObjectURL(foto) : null);
  }

  /** "APLIQUEI": dá baixa na pendência — precisa de rede. */
  async function darBaixa(p: ProtocoloPendencia) {
    setErroPendencia(null);
    setBaixando(p.id);
    try {
      const r = await aplicarPendencia(p.id, localDateISO());
      if (r && "error" in r && r.error) {
        setErroPendencia(r.error);
        return;
      }
      setBaixadas((atual) => new Set(atual).add(p.id));
      router.refresh();
    } catch {
      setErroPendencia("Sem rede agora. Toque em APLIQUEI de novo quando pegar sinal.");
    } finally {
      setBaixando(null);
    }
  }

  function resetForm() {
    setMotherTag("");
    setCalfSex("femea");
    setAplicados(new Set());
    setCaracteristicas("");
    handlePhotoChange(null);
    handleFotoMaeChange(null);
    // O bicho escolhido FICA: quem está no curral das ovelhas anota um cordeiro
    // atrás do outro, e voltar para bovino a cada envio só faria ele errar.
  }

  async function apagarDaFila(id: string) {
    try {
      await filaApagar(id);
      setFila(await filaListar());
    } catch {
      setError("Não consegui apagar da fila");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!motherTag.trim()) return setError("Informe o número da mãe");
    if (!photo) return setError(`Coloque uma foto do ${filhote}`);
    // O protocolo NÃO trava mais o envio: o que ele não marcou vai junto como
    // pendência dele, e fica na tela até ele aplicar e dar baixa.
    const protocoloDoEnvio = protocoloMarcado();
    const protocoloPendente: ProtocoloItemAplicado[] = faltaAplicar.map((i) => ({
      medicine: i.medicine,
      dose: i.dose,
    }));
    const caracteristicasDoEnvio = caracteristicas.trim().toUpperCase();
    const ficouPendente =
      protocoloPendente.length > 0
        ? ` Ficou pendente para você: ${protocoloPendente.map((i) => i.medicine).join(", ")}.`
        : "";

    // ── O caminho normal: GRAVA NO CELULAR, e só então tenta a rede ──────────
    // O formulário só é limpo depois que o nascimento está seguro no aparelho.
    // Assim, acabou a bateria, fechou o app, entrou no mato — não perde nada.
    if (guardaNoCelular) {
      const registro: NascimentoGuardado = {
        id: novoId(),
        mother_tag: motherTag.trim().toUpperCase(),
        calf_sex: calfSex,
        species,
        birth_date: today,
        protocolo: protocoloDoEnvio,
        protocolo_pendente: protocoloPendente,
        caracteristicas: caracteristicasDoEnvio,
        foto: photo,
        foto_nome: photo.name || "foto.jpg",
        foto_mae: fotoMae,
        foto_mae_nome: fotoMae?.name || "mae.jpg",
        criado_em: Date.now(),
        enviado_em: null,
        erro: null,
        tentativas: 0,
      };

      try {
        await filaGuardar(registro);
        setFila(await filaListar());
        resetForm();
        setSuccess(
          (temRede
            ? `${filhoteMaiusculo} da mãe ${registro.mother_tag} anotado! Enviando para o patrão...`
            : `${filhoteMaiusculo} da mãe ${registro.mother_tag} anotado no celular! Sem rede agora — vai sozinho quando o sinal voltar.`) +
            ficouPendente
        );
        esvaziarFila();
        return;
      } catch {
        // Não deu para guardar: cai no envio direto abaixo, com o formulário
        // ainda cheio — nada é limpo sem estar em lugar seguro.
        setGuardaNoCelular(false);
      }
    }

    // ── O caminho antigo: sem guardar, direto para o servidor ────────────────
    const fd = new FormData();
    fd.append("client_id", novoId());
    fd.append("mother_tag", motherTag);
    fd.append("birth_date", today);
    fd.append("calf_sex", calfSex);
    fd.append("species", species);
    if (protocoloDoEnvio.length > 0) fd.append("protocolo", JSON.stringify(protocoloDoEnvio));
    if (protocoloPendente.length > 0)
      fd.append("protocolo_pendente", JSON.stringify(protocoloPendente));
    if (caracteristicasDoEnvio) fd.append("caracteristicas", caracteristicasDoEnvio);
    fd.append("photo", photo);
    if (fotoMae) fd.append("mother_photo", fotoMae);

    startTransition(async () => {
      try {
        const r = await requestCalfBirth(fd);
        if (r && "error" in r) {
          setError(r.error ?? "Erro ao enviar o nascimento");
          return;
        }
        setSuccess(
          `${filhoteMaiusculo} da mãe ${motherTag.toUpperCase()} enviado! O patrão dá o número e lança no rebanho.` +
            ficouPendente
        );
        resetForm();
      } catch {
        setError("Sem rede agora. Não feche esta tela e tente de novo quando pegar sinal.");
      }
    });
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3 pt-1">
        <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
          <Baby className="w-6 h-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Novo nascimento
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Hoje, {formatDate(today)}</p>
        </div>
      </div>

      {/* Sem sinal: o aviso vem antes de tudo, para ele cadastrar tranquilo */}
      {!temRede && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
          <WifiOff className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Sem rede agora
            </p>
            <p className="text-[13px] text-amber-700 dark:text-amber-400/90">
              {guardaNoCelular
                ? "Pode cadastrar do mesmo jeito: fica guardado no celular e sobe sozinho quando o sinal voltar."
                : "Este celular não deixa guardar — espere pegar sinal para enviar."}
            </p>
          </div>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
          <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{success}</p>
        </div>
      )}

      {/* O QUE FICOU PENDENTE — o protocolo que ele não aplicou no nascimento.
          Fica aqui no alto até ele aplicar e tocar em APLIQUEI. */}
      {pendenciasAbertas.length > 0 && (
        <div className="space-y-2 rounded-xl border-2 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3">
          <div className="flex items-start gap-2">
            <Syringe className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Protocolo pendente ({pendenciasAbertas.length})
              </p>
              <p className="text-[12px] text-amber-800/80 dark:text-amber-300/80">
                Aplique e toque em APLIQUEI — a pendência sai da sua tela.
              </p>
            </div>
          </div>
          <ul className="space-y-1.5">
            {pendenciasAbertas.map((p) => {
              const nomes = SPECIES_META[speciesOf(p.species)];
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-white dark:bg-slate-900 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 break-words">
                      {p.medicine}
                      {p.dose ? (
                        <span className="text-sm font-normal text-slate-500"> · {p.dose}</span>
                      ) : null}
                    </p>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400">
                      {nomes.youngMale} {p.calf_sex === "macho" ? "macho" : "fêmea"}
                      {p.mother_tag ? ` da mãe ${p.mother_tag}` : ""}
                      {p.birth_date ? ` · nasceu ${formatDate(p.birth_date)}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => darBaixa(p)}
                    disabled={baixando === p.id}
                    className="h-12 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex-shrink-0"
                  >
                    <Check className="w-4 h-4" />
                    {baixando === p.id ? "..." : "APLIQUEI"}
                  </Button>
                </li>
              );
            })}
          </ul>
          {erroPendencia && (
            <p className="text-sm text-red-600 dark:text-red-400">{erroPendencia}</p>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nascimento de {filhote}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* O BICHO VEM PRIMEIRO: é ele que dá nome a tudo o que vem
                abaixo — foto do cordeiro, sexo do potro, e o recado que o
                patrão vê na fila dele. */}
            <div className="space-y-1.5">
              <Label>Que bicho nasceu? *</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {PARTO_SPECIES_OPTIONS.map((opt) => {
                  const nomes = SPECIES_META[opt.value];
                  const escolhido = species === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSpecies(opt.value)}
                      className={cn(
                        "min-h-[56px] px-3 py-2 rounded-xl border text-left transition-colors active:scale-[0.98]",
                        escolhido
                          ? "bg-produmar-50 border-produmar-300 dark:bg-produmar-950/40 dark:border-produmar-700"
                          : "bg-white border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
                      )}
                    >
                      <span
                        className={cn(
                          "block text-sm font-semibold",
                          escolhido
                            ? "text-produmar-700 dark:text-produmar-300"
                            : "text-slate-600 dark:text-slate-300"
                        )}
                      >
                        {nomes.label}
                      </span>
                      {/* "ovelha pariu cordeiro": o vaqueiro não precisa saber
                          que ovelha é "ovino" para achar o botão certo. */}
                      <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                        {nomes.female.toLowerCase()} pariu {nomes.youngMale.toLowerCase()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* AS DUAS FOTOS: a do filhote (obrigatória) e a da mãe — cada uma
                vai para a ficha do seu animal quando o patrão lançar. */}
            <CampoFoto
              titulo={`Foto do ${filhote} *`}
              alt={`Foto do ${filhote}`}
              url={photoUrl}
              onChange={handlePhotoChange}
            />
            <CampoFoto
              titulo="Foto da mãe"
              alt="Foto da mãe"
              url={fotoMaeUrl}
              onChange={handleFotoMaeChange}
              ajuda="Opcional — vai para a ficha da mãe."
            />

            <div className="space-y-1.5">
              <Label htmlFor="vq_mother_tag">Número da mãe *</Label>
              <Input
                id="vq_mother_tag"
                value={motherTag}
                onChange={(e) => setMotherTag(upperKeepingCaret(e))}
                placeholder="ex: 1046"
                autoCapitalize="characters"
                className="h-12 text-lg placeholder:text-base"
                autoComplete="off"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Não precisa ser exato — o patrão confere antes de lançar no rebanho.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Sexo do {filhote} *</Label>
              <SexPicker value={calfSex} onChange={setCalfSex} />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                O número do {filhote} quem dá é o patrão, na hora de lançar no rebanho.
              </p>
            </div>

            {/* Como reconhecer a cria no pasto — vira a observação da ficha dela */}
            <div className="space-y-1.5">
              <Label htmlFor="vq_caracteristicas">Características do {filhote}</Label>
              <Textarea
                id="vq_caracteristicas"
                value={caracteristicas}
                onChange={(e) => setCaracteristicas(upperKeepingCaret(e))}
                placeholder="ex: PINTA NA TESTA, MANCHA BRANCA NO LOMBO, ORELHA CAÍDA"
                autoCapitalize="characters"
                rows={2}
                maxLength={500}
                className="text-base"
              />
            </div>

            {/* O PROTOCOLO DO NASCIMENTO — o que o patrão mandou aplicar agora,
                com a cria na mão. Não trava o envio: o que ficar sem marcar
                vira pendência dele, lá embaixo, até aplicar. */}
            {protocoloDoBicho.length > 0 && (
              <div className="space-y-2 rounded-xl border-2 border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20 p-3">
                <div className="flex items-start gap-2">
                  <Syringe className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                      Aplique agora no {filhote} *
                    </p>
                    <p className="text-[12px] text-amber-800/80 dark:text-amber-300/80">
                      Toque em cada um depois de aplicar. O que não aplicar agora fica
                      pendente para você — o nascimento vai do mesmo jeito.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {protocoloDoBicho.map((item) => {
                    const feito = aplicados.has(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => alternarAplicado(item.id)}
                        aria-pressed={feito}
                        className={cn(
                          "w-full min-h-[56px] flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-colors active:scale-[0.99]",
                          feito
                            ? "bg-emerald-50 border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800"
                            : "bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700"
                        )}
                      >
                        {feito ? (
                          <CheckSquare className="w-6 h-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        ) : (
                          <Square className="w-6 h-6 text-slate-400 flex-shrink-0" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block text-[15px] font-semibold break-words",
                              feito
                                ? "text-emerald-800 dark:text-emerald-300"
                                : "text-slate-700 dark:text-slate-200"
                            )}
                          >
                            {item.medicine}
                          </span>
                          {item.dose && (
                            <span className="block text-[12px] text-slate-500 dark:text-slate-400">
                              {item.dose}
                            </span>
                          )}
                        </span>
                        <span
                          className={cn(
                            "text-[11px] font-bold flex-shrink-0",
                            feito ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"
                          )}
                        >
                          {feito ? "APLICADO" : "FALTA"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={isPending}
              className="w-full h-14 text-base font-semibold"
            >
              {isPending
                ? "Enviando..."
                : guardaNoCelular
                  ? "Salvar nascimento"
                  : "Enviar nascimento"}
            </Button>
            {faltaAplicar.length > 0 && (
              <p className="text-center text-[12px] text-amber-700 dark:text-amber-400 -mt-2">
                {faltaAplicar.length === 1
                  ? "1 item do protocolo vai ficar pendente para você"
                  : `${faltaAplicar.length} itens do protocolo vão ficar pendentes para você`}
              </p>
            )}

            {guardaNoCelular && (
              <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
                Funciona sem rede: o que você salvar sobe sozinho quando pegar sinal.
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {/* O QUE AINDA NÃO SUBIU — o vaqueiro precisa ver que não sumiu */}
      {pendentes.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="flex items-center gap-1.5">
              <CloudOff className="w-3.5 h-3.5 text-amber-500" />
              No celular, esperando rede ({pendentes.length})
            </Label>
            <button
              type="button"
              onClick={() => esvaziarFila()}
              disabled={enviandoFila || !temRede}
              className="flex items-center gap-1.5 text-[12px] font-medium text-produmar-600 dark:text-produmar-400 disabled:text-slate-400 min-h-[36px] px-2"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", enviandoFila && "animate-spin")} />
              {enviandoFila ? "Enviando..." : "Enviar agora"}
            </button>
          </div>

          <ul className="rounded-xl border border-amber-200 dark:border-amber-900/50 divide-y divide-amber-100 dark:divide-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20">
            {pendentes.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                <Baby
                  className={cn(
                    "w-4 h-4 flex-shrink-0 mt-0.5",
                    r.calf_sex === "macho" ? "text-sky-500" : "text-rose-500"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {nomeDoNascimento(r)} · mãe {r.mother_tag}
                  </p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400/90">
                    Nasceu {formatDate(r.birth_date)}
                    {r.birth_date !== today && " · guardado do dia"}
                  </p>
                  {r.erro && (
                    <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
                      {r.erro} (tentativa {r.tentativas})
                    </p>
                  )}
                </div>
                {/* Só o que deu erro de verdade pode ser jogado fora: o que
                    está apenas esperando sinal ninguém apaga sem querer. */}
                {r.erro && (
                  <button
                    type="button"
                    onClick={() => apagarDaFila(r.id)}
                    aria-label="Apagar este nascimento"
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* O QUE JÁ SUBIU — fica três dias, para ele não mandar duas vezes */}
      {enviados.length > 0 && (
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5 text-emerald-500" />
            Enviados
          </Label>
          <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
            {enviados.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <Baby
                  className={cn(
                    "w-4 h-4 flex-shrink-0",
                    r.calf_sex === "macho" ? "text-sky-500" : "text-rose-500"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {nomeDoNascimento(r)} · mãe {r.mother_tag}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Nasceu {formatDate(r.birth_date)} · enviado{" "}
                    {new Date(r.enviado_em ?? 0).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Um campo de foto do celular: "Tirar foto" abre a câmera, "Escolher foto" a
 * galeria (a foto que ele já tirou antes de abrir o sistema). Com a foto
 * escolhida, mostra a prévia com os botões de trocar e de tirar.
 */
function CampoFoto({
  titulo,
  alt,
  url,
  onChange,
  ajuda,
}: {
  titulo: string;
  alt: string;
  url: string | null;
  onChange: (file: File | null) => void;
  ajuda?: string;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-1.5">
      <Label>{titulo}</Label>
      {/* `capture` força a câmera no celular — o segundo input é para a
          foto que o vaqueiro já tirou antes de abrir o sistema. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onChange(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onChange(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      {url ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={alt}
            className="w-full h-56 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remover foto"
            className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="absolute bottom-2 right-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="h-10 px-3 rounded-full bg-black/60 text-white text-xs font-medium flex items-center gap-1.5"
            >
              <Camera className="w-3.5 h-3.5" />
              Câmera
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="h-10 px-3 rounded-full bg-black/60 text-white text-xs font-medium flex items-center gap-1.5"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              Galeria
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-24 flex-col gap-1.5 border-dashed"
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="w-6 h-6" />
            <span className="text-sm">Tirar foto</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-24 flex-col gap-1.5 border-dashed"
            onClick={() => galleryRef.current?.click()}
          >
            <ImagePlus className="w-6 h-6" />
            <span className="text-sm">Escolher foto</span>
          </Button>
        </div>
      )}
      {ajuda && <p className="text-[11px] text-slate-400 dark:text-slate-500">{ajuda}</p>}
    </div>
  );
}
