import type { AgentCapability } from "@agentpass/core";
import type { BaseAdapter } from "./base-adapter.js";
import type { AdapterManifest, SystemType } from "./types.js";

// ─── Registry ─────────────────────────────────────────────────────────────────

export class AdapterRegistry {
  private adapters = new Map<string, BaseAdapter>();

  /** Register an adapter. Keyed by systemId. */
  register(adapter: BaseAdapter): void {
    this.adapters.set(adapter.manifest.systemId, adapter);
  }

  /** Unregister an adapter by adapterId. */
  unregister(adapterId: string): void {
    for (const [key, adapter] of this.adapters.entries()) {
      if (adapter.manifest.adapterId === adapterId) {
        this.adapters.delete(key);
        return;
      }
    }
  }

  /** Get an adapter by systemId, also matching against systemPatterns. */
  get(systemId: string): BaseAdapter | null {
    // Exact match
    if (this.adapters.has(systemId)) {
      return this.adapters.get(systemId) ?? null;
    }

    // Pattern match
    for (const adapter of this.adapters.values()) {
      for (const pattern of adapter.manifest.systemPatterns) {
        if (pattern === "*") continue; // skip wildcard here
        if (this.matchPattern(pattern, systemId)) {
          return adapter;
        }
      }
    }

    return null;
  }

  /** List all registered adapter manifests. */
  list(): AdapterManifest[] {
    return Array.from(this.adapters.values()).map((a) => a.manifest);
  }

  /** Find adapters that provide all the given capabilities. */
  findByCapabilities(capabilities: AgentCapability[]): BaseAdapter[] {
    return Array.from(this.adapters.values()).filter((adapter) =>
      capabilities.every((cap) =>
        adapter.manifest.requiredCapabilities.includes(cap)
      )
    );
  }

  /** Find adapters by system type. */
  findBySystemType(type: SystemType): BaseAdapter[] {
    return Array.from(this.adapters.values()).filter(
      (adapter) => adapter.manifest.systemType === type
    );
  }

  /**
   * Auto-detect the best adapter for a given URL.
   * Priority: exact systemId > pattern match > heuristic > wildcard fallback
   */
  autoDetect(url: string): BaseAdapter | null {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;

      // 1. Exact systemId match
      const exact = this.get(hostname);
      if (exact && exact.manifest.systemId !== "*") return exact;

      // 2. Pattern match against systemPatterns
      for (const adapter of this.adapters.values()) {
        if (adapter.manifest.systemId === "*") continue;
        for (const pattern of adapter.manifest.systemPatterns) {
          if (pattern === "*") continue;
          if (this.matchPattern(pattern, hostname)) return adapter;
        }
      }

      // 3. Heuristic detection by URL patterns
      const heuristic = this.detectByHeuristic(url, hostname);
      if (heuristic) return heuristic;

      // 4. Wildcard fallback (WebGenericAdapter with systemId "*")
      return this.adapters.get("*") ?? null;
    } catch {
      return this.adapters.get("*") ?? null;
    }
  }

  private detectByHeuristic(url: string, hostname: string): BaseAdapter | null {
    const lower = url.toLowerCase();
    const host = hostname.toLowerCase();

    // Government India
    if (host.endsWith(".gov.in") || host.endsWith(".nic.in") || host.endsWith(".india.gov.in")) {
      return this.findBySystemType("government")[0] ?? null;
    }

    // E-commerce heuristics
    const ecommerceKeywords = [
      "shop",
      "store",
      "cart",
      "product",
      "buy",
      "flipkart",
      "amazon",
      "myntra",
      "meesho",
      "nykaa",
    ];
    if (ecommerceKeywords.some((k) => host.includes(k) || lower.includes(k))) {
      return this.findBySystemType("ecommerce")[0] ?? null;
    }

    // News heuristics
    const newsKeywords = ["news", "blog", "article", "post", "times", "herald", "tribune", "express"];
    if (newsKeywords.some((k) => host.includes(k) || lower.includes(k))) {
      return this.findBySystemType("news")[0] ?? null;
    }

    // Social heuristics
    const socialKeywords = ["reddit", "twitter", "x.com", "facebook", "instagram", "linkedin", "forum", "community"];
    if (socialKeywords.some((k) => host.includes(k))) {
      return this.findBySystemType("social")[0] ?? null;
    }

    // API heuristics
    if (lower.includes("/api/") || lower.includes("/v1/") || lower.includes("/v2/") || lower.includes("/graphql")) {
      return this.findBySystemType("api")[0] ?? null;
    }

    return null;
  }

  private matchPattern(pattern: string, value: string): boolean {
    if (!pattern.includes("*")) {
      return pattern === value;
    }
    // Convert glob to regex
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const regexStr = "^" + escaped.replace(/\*/g, ".*") + "$";
    return new RegExp(regexStr).test(value);
  }
}

/** Singleton registry — auto-populated with built-in adapters in sdk */
export const registry = new AdapterRegistry();
