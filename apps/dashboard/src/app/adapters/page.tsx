"use client";
import { useState } from "react";

interface AdapterInfo {
  id: string;
  name: string;
  systemType: string;
  version: string;
  description: string;
  capabilities: string[];
  patterns: string[];
  endpoints: {
    name: string;
    method: string;
    description: string;
    requiredCaps: string[];
    requiredTier: string;
  }[];
  verificationHandled: string[];
  stats: { requests: number; successRate: number; avgLatency: number };
}

const ADAPTERS: AdapterInfo[] = [
  {
    id: "web-generic",
    name: "WebGenericAdapter",
    systemType: "web",
    version: "1.0.0",
    description: "Generic web adapter for fetching pages, extracting structured data, submitting forms, and calling APIs from any website.",
    capabilities: ["web:read", "web:navigate", "web:submit_form"],
    patterns: ["*"],
    endpoints: [
      { name: "fetch_page", method: "GET", description: "Fetch and parse any web page", requiredCaps: ["web:read"], requiredTier: "basic" },
      { name: "extract_structured", method: "GET", description: "Extract structured JSON from a page", requiredCaps: ["web:read"], requiredTier: "basic" },
      { name: "submit_form", method: "POST", description: "Submit a form with provided data", requiredCaps: ["web:submit_form"], requiredTier: "verified" },
      { name: "api_call", method: "ANY", description: "Make an arbitrary HTTP API call", requiredCaps: ["web:read"], requiredTier: "basic" },
      { name: "monitor_page", method: "GET", description: "Poll a page for changes", requiredCaps: ["web:read", "web:navigate"], requiredTier: "basic" },
    ],
    verificationHandled: ["captcha", "login_wall", "rate_limit"],
    stats: { requests: 847, successRate: 98.2, avgLatency: 312 },
  },
  {
    id: "ecommerce-generic",
    name: "EcommerceGenericAdapter",
    systemType: "ecommerce",
    version: "1.0.0",
    description: "Specialized adapter for e-commerce platforms — search products, manage carts, and track orders with structured output.",
    capabilities: ["commerce:browse", "commerce:cart", "commerce:purchase", "commerce:order_history"],
    patterns: ["*shop*", "*store*", "*market*", "amazon.*", "flipkart.*"],
    endpoints: [
      { name: "search_products", method: "GET", description: "Search products with filters", requiredCaps: ["commerce:browse"], requiredTier: "basic" },
      { name: "get_product", method: "GET", description: "Get full product details", requiredCaps: ["commerce:browse"], requiredTier: "basic" },
      { name: "add_to_cart", method: "POST", description: "Add item to shopping cart", requiredCaps: ["commerce:cart"], requiredTier: "verified" },
      { name: "get_cart", method: "GET", description: "Retrieve current cart contents", requiredCaps: ["commerce:cart"], requiredTier: "verified" },
      { name: "get_orders", method: "GET", description: "List order history", requiredCaps: ["commerce:order_history"], requiredTier: "verified" },
    ],
    verificationHandled: ["captcha", "login_wall", "email_verification"],
    stats: { requests: 523, successRate: 97.1, avgLatency: 445 },
  },
  {
    id: "news-generic",
    name: "NewsGenericAdapter",
    systemType: "news",
    version: "1.0.0",
    description: "News and media adapter for extracting articles, feeds, and full-text content from news websites.",
    capabilities: ["web:read", "web:navigate"],
    patterns: ["*news*", "*blog*", "*media*", "techcrunch.*", "theverge.*", "wired.*"],
    endpoints: [
      { name: "get_article", method: "GET", description: "Extract full article content", requiredCaps: ["web:read"], requiredTier: "basic" },
      { name: "get_feed", method: "GET", description: "Get news feed / article list", requiredCaps: ["web:read"], requiredTier: "basic" },
      { name: "search_site", method: "GET", description: "Search within a news site", requiredCaps: ["web:read"], requiredTier: "basic" },
      { name: "get_sitemap", method: "GET", description: "Parse sitemap for article URLs", requiredCaps: ["web:read"], requiredTier: "basic" },
    ],
    verificationHandled: ["captcha", "login_wall"],
    stats: { requests: 234, successRate: 99.1, avgLatency: 218 },
  },
  {
    id: "api-generic",
    name: "APIGenericAdapter",
    systemType: "api",
    version: "1.0.0",
    description: "REST and GraphQL API adapter with OpenAPI discovery, automatic pagination, and structured response normalization.",
    capabilities: ["api:read", "api:write", "api:admin"],
    patterns: ["*/api/*", "api.*", "*graphql*"],
    endpoints: [
      { name: "rest_call", method: "ANY", description: "Generic REST API call", requiredCaps: ["api:read"], requiredTier: "basic" },
      { name: "graphql_query", method: "POST", description: "Execute a GraphQL query", requiredCaps: ["api:read"], requiredTier: "basic" },
      { name: "discover_api", method: "GET", description: "Discover API from OpenAPI spec", requiredCaps: ["api:read"], requiredTier: "basic" },
      { name: "paginate", method: "GET", description: "Auto-paginate through results", requiredCaps: ["api:read"], requiredTier: "basic" },
    ],
    verificationHandled: ["rate_limit"],
    stats: { requests: 189, successRate: 99.5, avgLatency: 89 },
  },
  {
    id: "social-generic",
    name: "SocialGenericAdapter",
    systemType: "social",
    version: "1.0.0",
    description: "Social media adapter for reading posts, profiles, and feeds without account logins.",
    capabilities: ["web:read", "web:navigate"],
    patterns: ["reddit.*", "twitter.*", "x.com*", "linkedin.*", "facebook.*"],
    endpoints: [
      { name: "get_post", method: "GET", description: "Fetch a specific post", requiredCaps: ["web:read"], requiredTier: "basic" },
      { name: "get_profile", method: "GET", description: "Get a user/page profile", requiredCaps: ["web:read"], requiredTier: "basic" },
      { name: "get_feed", method: "GET", description: "Get timeline or subreddit feed", requiredCaps: ["web:read", "web:navigate"], requiredTier: "verified" },
      { name: "search", method: "GET", description: "Search public content", requiredCaps: ["web:read"], requiredTier: "basic" },
    ],
    verificationHandled: ["captcha", "login_wall", "rate_limit"],
    stats: { requests: 54, successRate: 96.3, avgLatency: 521 },
  },
  {
    id: "government-india",
    name: "GovernmentIndiaAdapter",
    systemType: "government-india",
    version: "1.0.0",
    description: "Specialized adapter for Indian government portals (MCA, GSTN, NIC) with GSTIN validation, portal-specific parsing, and trusted tier requirement.",
    capabilities: ["web:read", "data:read", "data:write"],
    patterns: ["*.gov.in", "*.nic.in", "mca.gov.in", "gstn.gov.in"],
    endpoints: [
      { name: "fetch_portal_data", method: "GET", description: "Fetch data from gov portal", requiredCaps: ["web:read"], requiredTier: "trusted" },
      { name: "submit_portal_form", method: "POST", description: "Submit a government form", requiredCaps: ["web:read", "data:write"], requiredTier: "trusted" },
      { name: "search_registry", method: "GET", description: "Search MCA/GSTN registries", requiredCaps: ["data:read"], requiredTier: "trusted" },
      { name: "download_document", method: "GET", description: "Download official documents", requiredCaps: ["data:read"], requiredTier: "trusted" },
    ],
    verificationHandled: ["captcha", "otp", "login_wall"],
    stats: { requests: 12, successRate: 100, avgLatency: 892 },
  },
];

