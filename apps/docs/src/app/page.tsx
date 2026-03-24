import Link from "next/link";

const heroCode = `import AgentPass from "@agentpass/sdk";

const ap = new AgentPass({ secret: process.env.AGENTPASS_SECRET });

// 1. Issue a cryptographic passport
const passport = await ap.issue({
  principal: "user_123",
  name: "Research Agent",
  capabilities: ["web:browse", "data:extract", "commerce:search"],
  tier: "verified"
});

// 2. Assess trust — see exactly what human verification this replaces
const kyaProfile = await ap.assess({
  passport,
  declaredIntent: "Research product prices across e-commerce"
});

// kyaProfile.verificationReplacement →
// {
//   replacesCaptcha: true,       // trustScore >= 70 ✓
//   replacesLoginWall: true,     // trustScore >= 60 + tier verified ✓
//   replacesRateLimit: true,     // trustScore >= 50 ✓
//   replacesOTP: false,          // requires score >= 80
//   replacesEmailVerification: true  // principalVerified ✓
// }

// 3. Browse any website — agent credentials injected automatically
//    X-AgentPass-Passport, X-AgentPass-KYA-Score, X-AgentPass-Tier...
const page = await ap.browse({
  passport, kyaProfile,
  url: "https://news.ycombinator.com"
});
// → { title, text, links, images, structured } — clean data, no HTML

// Search any e-commerce — no CAPTCHA, no login wall
const products = await ap.search({
  passport, kyaProfile,
  url: "https://www.flipkart.com",
  query: "wireless headphones"
});

// Extract structured data from any page
const data = await ap.extract({
  passport, kyaProfile,
  url: "https://example.com",
  schema: { title: "h1", price: ".price", rating: ".rating" }
});`;

