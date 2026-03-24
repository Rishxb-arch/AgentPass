const stats = [
  { label: "Agents Issued", value: "24", change: "+3 today", color: "text-white" },
  { label: "Requests Made", value: "1,847", change: "+124 today", color: "text-white" },
  { label: "Verifications Bypassed", value: "523", change: "CAPTCHAs/OTPs/login walls replaced", color: "text-green-400", highlight: true },
  { label: "Adapter Coverage", value: "6", change: "All web types covered", color: "text-blue-400" },
];

const recentActivity = [
  { time: "10:42:31", agent: "ResearchBot v2", action: "browse", system: "news.ycombinator.com", outcome: "success", verifiedBy: "agentpass_credentials" },
  { time: "10:42:18", agent: "ShopBot v1", action: "search", system: "ecommerce:flipkart.com", outcome: "success", verifiedBy: "agentpass_credentials" },
  { time: "10:41:55", agent: "GovDataBot", action: "form_submit", system: "gov.in:mca.gov.in", outcome: "success", verifiedBy: "agentpass_credentials" },
  { time: "10:41:33", agent: "ResearchBot v2", action: "extract", system: "web:generic", outcome: "success", verifiedBy: "agentpass_credentials" },
  { time: "10:41:12", agent: "ShopBot v1", action: "api_call", system: "api:fakestoreapi.com", outcome: "success", verifiedBy: "agentpass_credentials" },
  { time: "10:40:58", agent: "GovDataBot", action: "read", system: "gov.in:rera.ts.gov.in", outcome: "success", verifiedBy: "agentpass_credentials" },
  { time: "10:40:44", agent: "ResearchBot v2", action: "browse", system: "web:generic", outcome: "success", verifiedBy: "agentpass_credentials" },
  { time: "10:40:21", agent: "ShopBot v1", action: "search", system: "ecommerce:amazon.in", outcome: "success", verifiedBy: "agentpass_credentials" },
  { time: "10:40:08", agent: "ResearchBot v2", action: "api_call", system: "api:jsonplaceholder.typicode.com", outcome: "success", verifiedBy: "agentpass_credentials" },
  { time: "10:39:55", agent: "GovDataBot", action: "search", system: "gov.in:mca.gov.in", outcome: "success", verifiedBy: "agentpass_credentials" },
];

export default function OverviewPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Overview</h1>
        <p className="text-zinc-500 text-sm">Real-time agent activity and system health</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {stats.map((stat) => (
          <div key={stat.label} className={`border rounded-xl p-5 ${stat.highlight ? "border-green-500/30 bg-green-500/5" : "border-zinc-800 bg-zinc-900/30"}`}>
            <div className="text-zinc-500 text-xs mb-2">{stat.label}</div>
            <div className={`text-3xl font-bold mb-1 ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-zinc-600">{stat.change}</div>
          </div>
        ))}
      </div>

      {/* Activity feed */}
      <div className="border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold text-sm">Live Activity Feed</h2>
            <p className="text-zinc-500 text-xs mt-0.5">Last 10 agent actions — <span className="text-green-400">verificationUsed: agentpass_credentials</span></p>
          </div>
          <div className="flex items-center gap-2 text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800/50">
                {["Time", "Agent", "Action", "System", "Outcome", "Verified By"].map((h) => (
                  <th key={h} className="text-left text-zinc-600 font-medium py-3 px-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((row, i) => (
                <tr key={i} className="border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors">
                  <td className="py-3 px-4 text-zinc-500 font-mono">{row.time}</td>
                  <td className="py-3 px-4 text-zinc-300">{row.agent}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded font-mono">{row.action}</span>
                  </td>
                  <td className="py-3 px-4 text-zinc-400 font-mono">{row.system}</td>
                  <td className="py-3 px-4">
                    <span className="text-green-400">{row.outcome}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs">{row.verifiedBy}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
