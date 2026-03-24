"use client";
import { useState } from "react";

interface KyaScore {
  trustScore: number;
  riskScore: number;
  status: string;
  classificationType: string;
  replacesCaptcha: boolean;
  replacesOtp: boolean;
  replacesLoginWall: boolean;
  replacesRateLimit: boolean;
  replacesEmailVerification: boolean;
  computedAt: string;
}

interface AgentDetail {
  agent: {
    id: string;
    principalId: string;
    name: string;
    tier: string;
    capabilities: unknown[];
    fingerprint: string;
    createdAt: string;
  };
  kya: KyaScore | null;
  passport: { token: string; issuedAt: string; expiresAt: string | null; active: boolean } | null;
  signals: Array<{
    signalType: string;
    count: number;
    windowHours: number;
    source: string | null;
    recordedAt: string;
  }>;
  error?: string;
}

interface ProfileView {
  agentId: string;
  principalId: string;
  name: string;
  tier: string;
  trustScore: number;
  riskScore: number;
  status: string;
  classificationType: string;
  replacesCaptcha: boolean;
  replacesOtp: boolean;
  replacesLoginWall: boolean;
  replacesRateLimit: boolean;
  replacesEmailVerification: boolean;
  signals: AgentDetail["signals"];
}

const vrItems: Array<{
  key: keyof Pick<ProfileView, "replacesCaptcha" | "replacesOtp" | "replacesLoginWall" | "replacesRateLimit" | "replacesEmailVerification">;
  label: string;
  threshold: string;
  required: number;
}> = [
  { key: "replacesCaptcha", label: "Replaces CAPTCHA", threshold: "trustScore >= 70", required: 70 },
  { key: "replacesOtp", label: "Replaces OTP / MFA", threshold: "tier >= verified", required: 0 },
  { key: "replacesLoginWall", label: "Replaces Login Wall", threshold: "tier >= trusted", required: 0 },
  { key: "replacesRateLimit", label: "Replaces Rate Limiting", threshold: "trustScore >= 60", required: 60 },
  { key: "replacesEmailVerification", label: "Replaces Email Verification", threshold: "principalVerified", required: 0 },
];

