import { HardHat, FolderKanban, Banknote, ListChecks, BarChart3 } from "lucide-react";
import { ComingSoonModule } from "@/components/modules/coming-soon-module";

export default function ObrasPage() {
  return (
    <ComingSoonModule
      title="Obras"
      badge="Fase 3 · Em breve"
      description="Gestão e acompanhamento de obras"
      icon={HardHat}
      features={[
        {
          icon: FolderKanban,
          title: "Cadastro de obras",
          description: "Organize cada obra com cliente, local e prazo",
        },
        {
          icon: Banknote,
          title: "Custos por obra",
          description: "Acompanhe gastos de material e mão de obra",
        },
        {
          icon: ListChecks,
          title: "Etapas e medições",
          description: "Registre o avanço de cada etapa da obra",
        },
        {
          icon: BarChart3,
          title: "Relatórios",
          description: "Resultado e rentabilidade por obra",
        },
      ]}
    />
  );
}
