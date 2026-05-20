import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://jcppqdpqpybfbzhwhpsj.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcHBxZHBxcHliZmJ6aHdocHNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTE1NTI2NSwiZXhwIjoyMDk0NzMxMjY1fQ.T7O9mqw53zkYLjeAOlUeVj0-a7FyuIAEpojCq5chi3k"
);

// ─── helpers ────────────────────────────────────────────────────────────────
function date(daysFromToday) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().split("T")[0];
}

function randomBetween(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

// ─── busca categorias e centros de custo ────────────────────────────────────
const { data: cats } = await supabase.from("categories").select("id, name, type");
const { data: ccs } = await supabase.from("cost_centers").select("id, name");

function catId(name) {
  return cats.find((c) => c.name === name)?.id ?? cats[0].id;
}
function ccId(name) {
  return ccs.find((c) => c.name === name)?.id ?? ccs[0].id;
}

// ─── contatos ───────────────────────────────────────────────────────────────
const contacts = [
  { name: "CEMAR / Equatorial", document: "06272793000184", is_supplier: true, is_customer: false },
  { name: "Vivo Empresas", document: "02449992000154", is_supplier: true, is_customer: false },
  { name: "Condomínio Sede ILNET", document: null, is_supplier: true, is_customer: false },
  { name: "Prefeitura São Mateus MA", document: "06114993000113", is_supplier: true, is_customer: false },
  { name: "Claro NET", document: "40432544000147", is_supplier: true, is_customer: false },
  { name: "Empresa Cliente A", document: "12345678000190", is_supplier: false, is_customer: true },
  { name: "Empresa Cliente B", document: "98765432000110", is_supplier: false, is_customer: true },
];

await supabase.from("contacts").upsert(contacts, { onConflict: "document", ignoreDuplicates: true });
const { data: savedContacts } = await supabase.from("contacts").select("id, name");

function contactId(name) {
  return savedContacts.find((c) => c.name === name)?.id ?? null;
}

// ─── transações ─────────────────────────────────────────────────────────────
// Mês passado = -30 a -60 dias | Mês atual = -28 a hoje | Próximos = +1 a +20

const transactions = [
  // ── MESES ANTERIORES (já pagos/recebidos) ──────────────────────────────
  // Receitas mês -2
  {
    type: "entrada", description: "Mensalidades clientes - Lote Mar/25",
    amount: 42800.00, due_date: date(-58), paid_date: date(-56),
    status: "recebido", category_id: catId("Mensalidades clientes"),
    cost_center_id: ccId("Comercial"), notes: "342 clientes ativos"
  },
  {
    type: "entrada", description: "Instalações realizadas - Mar/25",
    amount: 3750.00, due_date: date(-52), paid_date: date(-50),
    status: "recebido", category_id: catId("Instalações"),
    cost_center_id: ccId("Técnico"), notes: "15 instalações no mês"
  },
  // Despesas mês -2
  {
    type: "saida", description: "Energia elétrica - CEMAR Mar/25",
    amount: 2340.00, due_date: date(-55), paid_date: date(-55),
    status: "pago", category_id: catId("Aluguel e energia"),
    cost_center_id: ccId("Operacional"), contact_id: contactId("CEMAR / Equatorial")
  },
  {
    type: "saida", description: "Folha de pagamento - Mar/25",
    amount: 18500.00, due_date: date(-60), paid_date: date(-59),
    status: "pago", category_id: catId("Folha de pagamento"),
    cost_center_id: ccId("Administrativo"), notes: "12 funcionários"
  },
  {
    type: "saida", description: "Link dedicado Vivo - Mar/25",
    amount: 4200.00, due_date: date(-53), paid_date: date(-52),
    status: "pago", category_id: catId("Infraestrutura de rede"),
    cost_center_id: ccId("Técnico"), contact_id: contactId("Vivo Empresas")
  },
  {
    type: "saida", description: "Aluguel sede - Mar/25",
    amount: 2800.00, due_date: date(-57), paid_date: date(-57),
    status: "pago", category_id: catId("Aluguel e energia"),
    cost_center_id: ccId("Administrativo"), contact_id: contactId("Condomínio Sede ILNET")
  },
  {
    type: "saida", description: "Combustível frota - Mar/25",
    amount: 1850.00, due_date: date(-51), paid_date: date(-50),
    status: "pago", category_id: catId("Frota e combustível"),
    cost_center_id: ccId("Técnico")
  },

  // ── MÊS PASSADO (já pagos/recebidos) ──────────────────────────────────
  // Receitas mês -1
  {
    type: "entrada", description: "Mensalidades clientes - Lote Abr/25",
    amount: 45200.00, due_date: date(-28), paid_date: date(-26),
    status: "recebido", category_id: catId("Mensalidades clientes"),
    cost_center_id: ccId("Comercial"), notes: "361 clientes ativos"
  },
  {
    type: "entrada", description: "Instalações realizadas - Abr/25",
    amount: 4875.00, due_date: date(-22), paid_date: date(-21),
    status: "recebido", category_id: catId("Instalações"),
    cost_center_id: ccId("Técnico"), notes: "19 instalações"
  },
  {
    type: "entrada", description: "Venda de roteadores - Abr/25",
    amount: 1620.00, due_date: date(-20), paid_date: date(-20),
    status: "recebido", category_id: catId("Venda de equipamentos"),
    cost_center_id: ccId("Comercial")
  },
  // Despesas mês -1
  {
    type: "saida", description: "Energia elétrica - CEMAR Abr/25",
    amount: 2510.00, due_date: date(-25), paid_date: date(-25),
    status: "pago", category_id: catId("Aluguel e energia"),
    cost_center_id: ccId("Operacional"), contact_id: contactId("CEMAR / Equatorial")
  },
  {
    type: "saida", description: "Folha de pagamento - Abr/25",
    amount: 18500.00, due_date: date(-30), paid_date: date(-29),
    status: "pago", category_id: catId("Folha de pagamento"),
    cost_center_id: ccId("Administrativo")
  },
  {
    type: "saida", description: "Link dedicado Vivo - Abr/25",
    amount: 4200.00, due_date: date(-23), paid_date: date(-23),
    status: "pago", category_id: catId("Infraestrutura de rede"),
    cost_center_id: ccId("Técnico"), contact_id: contactId("Vivo Empresas")
  },
  {
    type: "saida", description: "Aluguel sede - Abr/25",
    amount: 2800.00, due_date: date(-27), paid_date: date(-27),
    status: "pago", category_id: catId("Aluguel e energia"),
    cost_center_id: ccId("Administrativo"), contact_id: contactId("Condomínio Sede ILNET")
  },
  {
    type: "saida", description: "Manutenção torres e antenas",
    amount: 3200.00, due_date: date(-24), paid_date: date(-23),
    status: "pago", category_id: catId("Infraestrutura de rede"),
    cost_center_id: ccId("Técnico"), notes: "Torre km 12 e km 28"
  },
  {
    type: "saida", description: "Combustível frota - Abr/25",
    amount: 2100.00, due_date: date(-21), paid_date: date(-20),
    status: "pago", category_id: catId("Frota e combustível"),
    cost_center_id: ccId("Técnico")
  },
  {
    type: "saida", description: "ISS - Abril/25",
    amount: 920.00, due_date: date(-20), paid_date: date(-19),
    status: "pago", category_id: catId("Impostos"),
    cost_center_id: ccId("Administrativo"), contact_id: contactId("Prefeitura São Mateus MA")
  },

  // ── MÊS ATUAL (mistura de pagos e pendentes) ──────────────────────────
  // Receitas já recebidas
  {
    type: "entrada", description: "Mensalidades clientes - Lote 1 Mai/25",
    amount: 23400.00, due_date: date(-10), paid_date: date(-8),
    status: "recebido", category_id: catId("Mensalidades clientes"),
    cost_center_id: ccId("Comercial"), notes: "Lote 1 de 2 - 187 clientes"
  },
  {
    type: "entrada", description: "Instalações - 1ª quinzena Mai/25",
    amount: 2500.00, due_date: date(-5), paid_date: date(-4),
    status: "recebido", category_id: catId("Instalações"),
    cost_center_id: ccId("Técnico"), notes: "10 instalações"
  },
  // Receitas pendentes
  {
    type: "entrada", description: "Mensalidades clientes - Lote 2 Mai/25",
    amount: 22800.00, due_date: date(5),
    status: "pendente", category_id: catId("Mensalidades clientes"),
    cost_center_id: ccId("Comercial"), notes: "Lote 2 de 2 - 182 clientes"
  },
  {
    type: "entrada", description: "Contrato empresa - Empresa Cliente A",
    amount: 890.00, due_date: date(8),
    status: "pendente", category_id: catId("Outras receitas"),
    cost_center_id: ccId("Comercial"), contact_id: contactId("Empresa Cliente A")
  },
  // Despesas pagas no mês atual
  {
    type: "saida", description: "Folha de pagamento - Mai/25",
    amount: 18500.00, due_date: date(-2), paid_date: date(-1),
    status: "pago", category_id: catId("Folha de pagamento"),
    cost_center_id: ccId("Administrativo")
  },
  {
    type: "saida", description: "Link dedicado Vivo - Mai/25",
    amount: 4200.00, due_date: date(-7), paid_date: date(-7),
    status: "pago", category_id: catId("Infraestrutura de rede"),
    cost_center_id: ccId("Técnico"), contact_id: contactId("Vivo Empresas")
  },
  {
    type: "saida", description: "Link Claro Backup - Mai/25",
    amount: 1800.00, due_date: date(-6), paid_date: date(-6),
    status: "pago", category_id: catId("Infraestrutura de rede"),
    cost_center_id: ccId("Técnico"), contact_id: contactId("Claro NET")
  },
  // Despesas pendentes (próximas)
  {
    type: "saida", description: "Energia elétrica - CEMAR Mai/25",
    amount: 2640.00, due_date: date(3),
    status: "pendente", category_id: catId("Aluguel e energia"),
    cost_center_id: ccId("Operacional"), contact_id: contactId("CEMAR / Equatorial")
  },
  {
    type: "saida", description: "Aluguel sede - Mai/25",
    amount: 2800.00, due_date: date(2),
    status: "pendente", category_id: catId("Aluguel e energia"),
    cost_center_id: ccId("Administrativo"), contact_id: contactId("Condomínio Sede ILNET")
  },
  {
    type: "saida", description: "Combustível frota - Mai/25",
    amount: 1950.00, due_date: date(6),
    status: "pendente", category_id: catId("Frota e combustível"),
    cost_center_id: ccId("Técnico")
  },
  {
    type: "saida", description: "ISS - Maio/25",
    amount: 980.00, due_date: date(10),
    status: "pendente", category_id: catId("Impostos"),
    cost_center_id: ccId("Administrativo"), contact_id: contactId("Prefeitura São Mateus MA")
  },
  // Vencidas (atrasadas)
  {
    type: "saida", description: "Seguro veículo - frota",
    amount: 1240.00, due_date: date(-9),
    status: "vencido", category_id: catId("Frota e combustível"),
    cost_center_id: ccId("Técnico"), notes: "Renovação anual - URGENTE"
  },
  {
    type: "saida", description: "Manutenção preventiva geradores",
    amount: 3800.00, due_date: date(-12),
    status: "vencido", category_id: catId("Infraestrutura de rede"),
    cost_center_id: ccId("Técnico"), notes: "Gerador da torre central"
  },
  // Futuros
  {
    type: "saida", description: "Renovação domínio ilnet.com.br",
    amount: 180.00, due_date: date(15),
    status: "pendente", category_id: catId("Outras despesas"),
    cost_center_id: ccId("Administrativo")
  },
  {
    type: "saida", description: "Material de escritório",
    amount: 450.00, due_date: date(12),
    status: "pendente", category_id: catId("Outras despesas"),
    cost_center_id: ccId("Administrativo")
  },
];

// ─── insere transações ───────────────────────────────────────────────────────
console.log(`\nInserindo ${transactions.length} transações...`);
const { data: inserted, error } = await supabase.from("transactions").insert(transactions).select("id");

if (error) {
  console.error("❌ Erro:", error.message);
  process.exit(1);
}

console.log(`✅ ${inserted.length} transações inseridas com sucesso!`);
console.log("\n📊 Resumo:");
console.log(`  Receitas: ${transactions.filter(t => t.type === "entrada").length}`);
console.log(`  Despesas: ${transactions.filter(t => t.type === "saida").length}`);
console.log(`  Vencidas: ${transactions.filter(t => t.status === "vencido").length}`);
console.log(`  Pendentes: ${transactions.filter(t => t.status === "pendente").length}`);
console.log("\n🚀 Acesse http://localhost:3000 para ver os dados!\n");
