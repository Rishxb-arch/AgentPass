import { PlaywrightAdapter, AgentPassContext, AdapterResult, buildAgentPassHeaders } from "./base.js";

export interface RestCallResult {
  url: string;
  method: string;
  statusCode: number;
  headers: Record<string, string>;
  data: unknown;
  latencyMs: number;
}

export interface GraphQLResult {
  data: unknown;
  errors?: unknown[];
}

export interface ApiSpec {
  openapi?: string;
  info?: { title: string; version: string };
  paths: Record<string, unknown>;
  baseUrl?: string;
}

export class APIGenericAdapter extends PlaywrightAdapter {
  readonly id = "api-generic";
  readonly name = "APIGenericAdapter";

  async restCall(
    ctx: AgentPassContext,
    url: string,
    options: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
      params?: Record<string, string>;
    } = {}
  ): Promise<AdapterResult<RestCallResult>> {
    const start = Date.now();
    const method = (options.method ?? "GET").toUpperCase();

    const targetUrl = options.params
      ? `${url}?${new URLSearchParams(options.params).toString()}`
      : url;

    try {
      const agentPassHeaders = buildAgentPassHeaders(ctx);
      const res = await fetch(targetUrl, {
        method,
        body: options.body ? JSON.stringify(options.body) : undefined,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "AgentPass/1.0",
          ...agentPassHeaders,
          ...options.headers,
        },
        signal: AbortSignal.timeout(30_000),
      });

      const contentType = res.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json")
        ? await res.json()
        : await res.text();

      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => { responseHeaders[key] = value; });

      return {
        success: res.ok,
        data: { url: targetUrl, method, statusCode: res.status, headers: responseHeaders, data, latencyMs: Date.now() - start },
        error: res.ok ? undefined : `HTTP ${res.status}`,
        statusCode: res.status,
        latencyMs: Date.now() - start,
        adapter: this.id,
        endpoint: "rest_call",
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - start, adapter: this.id, endpoint: "rest_call" };
    }
  }

  async graphql(
    ctx: AgentPassContext,
    endpoint: string,
    query: string,
    variables?: Record<string, unknown>
  ): Promise<AdapterResult<GraphQLResult>> {
    const start = Date.now();
    try {
      const agentPassHeaders = buildAgentPassHeaders(ctx);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", ...agentPassHeaders },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(30_000),
      });
      const result = await res.json() as GraphQLResult;
      return { success: !result.errors?.length, data: result, latencyMs: Date.now() - start, adapter: this.id, endpoint: "graphql" };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - start, adapter: this.id, endpoint: "graphql" };
    }
  }

  async discoverApi(
    ctx: AgentPassContext,
    baseUrl: string
  ): Promise<AdapterResult<ApiSpec>> {
    const start = Date.now();
    const specPaths = ["/openapi.json", "/swagger.json", "/api-docs", "/v1/openapi.json", "/api/openapi.json"];
    for (const path of specPaths) {
      try {
        const agentPassHeaders = buildAgentPassHeaders(ctx);
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
          headers: { "Accept": "application/json", ...agentPassHeaders },
          signal: AbortSignal.timeout(5_000),
        });
        if (res.ok) {
          const spec = await res.json() as ApiSpec;
          if (spec.paths || spec.openapi) {
            return { success: true, data: { ...spec, baseUrl }, latencyMs: Date.now() - start, adapter: this.id, endpoint: "discover" };
          }
        }
      } catch { /* try next */ }
    }
    return { success: false, error: "No OpenAPI spec found at common paths", latencyMs: Date.now() - start, adapter: this.id, endpoint: "discover" };
  }

  async paginate<T>(
    ctx: AgentPassContext,
    url: string,
    options: { maxPages?: number; pageParam?: string; limitParam?: string; limit?: number } = {}
  ): Promise<AdapterResult<T[]>> {
    const start = Date.now();
    const { maxPages = 5, pageParam = "page", limitParam = "limit", limit = 100 } = options;
    const results: T[] = [];

    try {
      for (let page = 1; page <= maxPages; page++) {
        const params = new URLSearchParams({ [pageParam]: String(page), [limitParam]: String(limit) });
        const agentPassHeaders = buildAgentPassHeaders(ctx);
        const res = await fetch(`${url}?${params}`, {
          headers: { "Accept": "application/json", ...agentPassHeaders },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) break;
        const json = await res.json() as unknown;
        const items = Array.isArray(json) ? json as T[] : (json as Record<string, T[]>).data ?? (json as Record<string, T[]>).items ?? (json as Record<string, T[]>).results ?? [];
        results.push(...items);
        if (items.length < limit) break; // Last page
      }
      return { success: true, data: results, latencyMs: Date.now() - start, adapter: this.id, endpoint: "paginate" };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - start, adapter: this.id, endpoint: "paginate" };
    }
  }
}

export const apiGenericAdapter = new APIGenericAdapter();
