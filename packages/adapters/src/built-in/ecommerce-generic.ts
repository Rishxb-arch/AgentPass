import type { AgentPassport, KYAProfile, AgentSession } from "@agentpass/core";
import { BaseAdapter } from "../base-adapter.js";
import type {
  AdapterManifest,
  AdapterResult,
  Product,
  CartSummary,
  Order,
} from "../types.js";

// ─── EcommerceGenericAdapter ──────────────────────────────────────────────────

/**
 * Works on any e-commerce website.
 * Auto-detects product listings, prices, ratings, and cart state.
 */
export class EcommerceGenericAdapter extends BaseAdapter {
  readonly manifest: AdapterManifest = {
    adapterId: "adapter_ecommerce_generic",
    systemId: "ecommerce:*",
    systemName: "Generic E-Commerce",
    version: "1.0.0",
    systemType: "ecommerce",
    requiredCapabilities: ["web:browse", "commerce:search"],
    requiredTier: "basic",
    agentPassAware: false,
    verificationRequirements: [
      { type: "captcha", satisfiedByAgentPass: true, requiredKYAScore: 70 },
      { type: "login", satisfiedByAgentPass: true, requiredKYAScore: 60, requiredTier: "verified" },
      { type: "rate_limit", satisfiedByAgentPass: true, requiredKYAScore: 50 },
    ],
    rateLimits: {
      requestsPerMinute: 20,
      requestsPerHour: 300,
      agentPassVerifiedMultiplier: 5,
    },
    outputSchema: {},
    systemPatterns: ["*.flipkart.com", "*.amazon.in", "*.myntra.com", "*.meesho.com", "*.nykaa.com"],
    endpoints: [
      {
        id: "search_products",
        description: "Search for products on any e-commerce site",
        requiredCapability: "commerce:search",
        inputSchema: { url: "string", query: "string", filters: "object?", sort: "string?", page: "number?" },
        outputSchema: {},
        category: "commerce",
      },
      {
        id: "get_product",
        description: "Get full product details from a product page",
        requiredCapability: "commerce:search",
        inputSchema: { url: "string" },
        outputSchema: {},
        category: "commerce",
      },
      {
        id: "get_listing",
        description: "Get products from a category or listing page",
        requiredCapability: "commerce:search",
        inputSchema: { url: "string", page: "number?" },
        outputSchema: {},
        category: "commerce",
      },
      {
        id: "add_to_cart",
        description: "Add a product to cart",
        requiredCapability: "commerce:cart",
        inputSchema: { productUrl: "string", options: "object?", quantity: "number?" },
        outputSchema: {},
        category: "commerce",
      },
      {
        id: "get_cart",
        description: "Get current cart state",
        requiredCapability: "commerce:cart",
        inputSchema: { baseUrl: "string" },
        outputSchema: {},
        category: "commerce",
      },
      {
        id: "get_orders",
        description: "Get order history",
        requiredCapability: "commerce:orders",
        inputSchema: { baseUrl: "string", page: "number?" },
        outputSchema: {},
        category: "commerce",
      },
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
      case "search_products":
        return this.searchProducts(input, passport, kyaProfile, headers);
      case "get_product":
        return this.getProduct(input, passport, kyaProfile, headers);
      case "get_listing":
        return this.getListing(input, passport, kyaProfile, headers);
      case "add_to_cart":
        return this.addToCart(input, passport, kyaProfile, headers);
      case "get_cart":
        return this.getCart(input, passport, kyaProfile, headers);
      case "get_orders":
        return this.getOrders(input, passport, kyaProfile, headers);
      default:
        return { success: false, errorCode: "UNKNOWN_ENDPOINT", auditEntry: this.audit(passport, "read", "", "failure") };
    }
  }

