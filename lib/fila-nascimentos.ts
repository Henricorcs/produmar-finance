/**
 * A FILA DO VAQUEIRO — o nascimento fica guardado no celular até ter rede.
 *
 * A vaca pare no mato, e no mato não tem sinal. Antes, o vaqueiro só conseguia
 * avisar o bezerro se o celular estivesse pegando naquele instante: sem barra,
 * o botão dava erro e o nascimento se perdia — ou virava papel no bolso para
 * lançar de noite, quando ninguém mais lembra o número da mãe.
 *
 * Agora o caminho é outro: o que ele preenche é GRAVADO NO PRÓPRIO CELULAR
 * antes de qualquer tentativa de envio, com foto e tudo. Ele fecha o app, o
 * celular desliga, ele passa o dia inteiro no pasto — quando o sinal voltar, o
 * que estava guardado sobe sozinho.
 *
 * O guardador é o IndexedDB, que é o único lugar do navegador que aguenta a
 * FOTO (localStorage só aceita texto). Fica no aparelho dele e ninguém mais vê.
 *
 * Regra de ouro deste arquivo: um registro só sai da fila quando o servidor
 * CONFIRMA que gravou. Errou, caiu a rede, fechou o app no meio — ele continua
 * aqui esperando a próxima chance.
 */

import type { AnimalSex, AnimalSpecies } from "@/lib/types";

/** Um nascimento esperando (ou já) subir. */
export interface NascimentoGuardado {
  /**
   * O número que o CELULAR deu a este nascimento. Vai junto no envio e é o que
   * impede o bezerro de entrar duas vezes quando o 4G cai depois de gravar e a
   * resposta se perde no caminho (migration 081).
   */
  id: string;
  mother_tag: string;
  calf_sex: AnimalSex;
  /**
   * Que bicho nasceu — bovino, equino, caprino, ovino ou suíno. Vem vazio no
   * que ficou guardado antes desta versão da tela: aquilo é tudo bovino, que é
   * o único bicho que a tela conhecia. Leia com `speciesOf`.
   */
  species?: AnimalSpecies;
  /** O dia em que o bezerro NASCEU — não o dia em que a rede voltou. */
  birth_date: string;
  /** A foto, já encolhida. Some depois que o envio confirma, para não entupir
   *  o celular guardando o que já está no servidor. */
  foto: Blob | null;
  foto_nome: string;
  criado_em: number;
  /** Preenchido quando o servidor confirmou. Antes disso, está esperando. */
  enviado_em: number | null;
  /** O último erro do servidor, para o vaqueiro ver o que houve. */
  erro: string | null;
  tentativas: number;
}

const BANCO = "produmar-vaqueiro";
const LOJA = "nascimentos";
const VERSAO_DO_BANCO = 1;

/** Quanto tempo o já-enviado continua aparecendo na tela ("mandei ou não?"). */
const DIAS_QUE_O_ENVIADO_FICA = 3;

/** Um número só deste nascimento. O `randomUUID` existe em tudo que é celular
 *  de hoje; o de baixo é só para não deixar a tela na mão se faltar. */
export function novoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const aleatorio = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  const h = aleatorio() + aleatorio() + aleatorio() + aleatorio();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((deuCerto, falhou) => {
    if (typeof indexedDB === "undefined") return falhou(new Error("sem IndexedDB"));

    const pedido = indexedDB.open(BANCO, VERSAO_DO_BANCO);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA, { keyPath: "id" });
    };
    pedido.onsuccess = () => deuCerto(pedido.result);
    pedido.onerror = () => falhou(pedido.error ?? new Error("não abriu a fila"));
    // Guia anônima do Safari e celular sem espaço caem aqui:
    pedido.onblocked = () => falhou(new Error("fila travada por outra aba"));
  });
}

/** Roda uma operação na loja e fecha o banco no fim, dando certo ou não. */
async function naLoja<T>(
  modo: IDBTransactionMode,
  operacao: (loja: IDBObjectStore) => IDBRequest
): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((deuCerto, falhou) => {
      const transacao = db.transaction(LOJA, modo);
      const pedido = operacao(transacao.objectStore(LOJA));
      pedido.onsuccess = () => deuCerto(pedido.result as T);
      pedido.onerror = () => falhou(pedido.error ?? new Error("erro na fila"));
      transacao.onabort = () => falhou(transacao.error ?? new Error("fila cancelada"));
    });
  } finally {
    // close() é educado: espera a gravação terminar antes de fechar de verdade.
    db.close();
  }
}

/**
 * Este celular sabe guardar? Se não souber, a tela volta ao envio direto de
 * antes — melhor sem fila do que sem enviar.
 */
export async function filaFunciona(): Promise<boolean> {
  try {
    const db = await abrir();
    db.close();
    return true;
  } catch {
    return false;
  }
}

/** Tudo que está no celular, do mais novo para o mais velho. */
export async function filaListar(): Promise<NascimentoGuardado[]> {
  const tudo = await naLoja<NascimentoGuardado[]>("readonly", (loja) => loja.getAll());
  return tudo.sort((a, b) => b.criado_em - a.criado_em);
}

/** Grava (ou regrava) um nascimento. */
export async function filaGuardar(registro: NascimentoGuardado): Promise<void> {
  await naLoja("readwrite", (loja) => loja.put(registro));
}

/** Tira da fila de vez — só para o que o vaqueiro mandou apagar. */
export async function filaApagar(id: string): Promise<void> {
  await naLoja("readwrite", (loja) => loja.delete(id));
}

/**
 * Faxina dos já enviados: depois de três dias eles já foram conferidos pelo
 * patrão e só estão ocupando espaço na tela e no celular.
 */
export async function filaLimparAntigos(): Promise<void> {
  const limite = Date.now() - DIAS_QUE_O_ENVIADO_FICA * 24 * 60 * 60 * 1000;
  const tudo = await filaListar();
  for (const r of tudo) {
    if (r.enviado_em && r.enviado_em < limite) await filaApagar(r.id);
  }
}
