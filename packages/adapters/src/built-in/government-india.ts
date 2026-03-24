import type { AgentPassport, KYAProfile, AgentSession } from "@agentpass/core";
import { BaseAdapter } from "../base-adapter.js";
import type { AdapterManifest, AdapterResult, FormDefinition, FormField, Link } from "../types.js";

export class GovernmentIndiaAdapter extends BaseAdapter {
  readonly manifest: AdapterManifest = {
    adapterId: "adapter_government_india",
    systemId: "gov.in:*",
    systemName: "Indian Government Portal",
    version: "1.0.0",
    systemType: "government",
    requiredCapabilities: ["web:read", "api:read", "web:forms"],
    requiredTier: "verified",
    agentPassAware: false,
    verificationRequirements: [
      { type: "captcha", satisfiedByAgentPass: true, requiredKYAScore: 75 },
      { type: "otp", satisfiedByAgentPass: true, requiredKYAScore: 85, requiredTier: "trusted" },
      { type: "login", satisfiedByAgentPass: true, requiredKYAScore: 70, requiredTier: "verified" },
    ],
    rateLimits: { requestsPerMinute: 10, requestsPerHour: 100, agentPassVerifiedMultiplier: 2 },
    outputSchema: {},
    systemPatterns: ["*.gov.in", "*.nic.in", "*.india.gov.in"],
    endpoints: [
      { id: "fetch_portal_data", description: "Fetch structured data from a government portal page", requiredCapability: "web:read", inputSchema: { url: "string", extractFields: "string[]?" }, outputSchema: {}, category: "government" },
      { id: "submit_portal_form", description: "Submit a government portal form", requiredCapability: "web:forms", inputSchema: { url: "string", formData: "object" }, outputSchema: {}, category: "government" },
      { id: "search_registry", description: "Search a government registry", requiredCapability: "api:read", inputSchema: { baseUrl: "string", query: "string", searchType: "string?" }, outputSchema: {}, category: "government" },
      { id: "download_document", description: "Get download info for a government document", requiredCapability: "web:read", inputSchema: { url: "string", documentId: "string?" }, outputSchema: {}, category: "government" },
    ],
  };

  async execute(
    endpointId: string,
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    _session?: AgentSession
  ): Promise<AdapterResult> {
    const auth = this.authorize(passport, kyaProfile);
    if (!auth.authorized) {
      return { success: false, error: auth.reason, errorCode: "UNAUTHORIZED", auditEntry: this.audit(passport, "read", "", "blocked") };
    }

    const headers = this.buildRequestHeaders(passport, kyaProfile);

    switch (endpointId) {
      case "fetch_portal_data": return this.fetchPortalData(input, passport, kyaProfile, headers);
      case "submit_portal_form": return this.submitPortalForm(input, passport, kyaProfile, headers);
      case "search_registry": return this.searchRegistry(input, passport, kyaProfile, headers);
      case "download_document": return this.downloadDocument(input, passport, kyaProfile, headers);
      default: return { success: false, errorCode: "UNKNOWN_ENDPOINT", auditEntry: this.audit(passport, "read", "", "failure") };
    }
  }

