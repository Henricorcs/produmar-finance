import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { modulesForProfile } from "@/lib/modules";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InicioPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, allowed_modules")
    .eq("id", user!.id)
    .single<Pick<Profile, "role" | "allowed_modules">>();

  const modules = modulesForProfile(profile?.allowed_modules, profile?.role);

  return (
    <div className="animate-fade-in max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">
          Módulos
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Escolha a área que deseja acessar
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {modules.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link
              key={mod.slug}
              href={mod.href}
              className="group relative flex flex-col rounded-2xl border border-produmar-100/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 sm:p-5 min-h-[9.5rem] transition-all active:scale-[0.97] hover:shadow-md hover:border-produmar-200 dark:hover:border-slate-700"
            >
              {mod.comingSoon && (
                <span className="absolute top-3 right-3 text-[10px] font-medium uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">
                  Em breve
                </span>
              )}

              <span
                className={`flex items-center justify-center w-11 h-11 rounded-xl shrink-0 ${mod.accentIcon}`}
              >
                <Icon className="w-6 h-6" />
              </span>

              <div className="mt-auto pt-4">
                <div className="text-[15px] font-semibold text-produmar-800 dark:text-slate-100 leading-snug">
                  {mod.name}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {mod.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
