/**
 * NF-e XML parser — runs in the browser via DOMParser.
 * Supports NF-e 4.0 (nfeProc wrapper or bare NFe element).
 * Strips namespaces before parsing so querySelector works reliably.
 */

export interface ParsedNFe {
  access_key: string | null;
  number: string | null;
  series: string | null;
  issue_date: string | null; // YYYY-MM-DD
  emitter_document: string | null;
  emitter_name: string | null;
  receiver_document: string | null;
  receiver_name: string | null;
  total_amount: number | null;
  direction: "entrada" | "saida";
}

export function parseNFeXml(xmlString: string): ParsedNFe {
  // Strip XML namespace declarations so querySelector works without prefixes
  const cleaned = xmlString
    .replace(/\sxmlns(?::[a-z0-9]+)?="[^"]*"/gi, "")
    .replace(/\sxmlns(?::[a-z0-9]+)?='[^']*'/gi, "");

  const parser = new DOMParser();
  const doc = parser.parseFromString(cleaned, "text/xml");

  if (doc.querySelector("parsererror")) {
    throw new Error(
      "XML inválido ou corrompido. Verifique se o arquivo é uma NF-e válida."
    );
  }

  /** Returns the trimmed textContent of the first matching element, or null */
  function get(selector: string): string | null {
    return doc.querySelector(selector)?.textContent?.trim() ?? null;
  }

  // ── Access key ────────────────────────────────────────────────────────────
  // Preferred source: infNFe Id attribute (e.g. "NFe12345…44digits")
  // Fallback: chNFe inside protNFe
  const infNFe = doc.querySelector("infNFe");
  const rawId = infNFe?.getAttribute("Id") ?? "";
  const access_key =
    rawId.replace(/^NFe/, "").trim() || get("chNFe")?.replace(/\s/g, "") || null;

  // ── Direction (tpNF: 0 = saída da empresa = receita; 1 = entrada = despesa) ─
  const tpNF = get("tpNF");
  const direction: "entrada" | "saida" = tpNF === "0" ? "entrada" : "saida";

  // ── Issue date ────────────────────────────────────────────────────────────
  // dhEmi (v4 datetime) or dEmi (v3 date-only)
  const rawDate = get("dhEmi") ?? get("dEmi");
  const issue_date = rawDate ? rawDate.split("T")[0] : null;

  // ── Emitter / receiver ────────────────────────────────────────────────────
  // querySelector "emit CNPJ" = <CNPJ> that is a descendant of <emit>
  const emitter_document =
    doc.querySelector("emit CNPJ")?.textContent?.trim() ??
    doc.querySelector("emit CPF")?.textContent?.trim() ??
    null;
  const emitter_name =
    doc.querySelector("emit xNome")?.textContent?.trim() ?? null;

  const receiver_document =
    doc.querySelector("dest CNPJ")?.textContent?.trim() ??
    doc.querySelector("dest CPF")?.textContent?.trim() ??
    null;
  const receiver_name =
    doc.querySelector("dest xNome")?.textContent?.trim() ?? null;

  // ── Total amount ──────────────────────────────────────────────────────────
  const vNFText = get("vNF");
  const total_amount = vNFText ? parseFloat(vNFText) : null;

  return {
    access_key,
    number: get("nNF"),
    series: get("serie"),
    issue_date,
    emitter_document,
    emitter_name,
    receiver_document,
    receiver_name,
    total_amount,
    direction,
  };
}

/** Format a raw CNPJ string (14 digits) as XX.XXX.XXX/XXXX-XX */
export function formatCNPJ(raw: string | null): string {
  if (!raw) return "—";
  const d = raw.replace(/\D/g, "");
  if (d.length !== 14) return raw;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
