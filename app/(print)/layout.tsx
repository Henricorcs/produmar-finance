// Layout mínimo para páginas de impressão — sem nav, sem shell
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
