import type { LucideIcon } from "lucide-react";

type PlannedFeature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

interface ComingSoonModuleProps {
  title: string;
  badge: string;
  description: string;
  icon: LucideIcon;
  features: PlannedFeature[];
}

/** Tela padrão dos módulos das próximas fases — visual pronto, funções em breve. */
export function ComingSoonModule({
  title,
  badge,
  description,
  icon: Icon,
  features,
}: ComingSoonModuleProps) {
  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">
            {title}
          </h1>
          <span className="text-[10px] font-medium uppercase tracking-wide bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
            {badge}
          </span>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </div>

      <div className="rounded-2xl border-2 border-dashed border-produmar-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 px-5 py-10 text-center">
        <span className="mx-auto flex items-center justify-center w-14 h-14 rounded-2xl bg-produmar-50 dark:bg-produmar-900/50 text-produmar-600 dark:text-produmar-300">
          <Icon className="w-7 h-7" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-produmar-800 dark:text-slate-100">
          Módulo em construção
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
          O visual já está pronto — as funcionalidades abaixo chegam em breve.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
          O que vem por aí
        </h3>
        <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
          {features.map((feature) => {
            const FeatureIcon = feature.icon;
            return (
              <div
                key={feature.title}
                className="flex items-start gap-3 rounded-xl border border-produmar-100/60 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
              >
                <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                  <FeatureIcon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-produmar-800 dark:text-slate-100">
                    {feature.title}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
