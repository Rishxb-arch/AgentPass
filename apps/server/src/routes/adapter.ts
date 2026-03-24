import { FastifyInstance } from "fastify";
import { AgentPassContext } from "../adapters/base.js";
import { webGenericAdapter } from "../adapters/web-generic.js";
import { ecommerceAdapter } from "../adapters/ecommerce.js";
import { newsAdapter } from "../adapters/news.js";
import { apiGenericAdapter } from "../adapters/api-generic.js";
import { socialAdapter } from "../adapters/social.js";
import { governmentIndiaAdapter } from "../adapters/government-india.js";
import { appendEntry } from "@agentpass/db";
import type { AuditAction } from "@agentpass/core";

interface AdapterRequest {
  ctx: AgentPassContext;
  url?: string;
  endpoint: string;
  params?: Record<string, unknown>;
}

// ─── Audit helper ──────────────────────────────────────────────────────────────

async function logAdapterAudit(
  ctx: AgentPassContext,
  endpoint: string,
  targetUrl: string | undefined,
  outcome: "success" | "failure",
  verificationUsed: "agentpass_credentials" | "legacy_auth" | "none" = "agentpass_credentials"
): Promise<void> {
  const action: AuditAction = {
    type: "browse",
    system: "adapter",
    endpoint,
    payloadHash: "",
  };

  await appendEntry({
    agentId: ctx.agentId,
    principalId: ctx.principalId,
    action,
    outcome,
    verificationUsed,
    targetUrl,
  }).catch((err: unknown) => {
    // Audit logging is non-fatal
    console.error("[AgentPass] Failed to write audit entry:", err);
  });
}

export async function adapterRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /adapter/execute
  // Universal entry point: given a URL and optional hint, auto-detect adapter and execute
  fastify.post<{ Body: AdapterRequest }>("/adapter/execute", async (req, reply) => {
    const { ctx, url, endpoint, params = {} } = req.body;
    if (!url) return reply.code(400).send({ error: "url is required" });

    const adapter = detectAdapter(url);
    let outcome: "success" | "failure" = "success";
    try {
      const result = await dispatchEndpoint(adapter, endpoint, ctx, url, params);
      if (result && typeof result === "object" && "success" in result && !(result as { success: boolean }).success) {
        outcome = "failure";
      }
      return reply.send(result);
    } catch (err) {
      outcome = "failure";
      throw err;
    } finally {
      await logAdapterAudit(ctx, `${adapter}:${endpoint}`, url, outcome);
    }
  });

  // POST /adapter/web/fetch-page
  fastify.post<{ Body: { ctx: AgentPassContext; url: string } }>("/adapter/web/fetch-page", async (req, reply) => {
    const result = await webGenericAdapter.fetchPage(req.body.ctx, req.body.url);
    return reply.send(result);
  });

  // POST /adapter/web/extract
  fastify.post<{ Body: { ctx: AgentPassContext; url: string; schema: string[] } }>("/adapter/web/extract", async (req, reply) => {
    const result = await webGenericAdapter.extractStructured(req.body.ctx, req.body.url, req.body.schema ?? []);
    return reply.send(result);
  });

  // POST /adapter/web/submit-form
  fastify.post<{ Body: { ctx: AgentPassContext; url: string; selector: string; fields: Record<string, string> } }>("/adapter/web/submit-form", async (req, reply) => {
    const result = await webGenericAdapter.submitForm(req.body.ctx, req.body.url, req.body.selector, req.body.fields);
    return reply.send(result);
  });

  // POST /adapter/ecommerce/search
  fastify.post<{ Body: { ctx: AgentPassContext; siteUrl: string; query: string; maxResults?: number } }>("/adapter/ecommerce/search", async (req, reply) => {
    const { ctx, siteUrl, query, maxResults } = req.body;
    const result = await ecommerceAdapter.searchProducts(ctx, siteUrl, query, { maxResults });
    return reply.send(result);
  });

  // POST /adapter/ecommerce/product
  fastify.post<{ Body: { ctx: AgentPassContext; productUrl: string } }>("/adapter/ecommerce/product", async (req, reply) => {
    const result = await ecommerceAdapter.getProduct(req.body.ctx, req.body.productUrl);
    return reply.send(result);
  });

  // POST /adapter/ecommerce/cart
  fastify.post<{ Body: { ctx: AgentPassContext; siteUrl: string } }>("/adapter/ecommerce/cart", async (req, reply) => {
    const result = await ecommerceAdapter.getCart(req.body.ctx, req.body.siteUrl);
    return reply.send(result);
  });

  // POST /adapter/news/article
  fastify.post<{ Body: { ctx: AgentPassContext; url: string } }>("/adapter/news/article", async (req, reply) => {
    const result = await newsAdapter.getArticle(req.body.ctx, req.body.url);
    return reply.send(result);
  });

  // POST /adapter/news/feed
  fastify.post<{ Body: { ctx: AgentPassContext; siteUrl: string } }>("/adapter/news/feed", async (req, reply) => {
    const result = await newsAdapter.getFeed(req.body.ctx, req.body.siteUrl);
    return reply.send(result);
  });

  // POST /adapter/api/rest
  fastify.post<{ Body: { ctx: AgentPassContext; url: string; method?: string; body?: unknown; headers?: Record<string, string>; params?: Record<string, string> } }>("/adapter/api/rest", async (req, reply) => {
    const { ctx, url, ...options } = req.body;
    const result = await apiGenericAdapter.restCall(ctx, url, options);
    return reply.send(result);
  });

  // POST /adapter/api/graphql
  fastify.post<{ Body: { ctx: AgentPassContext; endpoint: string; query: string; variables?: Record<string, unknown> } }>("/adapter/api/graphql", async (req, reply) => {
    const { ctx, endpoint, query, variables } = req.body;
    const result = await apiGenericAdapter.graphql(ctx, endpoint, query, variables);
    return reply.send(result);
  });

  // POST /adapter/api/discover
  fastify.post<{ Body: { ctx: AgentPassContext; baseUrl: string } }>("/adapter/api/discover", async (req, reply) => {
    const result = await apiGenericAdapter.discoverApi(req.body.ctx, req.body.baseUrl);
    return reply.send(result);
  });

  // POST /adapter/social/post
  fastify.post<{ Body: { ctx: AgentPassContext; url: string } }>("/adapter/social/post", async (req, reply) => {
    const result = await socialAdapter.getPost(req.body.ctx, req.body.url);
    return reply.send(result);
  });

  // POST /adapter/social/profile
  fastify.post<{ Body: { ctx: AgentPassContext; url: string } }>("/adapter/social/profile", async (req, reply) => {
    const result = await socialAdapter.getProfile(req.body.ctx, req.body.url);
    return reply.send(result);
  });

  // POST /adapter/gov/mca/search
  fastify.post<{ Body: { ctx: AgentPassContext; query: string } }>("/adapter/gov/mca/search", async (req, reply) => {
    const result = await governmentIndiaAdapter.searchMCA(req.body.ctx, req.body.query);
    return reply.send(result);
  });

  // POST /adapter/gov/gstn/lookup
  fastify.post<{ Body: { ctx: AgentPassContext; gstin: string } }>("/adapter/gov/gstn/lookup", async (req, reply) => {
    const result = await governmentIndiaAdapter.lookupGSTIN(req.body.ctx, req.body.gstin);
    return reply.send(result);
  });

  // POST /adapter/gov/portal
  fastify.post<{ Body: { ctx: AgentPassContext; portalUrl: string } }>("/adapter/gov/portal", async (req, reply) => {
    const result = await governmentIndiaAdapter.fetchPortal(req.body.ctx, req.body.portalUrl);
    return reply.send(result);
  });
}

