"use client";
import { useState, useEffect } from "react";

interface DelegationToken {
  tokenId: string;
  agentId: string;
  grantorId: string;
  scope: {
    capabilities: string[];
    systems: string[];
    maxActions: number | null;
    allowedHours: number[] | null;
  };
  usageCount: number;
  active: boolean;
  singleUse: boolean;
  issuedAt: string;
  expiresAt: string;
  signature: string;
}

function timeLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms < 0) return "expired";
  const h = Math.floor(ms / 3600000);
  if (h > 24) return `${Math.floor(h / 24)}d`;
  return `${h}h`;
}

const CAP_OPTIONS = [
  "web:read", "web:write", "web:forms", "web:browse",
  "api:read", "api:write",
  "commerce:search", "commerce:cart", "commerce:checkout",
  "data:extract", "data:monitor",
];

export default function DelegationPage() {
  const [tokens, setTokens] = useState<DelegationToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [agentId, setAgentId] = useState("");
  const [grantorId, setGrantorId] = useState("");
  const [caps, setCaps] = useState<string[]>(["web:read"]);
  const [systems, setSystems] = useState("*");
  const [maxActions, setMaxActions] = useState(100);
  const [singleUse, setSingleUse] = useState(false);
  const [expiresHours, setExpiresHours] = useState(24);

  async function loadTokens() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/delegation");
      const data = (await res.json()) as { tokens: DelegationToken[]; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? `Failed to load (${res.status})`);
        return;
      }
      setTokens(data.tokens ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTokens(); }, []);

  async function issue() {
    if (!agentId || !grantorId || caps.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/delegation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          grantorId,
          capabilities: caps,
          systems: systems.split(",").map((s) => s.trim()).filter(Boolean),
          maxActions: maxActions || null,
          expiresInHours: expiresHours,
          singleUse,
        }),
      });
      const data = (await res.json()) as { token?: DelegationToken; error?: string };

      if (!res.ok || data.error) {
        setError(data.error ?? `Failed to issue (${res.status})`);
        return;
      }

      setShowForm(false);
      // Reload the list
      await loadTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(tokenId: string) {
    try {
      const res = await fetch(`/api/delegation/${encodeURIComponent(tokenId)}/revoke`, {
        method: "POST",
      });
      if (res.ok) {
        setTokens((prev) => prev.map((t) => t.tokenId === tokenId ? { ...t, active: false } : t));
      }
    } catch {
      // non-fatal
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Delegation</h1>
          <p className="text-zinc-500 text-sm">Issue scoped delegation tokens — sub-agents can only act within the granted scope</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(null); }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {showForm ? "Cancel" : "+ New Token"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 border border-red-500/30 bg-red-500/5 rounded-lg text-red-400 text-xs">
          {error}
        </div>
      )}

      {showForm && (
        <div className="mb-8 border border-zinc-800 rounded-xl p-6 space-y-4">
          <h2 className="text-white font-semibold text-sm mb-4">Issue Delegation Token</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-zinc-400 text-xs mb-2 uppercase tracking-wide">Agent ID (recipient)</label>
              <input
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-300 text-sm font-mono focus:outline-none focus:border-blue-500"
                placeholder="ap_..."
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-xs mb-2 uppercase tracking-wide">Grantor ID</label>
              <input
                value={grantorId}
                onChange={(e) => setGrantorId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-300 text-sm font-mono focus:outline-none focus:border-blue-500"
                placeholder="user_..."
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 text-xs mb-2 uppercase tracking-wide">Capabilities</label>
            <div className="flex flex-wrap gap-2">
              {CAP_OPTIONS.map((cap) => (
                <button
                  key={cap}
                  onClick={() => setCaps((prev) => prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap])}
                  className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
                    caps.includes(cap) ? "border-blue-500/50 bg-blue-500/10 text-blue-400" : "border-zinc-800 text-zinc-600 hover:border-zinc-700"
                  }`}
                >
                  {cap}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-zinc-400 text-xs mb-2 uppercase tracking-wide">Systems (comma-separated)</label>
              <input
                value={systems}
                onChange={(e) => setSystems(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-300 text-sm font-mono focus:outline-none focus:border-blue-500"
                placeholder="* or shop.example.com"
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-xs mb-2 uppercase tracking-wide">Max Actions</label>
              <input
                type="number"
                value={maxActions}
                onChange={(e) => setMaxActions(Number(e.target.value))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-300 text-sm font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-xs mb-2 uppercase tracking-wide">Expires (hours)</label>
              <input
                type="number"
                value={expiresHours}
                onChange={(e) => setExpiresHours(Number(e.target.value))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-300 text-sm font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setSingleUse(!singleUse)}
              className={`w-10 h-5 rounded-full transition-colors relative ${singleUse ? "bg-blue-600" : "bg-zinc-700"}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${singleUse ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
            <span className="text-zinc-400 text-sm">Single use</span>
          </div>

          <button
            onClick={() => void issue()}
            disabled={submitting || !agentId || !grantorId || caps.length === 0}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {submitting ? "Issuing…" : "Issue Token"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="border border-dashed border-zinc-800 rounded-xl h-32 flex items-center justify-center">
          <div className="text-zinc-600 text-sm">Loading…</div>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-white font-semibold text-sm">Delegation Tokens ({tokens.length})</h2>
            <div className="text-zinc-600 text-xs">{tokens.filter((t) => t.active).length} active</div>
          </div>

          {tokens.length === 0 ? (
            <div className="h-32 flex items-center justify-center">
              <div className="text-zinc-700 text-sm">No delegation tokens yet</div>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {tokens.map((token) => (
                <div key={token.tokenId} className={`px-5 py-4 ${!token.active ? "opacity-50" : ""}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-blue-400 font-mono text-sm">{token.tokenId}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${token.active ? "bg-green-500/20 text-green-400" : "bg-zinc-800 text-zinc-500"}`}>
                          {token.active ? "active" : "revoked"}
                        </span>
                        {token.singleUse && (
                          <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">single-use</span>
                        )}
                      </div>
                      <div className="text-zinc-600 text-xs font-mono mb-2">
                        <span className="text-zinc-700">from</span> {token.grantorId} <span className="text-zinc-700">→ agent</span> {token.agentId}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {token.scope.capabilities.map((cap) => (
                          <span key={cap} className="px-2 py-0.5 bg-zinc-800 rounded text-xs font-mono text-zinc-400">{cap}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-zinc-600">
                        <span>Systems: <span className="text-zinc-500 font-mono">{token.scope.systems.join(", ")}</span></span>
                        <span>Usage: <span className="text-zinc-400">{token.usageCount}{token.scope.maxActions !== null ? `/${token.scope.maxActions}` : ""}</span></span>
                        <span>Expires: <span className="text-zinc-400">{timeLeft(token.expiresAt)}</span></span>
                      </div>
                    </div>
                    {token.active && (
                      <button
                        onClick={() => void revoke(token.tokenId)}
                        className="ml-4 px-3 py-1.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg text-xs transition-colors"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                  {token.scope.maxActions !== null && (
                    <div className="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-1 rounded-full bg-blue-500 transition-all"
                        style={{ width: `${Math.min(100, (token.usageCount / token.scope.maxActions) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
