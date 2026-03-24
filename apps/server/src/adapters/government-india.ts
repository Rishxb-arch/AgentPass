/**
 * GovernmentIndiaAdapter — targets documented public APIs, not scraped HTML.
 *
 * MCA21 (Ministry of Corporate Affairs):
 *   Company search: https://efiling.mca.gov.in/api/masterData/companyInfo
 *   Master data:    https://www.mca.gov.in/content/mca/global/en/mca/master-data/MDS.html
 *
 * GSTN (GST Network):
 *   Taxpayer search: https://api.gst.gov.in/commonapi/v1.1/search
 *   Returns public taxpayer info (name, address, registration status) without API key
 *   for sandbox. Production requires GSTN sandbox credentials.
 *
 * Requires env vars for production:
 *   GSTN_CLIENT_ID, GSTN_CLIENT_SECRET, MCA_API_KEY
 */
import { PlaywrightAdapter, AgentPassContext, AdapterResult } from "./base.js";

// --- MCA types ---
export interface MCACompany {
  cin: string;
  companyName: string;
  registrationDate: string | null;
  category: string;
  subCategory: string;
  classOfCompany: string;
  authorizedCapital: number | null;
  paidUpCapital: number | null;
  numberOfMembers: number | null;
  registeredAddress: string;
  registrarOfCompanies: string;
  status: string;
}

// --- GSTN types ---
export interface GSTNTaxpayer {
  gstin: string;
  legalName: string;
  tradeName: string | null;
  registrationDate: string | null;
  lastUpdateDate: string | null;
  constitutionOfBusiness: string;
  taxpayerType: string;
  gstinStatus: string;
  principalPlaceAddress: string | null;
  stateJurisdiction: string | null;
  centralJurisdiction: string | null;
}

