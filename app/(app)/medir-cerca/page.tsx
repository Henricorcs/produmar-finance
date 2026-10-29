import { MedidorDeCerca } from "@/components/obras/medidor-de-cerca";

/**
 * MEDIR CERCA — na aba de Obras: marca o 1º ponto pelo GPS, anda até o 2º e
 * marca de novo; a tela dá a metragem. A conta é toda no celular, nada é salvo
 * no banco (os pontos ficam só no aparelho, até começar uma medida nova).
 */
export default function MedirCercaPage() {
  return (
    <div className="space-y-5 animate-fade-in max-w-md">
      <div>
        <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Medir cerca</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Marque o começo e o fim da cerca pelo GPS — o sistema dá a metragem
        </p>
      </div>
      <MedidorDeCerca />
    </div>
  );
}
