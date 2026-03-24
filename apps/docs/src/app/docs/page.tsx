import Link from "next/link";

export default function QuickStartPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <div className="mb-12">
        <div className="text-blue-500 text-xs font-medium mb-3 uppercase tracking-widest">Documentation</div>
        <h1 className="text-4xl font-bold text-white mb-4">Quick Start</h1>
        <p className="text-zinc-400 text-lg">Get your first agent browsing the internet in under 5 minutes.</p>
      </div>

      <div className="space-y-12">
        <section>
          <h2 className="text-xl font-bold text-white mb-4">Installation</h2>
          <pre><code className="text-zinc-300">pnpm add @agentpass/sdk @agentpass/adapters</code></pre>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-4">Step 1 — Issue a Passport</h2>
          <p className="text-zinc-400 mb-4">A passport is a cryptographically signed identity token for your agent. It carries the agent's capabilities, tier, and principal (the human or org who authorized it).</p>
          <pre><code className="text-zinc-300">{`import AgentPass from "@agentpass/sdk";

const ap = new AgentPass({ secret: process.env.AGENTPASS_SECRET });

const passport = await ap.issue({
  principal: "user_123",              // the human authorizing this agent
  name: "My Research Agent",
  tier: "verified",                   // basic | verified | trusted | sovereign
  capabilities: ["web:browse", "data:extract", "commerce:search"],
  expiresInHours: 24,
});

// passport.agentId  → "ap_a3f8b2c1d..."  (cryptographic ID)
// passport.tier     → "verified"
// passport.signature → HMAC-SHA256 over canonical payload`}</code></pre>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-4">Step 2 — Assess Trust (KYA)</h2>
          <p className="text-zinc-400 mb-4">The KYA assessment runs 6 checks and produces a trust score. Crucially, it tells you <strong className="text-white">exactly which human verifications this agent's score replaces.</strong></p>
          <pre><code className="text-zinc-300">{`const kyaProfile = await ap.assess({
  passport,
  declaredIntent: "Research product prices for comparison",
  signals: [
    { type: "clean_history", count: 5, windowHours: 168 },
  ],
});

console.log(kyaProfile.trustScore);        // e.g. 82
console.log(kyaProfile.status);            // "verified"

// What this agent replaces — the core output
const vr = kyaProfile.verificationReplacement;
// vr.replacesCaptcha         → true   (score >= 70)
// vr.replacesLoginWall       → true   (score >= 60 + tier verified)
// vr.replacesRateLimit       → true   (score >= 50)
// vr.replacesOTP             → true   (score >= 80 + principalVerified)
// vr.replacesEmailVerification → true (principalVerified + basic tier)`}</code></pre>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-4">Step 3 — Browse / Search / Extract</h2>
          <p className="text-zinc-400 mb-4">Three convenience methods form the hero API. Agent credentials are presented automatically on every request via <code>X-AgentPass-*</code> headers.</p>
          <pre><code className="text-zinc-300">{`// Browse any URL — returns structured PageContent, not raw HTML
const page = await ap.browse({
  passport, kyaProfile,
  url: "https://news.ycombinator.com",
});
// page.title, page.text, page.links[], page.images[]

// Search any e-commerce / news / social site
const results = await ap.search({
  passport, kyaProfile,
  url: "https://www.flipkart.com",
  query: "wireless headphones",
});

// Extract structured data using CSS selectors
const data = await ap.extract({
  passport, kyaProfile,
  url: "https://example.com/product",
  schema: {
    title: "h1",
    price: ".price",
    rating: ".rating-value",
    inStock: ".stock-status",
  },
});`}</code></pre>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-4">How Verification Is Bypassed</h2>
          <p className="text-zinc-400 mb-4">Every HTTP request the adapter makes injects the full <code>X-AgentPass-*</code> header set:</p>
          <pre><code className="text-zinc-300">{`X-AgentPass-Passport: agentpass.eyJhZ2VudElkIjoiYXBf....abc123
X-AgentPass-KYA-Score: 82
X-AgentPass-Tier: verified
X-AgentPass-Principal: user_123
X-AgentPass-Capabilities-Hash: a3f8b2c1d9e4f501
X-AgentPass-Version: 1.0
X-AgentPass-Timestamp: 2024-01-15T10:30:00.000Z
X-AgentPass-Signature: 7b2c4a8f...`}</code></pre>
          <p className="text-zinc-400 mt-4">When a CAPTCHA / login wall / rate limit is encountered, <code>handleVerificationChallenge()</code> checks if the agent's KYA score satisfies the requirement. If yes, a signed verification proof is presented in lieu of human verification.</p>
        </section>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-zinc-800">
          {[
            { href: "/docs/trust-model", title: "Trust Model", desc: "Why agent verification replaces human verification" },
            { href: "/docs/adapters", title: "Adapters", desc: "6 generic adapters covering the entire web" },
            { href: "/docs/identity", title: "Identity", desc: "Passport, KYA, delegation in depth" },
            { href: "/docs/api", title: "API Reference", desc: "Full SDK method reference" },
          ].map((link) => (
            <Link key={link.href} href={link.href} className="border border-zinc-800 rounded-xl p-5 hover:border-zinc-600 transition-colors group">
              <div className="text-white font-medium mb-1 group-hover:text-blue-400 transition-colors">{link.title} →</div>
              <div className="text-zinc-500 text-sm">{link.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
