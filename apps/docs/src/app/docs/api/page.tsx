const methods = [
  {
    name: "ap.issue(options)",
    returns: "Promise<AgentPassport>",
    desc: "Issue a new signed agent passport.",
    params: [
      { name: "principal", type: "string", desc: "The human or org authorizing this agent" },
      { name: "name", type: "string", desc: "Human-readable agent name" },
      { name: "tier?", type: "AgentTier", desc: "basic | verified | trusted | sovereign (default: basic)" },
      { name: "capabilities?", type: "AgentCapability[]", desc: "Granted capability set" },
      { name: "expiresInHours?", type: "number | null", desc: "TTL in hours (default: 24, null = never)" },
      { name: "metadata?", type: "Record<string, string>", desc: "Additional metadata (protocol key reserved)" },
    ],
  },
  {
    name: "ap.verify(token)",
    returns: "{ valid, passport?, reason? }",
    desc: "Verify a serialized passport token.",
    params: [{ name: "token", type: "string", desc: "Serialized passport token (agentpass.xxx.yyy format)" }],
  },
  {
    name: "ap.assess(options)",
    returns: "Promise<KYAProfile>",
    desc: "Run KYA assessment and compute verificationReplacement.",
    params: [
      { name: "passport", type: "AgentPassport", desc: "The passport to assess" },
      { name: "declaredIntent?", type: "string", desc: "What the agent intends to do (>10 chars for full score)" },
      { name: "targetSystem?", type: "string", desc: "Target system for context" },
      { name: "signals?", type: "BehaviorSignal[]", desc: "Past behavior signals" },
    ],
  },
  {
    name: "ap.delegate(options)",
    returns: "Promise<DelegationToken>",
    desc: "Issue a scoped delegation token. Scope reduction rule enforced.",
    params: [
      { name: "grantor", type: "string", desc: "The granting principal ID" },
      { name: "agentId", type: "string", desc: "The agent receiving the delegation" },
      { name: "systems", type: "string[]", desc: "Systems in scope (use '*' for all)" },
      { name: "capabilities?", type: "AgentCapability[]", desc: "Capabilities in scope" },
      { name: "maxActions?", type: "number | null", desc: "Max actions before token expires" },
      { name: "expiresInHours?", type: "number", desc: "TTL in hours (default: 1)" },
      { name: "singleUse?", type: "boolean", desc: "Deactivate after first use" },
      { name: "grantorCapabilities?", type: "AgentCapability[]", desc: "Capabilities the grantor holds (enforces scope reduction)" },
    ],
  },
  {
    name: "ap.canAct(options)",
    returns: "Promise<{ allowed, reason }>",
    desc: "Check if an agent can perform a specific action.",
    params: [
      { name: "passport", type: "AgentPassport", desc: "" },
      { name: "kyaProfile", type: "KYAProfile", desc: "" },
      { name: "delegation?", type: "DelegationToken", desc: "Optional delegation for scoped access" },
      { name: "action", type: "{ capability, system? }", desc: "The action to check" },
    ],
  },
  {
    name: "ap.browse(options)",
    returns: "Promise<PageContent>",
    desc: "Browse any URL. Returns structured content. Agent credentials injected automatically.",
    params: [
      { name: "passport", type: "AgentPassport", desc: "" },
      { name: "kyaProfile", type: "KYAProfile", desc: "" },
      { name: "delegation?", type: "DelegationToken", desc: "" },
      { name: "url", type: "string", desc: "The URL to browse" },
    ],
  },
  {
    name: "ap.search(options)",
    returns: "Promise<AdapterResult>",
    desc: "Search any site. Auto-detects adapter type and calls appropriate endpoint.",
    params: [
      { name: "passport", type: "AgentPassport", desc: "" },
      { name: "kyaProfile", type: "KYAProfile", desc: "" },
      { name: "url", type: "string", desc: "Base URL of the site to search" },
      { name: "query", type: "string", desc: "Search query" },
      { name: "filters?", type: "Record<string, string>", desc: "Optional filters" },
    ],
  },
  {
    name: "ap.extract(options)",
    returns: "Promise<Record<string, unknown>>",
    desc: "Extract structured data using CSS selector schema.",
    params: [
      { name: "passport", type: "AgentPassport", desc: "" },
      { name: "kyaProfile", type: "KYAProfile", desc: "" },
      { name: "url", type: "string", desc: "URL to extract from" },
      { name: "schema", type: "Record<string, string>", desc: "Key → CSS selector or 'jsonpath:$.path' mapping" },
    ],
  },
  {
    name: "ap.execute(options)",
    returns: "Promise<AdapterResult>",
    desc: "Execute any adapter endpoint for a given URL.",
    params: [
      { name: "passport", type: "AgentPassport", desc: "" },
      { name: "kyaProfile", type: "KYAProfile", desc: "" },
      { name: "url", type: "string", desc: "URL to determine adapter" },
      { name: "endpointId", type: "string", desc: "Endpoint to call (e.g. 'rest_call', 'get_article')" },
      { name: "input", type: "Record<string, unknown>", desc: "Endpoint-specific input" },
    ],
  },
  {
    name: "ap.getAuditLog(agentId?)",
    returns: "AuditEntry[]",
    desc: "Get audit entries, optionally filtered by agent ID.",
    params: [],
  },
  {
    name: "ap.verifyAuditChain()",
    returns: "{ valid, brokenAt? }",
    desc: "Verify the integrity of the audit hash chain.",
    params: [],
  },
];

export default function ApiPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <div className="mb-12">
        <div className="text-blue-500 text-xs font-medium mb-3 uppercase tracking-widest">API Reference</div>
        <h1 className="text-4xl font-bold text-white mb-4">SDK Reference</h1>
        <p className="text-zinc-400 text-lg">Full reference for the AgentPass SDK. All methods are async-safe and return immutable results.</p>
      </div>

      <div className="mb-8">
        <pre><code className="text-zinc-300">{`import AgentPass from "@agentpass/sdk";

const ap = new AgentPass({
  secret: process.env.AGENTPASS_SECRET,  // HMAC key for signing
  issuer?: string,                        // optional issuer identifier
});`}</code></pre>
      </div>

      <div className="space-y-8">
        {methods.map((method) => (
          <div key={method.name} className="border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 bg-zinc-900/50 border-b border-zinc-800">
              <div className="flex items-start justify-between gap-4">
                <code className="text-blue-400 font-bold text-sm">{method.name}</code>
                <code className="text-zinc-500 text-xs">{method.returns}</code>
              </div>
              <p className="text-zinc-400 text-sm mt-2">{method.desc}</p>
            </div>
            {method.params.length > 0 && (
              <div className="px-5 py-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-left text-zinc-600 font-medium pb-2 w-1/4">Parameter</th>
                      <th className="text-left text-zinc-600 font-medium pb-2 w-1/4">Type</th>
                      <th className="text-left text-zinc-600 font-medium pb-2">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {method.params.map((p) => (
                      <tr key={p.name}>
                        <td className="py-2 pr-4 font-mono text-zinc-300">{p.name}</td>
                        <td className="py-2 pr-4 font-mono text-blue-400">{p.type}</td>
                        <td className="py-2 text-zinc-500">{p.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
