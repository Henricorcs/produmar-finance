import { BarChart3, Sparkles } from "lucide-react";

export default function RelatoriosPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto bg-produmar-100 text-produmar-600 rounded-2xl flex items-center justify-center mb-4">
          <BarChart3 className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-medium text-produmar-800 mb-2">Relatórios</h2>
        <p className="text-sm text-slate-500 mb-4">
          DRE, fluxo de caixa detalhado e exportação para Excel/PDF chegam na Fase 4.
        </p>
        <div className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-produmar-50 text-produmar-700 rounded-full">
          <Sparkles className="w-3 h-3" />
          Em desenvolvimento
        </div>
      </div>
    </div>
  );
}
