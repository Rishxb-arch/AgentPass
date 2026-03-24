import type { AgentPassport, KYAProfile, AgentSession } from "@agentpass/core";
import { BaseAdapter } from "../base-adapter.js";
import type { AdapterManifest, AdapterResult } from "../types.js";

export class APIGenericAdapter extends BaseAdapter {
  readonly manifest: AdapterManifest = {
    adapterId: "adapter_api_generic",
    systemId: "api:*",
    systemName: "Generic REST/GraphQL API",
    version: "1.0.0",
    systemType: "api",
    requiredCapabilities: ["api:read"],
    requiredTier: "basic",
    agentPassAware: false,
    verificationRequirements: [
      { type: "rate_limit", satisfiedByAgentPass: true, requiredKYAScore: 50 },
    ],
    rateLimits: { requestsPerMinute: 60, requestsPerHour: 1000, agentPassVerifiedMultiplier: 10 },
    outputSchema: {},
    systemPatterns: ["api.*", "*.api.*"],
    endpoints: [
      { id: "rest_call", description: "Make a REST API call", requiredCapability: "api:read", inputSchema: { url: "string", method: "string", headers: "object?", body: "unknown?", params: "object?", auth: "object?" }, outputSchema: {}, category: "api" },
      { id: "graphql_query", description: "Execute a GraphQL query", requiredCapability: "api:read", inputSchema: { url: "string", query: "string", variables: "object?", headers: "object?" }, outputSchema: {}, category: "api" },
      { id: "discover_api", description: "Discover OpenAPI/Swagger spec", requiredCapability: "api:read", inputSchema: { baseUrl: "string", authHeader: "string?" }, outputSchema: {}, category: "api" },
      { id: "paginate", description: "Paginate through an API endpoint", requiredCapability: "api:read", inputSchema: { url: "string", method: "string", paginationType: "string", pageSize: "number?", maxPages: "number?", headers: "object?" }, outputSchema: {}, category: "api" },
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
      return { success: false, error: auth.reason, errorCode: "UNAUTHORIZED", auditEntry: this.audit(passport, "api_call", "", "blocked") };
    }

    const headers = this.buildRequestHeaders(passport, kyaProfile);

    switch (endpointId) {
      case "rest_call": return this.restCall(input, passport, kyaProfile, headers);
      case "graphql_query": return this.graphqlQuery(input, passport, kyaProfile, headers);
      case "discover_api": return this.discoverApi(input, passport, kyaProfile, headers);
      case "paginate": return this.paginate(input, passport, kyaProfile, headers);
      default: return { success: false, errorCode: "UNKNOWN_ENDPOINT", auditEntry: this.audit(passport, "api_call", "", "failure") };
    }
  }

