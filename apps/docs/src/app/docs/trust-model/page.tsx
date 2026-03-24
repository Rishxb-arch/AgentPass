export default function TrustModelPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <div className="mb-12">
        <div className="text-blue-500 text-xs font-medium mb-3 uppercase tracking-widest">Trust Model</div>
        <h1 className="text-4xl font-bold text-white mb-4">Why Agent Verification Replaces Human Verification</h1>
        <p className="text-zinc-400 text-lg">The core insight behind AgentPass: CAPTCHAs prove humanity, not trustworthiness. AgentPass proves trustworthiness.</p>
      </div>

      <div className="space-y-16">
        <section>
          <h2 className="text-2xl font-bold text-white mb-4">Why CAPTCHAs Exist</h2>
          <p className="text-zinc-400 mb-4 leading-relaxed">
            Every CAPTCHA, OTP, and login wall on the web exists to fill one trust gap: <strong className="text-white">the system doesn't know who is making the request.</strong> Without identity infrastructure, the web's only defense is to demand proof of humanity — the assumption being that automated actors are malicious, and human actors are legitimate.
          </p>
          <p className="text-zinc-400 leading-relaxed">
            This was a reasonable heuristic in 2003. It is a category error in 2024. AI agents are real actors with real principals, real purposes, and real accountability — but the web has no way to verify any of that. So it falls back to "prove you're human."
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">The AgentPass Trust Stack</h2>
          <p className="text-zinc-400 mb-6 leading-relaxed">AgentPass answers the question a CAPTCHA can't: <em className="text-white">who is this actor, what are they allowed to do, and do they have a history of doing it responsibly?</em></p>
          <div className="space-y-4">
            {[
              {
                layer: "1. Passport",
                what: "Cryptographic identity",
                detail: "HMAC-SHA256 signed. Tied to a real principal. Contains the agent's tier and capability set. Unforgeable without the issuer secret.",
              },
              {
                layer: "2. KYA Score",
                what: "Behavioral trust proof",
                detail: "6-check assessment. Scores are derived from passport validity, principal verification, capability scope, behavioral history, intent declaration, and clean history. Produces a 0–100 trustScore.",
              },
              {
                layer: "3. Delegation Token",
                what: "Scoped access grant",
                detail: "Cryptographically scoped to specific systems and capabilities. Scope reduction rule: a delegation can never grant capabilities the grantor doesn't hold.",
              },
              {
                layer: "4. Audit History",
                what: "Verifiable behavioral record",
                detail: "Tamper-evident hash chain. Every action logged with verificationUsed field. Chain integrity verifiable at any time.",
              },
            ].map((item) => (
              <div key={item.layer} className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/30">
                <div className="flex items-start gap-4">
                  <div className="text-blue-500 font-mono text-sm font-bold min-w-[120px]">{item.layer}</div>
                  <div>
                    <div className="text-white font-medium mb-1">{item.what}</div>
                    <div className="text-zinc-400 text-sm leading-relaxed">{item.detail}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-6">Verification Replacement Thresholds</h2>
          <p className="text-zinc-400 mb-6">The KYA trustScore maps directly to which human verification mechanisms become unnecessary:</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium py-3 px-4">Verification Type</th>
                  <th className="text-left text-zinc-500 font-medium py-3 px-4">Condition</th>
                  <th className="text-left text-zinc-500 font-medium py-3 px-4">Why It's Sufficient</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { type: "CAPTCHA", condition: "trustScore >= 70", why: "Agent has verified identity, behavioral history, and stated intent. More evidence than a puzzle solve." },
                  { type: "Login Wall", condition: "trustScore >= 60 AND tier >= verified", why: "Agent has a verified principal and delegated access. The session can be established via credentials." },
                  { type: "Rate Limiting", condition: "trustScore >= 50", why: "Agent identity is known. Abuse is traceable to a principal. Rate limits for anonymous actors don't apply." },
                  { type: "OTP", condition: "trustScore >= 80 AND principalVerified", why: "Agent's principal has been verified out-of-band. High trust score indicates clean behavioral history." },
                  { type: "Email Verification", condition: "principalVerified AND tier >= basic", why: "The principal identity was already verified at passport issuance." },
                ].map((row) => (
                  <tr key={row.type} className="border-b border-zinc-800/50">
                    <td className="py-3 px-4 text-white font-medium">{row.type}</td>
                    <td className="py-3 px-4 font-mono text-blue-400 text-xs">{row.condition}</td>
                    <td className="py-3 px-4 text-zinc-400 text-xs">{row.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border border-blue-500/20 bg-blue-500/5 rounded-xl p-8">
          <h2 className="text-xl font-bold text-white mb-4">The Long-Term Vision</h2>
          <p className="text-zinc-300 leading-relaxed mb-4">
            Today, AgentPass headers are presented proactively. Most systems ignore them and fall back to their usual verification. The adapter layer handles this transparently using agent credentials.
          </p>
          <p className="text-zinc-300 leading-relaxed">
            As adoption grows, systems start reading AgentPass headers and skipping verification for verified agents. The end state: <strong className="text-white">agent verification so standard that human-style checks for agents become obsolete across the web.</strong>
          </p>
        </section>
      </div>
    </div>
  );
}