// --- Validation ---
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const CIN_RE = /^[UL][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;

export function validateGSTIN(gstin: string): boolean {
  return GSTIN_RE.test(gstin.toUpperCase());
}

export function validateCIN(cin: string): boolean {
  return CIN_RE.test(cin.toUpperCase());
}

// --- MCA API ---
const MCA_BASE = "https://efiling.mca.gov.in";
const MCA_SEARCH_API = `${MCA_BASE}/MCAGovServices/rest/getCompanyDetails`;

async function mcaSearchCompany(query: string, apiKey?: string): Promise<MCACompany[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  // MCA provides a public search endpoint for company name/CIN
  const isCIN = CIN_RE.test(query.toUpperCase());
  const params = isCIN
    ? `?cin=${encodeURIComponent(query.toUpperCase())}`
    : `?companyName=${encodeURIComponent(query)}&category=all`;

  const res = await fetch(`${MCA_SEARCH_API}${params}`, { headers, signal: AbortSignal.timeout(15_000) });

  if (!res.ok) {
    if (res.status === 403 || res.status === 401) {
      throw new Error("MCA API requires authentication — set MCA_API_KEY env var");
    }
    throw new Error(`MCA API error: HTTP ${res.status}`);
  }

  const json = await res.json() as { companyDetails?: unknown[]; data?: unknown[]; companies?: unknown[] };
  const raw = (json.companyDetails ?? json.data ?? json.companies ?? []) as Record<string, unknown>[];
  return raw.map(normalizeCompany);
}

function normalizeCompany(raw: Record<string, unknown>): MCACompany {
  return {
    cin: String(raw.cin ?? raw.CIN ?? raw.companyIdentificationNumber ?? ""),
    companyName: String(raw.companyName ?? raw.COMPANY_NAME ?? raw.name ?? ""),
    registrationDate: String(raw.dateOfIncorporation ?? raw.registrationDate ?? raw.INCORPORATION_DATE ?? "") || null,
    category: String(raw.companyCategory ?? raw.COMPANY_CATEGORY ?? ""),
    subCategory: String(raw.companySubCategory ?? raw.SUB_CATEGORY ?? ""),
    classOfCompany: String(raw.classOfCompany ?? raw.CLASS_OF_COMPANY ?? ""),
    authorizedCapital: parseFloat(String(raw.authorisedCapitalAmount ?? raw.AUTHORIZED_CAPITAL ?? "0")) || null,
    paidUpCapital: parseFloat(String(raw.paidUpCapitalAmount ?? raw.PAID_UP_CAPITAL ?? "0")) || null,
    numberOfMembers: parseInt(String(raw.numberOfMembers ?? "0"), 10) || null,
    registeredAddress: String(raw.registeredAddress ?? raw.REGISTERED_OFFICE_ADDRESS ?? ""),
    registrarOfCompanies: String(raw.roc ?? raw.ROC ?? raw.registrarOfCompanies ?? ""),
    status: String(raw.companyStatus ?? raw.STATUS ?? "Unknown"),
  };
}

// --- GSTN Public API ---
// GSTN exposes public taxpayer info without auth for basic GSTIN lookup
// Ref: https://developer.gst.gov.in/apiportal/taxpayer/search
const GSTN_SANDBOX_BASE = "https://api.gst.gov.in";
const GSTN_SEARCH_PATH = "/commonapi/v1.1/search";

async function gstnLookup(gstin: string): Promise<GSTNTaxpayer> {
  if (!validateGSTIN(gstin)) {
    throw new Error(`Invalid GSTIN format: ${gstin}. Expected: 2-digit state code + PAN + 1 entity number + Z + check digit`);
  }

  const url = `${GSTN_SANDBOX_BASE}${GSTN_SEARCH_PATH}?action=TP&gstin=${gstin.toUpperCase()}`;
  const res = await fetch(url, {
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error(`GSTIN not found: ${gstin}`);
    if (res.status === 401) throw new Error("GSTN API requires authentication — set GSTN_CLIENT_ID and GSTN_CLIENT_SECRET env vars");
    throw new Error(`GSTN API error: HTTP ${res.status}`);
  }

  const json = await res.json() as Record<string, unknown>;
  return normalizeGSTN(json);
}

function normalizeGSTN(raw: Record<string, unknown>): GSTNTaxpayer {
  const data = (raw.data ?? raw) as Record<string, unknown>;
  return {
    gstin: String(data.gstin ?? data.GSTIN ?? ""),
    legalName: String(data.lgnm ?? data.legalName ?? data.LEGAL_NAME ?? ""),
    tradeName: String(data.tradeNam ?? data.tradeName ?? "") || null,
    registrationDate: String(data.rgdt ?? data.registrationDate ?? "") || null,
    lastUpdateDate: String(data.lstupdt ?? data.lastUpdateDate ?? "") || null,
    constitutionOfBusiness: String(data.ctb ?? data.constitutionOfBusiness ?? ""),
    taxpayerType: String(data.dty ?? data.taxpayerType ?? "Regular"),
    gstinStatus: String(data.sts ?? data.status ?? "Active"),
    principalPlaceAddress: String((() => { const pradr = data["pradr"] as Record<string, unknown> | undefined; return pradr?.["addr"] ? JSON.stringify(pradr["addr"]) : ""; })()) || null,
    stateJurisdiction: String(data.stj ?? "") || null,
    centralJurisdiction: String(data.ctj ?? "") || null,
  };
}

// --- Adapter class ---
export class GovernmentIndiaAdapter extends PlaywrightAdapter {
  readonly id = "government-india";
  readonly name = "GovernmentIndiaAdapter";

  async searchMCA(
    ctx: AgentPassContext,
    query: string
  ): Promise<AdapterResult<MCACompany[]>> {
    const start = Date.now();
    try {
      const apiKey = process.env.MCA_API_KEY;
      const companies = await mcaSearchCompany(query, apiKey);
      return { success: true, data: companies, latencyMs: Date.now() - start, adapter: this.id, endpoint: "mca:search" };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - start, adapter: this.id, endpoint: "mca:search" };
    }
  }

  async lookupGSTIN(
    ctx: AgentPassContext,
    gstin: string
  ): Promise<AdapterResult<GSTNTaxpayer>> {
    const start = Date.now();
    try {
      const taxpayer = await gstnLookup(gstin);
      return { success: true, data: taxpayer, latencyMs: Date.now() - start, adapter: this.id, endpoint: "gstn:lookup" };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - start, adapter: this.id, endpoint: "gstn:lookup" };
    }
  }

  // Portal scraping fallback for forms/downloads that have no API
  async fetchPortal(ctx: AgentPassContext, portalUrl: string): Promise<AdapterResult<{ html: string; title: string; tables: Record<string, string>[][] }>> {
    if (!portalUrl.includes(".gov.in") && !portalUrl.includes(".nic.in")) {
      return { success: false, error: "GovernmentIndiaAdapter only handles *.gov.in and *.nic.in URLs", latencyMs: 0, adapter: this.id, endpoint: "portal:fetch" };
    }
    return this.execute(ctx, portalUrl, async (page) => {
      await page.waitForLoadState("networkidle").catch(() => null);
      const title = await page.title();
      const tables = await page.evaluate((): Record<string, string>[][] => {
        return Array.from(document.querySelectorAll("table")).map((table) =>
          Array.from(table.querySelectorAll("tr")).map((row) => {
            const cells = Array.from(row.querySelectorAll("th, td"));
            return Object.fromEntries(
              cells.map((cell, i) => [
                (cells[0] as HTMLElement)?.innerText?.trim() ?? `col_${i}`,
                (cell as HTMLElement)?.innerText?.trim() ?? "",
              ])
            );
          })
        );
      });
      const html = await page.content();
      return { html: html.slice(0, 100_000), title, tables };
    });
  }

  // Validation utilities exposed as API
  validateGSTIN = validateGSTIN;
  validateCIN = validateCIN;
}

export const governmentIndiaAdapter = new GovernmentIndiaAdapter();
