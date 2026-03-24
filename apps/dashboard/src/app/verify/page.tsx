"use client";
import { useState } from "react";

interface VerifyResult {
  valid: boolean;
  reason?: string;
  agentId?: string;
  principalId?: string;
  name?: string;
  tier?: string;
  kyaScore?: number | null;
  expiresAt?: string | null;
  error?: string;
}

export default function VerifyPage() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function verify() {
    if (!token.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/passport/verify?token=${encodeURIComponent(token.trim())}`);
      const data = (await res.json()) as VerifyResult;
      setResult(data);
    } catch (err) {
      setResult({ valid: false, reason: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Verify Token</h1>
        <p className="text-zinc-500 text-sm">
          Verify a passport token against the central trust anchor — checks cryptographic signature, expiry, and revocation status
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-zinc-400 text-xs mb-2 uppercase tracking-wide">Passport Token</label>
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          rows={4}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-300 text-xs font-mono focus:outline-none focus:border-blue-500 resize-none mb-3"
          placeholder="agentpass.xxx.yyy"
        />
        <button
          onClick={() => void verify()}
          disabled={loading || !token.trim()}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? "Verifying…" : "Verify"}
        </button>
      </div>

      {result && (
        <div className="space-y-4">
          {/* Status banner */}
          <div className={`flex items-center gap-4 p-5 rounded-xl border ${
            result.valid
              ? "border-green-500/30 bg-green-500/5"
              : "border-red-500/30 bg-red-500/5"
          }`}>
            <span className={`text-3xl ${result.valid ? "text-green-400" : "text-red-400"}`}>
              {result.valid ? "✓" : "✗"}
            </span>
            <div>
              <div className={`font-bold text-lg ${result.valid ? "text-green-300" : "text-red-300"}`}>
                {result.valid ? "Valid Passport" : "Invalid Passport"}
              </div>
              {result.reason && (
                <div className="text-zinc-400 text-sm">{result.reason}</div>
              )}
              {result.error && (
                <div className="text-red-400 text-sm">{result.error}</div>
              )}
            </div>
          </div>

          {/* Details when valid */}
          {result.valid && result.agentId && (
            <div className="border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800">
                <h2 className="text-white font-semibold text-sm">Passport Details (from DB)</h2>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {[
                  { label: "Agent ID", value: result.agentId, mono: true },
                  { label: "Name", value: result.name ?? "—", mono: false },
                  { label: "Principal ID", value: result.principalId ?? "—", mono: true },
                  { label: "Tier", value: result.tier ?? "—", mono: true, badge: true },
                  { label: "KYA Score", value: result.kyaScore != null ? String(result.kyaScore) : "—", mono: true },
                  {
                    label: "Expires",
                    value: result.expiresAt ? new Date(result.expiresAt).toLocaleString() : "Never",
                    mono: false,
                  },
                ].map((row) => (
                  <div key={row.label} className="flex px-5 py-3">
                    <div className="text-zinc-600 text-xs w-32 shrink-0">{row.label}</div>
                    {row.badge ? (
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-mono">{row.value}</span>
                    ) : (
                      <div className={`text-xs ${row.mono ? "font-mono text-zinc-400" : "text-zinc-300"}`}>{row.value}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Verification steps (always shown) */}
          <div className="border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h2 className="text-white font-semibold text-sm">Verification Chain</h2>
            </div>
            <div className="divide-y divide-zinc-800/50 text-xs">
              {[
                { step: "Token format", desc: "Starts with agentpass. prefix", ok: token.startsWith("agentpass.") },
                { step: "Cryptographic signature", desc: "HMAC-SHA256 verified against secret", ok: result.valid || (result.reason !== "Invalid signature" && !result.reason?.includes("signature")) },
                { step: "Expiry check", desc: "Token not expired", ok: result.valid || !result.reason?.includes("expired") },
                { step: "Revocation check", desc: "Not revoked in database", ok: result.valid || !result.reason?.includes("revoked") },
              ].map((check) => (
                <div key={check.step} className="flex items-center gap-4 px-5 py-3">
                  <span className={check.ok ? "text-green-400" : "text-red-400"}>{check.ok ? "✓" : "✗"}</span>
                  <div>
                    <div className={check.ok ? "text-zinc-300" : "text-zinc-500"}>{check.step}</div>
                    <div className="text-zinc-600">{check.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
