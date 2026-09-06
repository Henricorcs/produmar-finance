"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  Baby,
  Camera,
  Check,
  CloudOff,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatDate, localDateISO, upperKeepingCaret } from "@/lib/utils";
import { requestCalfBirth } from "@/app/(app)/vaqueiro/actions";
import { SexPicker } from "@/components/animais/animal-shared";
import type { AnimalSex } from "@/lib/types";
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
}

type ResultadoEnvio = { ok: true } | { erro: string } | { semRede: true };

/** Manda UM nascimento para o servidor e diz no que deu. */
async function enviarNascimento(registro: NascimentoGuardado): Promise<ResultadoEnvio> {
  const fd = new FormData();
  fd.append("client_id", registro.id);
  fd.append("mother_tag", registro.mother_tag);
  fd.append("birth_date", registro.birth_date);
  fd.append("calf_sex", registro.calf_sex);
  if (registro.foto) {
    fd.append(
      "photo",
      new File([registro.foto], registro.foto_nome || "bezerro.jpg", {
        type: registro.foto.type || "image/jpeg",
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

export function VaqueiroClient({ podeOffline = false }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [motherTag, setMotherTag] = useState("");
  const [calfSex, setCalfSex] = useState<AnimalSex>("femea");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

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

  // Libera a URL do objeto quando troca ou some a foto — evita vazar memória.
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

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

        // Subiu: guarda o comprovante e joga a foto fora — ela já está no
        // servidor, e foto guardada à toa enche o celular do vaqueiro.
        await filaGuardar({
          ...registro,
          foto: null,
          enviado_em: Date.now(),
          erro: null,
        });
      }
      setFila(await filaListar());
    } catch {
      // Fila quebrada no meio do caminho: o que está gravado continua gravado
      // e a próxima tentativa pega tudo de novo.
    } finally {
      enviando.current = false;
      setEnviandoFila(false);
    }
  }, []);

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

  function resetForm() {
    setMotherTag("");
    setCalfSex("femea");
    handlePhotoChange(null);
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
    if (!photo) return setError("Coloque uma foto do bezerro");

    // ── O caminho normal: GRAVA NO CELULAR, e só então tenta a rede ──────────
    // O formulário só é limpo depois que o nascimento está seguro no aparelho.
    // Assim, acabou a bateria, fechou o app, entrou no mato — não perde nada.
    if (guardaNoCelular) {
      const registro: NascimentoGuardado = {
        id: novoId(),
        mother_tag: motherTag.trim().toUpperCase(),
        calf_sex: calfSex,
        birth_date: today,
        foto: photo,
        foto_nome: photo.name || "bezerro.jpg",
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
          temRede
            ? `Bezerro da mãe ${registro.mother_tag} anotado! Enviando para o patrão...`
            : `Bezerro da mãe ${registro.mother_tag} anotado no celular! Sem rede agora — vai sozinho quando o sinal voltar.`
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
    fd.append("photo", photo);

    startTransition(async () => {
      try {
        const r = await requestCalfBirth(fd);
        if (r && "error" in r) {
          setError(r.error ?? "Erro ao enviar o nascimento");
          return;
        }
        setSuccess(
          `Bezerro da mãe ${motherTag.toUpperCase()} enviado! O patrão dá o número e lança no rebanho.`
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
            Nascimento de bezerro
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo bezerro</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label>Foto do bezerro *</Label>
              {/* `capture` força a câmera no celular — o segundo input é para a
                  foto que o vaqueiro já tirou antes de abrir o sistema. */}
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  handlePhotoChange(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handlePhotoChange(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              {photoUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl}
                    alt="Foto do bezerro"
                    className="w-full h-56 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => handlePhotoChange(null)}
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
            </div>

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
              <Label>Sexo do bezerro *</Label>
              <SexPicker value={calfSex} onChange={setCalfSex} />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                O número do bezerro quem dá é o patrão, na hora de lançar no rebanho.
              </p>
            </div>

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
                    Bezerro {r.calf_sex === "macho" ? "macho" : "fêmea"} · mãe {r.mother_tag}
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
                    Bezerro {r.calf_sex === "macho" ? "macho" : "fêmea"} · mãe {r.mother_tag}
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