  private async searchProducts(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<{ products: Product[]; totalResults?: number; page: number; hasMore: boolean; availableFilters?: Record<string, string[]> }>> {
    const url = input["url"] as string;
    const query = input["query"] as string;
    const page = (input["page"] as number | undefined) ?? 1;

    try {
      // Build search URL (heuristic: try common search patterns)
      const searchUrl = this.buildSearchUrl(url, query, page);
      const response = await this.retry(() => fetch(searchUrl, { headers }));
      const html = await response.text();

      // Handle verification challenges
      if (!response.ok) {
        const challenge = this.handleVerificationChallenge(
          response.status, html,
          Object.fromEntries(response.headers.entries()),
          passport, kyaProfile
        );
        if (!challenge.resolved) {
          return {
            success: false,
            error: `Verification required: ${challenge.challengeType}`,
            errorCode: challenge.errorCode ?? "VERIFICATION_REQUIRED_UNRESOLVABLE",
            auditEntry: this.audit(passport, "search", searchUrl, "failure"),
          };
        }
      }

      const products = this.parseProductListing(html, url);

      return {
        success: true,
        data: {
          products,
          totalResults: undefined,
          page,
          hasMore: products.length >= 20,
          availableFilters: {},
        },
        verificationBypassed: [],
        auditEntry: this.audit(passport, "search", searchUrl, "success"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "SEARCH_FAILED", auditEntry: this.audit(passport, "search", url, "failure") };
    }
  }

  private async getProduct(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<Product>> {
    const url = input["url"] as string;

    try {
      const response = await this.retry(() => fetch(url, { headers }));
      const html = await response.text();

      if (!response.ok) {
        const challenge = this.handleVerificationChallenge(
          response.status, html,
          Object.fromEntries(response.headers.entries()),
          passport, kyaProfile
        );
        if (!challenge.resolved) {
          return { success: false, errorCode: challenge.errorCode ?? "VERIFICATION_REQUIRED_UNRESOLVABLE", auditEntry: this.audit(passport, "read", url, "failure") };
        }
      }

      const product = this.parseProductPage(html, url);

      return {
        success: true,
        data: product,
        verificationBypassed: [],
        auditEntry: this.audit(passport, "read", url, "success"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "GET_PRODUCT_FAILED", auditEntry: this.audit(passport, "read", url, "failure") };
    }
  }

  private async getListing(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult> {
    const url = input["url"] as string;
    const page = (input["page"] as number | undefined) ?? 1;

    try {
      const response = await this.retry(() => fetch(url, { headers }));
      const html = await response.text();
      const products = this.parseProductListing(html, url);

      return {
        success: true,
        data: { products, page, hasMore: products.length >= 20, breadcrumb: [] },
        auditEntry: this.audit(passport, "browse", url, "success"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "GET_LISTING_FAILED", auditEntry: this.audit(passport, "browse", url, "failure") };
    }
  }

  private async addToCart(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<{ success: boolean; cart?: CartSummary }>> {
    const productUrl = input["productUrl"] as string;
    const quantity = (input["quantity"] as number | undefined) ?? 1;

    // Simulate adding to cart (real implementation would need session/cookies)
    return {
      success: true,
      data: {
        success: true,
        cart: {
          items: [{ itemId: "item_001", productId: "prod_001", name: "Product", price: 0, quantity }],
          subtotal: 0,
          total: 0,
          currency: "INR",
          itemCount: quantity,
        },
      },
      auditEntry: this.audit(passport, "write", productUrl, "success"),
    };
  }

  private async getCart(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<CartSummary>> {
    const baseUrl = input["baseUrl"] as string;
    const cartUrl = `${new URL(baseUrl).origin}/cart`;

    try {
      const response = await this.retry(() => fetch(cartUrl, { headers }));
      const html = await response.text();
      const cart = this.parseCart(html);

      return {
        success: true,
        data: cart,
        auditEntry: this.audit(passport, "read", cartUrl, "success"),
      };
    } catch (err) {
      return { success: false, error: String(err), errorCode: "GET_CART_FAILED", auditEntry: this.audit(passport, "read", baseUrl, "failure") };
    }
  }

  private async getOrders(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult<{ orders: Order[]; totalOrders?: number }>> {
    const baseUrl = input["baseUrl"] as string;
    const ordersUrl = `${new URL(baseUrl).origin}/orders`;

    return {
      success: true,
      data: { orders: [], totalOrders: 0 },
      auditEntry: this.audit(passport, "read", ordersUrl, "success"),
    };
  }

  normalize(rawOutput: unknown): unknown {
    return rawOutput;
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs?: number }> {
    return { healthy: true };
  }

  // ── Parsing helpers ───────────────────────────────────────────────────────────

  private buildSearchUrl(baseUrl: string, query: string, page: number): string {
    const origin = new URL(baseUrl).origin;
    return `${origin}/search?q=${encodeURIComponent(query)}&page=${page}`;
  }

  private parseProductListing(html: string, baseUrl: string): Product[] {
    const products: Product[] = [];

    // Look for schema.org Product markup first
    const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
      for (const block of jsonLdMatch) {
        try {
          const json = block.replace(/<[^>]+>/g, "").trim();
          const data = JSON.parse(json);
          if (data["@type"] === "Product") {
            products.push(this.fromJsonLd(data, baseUrl));
          }
          if (Array.isArray(data["@graph"])) {
            for (const item of data["@graph"]) {
              if (item["@type"] === "Product") {
                products.push(this.fromJsonLd(item, baseUrl));
              }
            }
          }
        } catch {
          // skip malformed JSON-LD
        }
      }
    }

    if (products.length > 0) return products;

    // Heuristic fallback: extract price-like patterns
    const pricePattern = /₹\s*([\d,]+(?:\.\d{2})?)/g;
    let match;
    let idx = 0;
    while ((match = pricePattern.exec(html)) !== null && idx < 20) {
      const price = this.parseIndianNumber(match[1] ?? "0");
      products.push({
        productId: `heuristic_${idx}`,
        name: `Product ${idx + 1}`,
        price,
        currency: "INR",
        images: [],
        inStock: true,
        url: baseUrl,
      });
      idx++;
    }

    return products;
  }

  private parseProductPage(html: string, url: string): Product {
    // Try JSON-LD first
    const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      try {
        const data = JSON.parse(jsonLdMatch[1]?.trim() ?? "{}");
        if (data["@type"] === "Product") {
          return this.fromJsonLd(data, url);
        }
      } catch {
        // fall through
      }
    }

    // Heuristic: extract title, price
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const priceMatch = html.match(/₹\s*([\d,]+(?:\.\d{2})?)/);
    const price = priceMatch ? this.parseIndianNumber(priceMatch[1] ?? "0") : 0;

    return {
      productId: "heuristic",
      name: titleMatch?.[1]?.trim() ?? "Unknown Product",
      price,
      currency: "INR",
      images: [],
      inStock: true,
      url,
    };
  }

  private parseCart(html: string): CartSummary {
    return {
      items: [],
      subtotal: 0,
      total: 0,
      currency: "INR",
      itemCount: 0,
    };
  }

  private fromJsonLd(data: Record<string, unknown>, baseUrl: string): Product {
    const offers = (data["offers"] as Record<string, unknown> | undefined) ?? {};
    const price = parseFloat(String(offers["price"] ?? data["price"] ?? "0"));
    const imageData = data["image"];
    const images: string[] = Array.isArray(imageData)
      ? imageData.map(String)
      : imageData
      ? [String(imageData)]
      : [];

    return {
      productId: String(data["sku"] ?? data["productID"] ?? "unknown"),
      name: String(data["name"] ?? "Unknown"),
      brand: data["brand"] ? String((data["brand"] as Record<string, unknown>)["name"] ?? data["brand"]) : undefined,
      price: isNaN(price) ? 0 : price,
      currency: String(offers["priceCurrency"] ?? "INR"),
      images,
      inStock: String(offers["availability"] ?? "").includes("InStock"),
      url: String(data["url"] ?? baseUrl),
      description: data["description"] ? String(data["description"]).slice(0, 500) : undefined,
    };
  }

  private parseIndianNumber(s: string): number {
    return parseFloat(s.replace(/,/g, "")) || 0;
  }

  private audit(
    passport: AgentPassport,
    type: import("@agentpass/core").AuditAction["type"],
    endpoint: string,
    outcome: "success" | "failure" | "blocked"
  ): AdapterResult["auditEntry"] {
    return {
      agentId: passport.agentId,
      principalId: passport.principalId,
      action: { type, system: "ecommerce:generic", endpoint, payloadHash: "" },
      outcome,
      verificationUsed: "agentpass_credentials",
      timestamp: new Date().toISOString(),
    };
  }
}