function detectAdapter(url: string): string {
  const u = url.toLowerCase();
  if (u.includes(".gov.in") || u.includes(".nic.in")) return "government-india";
  if (u.includes("/api/") || u.startsWith("api.") || u.match(/api\.[a-z]+\.(com|io|dev)/)) return "api-generic";
  if (u.match(/reddit\.|twitter\.|x\.com|linkedin\.|facebook\./)) return "social";
  if (u.match(/shop|store|mart|buy|cart|commerce|amazon|flipkart|ebay/)) return "ecommerce";
  if (u.match(/news|blog|media|techcrunch|wired|verge/)) return "news";
  return "web-generic";
}

async function dispatchEndpoint(
  adapter: string,
  endpoint: string,
  ctx: AgentPassContext,
  url: string,
  params: Record<string, unknown>
): Promise<unknown> {
  switch (adapter) {
    case "web-generic":
      return webGenericAdapter.fetchPage(ctx, url);
    case "ecommerce":
      if (endpoint === "search_products") return ecommerceAdapter.searchProducts(ctx, url, String(params.query ?? ""), params as never);
      if (endpoint === "get_cart") return ecommerceAdapter.getCart(ctx, url);
      return ecommerceAdapter.getProduct(ctx, url);
    case "news":
      if (endpoint === "get_feed") return newsAdapter.getFeed(ctx, url);
      return newsAdapter.getArticle(ctx, url);
    case "api-generic":
      return apiGenericAdapter.restCall(ctx, url, params as never);
    case "social":
      if (endpoint === "get_profile") return socialAdapter.getProfile(ctx, url);
      return socialAdapter.getPost(ctx, url);
    case "government-india":
      if (params.gstin) return governmentIndiaAdapter.lookupGSTIN(ctx, String(params.gstin));
      if (params.query) return governmentIndiaAdapter.searchMCA(ctx, String(params.query));
      return governmentIndiaAdapter.fetchPortal(ctx, url);
    default:
      return webGenericAdapter.fetchPage(ctx, url);
  }
}
