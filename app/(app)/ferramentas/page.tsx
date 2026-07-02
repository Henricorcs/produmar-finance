import { Wrench, Hammer, ArrowRightLeft, UserCheck, History } from "lucide-react";
import { ComingSoonModule } from "@/components/modules/coming-soon-module";

export default function FerramentasPage() {
  return (
    <ComingSoonModule
      title="Ferramentas"
      badge="Fase 2 · Em breve"
      description="Controle de ferramentas e equipamentos"
      icon={Wrench}
      features={[
        {
          icon: Hammer,
          title: "Cadastro de ferramentas",
          description: "Registre cada ferramenta com código, foto e estado",
        },
        {
          icon: ArrowRightLeft,
          title: "Retirada e devolução",
          description: "Controle quem pegou, quando e quando devolveu",
        },
        {
          icon: UserCheck,
          title: "Quem está com o quê",
          description: "Veja em tempo real onde cada ferramenta está",
        },
        {
          icon: History,
          title: "Manutenção",
          description: "Histórico de conserto e conservação",
        },
      ]}
    />
  );
}
