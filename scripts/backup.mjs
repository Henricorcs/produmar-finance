/**
 * Backup diário da ILNET, rodando no PC do escritório.
 *
 * Guarda as DUAS coisas que a empresa não pode perder:
 *
 *   1. O BANCO (as OS, o financeiro, os empréstimos, os animais, os diaristas).
 *      Mora no Supabase e é o mais valioso — e o mais fácil de copiar: são uns
 *      36 MB. Sai uma cópia nova por dia, com data no nome.
 *
 *   2. AS FOTOS (comprovantes, patrimônio, animais). Moram no disco do
 *      servidor. A cópia é incremental: baixa só o que ainda não tem. A
 *      primeira demora, as seguintes levam segundos.
 *
 * Como usar:
 *
 *   node scripts/backup.mjs                    # roda o backup completo
 *   node scripts/backup.mjs --so-banco         # só o banco
 *   node scripts/backup.mjs --so-fotos         # só as fotos
 *   node scripts/backup.mjs --conferir         # não copia nada, só testa o acesso
 *
 * A configuração fica em `backup.config.json`, ao lado deste arquivo. Ele NÃO
 * entra no git (tem senha dentro). Rode `--conferir` que ele cria o modelo.
 *
 * As fotos formam um ESPELHO que nunca apaga nada: se alguém excluir uma foto
 * no sistema, a cópia aqui continua. É de propósito — backup que apaga junto
 * com o original não protege de exclusão por engano.
 */

import { mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_PROJETO = path.dirname(AQUI);
const ARQUIVO_CONFIG = path.join(RAIZ_PROJETO, "backup.config.json");

const args = process.argv.slice(2);
const tem = (f) => args.includes(f);
const SO_BANCO = tem("--so-banco");
const SO_FOTOS = tem("--so-fotos");
const CONFERIR = tem("--conferir");

const MODELO = {
  _leia_me:
    "Senhas aqui dentro. Este arquivo não entra no git. Guarde o destino num HD externo ou pasta sincronizada.",
  destino: "C:/Backup-ILNET",
  supabase_url: "https://SEU-PROJETO.supabase.co",
  supabase_service_role_key: "cole aqui a service_role key (painel do Supabase → Settings → API)",
  site_url: "http://170.0.124.7:3000",
  backup_token: "cole aqui o mesmo valor que você pôs em BACKUP_TOKEN no EasyPanel",
  dias_de_historico_do_banco: 30,
};

const mb = (b) => (b / 1024 / 1024).toFixed(1) + " MB";
const hoje = () => new Date().toISOString().slice(0, 10);
const agora = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(`[${agora()}]`, ...a);

async function carregarConfig() {
  try {
    return JSON.parse(await readFile(ARQUIVO_CONFIG, "utf8"));
  } catch {
    await writeFile(ARQUIVO_CONFIG, JSON.stringify(MODELO, null, 2), "utf8");
    console.log(`\nCriei o modelo de configuração em:\n  ${ARQUIVO_CONFIG}\n`);
    console.log("Preencha os campos e rode de novo.");
    process.exit(1);
  }
}

// ── 1. BANCO ────────────────────────────────────────────────────────────────

/**
 * Descobre as tabelas sozinho, perguntando ao próprio Supabase.
 *
 * Assim, tabela nova criada por uma migration futura entra no backup sem
 * ninguém precisar lembrar de mexer aqui — que é exatamente o tipo de coisa
 * que ninguém lembra.
 */
async function descobrirTabelas(cfg) {
  const r = await fetch(`${cfg.supabase_url}/rest/v1/`, {
    headers: { apikey: cfg.supabase_service_role_key, Authorization: `Bearer ${cfg.supabase_service_role_key}` },
  });
  if (!r.ok) throw new Error(`não consegui listar as tabelas: ${r.status}`);

  const spec = await r.json();
  const nomes = Object.keys(spec.definitions ?? spec.components?.schemas ?? {});

  // As "v_" são visões: contas montadas na hora a partir das tabelas. Copiar
  // não adianta nada — voltam sozinhas quando as tabelas voltarem.
  return nomes.filter((n) => !n.startsWith("v_")).sort();
}

/** Puxa a tabela inteira, de mil em mil (o limite que o Supabase devolve por vez). */
async function baixarTabela(cfg, tabela) {
  const PAGINA = 1000;
  const linhas = [];

  for (let inicio = 0; ; inicio += PAGINA) {
    const r = await fetch(`${cfg.supabase_url}/rest/v1/${tabela}?select=*`, {
      headers: {
        apikey: cfg.supabase_service_role_key,
        Authorization: `Bearer ${cfg.supabase_service_role_key}`,
        Range: `${inicio}-${inicio + PAGINA - 1}`,
        Prefer: "count=exact",
      },
    });

    if (!r.ok) throw new Error(`${tabela}: ${r.status} ${await r.text()}`);

    const parte = await r.json();
    linhas.push(...parte);
    if (parte.length < PAGINA) break;
  }

  return linhas;
}

/** Usuários do login. Sem as senhas — o Supabase não entrega, e nem deveria. */
async function baixarUsuarios(cfg) {
  const r = await fetch(`${cfg.supabase_url}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: cfg.supabase_service_role_key, Authorization: `Bearer ${cfg.supabase_service_role_key}` },
  });
  if (!r.ok) throw new Error(`usuários: ${r.status}`);

  const j = await r.json();
  return (j.users ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    criado_em: u.created_at,
    ultimo_acesso: u.last_sign_in_at,
    metadata: u.user_metadata,
  }));
}

async function backupDoBanco(cfg) {
  log("BANCO — começando");

  const tabelas = await descobrirTabelas(cfg);
  log(`${tabelas.length} tabelas a copiar`);

  const dados = {};
  let totalLinhas = 0;

  for (const tabela of tabelas) {
    const linhas = await baixarTabela(cfg, tabela);
    dados[tabela] = linhas;
    totalLinhas += linhas.length;
    if (linhas.length) log(`  ${tabela}: ${linhas.length} linhas`);
  }

  const usuarios = await baixarUsuarios(cfg);
  log(`  usuários do login: ${usuarios.length}`);

  const pasta = path.join(cfg.destino, "banco");
  await mkdir(pasta, { recursive: true });

  const conteudo = JSON.stringify(
    {
      gerado_em: new Date().toISOString(),
      aviso:
        "Os dados estão aqui; a ESTRUTURA das tabelas está em supabase/migrations/ no repositório. Para restaurar: rode as migrations numa base limpa e depois carregue estes dados. As senhas dos usuários não vêm aqui (o Supabase não as entrega) — na restauração cada um define a sua de novo.",
      totais: { tabelas: tabelas.length, linhas: totalLinhas, usuarios: usuarios.length },
      usuarios,
      tabelas: dados,
    },
    null,
    2
  );

  const destinoArquivo = path.join(pasta, `banco-${hoje()}.json`);
  await writeFile(destinoArquivo, conteudo, "utf8");
  log(`BANCO — pronto: ${totalLinhas} linhas, ${mb(Buffer.byteLength(conteudo))}`);

  await limparHistoricoAntigo(pasta, cfg.dias_de_historico_do_banco ?? 30);
}

/** Mantém só os últimos N dias de cópias do banco. */
async function limparHistoricoAntigo(pasta, dias) {
  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  const itens = await readdir(pasta).catch(() => []);
  const { rm } = await import("fs/promises");

  let apagados = 0;
  for (const nome of itens) {
    if (!/^banco-\d{4}-\d{2}-\d{2}\.json$/.test(nome)) continue;
    const completo = path.join(pasta, nome);
    const info = await stat(completo).catch(() => null);
    if (info && info.mtimeMs < limite) {
      await rm(completo, { force: true });
      apagados++;
    }
  }
  if (apagados) log(`  (${apagados} cópias antigas removidas, guardando ${dias} dias)`);
}

// ── 2. FOTOS ────────────────────────────────────────────────────────────────

async function backupDasFotos(cfg) {
  log("FOTOS — começando");

  const cabecalhos = { Authorization: `Bearer ${cfg.backup_token}` };

  const r = await fetch(`${cfg.site_url}/api/backup`, { headers: cabecalhos });
  if (r.status === 404) {
    throw new Error(
      "o servidor respondeu 404. Confira se BACKUP_TOKEN está definido no EasyPanel " +
        "(com 32 caracteres ou mais) e se o site já foi publicado depois disso."
    );
  }
  if (r.status === 401) throw new Error("senha recusada: o backup_token daqui não bate com o do servidor.");
  if (!r.ok) throw new Error(`servidor respondeu ${r.status}`);

  const { arquivos, total } = await r.json();
  log(`${arquivos.length} arquivos no servidor · ${mb(total)}`);

  const pasta = path.join(cfg.destino, "fotos");
  let baixados = 0;
  let pulados = 0;
  let falhas = 0;
  let bytes = 0;

  for (const arquivo of arquivos) {
    const destinoArquivo = path.join(pasta, arquivo.caminho);

    // Já tenho, e do mesmo tamanho: pula.
    const info = await stat(destinoArquivo).catch(() => null);
    if (info && info.size === arquivo.tamanho) {
      pulados++;
      continue;
    }

    const resposta = await fetch(
      `${cfg.site_url}/api/backup?arquivo=${encodeURIComponent(arquivo.caminho)}`,
      { headers: cabecalhos }
    );

    if (!resposta.ok) {
      console.error(`  FALHOU ${arquivo.caminho} — ${resposta.status}`);
      falhas++;
      continue;
    }

    const conteudo = Buffer.from(await resposta.arrayBuffer());
    await mkdir(path.dirname(destinoArquivo), { recursive: true });
    await writeFile(destinoArquivo, conteudo);

    bytes += conteudo.length;
    baixados++;
    if (baixados % 25 === 0) log(`  ${baixados} novos... (${mb(bytes)})`);
  }

  log(`FOTOS — pronto: ${baixados} novos (${mb(bytes)}), ${pulados} já tinha, ${falhas} falhas`);
  if (falhas > 0) process.exitCode = 1;
}

// ── Conferência ─────────────────────────────────────────────────────────────

async function conferir(cfg) {
  let tudoOk = true;

  // Supabase
  try {
    const r = await fetch(`${cfg.supabase_url}/rest/v1/`, {
      headers: { apikey: cfg.supabase_service_role_key, Authorization: `Bearer ${cfg.supabase_service_role_key}` },
    });
    console.log(r.ok ? "  ok    Supabase responde" : `  FALHA Supabase: ${r.status}`);
    if (!r.ok) tudoOk = false;
  } catch (e) {
    console.log(`  FALHA Supabase: ${e.message}`);
    tudoOk = false;
  }

  // Site
  try {
    const r = await fetch(`${cfg.site_url}/api/backup`, {
      headers: { Authorization: `Bearer ${cfg.backup_token}` },
    });
    if (r.ok) {
      const { arquivos, total } = await r.json();
      console.log(`  ok    Site responde: ${arquivos.length} arquivos, ${mb(total)}`);
    } else if (r.status === 404) {
      console.log("  FALHA Site: rota de backup desligada (falta BACKUP_TOKEN no EasyPanel)");
      tudoOk = false;
    } else if (r.status === 401) {
      console.log("  FALHA Site: senha recusada (backup_token diferente do servidor)");
      tudoOk = false;
    } else {
      console.log(`  FALHA Site: ${r.status}`);
      tudoOk = false;
    }
  } catch (e) {
    console.log(`  FALHA Site: ${e.message}`);
    tudoOk = false;
  }

  // Destino
  try {
    await mkdir(cfg.destino, { recursive: true });
    const teste = path.join(cfg.destino, ".teste");
    await writeFile(teste, "ok");
    await (await import("fs/promises")).rm(teste, { force: true });
    console.log(`  ok    Consigo gravar em ${cfg.destino}`);
  } catch (e) {
    console.log(`  FALHA Não consigo gravar em ${cfg.destino}: ${e.message}`);
    tudoOk = false;
  }

  console.log(tudoOk ? "\nTudo certo. Pode agendar." : "\nCorrija os itens acima antes de agendar.");
  process.exit(tudoOk ? 0 : 1);
}

// ── Programa ────────────────────────────────────────────────────────────────

async function main() {
  const cfg = await carregarConfig();

  if (CONFERIR) {
    console.log("Conferindo o acesso...\n");
    return conferir(cfg);
  }

  const inicio = Date.now();
  log(`Backup começando — destino: ${cfg.destino}`);

  if (!SO_FOTOS) await backupDoBanco(cfg);
  if (!SO_BANCO) await backupDasFotos(cfg);

  const minutos = ((Date.now() - inicio) / 60000).toFixed(1);
  log(`Backup terminado em ${minutos} min`);
}

main().catch((e) => {
  console.error(`\n[${agora()}] ERRO: ${e.message}`);
  process.exit(1);
});
