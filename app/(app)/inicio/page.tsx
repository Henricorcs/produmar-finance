import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { modulesForProfile } from "@/lib/modules";
import { recebeOs } from "@/lib/module-access";
import { BotaoAtualizar } from "@/components/layout/botao-atualizar";
import { BotaoFecharSistema } from "@/components/layout/botao-fechar-sistema";

export const dynamic = "force-dynamic";

// O hub é a primeira tela do app: tem que caber na tela do celular sem rolar.
// Por isso o quadro é pequeno — ícone e nome, sem a linha de explicação que
// fazia cada card ocupar meia tela. O que abre o módulo é o quadro inteiro,
// então o alvo do dedo continua grande.
const QUADRO =
  "group relative flex flex-col items-center justify-start text-center gap-2 rounded-2xl border border-produmar-100/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm px-2 py-3 min-h-[104px] transition-all active:scale-[0.97] hover:shadow-md hover:border-produmar-200 dark:hover:border-slate-700";

const NOME =
  "text-[12px] sm:text-[13px] font-semibold leading-tight text-produmar-800 dark:text-slate-100";

export default async function InicioPage() {
  // O layout já buscou o perfil nesta mesma requisição; aqui vem do cache,
  // sem nova consulta.
  const profile = await getProfile();

  const modules = modulesForProfile(profile?.allowed_modules, profile?.role);
  // Quem recebe OS tem o painel: operador, encarregado — e o admin, agora que
  // dá para mandar uma OS de um admin para outro. Sem este card, a OS enviada
  // ao chefe cairia numa tela que ele nunca abre.
  const temPainelDeOs = recebeOs(profile?.role);

  return (
    <div className="animate-fade-in max-w-3xl mx-auto">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">
          Módulos
        </h1>
        {/* Depois de uma implantação, troca a versão sem fechar e abrir o app */}
        <BotaoAtualizar />
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3">
        {/* Painel da OS que mandaram PARA ESTA PESSOA — no admin ele fica ao
            lado dos módulos, porque ele também pode ser o destinatário. */}
        {temPainelDeOs && (
          <Link href="/operador" className={QUADRO}>
            <span className="flex items-center justify-center w-11 h-11 rounded-xl shrink-0 bg-amber-50 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
              <ClipboardList className="w-6 h-6" />
            </span>
            <span className={NOME}>Painel de OS</span>
          </Link>
        )}

        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link key={mod.slug} href={mod.href} className={QUADRO}>
              {mod.comingSoon && (
                <span className="absolute top-1 right-1 text-[9px] font-medium uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full">
                  Em breve
                </span>
              )}

              <span
                className={`flex items-center justify-center w-11 h-11 rounded-xl shrink-0 ${mod.accentIcon}`}
              >
                <Icon className="w-6 h-6" />
              </span>

              <span className={NOME}>{mod.name}</span>
            </Link>
          );
        })}
      </div>

      {/* A saída fica no pé da tela inicial, longe do dedo que abre módulo:
          dentro do módulo a barra fecha o módulo; aqui se fecha o sistema. */}
      <div className="mt-8 flex justify-center">
        <BotaoFecharSistema />
      </div>
    </div>
  );
}
