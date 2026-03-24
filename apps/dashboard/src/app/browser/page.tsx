"use client";
import { useState } from "react";

type AdapterType = "web-generic" | "ecommerce-generic" | "news-generic" | "api-generic" | "social-generic" | "government-india";

interface BrowseResult {
  adapter: string;
  endpoint: string;
  url: string;
  success: boolean;
  error?: string;
  verificationBypassed: string | null;
  headers: Record<string, string>;
  data: unknown;
  latencyMs: number;
}

const ADAPTER_COLORS: Record<string, string> = {
  "web-generic": "bg-zinc-700 text-zinc-300",
  "ecommerce-generic": "bg-blue-500/20 text-blue-400",
  "news-generic": "bg-purple-500/20 text-purple-400",
  "api-generic": "bg-green-500/20 text-green-400",
  "social-generic": "bg-pink-500/20 text-pink-400",
  "government-india": "bg-orange-500/20 text-orange-400",
};

const BYPASS_LABELS: Record<string, string> = {
  captcha: "CAPTCHA bypassed",
  otp: "OTP bypassed",
  login_wall: "Login wall bypassed",
  rate_limit: "Rate limit bypassed",
  email_verification: "Email verification bypassed",
};

// Minimal AgentPass context — real apps would load this from auth
const DEMO_CTX = {
  agentId: "ap_a3f8b2c1d9e4f501a2b3c4d5e6f70891",
  principalId: "user_acme_123",
  tier: "verified",
  trustScore: 82,
  serializedToken: "agentpass.eyJhZ2VudElkIjoiYXBfYTNmOGIyYzFkOWU0ZjUwMWEyYjNjNGQ1ZTZmNzA4OTEiLCAicHJpbmNpcGFsSWQiOiJ1c2VyX2FjbWVfMTIzIn0.a3f8b2c1d9e4",
  capabilities: ["web:read", "web:navigate", "commerce:browse", "commerce:cart"],
};

export default function BrowserPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BrowseResult | null>(null);
  const [activeTab, setActiveTab] = useState<"data" | "headers">("data");
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);

  async function browse() {
    setLoading(true);
    setResult(null);
    const start = Date.now();

    try {
      const res = await fetch("/api/adapter?endpoint=execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ctx: DEMO_CTX, url, endpoint: "fetch_page", params: {} }),
      });

      const json = await res.json();
      setServerReachable(res.status !== 503);

      setResult({
        adapter: json.adapter ?? "web-generic",
        endpoint: json.endpoint ?? "fetch_page",
        url,
        success: json.success ?? false,
        error: json.error,
        verificationBypassed: json.verificationBypassed ?? null,
        headers: {
          "X-AgentPass-Passport": DEMO_CTX.serializedToken,
          "X-AgentPass-KYA-Score": String(DEMO_CTX.trustScore),
          "X-AgentPass-Tier": DEMO_CTX.tier,
          "X-AgentPass-Principal": DEMO_CTX.principalId,
          "X-AgentPass-Capabilities-Hash": "a3f8b2c1d9e4f501",
          "X-AgentPass-Version": "1.0",
          "X-AgentPass-Timestamp": new Date().toISOString(),
        },
        data: json.data,
        latencyMs: Date.now() - start,
      });
    } catch (err) {
      setServerReachable(false);
      setResult({
        adapter: "web-generic",
        endpoint: "fetch_page",
        url,
        success: false,
        error: err instanceof Error ? err.message : "Network error",
        verificationBypassed: null,
        headers: {},
        data: null,
        latencyMs: Date.now() - start,
      });
    } finally {
      setLoading(false);
    }
  }

  const EXAMPLE_URLS = [
    "https://news.ycombinator.com",
    "https://techcrunch.com",
    "https://reddit.com/r/programming",
    "https://api.github.com/repos/anthropics/anthropic-sdk-python",
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Live Browser</h1>
        <p className="text-zinc-500 text-sm">Execute adapter requests via the AgentPass server — auto-detects adapter, injects credentials, handles verification</p>
      </div>

      {serverReachable === false && (
        <div className="mb-6 p-4 border border-yellow-500/30 bg-yellow-500/5 rounded-xl">
          <div className="text-yellow-400 text-sm font-medium mb-1">Server not running</div>
          <div className="text-zinc-500 text-xs font-mono">Run: <span className="text-zinc-300">pnpm --filter @agentpass/server dev</span></div>
        </div>
      )}

      <div className="mb-6">
        <div className="flex gap-3">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && url && browse()}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-300 text-sm font-mono focus:outline-none focus:border-blue-500"
            placeholder="https://..."
          />
          <button
            onClick={browse}
            disabled={!url || loading}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-sm font-medium transition-colors min-w-[100px]"
          >
            {loading ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                Fetching
              </span>
            ) : "Fetch"}
          </button>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          <span className="text-zinc-600 text-xs mt-0.5">Try:</span>
          {EXAMPLE_URLS.map((u) => (
            <button key={u} onClick={() => setUrl(u)} className="text-zinc-500 hover:text-zinc-300 text-xs underline transition-colors">
              {u.replace("https://", "")}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className="space-y-4">
          {/* Meta bar */}
          <div className="flex items-center gap-4 p-4 border border-zinc-800 rounded-xl flex-wrap">
            <span className={`px-2.5 py-1 rounded text-xs font-medium ${ADAPTER_COLORS[result.adapter] ?? "bg-zinc-700 text-zinc-300"}`}>
              {result.adapter}
            </span>
            <span className="text-zinc-600 text-xs font-mono">{result.endpoint}</span>
            <span className={`text-xs font-mono ml-auto ${result.success ? "text-green-400" : "text-red-400"}`}>
              {result.success ? "✓ OK" : "✗ Error"}
            </span>
            <span className="text-zinc-600 text-xs">{result.latencyMs}ms</span>
            {result.verificationBypassed && (
              <span className="px-2.5 py-1 bg-green-500/10 border border-green-500/30 rounded text-xs text-green-400 font-medium">
                ✓ {BYPASS_LABELS[result.verificationBypassed] ?? result.verificationBypassed}
              </span>
            )}
          </div>

          {result.error && (
            <div className="p-4 border border-red-500/20 bg-red-500/5 rounded-xl text-red-400 text-sm">
              {result.error}
            </div>
          )}

          {/* Tabs */}
          <div className="border border-zinc-800 rounded-xl overflow-hidden">
            <div className="flex border-b border-zinc-800">
              {(["data", "headers"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-3 text-xs font-medium transition-colors ${
                    activeTab === tab ? "text-white border-b-2 border-blue-500" : "text-zinc-500 hover:text-zinc-400"
                  }`}
                >
                  {tab === "data" ? "Response Data" : "AgentPass Headers"}
                </button>
              ))}
            </div>
            <div className="p-5">
              {activeTab === "data" && (
                <pre className="text-xs text-green-300 overflow-auto max-h-[400px]">
                  {result.data ? JSON.stringify(result.data, null, 2) : "(no data)"}
                </pre>
              )}
              {activeTab === "headers" && (
                <div className="space-y-2">
                  {Object.entries(result.headers).map(([k, v]) => (
                    <div key={k} className="flex gap-4">
                      <span className="text-blue-400 text-xs font-mono w-64 shrink-0">{k}</span>
                      <span className="text-zinc-400 text-xs font-mono break-all">{v}</span>
                    </div>
                  ))}
                  <div className="flex gap-4">
                    <span className="text-blue-400 text-xs font-mono w-64 shrink-0">User-Agent</span>
                    <span className="text-zinc-400 text-xs font-mono">AgentPass/1.0 (Playwright; compatible)</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
