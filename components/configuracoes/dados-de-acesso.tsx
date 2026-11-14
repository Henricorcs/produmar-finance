"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, MessageCircle, X } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// OS DADOS DE ACESSO DO USUÁRIO NOVO
// ─────────────────────────────────────────────────────────────────────────────
// Criou o usuário, o dono precisa mandar para a pessoa onde entrar e com que
// senha. A senha já nasce gerada no formulário (fácil de digitar no celular:
// uma palavra inventada e quatro números), e depois de criar aparece o recado
// pronto — site, login e senha — para copiar ou mandar no WhatsApp.
//
// O endereço do site é o da própria tela (window.location.origin): é o mesmo
// que a pessoa vai abrir, e não depende de variável de ambiente (o
// NEXT_PUBLIC_ não chega no build do EasyPanel).
// ─────────────────────────────────────────────────────────────────────────────

const CONSOANTES = "bcdfgjklmnprstvz";
const VOGAIS = "aeiou";

function sorteio(max: number): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % max;
}

/** Senha fácil de ditar e digitar: "Bomila4821" — sem letra que confunde (l/I, 0/O). */
export function gerarSenha(): string {
  let palavra = "";
  for (let i = 0; i < 3; i++) {
    palavra += CONSOANTES[sorteio(CONSOANTES.length)] + VOGAIS[sorteio(VOGAIS.length)];
  }
  palavra = palavra.replace(/l/g, "r");
  const numeros = String(1000 + sorteio(9000)).replace(/0/g, String(2 + sorteio(8)));
  return palavra[0].toUpperCase() + palavra.slice(1) + numeros;
}

export type AcessoCriado = {
  nome: string;
  email: string;
  senha: string;
  perfil: string;
};

function recado(a: AcessoCriado, site: string): string {
  const primeiro = a.nome.trim().split(/\s+/)[0];
  return [
    `Olá${primeiro ? `, ${primeiro}` : ""}! Seu acesso ao sistema da PRODUMAR:`,
    "",
    `Site: ${site}`,
    `Login: ${a.email}`,
    `Senha: ${a.senha}`,
    "",
    "Abra o site, entre com o login e a senha acima. No celular, dá para colocar o site na tela de início para abrir como aplicativo.",
  ].join("\n");
}

export function DadosDeAcesso({ acesso, onFechar }: { acesso: AcessoCriado; onFechar: () => void }) {
  const [site, setSite] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    setSite(window.location.origin);
  }, []);

  const texto = recado(acesso, site);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Safari antigo: copia pelo jeito velho, com um campo escondido
      const t = document.createElement("textarea");
      t.value = texto;
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  const linha = (rotulo: string, valor: string) => (
    <div className="flex items-baseline gap-3 px-3 py-2">
      <span className="w-12 shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{rotulo}</span>
      <span className="min-w-0 flex-1 break-all text-sm font-semibold text-slate-800 dark:text-slate-100 select-all">
        {valor}
      </span>
    </div>
  );

  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            <KeyRound className="h-4 w-4" />
            Usuário criado — mande o acesso para {acesso.nome.trim() || acesso.email}
          </p>
          <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">Perfil: {acesso.perfil}</p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="rounded-md p-1 text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="divide-y divide-emerald-100 rounded-lg border border-emerald-100 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
        {linha("Site", site)}
        {linha("Login", acesso.email)}
        {linha("Senha", acesso.senha)}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={copiar}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-white text-sm font-medium text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300"
        >
          {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copiado ? "Copiado" : "Copiar recado"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <MessageCircle className="h-4 w-4" />
          WhatsApp
        </a>
      </div>
      <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
        A senha só aparece agora — copie ou mande antes de fechar este quadro.
      </p>
    </div>
  );
}
