"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Baby, Camera, Check, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatDate, localDateISO, upperKeepingCaret } from "@/lib/utils";
import { requestCalfBirth } from "@/app/(app)/vaqueiro/actions";
import { SexPicker } from "@/components/animais/animal-shared";
import type { AnimalSex } from "@/lib/types";
import { comprimirImagem } from "@/lib/comprimir-imagem";

interface SubmittedEntry {
  id: string;
  sex: AnimalSex;
  motherTag: string;
  at: string;
}

export function VaqueiroClient() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [motherTag, setMotherTag] = useState("");
  const [calfSex, setCalfSex] = useState<AnimalSex>("femea");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [submittedToday, setSubmittedToday] = useState<SubmittedEntry[]>([]);

  const today = localDateISO();

  // Libera a URL do objeto quando troca ou some a foto — evita vazar memória.
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!motherTag.trim()) return setError("Informe o número da mãe");
    if (!photo) return setError("Coloque uma foto do bezerro");

    const fd = new FormData();
    fd.append("mother_tag", motherTag);
    fd.append("birth_date", today);
    fd.append("calf_sex", calfSex);
    fd.append("photo", photo);

    startTransition(async () => {
      const r = await requestCalfBirth(fd);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao enviar o nascimento");
        return;
      }
      setSubmittedToday((prev) => [
        {
          id: crypto.randomUUID(),
          sex: calfSex,
          motherTag: motherTag.toUpperCase(),
          at: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        },
        ...prev,
      ]);
      setSuccess(
        `Bezerro da mãe ${motherTag.toUpperCase()} enviado! O patrão dá o número e lança no rebanho.`
      );
      resetForm();
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
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Hoje, {formatDate(today)}
          </p>
        </div>
      </div>

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
                className="h-12 text-lg uppercase placeholder:normal-case placeholder:text-base placeholder:lowercase"
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
              {isPending ? "Enviando..." : "Enviar nascimento"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {submittedToday.length > 0 && (
        <div className="space-y-1.5">
          <Label>Enviados agora</Label>
          <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
            {submittedToday.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <Baby
                  className={cn(
                    "w-4 h-4 flex-shrink-0",
                    r.sex === "macho" ? "text-sky-500" : "text-rose-500"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    Bezerro {r.sex === "macho" ? "macho" : "fêmea"} · mãe {r.motherTag}
                  </p>
                  <p className="text-[11px] text-slate-400">Enviado {r.at}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
