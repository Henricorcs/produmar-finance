import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";

export default async function Home() {
  // Id vem do header que o middleware preencheu — sem ida e volta ao Supabase
  // só para decidir o destino do redirecionamento.
  const userId = await getCurrentUserId();
  redirect(userId ? "/inicio" : "/login");
}