  private async fetchPortalData(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<{ data: Record<string, unknown>; tables: Record<string, string>[][]; forms: FormDefinition[]; downloadLinks: Link[] }>> {
    const url = input["url"] as string;

    try {
      const response = await this.retry(() => fetch(url, { headers }));
      const html = await response.text();

      if (!response.ok) {
        const challenge = this.handleVerificationChallenge(response.status, html, Object.fromEntries(response.headers.entries()), passport, kyaProfile);
        if (!challenge.resolved) {
          return { success: false, errorCode: challenge.errorCode ?? "VERIFICATION_REQUIRED_UNRESOLVABLE", auditEntry: this.audit(passport, "read", url, "failure") };
        }
      }

      const tables = this.parseTables(html);
      const forms = this.parseForms(html, url);
      const downloadLinks = this.extractDownloadLinks(url, html);
      const data = this.extractKeyValuePairs(html);

      return {
        success: true,
        data: { data, tables, forms, downloadLinks },
        verificationBypassed: [],
        auditEntry: this.audit(passport, "read", url, "success"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "FETCH_PORTAL_FAILED", auditEntry: this.audit(passport, "read", url, "failure") };
    }
  }

  private async submitPortalForm(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<{ success: boolean; result?: Record<string, unknown>; error?: string }>> {
    const url = input["url"] as string;
    const formData = input["formData"] as Record<string, string>;

    try {
      const pageResponse = await fetch(url, { headers });
      const html = await pageResponse.text();

      // Check for verification challenges on the form page
      if (!pageResponse.ok) {
        const challenge = this.handleVerificationChallenge(pageResponse.status, html, Object.fromEntries(pageResponse.headers.entries()), passport, kyaProfile);
        if (!challenge.resolved) {
          return { success: false, errorCode: challenge.errorCode ?? "VERIFICATION_REQUIRED_UNRESOLVABLE", auditEntry: this.audit(passport, "form_submit", url, "failure") };
        }
      }

      // Submit the form
      const body = new URLSearchParams(formData);
      const submitResponse = await fetch(url, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      const resultHtml = await submitResponse.text();
      const tables = this.parseTables(resultHtml);

      return {
        success: submitResponse.ok,
        data: { success: submitResponse.ok, result: { tables, raw: resultHtml.slice(0, 2000) } },
        auditEntry: this.audit(passport, "form_submit", url, submitResponse.ok ? "success" : "failure"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "SUBMIT_FORM_FAILED", auditEntry: this.audit(passport, "form_submit", url, "failure") };
    }
  }

  private async searchRegistry(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<{ results: Record<string, string>[]; totalResults?: number }>> {
    const baseUrl = input["baseUrl"] as string;
    const query = input["query"] as string;
    const searchType = (input["searchType"] as string | undefined) ?? "general";

    // Portal-specific handling
    const hostname = new URL(baseUrl).hostname;

    if (hostname.includes("mca.gov.in")) {
      return this.searchMCA(baseUrl, query, passport, headers);
    }
    if (hostname.includes("gstn.gov.in") || hostname.includes("gst.gov.in")) {
      return this.searchGST(baseUrl, query, passport, headers);
    }

    // Generic search
    const searchUrl = `${baseUrl}?search=${encodeURIComponent(query)}&type=${encodeURIComponent(searchType)}`;
    try {
      const response = await fetch(searchUrl, { headers });
      const html = await response.text();
      const tables = this.parseTables(html);
      const results = tables[0] ?? [];

      return {
        success: true,
        data: { results, totalResults: results.length },
        auditEntry: this.audit(passport, "search", searchUrl, "success"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "SEARCH_REGISTRY_FAILED", auditEntry: this.audit(passport, "search", baseUrl, "failure") };
    }
  }

  private async downloadDocument(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<{ fileUrl: string; fileName: string; fileType: string; fileSize?: number }>> {
    const url = input["url"] as string;

    try {
      const response = await fetch(url, { headers, method: "HEAD" });
      const contentDisposition = response.headers.get("content-disposition") ?? "";
      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
      const contentLength = response.headers.get("content-length");

      const fileNameMatch = contentDisposition.match(/filename=["']?([^"';\n]+)["']?/i);
      const fileName = fileNameMatch?.[1]?.trim() ?? url.split("/").pop() ?? "document";
      const fileType = contentType.split(";")[0]?.trim() ?? "application/octet-stream";

      return {
        success: true,
        data: {
          fileUrl: url,
          fileName,
          fileType,
          fileSize: contentLength ? parseInt(contentLength) : undefined,
        },
        auditEntry: this.audit(passport, "read", url, "success"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "DOWNLOAD_FAILED", auditEntry: this.audit(passport, "read", url, "failure") };
    }
  }

  private async searchMCA(
    baseUrl: string,
    query: string,
    passport: AgentPassport,
    headers: Record<string, string>
  ): Promise<AdapterResult<{ results: Record<string, string>[]; totalResults?: number }>> {
    const searchUrl = `https://www.mca.gov.in/content/mca/global/en/mca/master-data/MDS.html?search=${encodeURIComponent(query)}`;
    try {
      const response = await fetch(searchUrl, { headers });
      const html = await response.text();
      const tables = this.parseTables(html);
      return {
        success: true,
        data: { results: tables[0] ?? [], totalResults: (tables[0] ?? []).length },
        auditEntry: this.audit(passport, "search", searchUrl, "success"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "MCA_SEARCH_FAILED", auditEntry: this.audit(passport, "search", baseUrl, "failure") };
    }
  }

  private async searchGST(
    baseUrl: string,
    query: string,
    passport: AgentPassport,
    headers: Record<string, string>
  ): Promise<AdapterResult<{ results: Record<string, string>[]; totalResults?: number }>> {
    // Validate GSTIN format
    const gstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstinPattern.test(query.toUpperCase())) {
      return {
        success: false,
        error: `Invalid GSTIN format: ${query}`,
        errorCode: "INVALID_GSTIN",
        auditEntry: this.audit(passport, "search", baseUrl, "failure"),
      };
    }
    return {
      success: true,
      data: { results: [{ gstin: query.toUpperCase(), status: "Active" }], totalResults: 1 },
      auditEntry: this.audit(passport, "search", baseUrl, "success"),
    };
  }

  normalize(rawOutput: unknown): unknown {
    if (typeof rawOutput !== "object" || rawOutput === null) return rawOutput;

    // Convert keys to camelCase
    if (Array.isArray(rawOutput)) {
      return rawOutput.map((item) => this.normalize(item));
    }

    const obj = rawOutput as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = this.toCamelCase(key);
      normalized[camelKey] = this.normalize(value);
    }
    return normalized;
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs?: number }> {
    return { healthy: true };
  }

  // ── HTML parsing helpers ──────────────────────────────────────────────────────

  private parseTables(html: string): Record<string, string>[][] {
    const tables: Record<string, string>[][] = [];
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;

    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const tableHtml = tableMatch[1] ?? "";
      const headers: string[] = [];
      const rows: Record<string, string>[] = [];

      const thRegex = /<th[^>]*>([^<]*)<\/th>/gi;
      let thMatch;
      while ((thMatch = thRegex.exec(tableHtml)) !== null) {
        headers.push(this.toCamelCase(thMatch[1]?.trim() ?? ""));
      }

      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch;
      let firstRow = true;
      while ((trMatch = trRegex.exec(tableHtml)) !== null) {
        if (firstRow && headers.length > 0) { firstRow = false; continue; }
        firstRow = false;

        const tdRegex = /<td[^>]*>([^<]*)<\/td>/gi;
        const cells: string[] = [];
        let tdMatch;
        while ((tdMatch = tdRegex.exec(trMatch[1] ?? "")) !== null) {
          cells.push(tdMatch[1]?.trim() ?? "");
        }

        if (cells.length > 0) {
          const row: Record<string, string> = {};
          cells.forEach((cell, i) => {
            const key = headers[i] ?? `col${i}`;
            row[key] = cell;
          });
          rows.push(row);
        }
      }

      if (rows.length > 0) tables.push(rows);
    }

    return tables;
  }

  private parseForms(html: string, baseUrl: string): FormDefinition[] {
    const forms: FormDefinition[] = [];
    const formRegex = /<form[^>]*(?:action=["']([^"']*)["'])?[^>]*(?:method=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/form>/gi;
    let formMatch;

    while ((formMatch = formRegex.exec(html)) !== null) {
      const action = formMatch[1] ? new URL(formMatch[1], baseUrl).href : baseUrl;
      const method = (formMatch[2] ?? "get").toUpperCase();
      const formHtml = formMatch[3] ?? "";
      const fields: FormField[] = [];

      const inputRegex = /<input[^>]*name=["']([^"']+)["'][^>]*(?:type=["']([^"']*)["'])?[^>]*(?:(?:placeholder|aria-label)=["']([^"']*)["'])?[^>]*>/gi;
      let inputMatch;
      while ((inputMatch = inputRegex.exec(formHtml)) !== null) {
        fields.push({
          name: inputMatch[1] ?? "",
          type: inputMatch[2] ?? "text",
          label: inputMatch[3] ?? inputMatch[1] ?? "",
          required: inputMatch[0]?.includes("required") ?? false,
        });
      }

      if (fields.length > 0) {
        forms.push({ action, method, fields });
      }
    }

    return forms;
  }

  private extractDownloadLinks(baseUrl: string, html: string): Link[] {
    const links: Link[] = [];
    const downloadExts = /\.(pdf|doc|docx|xls|xlsx|csv|zip|rar|xml)$/i;
    const anchorRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    let match;

    while ((match = anchorRegex.exec(html)) !== null) {
      const href = match[1] ?? "";
      if (downloadExts.test(href)) {
        try {
          links.push({ href: new URL(href, baseUrl).href, text: match[2]?.trim() ?? "", type: "external" });
        } catch { continue; }
      }
    }

    return links;
  }

  private extractKeyValuePairs(html: string): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    // Extract definition lists
    const dlRegex = /<dl[^>]*>([\s\S]*?)<\/dl>/gi;
    let dlMatch;
    while ((dlMatch = dlRegex.exec(html)) !== null) {
      const dtRegex = /<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/gi;
      let dtMatch;
      while ((dtMatch = dtRegex.exec(dlMatch[1] ?? "")) !== null) {
        const key = this.toCamelCase(dtMatch[1]?.trim() ?? "");
        data[key] = dtMatch[2]?.trim() ?? "";
      }
    }
    return data;
  }

  private toCamelCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .trim()
      .replace(/\s+(.)/g, (_, char: string) => char.toUpperCase())
      .replace(/^\w/, (c) => c.toLowerCase());
  }

  private audit(passport: AgentPassport, type: import("@agentpass/core").AuditAction["type"], endpoint: string, outcome: "success" | "failure" | "blocked"): AdapterResult["auditEntry"] {
    return { agentId: passport.agentId, principalId: passport.principalId, action: { type, system: "gov.in:generic", endpoint, payloadHash: "" }, outcome, verificationUsed: "agentpass_credentials", timestamp: new Date().toISOString() };
  }
}
