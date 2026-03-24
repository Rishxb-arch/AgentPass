export default function AdaptersPage() {
  const adapters = [
    {
      id: "web_generic", name: "Web Generic", systemId: "*", tier: "basic",
      covers: "Any website — universal fallback",
      verificationRequirements: [
        { type: "captcha", kyaScore: 70 },
        { type: "rate_limit", kyaScore: 50 },
      ],
      endpoints: ["fetch_page", "extract_structured", "submit_form", "api_call", "monitor_page"],
      multiplier: 3,
    },
    {
      id: "ecommerce_generic", name: "E-Commerce Generic", systemId: "ecommerce:*", tier: "basic",
      covers: "Any shop — Flipkart, Amazon, Myntra, Meesho...",
      verificationRequirements: [
        { type: "captcha", kyaScore: 70 },
        { type: "login", kyaScore: 60 },
        { type: "rate_limit", kyaScore: 50 },
      ],
      endpoints: ["search_products", "get_product", "get_listing", "add_to_cart", "get_cart", "get_orders"],
      multiplier: 5,
    },
    {
      id: "news_generic", name: "News Generic", systemId: "news:*", tier: "basic",
      covers: "Any news / blog / content site",
      verificationRequirements: [
        { type: "captcha", kyaScore: 70 },
        { type: "rate_limit", kyaScore: 50 },
      ],
      endpoints: ["get_article", "get_feed", "search_site", "get_sitemap"],
      multiplier: 4,
    },
    {
      id: "government_india", name: "Government India", systemId: "gov.in:*", tier: "verified",
      covers: "*.gov.in, *.nic.in, *.india.gov.in",
      verificationRequirements: [
        { type: "captcha", kyaScore: 75 },
        { type: "otp", kyaScore: 85 },
        { type: "login", kyaScore: 70 },
      ],
      endpoints: ["fetch_portal_data", "submit_portal_form", "search_registry", "download_document"],
      multiplier: 2,
    },
    {
      id: "api_generic", name: "API Generic", systemId: "api:*", tier: "basic",
      covers: "Any REST or GraphQL API",
      verificationRequirements: [
        { type: "rate_limit", kyaScore: 50 },
      ],
      endpoints: ["rest_call", "graphql_query", "discover_api", "paginate"],
      multiplier: 10,
    },
    {
      id: "social_generic", name: "Social Generic", systemId: "social:*", tier: "basic",
      covers: "Social platforms, forums, communities",
      verificationRequirements: [
        { type: "captcha", kyaScore: 70 },
        { type: "login", kyaScore: 65 },
      ],
      endpoints: ["get_post", "get_profile", "get_feed", "search"],
      multiplier: 3,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <div className="mb-12">
        <div className="text-blue-500 text-xs font-medium mb-3 uppercase tracking-widest">Adapters</div>
        <h1 className="text-4xl font-bold text-white mb-4">Web Adapters</h1>
        <p className="text-zinc-400 text-lg">Six generic adapters translate the human web into agent-native JSON. Auto-detected from URL.</p>
      </div>

      <section className="mb-12">
        <h2 className="text-xl font-bold text-white mb-4">What Adapters Are</h2>
        <p className="text-zinc-400 leading-relaxed mb-4">An adapter is a <strong className="text-white">protocol translator</strong>, not a scraper. It translates any human-web interface into an agent-native interface. Input: structured JSON intent. Output: structured JSON data. The adapter handles HTTP, HTML parsing, auth flows, session management, pagination, rate limits — all invisible to the agent.</p>
        <p className="text-zinc-400 leading-relaxed">The agent never knows it talked to a legacy system. It makes a clean call, gets clean data back.</p>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-bold text-white mb-6">Auto-Detection</h2>
        <pre><code className="text-zinc-300">{`// Auto-detects adapter from URL — no configuration needed
const adapter = ap.autoDetect("https://www.flipkart.com");
// → EcommerceGenericAdapter

const adapter2 = ap.autoDetect("https://mca.gov.in/search");
// → GovernmentIndiaAdapter

// Or use the hero API — auto-detection is built in
const products = await ap.search({
  passport, kyaProfile,
  url: "https://www.flipkart.com",
  query: "headphones",
});`}</code></pre>
      </section>

      <section className="space-y-6">
        <h2 className="text-xl font-bold text-white mb-4">Built-in Adapters</h2>
        {adapters.map((adapter) => (
          <div key={adapter.id} className="border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 bg-zinc-900/50 flex items-center justify-between">
              <div>
                <span className="text-white font-semibold">{adapter.name}</span>
                <span className="ml-3 text-zinc-500 text-sm font-mono">{adapter.systemId}</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs ${adapter.tier === "verified" ? "bg-blue-500/20 text-blue-400" : "bg-zinc-800 text-zinc-400"}`}>
                {adapter.tier}
              </span>
            </div>
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-zinc-500 text-xs mb-2 uppercase tracking-wide">Covers</div>
                <div className="text-zinc-300">{adapter.covers}</div>
              </div>
              <div>
                <div className="text-zinc-500 text-xs mb-2 uppercase tracking-wide">Verification Bypassed</div>
                <div className="space-y-1">
                  {adapter.verificationRequirements.map((vr) => (
                    <div key={vr.type} className="text-green-400 text-xs">
                      {vr.type} <span className="text-zinc-600">(KYA &gt;= {vr.kyaScore})</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-zinc-500 text-xs mb-2 uppercase tracking-wide">Rate Limit Multiplier</div>
                <div className="text-white font-bold text-lg">{adapter.multiplier}x</div>
                <div className="text-zinc-600 text-xs">vs anonymous actors</div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-zinc-800/50 flex flex-wrap gap-2">
              {adapter.endpoints.map((ep) => (
                <span key={ep} className="px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded text-xs font-mono">{ep}</span>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-bold text-white mb-4">Custom Adapters</h2>
        <p className="text-zinc-400 mb-4">Extend <code>BaseAdapter</code> to support any system:</p>
        <pre><code className="text-zinc-300">{`import { BaseAdapter } from "@agentpass/adapters";

class MyCustomAdapter extends BaseAdapter {
  readonly manifest = {
    adapterId: "adapter_my_system",
    systemId: "mysystem.example.com",
    systemName: "My System",
    version: "1.0.0",
    systemType: "api",
    requiredCapabilities: ["api:read"],
    requiredTier: "basic",
    agentPassAware: true,  // if your system reads X-AgentPass-* headers
    verificationRequirements: [],
    rateLimits: { requestsPerMinute: 60, requestsPerHour: 1000, agentPassVerifiedMultiplier: 5 },
    outputSchema: {},
    systemPatterns: ["mysystem.example.com"],
    endpoints: [/* ... */],
  };

  async execute(endpointId, input, passport, kyaProfile) {
    // Always inject AgentPass headers
    const headers = this.buildRequestHeaders(passport, kyaProfile);
    const response = await fetch(input.url, { headers });

    // Handle verification challenges using agent credentials
    if (!response.ok) {
      const challenge = this.handleVerificationChallenge(
        response.status, await response.text(),
        Object.fromEntries(response.headers), passport, kyaProfile
      );
      if (!challenge.resolved) {
        return { success: false, errorCode: challenge.errorCode, auditEntry: /* ... */ };
      }
    }
    // ... return normalized data
  }
}

// Register
ap.useAdapter(new MyCustomAdapter());`}</code></pre>
      </section>
    </div>
  );
}
