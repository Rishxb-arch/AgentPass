"use client";
import { useState } from "react";

// Only expose capabilities that @agentpass/core actually knows about
const ALL_CAPABILITIES = [
  { group: "Web", caps: ["web:read", "web:write", "web:forms", "web:auth", "web:browse"] },
  { group: "API", caps: ["api:read", "api:write"] },
  { group: "Commerce", caps: ["commerce:search", "commerce:cart", "commerce:checkout", "commerce:orders"] },
  { group: "Payments", caps: ["payments:initiate", "payments:read"] },
  { group: "Data", caps: ["data:extract", "data:monitor"] },
  { group: "Files", caps: ["files:read", "files:write"] },
  { group: "Identity", caps: ["identity:delegate", "identity:verify"] },
];

const TIERS = ["basic", "verified", "trusted", "sovereign"] as const;

interface EnrollResult {
  agent: {
    id: string;
    principalId: string;
    name: string;
    tier: string;
    capabilities: string[];
    fingerprint: string;
    createdAt: string;
  };
  token: string;
  passport: {
    agentId: string;
    tier: string;
    capabilities: string[];
    issuedAt: string;
    expiresAt: string | null;
    fingerprint: string;
  };
  kyaProfile: {
    trustScore: number;
    riskScore: number;
    status: string;
    verificationReplacement: {
      replacesCaptcha: boolean;
      replacesOTP: boolean;
      replacesLoginWall: boolean;
      replacesRateLimit: boolean;
      replacesEmailVerification: boolean;
    };
    classification: { type: string; confidence: number };
  };
  error?: string;
}

