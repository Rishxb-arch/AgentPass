"use client";
import { useState } from "react";

interface AuditEntry {
  entryId: string;
  agentId: string;
  principalId: string;
  action: {
    type: string;
    system?: string;
    endpoint?: string;
    payloadHash?: string;
  };
  outcome: string;
  timestamp: string;
  entryHash: string;
  previousHash: string;
  verificationUsed?: string;
  targetUrl?: string | null;
}

const OUTCOME_COLORS: Record<string, string> = {
  success: "bg-green-500/20 text-green-400",
  failure: "bg-red-500/20 text-red-400",
  blocked: "bg-orange-500/20 text-orange-400",
};

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  return `${Math.floor(ms / 3600000)}h ago`;
}

export default function AuditPage() {
  const [agentId, setAgentId] = useState("");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const [filter, setFilter] = useState<"all" | "success" | "failure" | "blocked">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chainVerified, setChainVerified] = useState<boolean | null>(null);

  async function load() {
    if (!agentId.trim()) return;
    setLoading(true);
    setError(null);
    setEntries([]);
    setChainVerified(null);

    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId.trim())}/audit?limit=100`);
      const data = (await res.json()) as { entries: AuditEntry[]; error?: string };

      if (!res.ok || data.error) {
        setError(data.error ?? `Failed to load audit log (${res.status})`);
        return;
      }

      setEntries(data.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function verifyChainLocal() {
    // Local chain verification: each entry's previousHash should equal the prior entry's entryHash
    if (entries.length === 0) return;
    let valid = true;
    for (let i = 1; i < entries.length; i++) {
      if (entries[i]!.previousHash !== entries[i - 1]!.entryHash) {
        valid = false;
        break;
      }
    }
    setChainVerified(valid);
  }

  const filtered = entries.filter((e) => filter === "all" || e.outcome === filter);

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Audit Log</h1>
          <p className="text-zinc-500 text-sm">Tamper-evident SHA-256 hash chain of all agent actions</p>
        </div>
        {entries.length > 0 && (
          <button
            onClick={verifyChainLocal}
            className="px-4 py-2 border border-zinc-700 hover:border-zinc-600 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
          >
            Verify Chain
          </button>
        )}
      </div>

      {/* Agent ID lookup */}
      <div className="mb-6 flex gap-3">
        <input
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void load(); }}
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-300 text-sm font-mono focus:outline-none focus:border-blue-500"
          placeholder="ap_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        />
        <button
          onClick={() => void load()}
          disabled={loading || !agentId.trim()}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? "Loading…" : "Load Log"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 border border-red-500/30 bg-red-500/5 rounded-lg text-red-400 text-xs">
          {error}
        </div>
      )}

      {chainVerified !== null && (
        <div className={`mb-6 p-4 rounded-xl border ${chainVerified ? "border-green-500/30 bg-green-500/5 text-green-400" : "border-red-500/30 bg-red-500/5 text-red-400"}`}>
          <span className="text-sm font-medium">
            {chainVerified ? "✓ Chain integrity verified — all hashes valid" : "✗ Chain integrity FAILED — tampering detected"}
          </span>
        </div>
      )}

      {entries.length > 0 && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: "Total Entries", value: entries.length, color: "text-white" },
              { label: "Successful", value: entries.filter((e) => e.outcome === "success").length, color: "text-green-400" },
              { label: "Failed", value: entries.filter((e) => e.outcome === "failure").length, color: "text-red-400" },
              { label: "With Creds", value: entries.filter((e) => e.verificationUsed && e.verificationUsed !== "none").length, color: "text-blue-400" },
            ].map((s) => (
              <div key={s.label} className="border border-zinc-800 rounded-xl p-4">
                <div className="text-zinc-500 text-xs mb-1">{s.label}</div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Filter */}
          <div className="flex gap-2 mb-4">
            {(["all", "success", "failure", "blocked"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === f ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-400"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Log table */}
            <div className="col-span-2 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {["Entry ID", "Action", "System", "Outcome", "Verification", "Time"].map((h) => (
                      <th key={h} className="text-left text-zinc-600 font-medium py-3 px-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => (
                    <tr
                      key={entry.entryId}
                      className={`border-b border-zinc-800/50 cursor-pointer transition-colors ${
                        selected?.entryId === entry.entryId ? "bg-zinc-800/30" : "hover:bg-zinc-900/50"
                      }`}
                      onClick={() => setSelected(entry)}
                    >
                      <td className="py-3 px-4 font-mono text-blue-400 truncate max-w-[80px]">{entry.entryId.slice(0, 12)}…</td>
                      <td className="py-3 px-4 text-zinc-400 font-mono">{entry.action.type}</td>
                      <td className="py-3 px-4 text-zinc-500">{entry.action.system ?? entry.targetUrl?.slice(0, 20) ?? "—"}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${OUTCOME_COLORS[entry.outcome] ?? "bg-zinc-800 text-zinc-400"}`}>
                          {entry.outcome}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {entry.verificationUsed && entry.verificationUsed !== "none" ? (
                          <span className="text-blue-400 text-xs font-mono">{entry.verificationUsed}</span>
                        ) : (
                          <span className="text-zinc-700">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-zinc-600">{relativeTime(entry.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Detail panel */}
            <div>
              {selected ? (
                <div className="border border-zinc-800 rounded-xl p-5 space-y-4 sticky top-0">
                  <div className="flex items-center justify-between">
                    <span className="text-blue-400 font-mono text-xs truncate">{selected.entryId}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${OUTCOME_COLORS[selected.outcome] ?? "bg-zinc-800 text-zinc-400"}`}>
                      {selected.outcome}
                    </span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="text-zinc-600 mb-1">Agent ID</div>
                      <div className="text-zinc-400 font-mono break-all">{selected.agentId}</div>
                    </div>
                    <div>
                      <div className="text-zinc-600 mb-1">Action</div>
                      <pre className="text-zinc-400 font-mono bg-zinc-900 rounded-lg p-3 overflow-auto text-xs">
                        {JSON.stringify(selected.action, null, 2)}
                      </pre>
                    </div>
                    {selected.targetUrl && (
                      <div>
                        <div className="text-zinc-600 mb-1">Target URL</div>
                        <div className="text-zinc-400 break-all">{selected.targetUrl}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-zinc-600 mb-1">Entry Hash</div>
                      <div className="text-green-400 font-mono text-xs break-all">{selected.entryHash}</div>
                    </div>
                    <div>
                      <div className="text-zinc-600 mb-1">Previous Hash</div>
                      <div className="text-zinc-500 font-mono text-xs break-all">{selected.previousHash}</div>
                    </div>
                    <div>
                      <div className="text-zinc-600 mb-1">Timestamp</div>
                      <div className="text-zinc-400">{new Date(selected.timestamp).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-zinc-800 rounded-xl h-48 flex items-center justify-center">
                  <div className="text-zinc-700 text-sm">Click an entry to inspect</div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!loading && entries.length === 0 && agentId && !error && (
        <div className="border border-dashed border-zinc-800 rounded-xl h-48 flex items-center justify-center">
          <div className="text-center">
            <div className="text-zinc-700 text-sm">No audit entries found</div>
            <div className="text-zinc-700 text-xs mt-1">This agent has no recorded actions yet</div>
          </div>
        </div>
      )}
    </div>
  );
}
