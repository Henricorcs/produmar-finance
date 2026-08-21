/** @type {import('next').NextConfig} */
const nextConfig = {
  // Empacota só o que o site realmente usa para rodar. O container final deixa
  // de carregar o node_modules inteiro (incluindo as ferramentas de
  // desenvolvimento): imagem menor, menos memória e partida mais rápida.
  output: "standalone",

  // Menos JavaScript no celular: em vez de puxar o pacote inteiro, o Next
  // importa só o que cada tela realmente usa dessas bibliotecas.
  experimental: {
    optimizePackageImports: ["recharts", "date-fns", "lucide-react"],
    serverActions: {
      bodySizeLimit: '10mb'
    }
  }
};

module.exports = nextConfig;
