"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * BUSCA O CADASTRO DE NOVO QUANDO O TÉCNICO VOLTA PARA A TELA.
 *
 * O técnico deixa o app aberto o dia inteiro no celular: abre de manhã, guarda
 * no bolso, volta à tarde. A tela que ele vê é a do momento em que abriu — se o
 * escritório cadastrar um setor, uma obra ou um material no meio do dia, ele não
 * enxerga, e do lado de cá parece que "não está aparecendo".
 *
 * Então, toda vez que o app volta a ficar visível (ou a janela recebe o foco),
 * a tela busca o cadastro de novo. É uma consulta leve e só acontece quando ele
 * volta — não fica batendo no servidor sozinha.
 */
export function useAtualizarAoVoltar() {
  const router = useRouter();

  useEffect(() => {
    function atualizar() {
      if (document.visibilityState === "visible") router.refresh();
    }

    window.addEventListener("focus", atualizar);
    document.addEventListener("visibilitychange", atualizar);
    return () => {
      window.removeEventListener("focus", atualizar);
      document.removeEventListener("visibilitychange", atualizar);
    };
  }, [router]);
}
