export default function IdentityPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <div className="mb-12">
        <div className="text-blue-500 text-xs font-medium mb-3 uppercase tracking-widest">Identity</div>
        <h1 className="text-4xl font-bold text-white mb-4">Passport, KYA & Delegation</h1>
        <p className="text-zinc-400 text-lg">The three-layer identity system that makes human verification unnecessary.</p>
      </div>

      <div className="space-y-16">
        <section>
          <h2 className="text-2xl font-bold text-white mb-6">AgentPassport</h2>
          <p className="text-zinc-400 mb-4 leading-relaxed">A passport is a cryptographically signed identity document. It ties an agent to a principal, defines its tier and capabilities, and carries a fingerprint and HMAC-SHA256 signature.</p>
          <pre><code className="text-zinc-300">{`interface AgentPassport {
  agentId: string;           // "ap_" + sha256(principalId + random)[0:32]
  principalId: string;       // human or org who authorized this agent
  name: string;
  tier: AgentTier;           // "basic" | "verified" | "trusted" | "sovereign"
  capabilities: AgentCapability[];
  fingerprint: string;       // sha256(name + sortedCaps.join(",") + tier)[0:16]
  issuedAt: string;          // ISO timestamp
  expiresAt: string | null;
  active: boolean;
  signature: string;         // HMAC-SHA256 over canonical JSON payload
  trustCredentials: TrustCredentials;  // precomputed presentation package
  metadata: Record<string, string>;    // always includes protocol:"agentpass/1.0"
}`}</code></pre>

          <h3 className="text-lg font-bold text-white mt-8 mb-4">Tier Definitions</h3>
          <div className="space-y-3">
            {[
              { tier: "basic", desc: "Read-only web access. No delegation. No auth flows." },
              { tier: "verified", desc: "Forms + API access. Single-system delegation. Authenticated sessions." },
              { tier: "trusted", desc: "Multi-system delegation. Payment reads. Behavioral history established." },
              { tier: "sovereign", desc: "Full capabilities. Can spawn sub-agents. Maximum trust." },
            ].map((t) => (
              <div key={t.tier} className="flex items-start gap-4 p-4 border border-zinc-800 rounded-lg">
                <span className={`px-2 py-0.5 rounded text-xs font-mono min-w-[80px] text-center ${
                  t.tier === "sovereign" ? "bg-purple-500/20 text-purple-400" :
                  t.tier === "trusted" ? "bg-orange-500/20 text-orange-400" :
                  t.tier === "verified" ? "bg-blue-500/20 text-blue-400" :
                  "bg-zinc-800 text-zinc-400"
                }`}>{t.tier}</span>
                <span className="text-zinc-400 text-sm">{t.desc}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-6">KYA Assessment</h2>
          <p className="text-zinc-400 mb-4 leading-relaxed">KYA (Know Your Agent) runs 6 checks and produces a trustScore (0–100). This score maps to which human verifications the agent's credentials can replace.</p>
          <div className="space-y-3">
            {[
              { check: "passport_validity", score: "100/0", desc: "Verifies HMAC-SHA256 signature and expiry" },
              { check: "principal_verification", score: "90/20", desc: "Principal must be non-empty and non-anonymous" },
              { check: "capability_scope", score: "85/30", desc: "Flags basic-tier agents holding identity:delegate" },
              { check: "behavior_history", score: "0–100", desc: "Start 100, -10 per auth_failure, -20 per scope_violation" },
              { check: "intent_declaration", score: "80/50", desc: "Long intent (>10 chars) scores 80, short scores 50" },
              { check: "clean_history_bonus", score: "+10", desc: "Clean history signals grant a trust bonus" },
            ].map((c) => (
              <div key={c.check} className="flex items-start gap-4 p-4 border border-zinc-800 rounded-lg">
                <code className="text-blue-400 text-xs min-w-[180px]">{c.check}</code>
                <span className="text-zinc-500 text-xs min-w-[60px]">{c.score}</span>
                <span className="text-zinc-400 text-sm">{c.desc}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-6">Delegation Tokens</h2>
          <p className="text-zinc-400 mb-4 leading-relaxed">Delegation tokens grant a specific agent access to specific systems and capabilities for a bounded time. The key rule: <strong className="text-white">a delegation can never grant capabilities the grantor doesn't hold.</strong></p>
          <pre><code className="text-zinc-300">{`// Issue a scoped delegation
const delegation = await ap.delegate({
  grantor: "user_123",
  agentId: passport.agentId,
  systems: ["ecommerce:flipkart.com", "ecommerce:amazon.in"],
  capabilities: ["commerce:search", "web:browse"],
  maxActions: 50,
  expiresInHours: 2,
  singleUse: false,
  grantorCapabilities: ["commerce:search", "web:browse"],  // scope reduction enforced
});

// delegation.tokenId  → "del_a3f8b2c1d9e4f501"
// delegation.scope.capabilities  → ["commerce:search", "web:browse"]
// delegation.scope.maxActions    → 50

// Verify before use
const check = ap.verifyDelegation(delegation, passport.agentId, {
  system: "ecommerce:flipkart.com",
  capability: "commerce:search",
});
// check.valid → true`}</code></pre>
        </section>
      </div>
    </div>
  );
}