  private async restCall(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<{ status: number; headers: Record<string, string>; data: unknown; responseTime: number }>> {
    const url = input["url"] as string;
    const method = (input["method"] as string ?? "GET").toUpperCase();
    const extraHeaders = (input["headers"] as Record<string, string> | undefined) ?? {};
    const body = input["body"];
    const params = input["params"] as Record<string, string> | undefined;
    const auth = input["auth"] as { type: "bearer" | "basic" | "apikey"; credential: string; headerName?: string } | undefined;

    // Build URL with query params
    let requestUrl = url;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      requestUrl = `${url}${url.includes("?") ? "&" : "?"}${qs}`;
    }

    // Build auth header
    const authHeaders: Record<string, string> = {};
    if (auth) {
      if (auth.type === "bearer") authHeaders["Authorization"] = `Bearer ${auth.credential}`;
      else if (auth.type === "basic") authHeaders["Authorization"] = `Basic ${Buffer.from(auth.credential).toString("base64")}`;
      else if (auth.type === "apikey") authHeaders[auth.headerName ?? "X-API-Key"] = auth.credential;
    }

    const start = Date.now();
    try {
      const response = await this.retry(() =>
        fetch(requestUrl, {
          method,
          headers: { ...headers, ...extraHeaders, ...authHeaders, ...(body ? { "Content-Type": "application/json" } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        })
      );
      const responseTime = Date.now() - start;

      const contentType = response.headers.get("content-type") ?? "";
      let data: unknown;
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      const data_normalized = this.normalize(data);

      return {
        success: response.ok,
        data: {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          data: data_normalized,
          responseTime,
        },
        auditEntry: this.audit(passport, "api_call", requestUrl, response.ok ? "success" : "failure"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "REST_CALL_FAILED", auditEntry: this.audit(passport, "api_call", url, "failure") };
    }
  }

  private async graphqlQuery(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<{ data: unknown; errors?: unknown[] }>> {
    const url = input["url"] as string;
    const query = input["query"] as string;
    const variables = input["variables"];
    const extraHeaders = (input["headers"] as Record<string, string> | undefined) ?? {};

    try {
      const response = await this.retry(() =>
        fetch(url, {
          method: "POST",
          headers: { ...headers, ...extraHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ query, variables }),
        })
      );

      const result = await response.json() as { data?: unknown; errors?: unknown[] };

      return {
        success: !result.errors || result.errors.length === 0,
        data: { data: result.data, errors: result.errors },
        auditEntry: this.audit(passport, "api_call", url, !result.errors || result.errors.length === 0 ? "success" : "failure"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "GRAPHQL_FAILED", auditEntry: this.audit(passport, "api_call", url, "failure") };
    }
  }

  private async discoverApi(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<{ hasOpenAPI: boolean; openApiUrl?: string; spec?: unknown; detectedEndpoints: Array<{ path: string; method: string; description?: string }> }>> {
    const baseUrl = input["baseUrl"] as string;
    const authHeader = input["authHeader"] as string | undefined;
    const origin = new URL(baseUrl).origin;

    const paths = [
      "/openapi.json",
      "/swagger.json",
      "/api-docs",
      "/api/v1/openapi.json",
      "/api-docs.json",
      "/swagger/v1/swagger.json",
    ];

    const reqHeaders = { ...headers, ...(authHeader ? { Authorization: authHeader } : {}) };

    for (const path of paths) {
      try {
        const response = await fetch(origin + path, { headers: reqHeaders });
        if (!response.ok) continue;

        const spec = await response.json();
        if (typeof spec === "object" && spec !== null && ("openapi" in spec || "swagger" in spec)) {
          const endpoints = this.extractEndpointsFromSpec(spec as Record<string, unknown>);
          return {
            success: true,
            data: { hasOpenAPI: true, openApiUrl: origin + path, spec, detectedEndpoints: endpoints },
            auditEntry: this.audit(passport, "api_call", origin + path, "success"),
          };
        }
      } catch {
        continue;
      }
    }

    return {
      success: true,
      data: { hasOpenAPI: false, detectedEndpoints: [] },
      auditEntry: this.audit(passport, "api_call", baseUrl, "success"),
    };
  }

  private async paginate(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<{ allData: unknown[]; totalFetched: number; pages: number }>> {
    const url = input["url"] as string;
    const method = (input["method"] as string ?? "GET").toUpperCase();
    const paginationType = input["paginationType"] as "offset" | "cursor" | "page";
    const pageSize = (input["pageSize"] as number | undefined) ?? 100;
    const maxPages = (input["maxPages"] as number | undefined) ?? 10;
    const extraHeaders = (input["headers"] as Record<string, string> | undefined) ?? {};

    const allData: unknown[] = [];
    let pages = 0;
    let cursor: string | undefined;

    while (pages < maxPages) {
      let pageUrl = url;

      if (paginationType === "page") {
        pageUrl = `${url}${url.includes("?") ? "&" : "?"}page=${pages + 1}&per_page=${pageSize}`;
      } else if (paginationType === "offset") {
        pageUrl = `${url}${url.includes("?") ? "&" : "?"}offset=${pages * pageSize}&limit=${pageSize}`;
      } else if (paginationType === "cursor" && cursor) {
        pageUrl = `${url}${url.includes("?") ? "&" : "?"}cursor=${cursor}`;
      }

      try {
        const response = await fetch(pageUrl, { method, headers: { ...headers, ...extraHeaders } });
        if (!response.ok) break;

        const data = await response.json() as unknown;
        pages++;

        if (Array.isArray(data)) {
          allData.push(...data);
          if (data.length < pageSize) break;
        } else if (typeof data === "object" && data !== null) {
          const obj = data as Record<string, unknown>;
          const items = obj["data"] ?? obj["items"] ?? obj["results"] ?? obj["records"] ?? [];
          if (Array.isArray(items)) {
            allData.push(...items);
            cursor = obj["next_cursor"] ? String(obj["next_cursor"]) : undefined;
            if (items.length < pageSize || !cursor) break;
          } else {
            allData.push(data);
            break;
          }
        }
      } catch {
        break;
      }
    }

    return {
      success: true,
      data: { allData, totalFetched: allData.length, pages },
      auditEntry: this.audit(passport, "api_call", url, "success"),
    };
  }

  normalize(rawOutput: unknown): unknown {
    if (typeof rawOutput !== "object" || rawOutput === null) return rawOutput;
    if (Array.isArray(rawOutput)) return rawOutput.map((item) => this.normalize(item));

    const obj = rawOutput as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = this.toCamelCase(key);
      if (typeof value === "string" && this.isDateString(value)) {
        normalized[camelKey] = this.normalizeDate(value);
      } else {
        normalized[camelKey] = this.normalize(value);
      }
    }
    return normalized;
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs?: number }> {
    return { healthy: true };
  }

  private extractEndpointsFromSpec(spec: Record<string, unknown>): Array<{ path: string; method: string; description?: string }> {
    const endpoints: Array<{ path: string; method: string; description?: string }> = [];
    const paths = spec["paths"] as Record<string, Record<string, Record<string, unknown>>> | undefined;
    if (!paths) return endpoints;

    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, details] of Object.entries(methods)) {
        if (["get", "post", "put", "patch", "delete"].includes(method)) {
          endpoints.push({
            path,
            method: method.toUpperCase(),
            description: details["summary"] ? String(details["summary"]) : undefined,
          });
        }
      }
    }
    return endpoints;
  }

  private toCamelCase(str: string): string {
    return str.replace(/[_-](.)/g, (_, char: string) => char.toUpperCase());
  }

  private isDateString(str: string): boolean {
    return /^\d{4}-\d{2}-\d{2}/.test(str) && !isNaN(Date.parse(str));
  }

  private normalizeDate(dateStr: string): string {
    try { return new Date(dateStr).toISOString(); } catch { return dateStr; }
  }

  private audit(passport: AgentPassport, type: import("@agentpass/core").AuditAction["type"], endpoint: string, outcome: "success" | "failure" | "blocked"): AdapterResult["auditEntry"] {
    return { agentId: passport.agentId, principalId: passport.principalId, action: { type, system: "api:generic", endpoint, payloadHash: "" }, outcome, verificationUsed: "agentpass_credentials", timestamp: new Date().toISOString() };
  }
}