export default function IssuePage() {
  const [principalId, setPrincipalId] = useState("user_acme_123");
  const [principalName, setPrincipalName] = useState("");
  const [name, setName] = useState("Acme Commerce Agent");
  const [tier, setTier] = useState<(typeof TIERS)[number]>("verified");
  const [selectedCaps, setSelectedCaps] = useState<string[]>(["web:read", "commerce:search", "commerce:cart"]);
  const [expiresHours, setExpiresHours] = useState(8760);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EnrollResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"passport" | "token" | "kya">("passport");

  function toggleCap(cap: string) {
    setSelectedCaps((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  }

  async function issue() {
    if (!principalId || !name || selectedCaps.length === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          principalId,
          principalName: principalName || principalId,
          name,
          tier,
          capabilities: selectedCaps,
          expiresInHours: expiresHours,
        }),
      });

      const data = (await res.json()) as EnrollResult;
      if (!res.ok) {
        setError((data.error as string | undefined) ?? `Server error ${res.status}`);
      } else {
        setResult(data);
        setActiveTab("passport");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Issue Passport</h1>
        <p className="text-zinc-500 text-sm">Enroll a new agent and issue a cryptographically signed AgentPass passport (persisted to Postgres)</p>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Form */}
        <div className="space-y-5">
          <div>
            <label className="block text-zinc-400 text-xs mb-2 uppercase tracking-wide">Principal ID</label>
            <input
              value={principalId}
              onChange={(e) => setPrincipalId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-300 text-sm font-mono focus:outline-none focus:border-blue-500"
              placeholder="user_acme_123"
            />
          </div>

          <div>
            <label className="block text-zinc-400 text-xs mb-2 uppercase tracking-wide">Principal Name <span className="text-zinc-600 normal-case">(optional)</span></label>
            <input
              value={principalName}
              onChange={(e) => setPrincipalName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-300 text-sm focus:outline-none focus:border-blue-500"
              placeholder="Acme Corp"
            />
          </div>

          <div>
            <label className="block text-zinc-400 text-xs mb-2 uppercase tracking-wide">Agent Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-300 text-sm focus:outline-none focus:border-blue-500"
              placeholder="My Commerce Agent"
            />
          </div>

          <div>
            <label className="block text-zinc-400 text-xs mb-2 uppercase tracking-wide">Tier</label>
            <div className="grid grid-cols-4 gap-2">
              {TIERS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTier(t)}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                    tier === t
                      ? "border-blue-500 bg-blue-500/20 text-blue-300"
                      : "border-zinc-700 text-zinc-500 hover:border-zinc-600"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 text-xs mb-2 uppercase tracking-wide">
              Capabilities <span className="text-zinc-600 normal-case">({selectedCaps.length} selected)</span>
            </label>
            <div className="space-y-3">
              {ALL_CAPABILITIES.map((group) => (
                <div key={group.group}>
                  <div className="text-zinc-600 text-xs mb-1.5">{group.group}</div>
                  <div className="flex flex-wrap gap-2">
                    {group.caps.map((cap) => (
                      <button
                        key={cap}
                        onClick={() => toggleCap(cap)}
                        className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
                          selectedCaps.includes(cap)
                            ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                            : "border-zinc-800 text-zinc-600 hover:border-zinc-700"
                        }`}
                      >
                        {cap}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 text-xs mb-2 uppercase tracking-wide">Expires In (hours)</label>
            <input
              type="number"
              value={expiresHours}
              onChange={(e) => setExpiresHours(Number(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-300 text-sm font-mono focus:outline-none focus:border-blue-500"
            />
            <div className="text-zinc-600 text-xs mt-1">
              {expiresHours >= 8760 ? `~${Math.round(expiresHours / 8760)}yr` : expiresHours >= 720 ? `~${Math.round(expiresHours / 720)}mo` : expiresHours >= 24 ? `~${Math.round(expiresHours / 24)}d` : `${expiresHours}h`}
            </div>
          </div>

          <button
            onClick={issue}
            disabled={loading || !principalId || !name || selectedCaps.length === 0}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? "Issuing…" : "Issue Passport"}
          </button>

          {error && (
            <div className="p-3 border border-red-500/30 bg-red-500/5 rounded-lg text-red-400 text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Output */}
        <div>
          {result ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                {(["passport", "token", "kya"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      activeTab === tab ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-400"
                    }`}
                  >
                    {tab === "passport" ? "Passport JSON" : tab === "token" ? "Token" : "KYA Profile"}
                  </button>
                ))}
              </div>

              {/* Agent ID banner */}
              <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg">
                <div className="text-zinc-500 text-xs mb-1">Agent ID (persisted to DB)</div>
                <div className="text-green-400 text-xs font-mono">{result.agent.id}</div>
              </div>

              {activeTab === "passport" && (
                <pre className="text-xs text-green-300 overflow-auto max-h-[500px]">
                  {JSON.stringify(result.passport, null, 2)}
                </pre>
              )}
              {activeTab === "token" && (
                <div className="space-y-3">
                  <div className="p-4 bg-zinc-900 border border-zinc-700 rounded-lg">
                    <div className="text-zinc-500 text-xs mb-2">Serialized Token (X-AgentPass-Passport value)</div>
                    <div className="text-blue-400 text-xs font-mono break-all">{result.token}</div>
                  </div>
                  <div className="p-4 bg-zinc-900 border border-zinc-700 rounded-lg">
                    <div className="text-zinc-500 text-xs mb-2">Copy to clipboard</div>
                    <button
                      onClick={() => navigator.clipboard.writeText(result.token)}
                      className="px-3 py-1.5 border border-zinc-700 text-zinc-400 hover:text-zinc-300 rounded text-xs transition-colors"
                    >
                      Copy token
                    </button>
                  </div>
                </div>
              )}
              {activeTab === "kya" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg">
                      <div className="text-zinc-500 text-xs mb-1">Trust Score</div>
                      <div className="text-2xl font-bold text-green-400">{result.kyaProfile.trustScore}</div>
                    </div>
                    <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg">
                      <div className="text-zinc-500 text-xs mb-1">Risk Score</div>
                      <div className="text-2xl font-bold text-blue-400">{result.kyaProfile.riskScore}</div>
                    </div>
                    <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg">
                      <div className="text-zinc-500 text-xs mb-1">Status</div>
                      <div className="text-sm font-medium text-white uppercase">{result.kyaProfile.status}</div>
                    </div>
                  </div>
                  <pre className="text-xs text-blue-300 overflow-auto max-h-[300px]">
                    {JSON.stringify(result.kyaProfile, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center border border-dashed border-zinc-800 rounded-xl">
              <div className="text-center">
                <div className="text-zinc-700 text-4xl mb-3">⊕</div>
                <div className="text-zinc-600 text-sm">Fill the form and issue a passport</div>
                <div className="text-zinc-700 text-xs mt-1">Passport will be persisted to Postgres</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