export default function KYAPage() {
  const [agentId, setAgentId] = useState("");
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assess() {
    if (!agentId.trim()) return;
    setLoading(true);
    setError(null);
    setProfile(null);

    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId.trim())}`);
      const data = (await res.json()) as AgentDetail;

      if (!res.ok || data.error) {
        setError(data.error ?? `Agent not found (${res.status})`);
        return;
      }

      if (!data.kya) {
        setError("No KYA score found for this agent. Submit a signal first.");
        return;
      }

      setProfile({
        agentId: data.agent.id,
        principalId: data.agent.principalId,
        name: data.agent.name,
        tier: data.agent.tier,
        trustScore: data.kya.trustScore,
        riskScore: data.kya.riskScore,
        status: data.kya.status,
        classificationType: data.kya.classificationType,
        replacesCaptcha: data.kya.replacesCaptcha,
        replacesOtp: data.kya.replacesOtp,
        replacesLoginWall: data.kya.replacesLoginWall,
        replacesRateLimit: data.kya.replacesRateLimit,
        replacesEmailVerification: data.kya.replacesEmailVerification,
        signals: data.signals,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">KYA Assessment</h1>
        <p className="text-zinc-500 text-sm">Look up an agent by ID and see its live trust profile from the database</p>
      </div>

      <div className="mb-8 flex gap-3">
        <input
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void assess(); }}
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-300 text-sm font-mono focus:outline-none focus:border-blue-500"
          placeholder="ap_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        />
        <button
          onClick={() => void assess()}
          disabled={loading || !agentId.trim()}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? "Loading…" : "Assess Agent"}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 border border-red-500/30 bg-red-500/5 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {profile && (
        <div className="space-y-6">
          {/* Agent info */}
          <div className="p-4 border border-zinc-700 bg-zinc-900 rounded-xl text-xs">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-zinc-500">Agent: <span className="text-zinc-300 font-mono">{profile.name}</span></span>
              <span className="text-zinc-500">ID: <span className="text-blue-400 font-mono">{profile.agentId}</span></span>
              <span className="text-zinc-500">Principal: <span className="text-zinc-400 font-mono">{profile.principalId}</span></span>
              <span className="px-2 py-0.5 rounded text-xs font-mono bg-blue-500/20 text-blue-400">{profile.tier}</span>
            </div>
          </div>

          {/* Score cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-zinc-800 rounded-xl p-5">
              <div className="text-zinc-500 text-xs mb-3">Trust Score</div>
              <div className="flex items-end gap-3 mb-3">
                <span className="text-4xl font-bold text-green-400">{profile.trustScore}</span>
                <span className="text-zinc-600 text-sm mb-1">/100</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2">
                <div className="h-2 rounded-full bg-green-500" style={{ width: `${profile.trustScore}%` }} />
              </div>
            </div>
            <div className="border border-zinc-800 rounded-xl p-5">
              <div className="text-zinc-500 text-xs mb-3">Risk Score</div>
              <div className="flex items-end gap-3 mb-3">
                <span className="text-4xl font-bold text-blue-400">{profile.riskScore}</span>
                <span className="text-zinc-600 text-sm mb-1">/100</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2">
                <div className="h-2 rounded-full bg-blue-500" style={{ width: `${profile.riskScore}%` }} />
              </div>
            </div>
            <div className="border border-zinc-800 rounded-xl p-5">
              <div className="text-zinc-500 text-xs mb-3">Status</div>
              <div className="mt-2">
                <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                  profile.status === "verified" ? "bg-green-500/20 text-green-400" :
                  profile.status === "pending" ? "bg-yellow-500/20 text-yellow-400" :
                  profile.status === "flagged" ? "bg-orange-500/20 text-orange-400" :
                  "bg-red-500/20 text-red-400"
                }`}>{profile.status.toUpperCase()}</span>
              </div>
              <div className="text-zinc-600 text-xs mt-3">
                {profile.classificationType} agent
              </div>
            </div>
          </div>

          {/* VERIFICATION REPLACEMENT */}
          <div className="border border-blue-500/30 bg-blue-500/5 rounded-xl p-6">
            <h2 className="text-white font-bold text-lg mb-1">Verification Replacement</h2>
            <p className="text-zinc-400 text-sm mb-6">Which human verification mechanisms this agent&apos;s credentials make unnecessary:</p>
            <div className="space-y-3">
              {vrItems.map((item) => {
                const met = profile[item.key];
                return (
                  <div key={item.key} className={`flex items-center justify-between p-4 rounded-lg border ${met ? "border-green-500/30 bg-green-500/5" : "border-zinc-700/50 bg-zinc-800/20"}`}>
                    <div className="flex items-center gap-4">
                      <span className={`text-2xl ${met ? "text-green-400" : "text-zinc-600"}`}>
                        {met ? "✓" : "✗"}
                      </span>
                      <div>
                        <div className={`font-medium ${met ? "text-green-300" : "text-zinc-500"}`}>{item.label}</div>
                        <div className="text-zinc-600 text-xs font-mono mt-0.5">{item.threshold}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      {item.required > 0 && (
                        <div className="text-xs text-zinc-500">
                          Score: <span className={profile.trustScore >= item.required ? "text-green-400" : "text-red-400"}>{profile.trustScore}</span>
                          {" "}/{" "}{item.required}
                        </div>
                      )}
                      <div className={`text-xs font-medium mt-1 ${met ? "text-green-400" : "text-zinc-600"}`}>
                        {met ? "SATISFIED" : "NOT SATISFIED"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Signals */}
          {profile.signals.length > 0 && (
            <div className="border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800">
                <h2 className="text-white font-semibold text-sm">Behaviour Signals ({profile.signals.length})</h2>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {["Signal Type", "Count", "Window (h)", "Source", "Recorded"].map((h) => (
                      <th key={h} className="text-left text-zinc-600 font-medium py-3 px-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {profile.signals.map((s, i) => (
                    <tr key={i} className="border-b border-zinc-800/50">
                      <td className="py-3 px-4 font-mono text-blue-400">{s.signalType}</td>
                      <td className="py-3 px-4 text-white">{s.count}</td>
                      <td className="py-3 px-4 text-zinc-400">{s.windowHours}</td>
                      <td className="py-3 px-4 text-zinc-500">{s.source ?? "—"}</td>
                      <td className="py-3 px-4 text-zinc-600">{new Date(s.recordedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
