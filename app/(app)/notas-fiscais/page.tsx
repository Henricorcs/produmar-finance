import { FileText, Sparkles } from "lucide-react";

export default function NotasFiscaisPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto bg-produmar-100 text-produmar-600 rounded-2xl flex items-center justify-center mb-4">
          <FileText className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-medium text-produmar-800 mb-2">Notas fiscais</h2>
        <p className="text-sm text-slate-500 mb-4">
          Upload de NF (XML + PDF com OCR via Claude) será construído na Fase 3.
        </p>
        <div className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-produmar-50 text-produmar-700 rounded-full">
          <Sparkles className="w-3 h-3" />
          Em desenvolvimento
        </div>
      </div>
    </div>
  );
}