const adapters = [
  { name: "Web Generic", covers: "Any website", bypasses: "CAPTCHA, rate limits", tier: "basic" },
  { name: "E-Commerce Generic", covers: "Any shop", bypasses: "CAPTCHA, login walls, rate limits", tier: "basic" },
  { name: "News Generic", covers: "Any news / blog", bypasses: "CAPTCHA, rate limits", tier: "basic" },
  { name: "Government India", covers: "*.gov.in, *.nic.in", bypasses: "CAPTCHA, OTP (trusted tier)", tier: "verified" },
  { name: "API Generic", covers: "Any REST / GraphQL", bypasses: "Rate limits", tier: "basic" },
  { name: "Social Generic", covers: "Any community", bypasses: "CAPTCHA, login walls", tier: "basic" },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative px-6 py-28 max-w-6xl mx-auto">
        {/* Background glow */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            agentpass/1.0 — Protocol live
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold text-white leading-tight mb-6 tracking-tight">
            The Internet,<br />
            <span className="text-blue-500">Built for Agents</span>
          </h1>

          <p className="text-zinc-400 text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
            The web demands human verification because it cannot verify agents.
            AgentPass closes that gap permanently — giving every agent a
            cryptographic passport, a KYA trust score, and scoped delegation tokens
            that replace CAPTCHAs, OTPs, and login walls entirely.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Link
              href="/docs"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Get Started
            </Link>
            <Link
              href="/docs/trust-model"
              className="px-5 py-2.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
            >
              Trust Model →
            </Link>
          </div>
        </div>

        {/* Key statement */}
        <div className="border border-blue-500/20 bg-blue-500/5 rounded-xl p-8 mb-16 text-center max-w-3xl mx-auto">
          <p className="text-white text-lg font-medium leading-relaxed mb-3">
            "A verified AgentPass agent is more trustworthy to a system<br />
            than a human who solved a CAPTCHA."
          </p>
          <div className="grid grid-cols-3 gap-4 mt-6 text-sm">
            {[
              { label: "Cryptographically signed", sub: "HMAC-SHA256 passport" },
              { label: "KYA score is verifiable", sub: "6-check behavioral profile" },
              { label: "Delegation is scoped", sub: "System + capability bounds" },
            ].map((item) => (
              <div key={item.label} className="text-zinc-400">
                <div className="text-blue-400 font-medium mb-1">{item.label}</div>
                <div className="text-xs text-zinc-600">{item.sub}</div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-zinc-500 text-sm">
            No CAPTCHA needed. No OTP needed. No login form needed.
          </p>
        </div>

        {/* Hero code */}
        <div className="relative">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 bg-zinc-900 rounded-t-xl">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-zinc-700" />
              <div className="w-3 h-3 rounded-full bg-zinc-700" />
              <div className="w-3 h-3 rounded-full bg-zinc-700" />
            </div>
            <span className="text-zinc-500 text-xs ml-2">agent.ts</span>
          </div>
          <pre className="rounded-t-none rounded-b-xl text-sm overflow-x-auto !border-t-0">
            <code className="text-zinc-300">{heroCode}</code>
          </pre>
        </div>
      </section>

      {/* ── Architecture diagram ────────────────────────────────────── */}
      <section className="px-6 py-20 border-t border-zinc-800/50 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-white mb-3">How It Works</h2>
          <p className="text-zinc-400 text-sm">Agent credentials replace human verification at every layer</p>
        </div>

        <div className="flex items-center justify-center gap-4 flex-wrap">
          {/* AI Agent box */}
          <div className="border border-zinc-700 rounded-xl p-6 bg-zinc-900/50 text-center min-w-[180px]">
            <div className="text-2xl mb-2">🤖</div>
            <div className="text-white font-semibold text-sm">AI Agent</div>
            <div className="text-zinc-500 text-xs mt-1">Makes structured calls</div>
          </div>

          {/* Arrow right */}
          <div className="flex flex-col items-center">
            <div className="text-blue-500 font-mono text-xs mb-1">X-AgentPass-Passport</div>
            <div className="text-blue-500 font-mono text-xs mb-1">X-AgentPass-KYA-Score</div>
            <div className="text-blue-500 font-mono text-xs">X-AgentPass-Delegation</div>
            <div className="text-zinc-400 mt-2">→→→</div>
          </div>

          {/* AgentPass box */}
          <div className="border border-blue-500/50 rounded-xl p-6 bg-blue-600/10 text-center min-w-[200px]">
            <div className="text-blue-400 font-bold text-sm mb-2">AgentPass Trust Layer</div>
            <div className="space-y-1 text-xs text-zinc-400">
              <div className="flex items-center gap-2"><span className="text-green-400">✓</span> Passport (cryptographic ID)</div>
              <div className="flex items-center gap-2"><span className="text-green-400">✓</span> KYA Score (trust proof)</div>
              <div className="flex items-center gap-2"><span className="text-green-400">✓</span> Delegation (scoped access)</div>
              <div className="flex items-center gap-2"><span className="text-green-400">✓</span> Audit chain (behavioral history)</div>
            </div>
          </div>

          {/* Arrow right */}
          <div className="flex flex-col items-center">
            <div className="text-zinc-500 text-xs mb-1 line-through">CAPTCHA</div>
            <div className="text-zinc-500 text-xs mb-1 line-through">OTP</div>
            <div className="text-zinc-500 text-xs line-through">Login Wall</div>
            <div className="text-zinc-400 mt-2">→→→</div>
          </div>

          {/* Web box */}
          <div className="border border-zinc-700 rounded-xl p-6 bg-zinc-900/50 text-center min-w-[180px]">
            <div className="text-2xl mb-2">🌐</div>
            <div className="text-white font-semibold text-sm">Any Website</div>
            <div className="text-zinc-500 text-xs mt-1">Returns structured data</div>
          </div>
        </div>

        <p className="text-center text-zinc-500 text-xs mt-8">
          Agent credentials satisfy verification requirements — the human verification loop is eliminated
        </p>
      </section>

      {/* ── Feature 1: Verification Replacement ─────────────────────── */}
      <section className="px-6 py-20 border-t border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="text-blue-500 text-xs font-medium mb-3 uppercase tracking-widest">Trust Model</div>
              <h2 className="text-3xl font-bold text-white mb-6 leading-tight">
                Agent Verification<br />Replaces Human Verification
              </h2>
              <p className="text-zinc-400 mb-6 leading-relaxed">
                Every CAPTCHA on the web exists to fill one trust gap: the system doesn't
                know who is making the request. AgentPass fills that gap with credentials
                that are strictly more rigorous than any CAPTCHA.
              </p>
              <p className="text-zinc-400 mb-8 leading-relaxed">
                The KYA assessment maps your agent's trust score directly to the human
                verifications it makes unnecessary. Systems that accept AgentPass headers
                skip verification entirely. Legacy systems get their verification satisfied
                by the adapter layer using agent credentials.
              </p>
              <Link href="/docs/trust-model" className="text-blue-400 text-sm hover:text-blue-300 transition-colors">
                Read the Trust Model →
              </Link>
            </div>
            <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30">
              <div className="text-zinc-400 text-xs mb-4 font-medium">kyaProfile.verificationReplacement</div>
              <div className="space-y-3">
                {[
                  { label: "Replaces CAPTCHA", threshold: "trustScore >= 70", met: true },
                  { label: "Replaces Login Wall", threshold: "trustScore >= 60 + tier verified", met: true },
                  { label: "Replaces Rate Limiting", threshold: "trustScore >= 50", met: true },
                  { label: "Replaces OTP", threshold: "trustScore >= 80 + principalVerified", met: false },
                  { label: "Replaces Email Verification", threshold: "principalVerified + basic tier", met: true },
                ].map((item) => (
                  <div key={item.label} className={`flex items-start gap-3 p-3 rounded-lg border ${item.met ? "border-green-500/20 bg-green-500/5" : "border-zinc-700/50 bg-zinc-800/30"}`}>
                    <span className={`text-lg mt-0.5 ${item.met ? "text-green-400" : "text-zinc-600"}`}>
                      {item.met ? "✓" : "✗"}
                    </span>
                    <div>
                      <div className={`text-sm font-medium ${item.met ? "text-green-300" : "text-zinc-500"}`}>{item.label}</div>
                      <div className="text-xs text-zinc-600 mt-0.5 font-mono">{item.threshold}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature 2: Adapters ─────────────────────────────────────── */}
      <section className="px-6 py-20 border-t border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-blue-500 text-xs font-medium mb-3 uppercase tracking-widest">Web Coverage</div>
            <h2 className="text-3xl font-bold text-white mb-4">Universal Web Coverage</h2>
            <p className="text-zinc-400 max-w-xl mx-auto">
              Six generic adapters cover the entire web by type. Auto-detected from URL.
              Input: structured JSON intent. Output: structured JSON data.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium py-3 px-4">Adapter</th>
                  <th className="text-left text-zinc-500 font-medium py-3 px-4">Covers</th>
                  <th className="text-left text-zinc-500 font-medium py-3 px-4">Verification Bypassed</th>
                  <th className="text-left text-zinc-500 font-medium py-3 px-4">Min Tier</th>
                </tr>
              </thead>
              <tbody>
                {adapters.map((a, i) => (
                  <tr key={a.name} className={`border-b border-zinc-800/50 ${i % 2 === 0 ? "bg-zinc-900/20" : ""}`}>
                    <td className="py-3 px-4 text-white font-medium">{a.name}</td>
                    <td className="py-3 px-4 text-zinc-400">{a.covers}</td>
                    <td className="py-3 px-4 text-green-400 text-xs">{a.bypasses}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${a.tier === "verified" ? "bg-blue-500/20 text-blue-400" : "bg-zinc-800 text-zinc-400"}`}>
                        {a.tier}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Feature 3: Audit ────────────────────────────────────────── */}
      <section className="px-6 py-20 border-t border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/30">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-zinc-400 text-xs">Audit Log — verificationUsed</span>
                <span className="text-green-400 text-xs">✓ Chain Valid</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-zinc-600 font-medium py-2 px-4">Action</th>
                    <th className="text-left text-zinc-600 font-medium py-2 px-4">Outcome</th>
                    <th className="text-left text-zinc-600 font-medium py-2 px-4">Verified By</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { action: "browse", outcome: "success", by: "agentpass_credentials" },
                    { action: "search", outcome: "success", by: "agentpass_credentials" },
                    { action: "form_submit", outcome: "success", by: "agentpass_credentials" },
                    { action: "api_call", outcome: "success", by: "agentpass_credentials" },
                    { action: "extract", outcome: "success", by: "agentpass_credentials" },
                  ].map((row, i) => (
                    <tr key={i} className="border-b border-zinc-800/50">
                      <td className="py-2 px-4 text-zinc-300">{row.action}</td>
                      <td className="py-2 px-4">
                        <span className="text-green-400">{row.outcome}</span>
                      </td>
                      <td className="py-2 px-4">
                        <span className="text-blue-400 font-mono">{row.by}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div className="text-blue-500 text-xs font-medium mb-3 uppercase tracking-widest">Audit Trail</div>
              <h2 className="text-3xl font-bold text-white mb-6 leading-tight">
                Every Action Logged,<br />Chain Verified
              </h2>
              <p className="text-zinc-400 mb-4 leading-relaxed">
                Every request an agent makes is logged in a tamper-evident hash chain.
                Each entry records how the agent authenticated: via AgentPass credentials,
                legacy auth, or none.
              </p>
              <p className="text-zinc-400 mb-8 leading-relaxed">
                The <code>verificationUsed</code> field is the audit trail's key metric —
                showing that agents authenticate via credentials, not human verification.
              </p>
              <Link href="/docs/identity" className="text-blue-400 text-sm hover:text-blue-300 transition-colors">
                Read about Identity →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-800 px-6 py-12">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <span className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center text-xs font-black text-white">AP</span>
            AgentPass — MIT License
          </div>
          <div className="flex items-center gap-6 text-sm text-zinc-600">
            <Link href="/docs" className="hover:text-zinc-400 transition-colors">Docs</Link>
            <Link href="/docs/trust-model" className="hover:text-zinc-400 transition-colors">Trust Model</Link>
            <Link href="/docs/adapters" className="hover:text-zinc-400 transition-colors">Adapters</Link>
            <Link href="/docs/api" className="hover:text-zinc-400 transition-colors">API</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