const BYPASS_BADGE_COLORS: Record<string, string> = {
  captcha: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  otp: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  login_wall: "bg-green-500/10 text-green-400 border-green-500/20",
  rate_limit: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  email_verification: "bg-pink-500/10 text-pink-400 border-pink-500/20",
};

const TIER_COLORS: Record<string, string> = {
  basic: "text-zinc-400",
  verified: "text-blue-400",
  trusted: "text-purple-400",
  sovereign: "text-yellow-400",
};

export default function AdaptersPage() {
  const [selected, setSelected] = useState<AdapterInfo>(ADAPTERS[0]);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Adapters</h1>
        <p className="text-zinc-500 text-sm">Built-in adapters that translate any web interface into structured JSON for agents</p>
      </div>

      <div className="grid grid-cols-3 gap-6 h-[calc(100vh-200px)]">
        {/* Sidebar list */}
        <div className="space-y-2 overflow-y-auto">
          {ADAPTERS.map((adapter) => (
            <button
              key={adapter.id}
              onClick={() => setSelected(adapter)}
              className={`w-full text-left p-4 rounded-xl border transition-colors ${
                selected.id === adapter.id
                  ? "border-blue-500/50 bg-blue-500/5"
                  : "border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div className="font-mono text-sm text-white mb-1">{adapter.name}</div>
              <div className="text-zinc-600 text-xs mb-2 line-clamp-2">{adapter.description.split("—")[0]}</div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-green-400">{adapter.stats.successRate}%</span>
                <span className="text-zinc-700">·</span>
                <span className="text-zinc-500">{adapter.stats.requests} reqs</span>
                <span className="text-zinc-700">·</span>
                <span className="text-zinc-500">{adapter.stats.avgLatency}ms</span>
              </div>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="col-span-2 overflow-y-auto space-y-5">
          <div className="border border-zinc-800 rounded-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-white font-bold text-lg font-mono">{selected.name}</h2>
                <div className="text-zinc-500 text-xs mt-1">v{selected.version} · systemType: <span className="text-zinc-400 font-mono">{selected.systemType}</span></div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-green-400">{selected.stats.successRate}%</div>
                <div className="text-zinc-600 text-xs">success rate</div>
              </div>
            </div>
            <p className="text-zinc-400 text-sm">{selected.description}</p>
          </div>

          {/* Endpoints */}
          <div className="border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h3 className="text-white font-semibold text-sm">Endpoints ({selected.endpoints.length})</h3>
            </div>
            <div className="divide-y divide-zinc-800/50">
              {selected.endpoints.map((ep) => (
                <div key={ep.name} className="px-5 py-4">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-blue-400 font-mono text-sm">{ep.name}</span>
                    <span className="text-zinc-600 text-xs font-mono">{ep.method}</span>
                    <span className={`text-xs ml-auto ${TIER_COLORS[ep.requiredTier]}`}>requires {ep.requiredTier}</span>
                  </div>
                  <div className="text-zinc-500 text-xs mb-2">{ep.description}</div>
                  <div className="flex flex-wrap gap-1">
                    {ep.requiredCaps.map((cap) => (
                      <span key={cap} className="px-2 py-0.5 bg-zinc-800 rounded text-xs font-mono text-zinc-400">{cap}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Verification handled */}
          <div className="border border-zinc-800 rounded-xl p-5">
            <h3 className="text-white font-semibold text-sm mb-3">Verification Bypass</h3>
            <div className="flex flex-wrap gap-2">
              {selected.verificationHandled.map((v) => (
                <span key={v} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${BYPASS_BADGE_COLORS[v]}`}>
                  ✓ {v.replace("_", " ")}
                </span>
              ))}
            </div>
          </div>

          {/* URL patterns */}
          <div className="border border-zinc-800 rounded-xl p-5">
            <h3 className="text-white font-semibold text-sm mb-3">Auto-Detection Patterns</h3>
            <div className="flex flex-wrap gap-2">
              {selected.patterns.map((p) => (
                <span key={p} className="px-2.5 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs font-mono text-zinc-400">{p}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
