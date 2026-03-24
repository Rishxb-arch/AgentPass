/**
 * AgentPass E-Commerce Agent Example
 *
 * Demonstrates: passport issuance, KYA assessment (verificationReplacement),
 * product search, cart operations, and audit trail with verificationUsed column.
 */

import AgentPass from "@agentpass/sdk";

const ap = new AgentPass({
  secret: process.env["AGENTPASS_SECRET"] ?? "example-secret-change-in-production",
  issuer: "ecommerce-example",
});

async function main() {
  console.log("=== AgentPass E-Commerce Agent ===\n");

  // 1. Issue a passport with commerce capabilities
  console.log("1. Issuing passport...");
  const passport = await ap.issue({
    principal: "user_acme_123",
    name: "ShopBot v1",
    tier: "verified",
    capabilities: [
      "web:browse",
      "web:forms",
      "commerce:search",
      "commerce:cart",
      "commerce:orders",
      "data:extract",
    ],
    expiresInHours: 8,
    metadata: { purpose: "price comparison and cart management" },
  });

  console.log(`  Agent ID: ${passport.agentId}`);
  console.log(`  Tier: ${passport.tier}`);
  console.log(`  Fingerprint: ${passport.fingerprint}\n`);

  // 2. Assess KYA — see what human verification the agent replaces
  console.log("2. KYA Assessment...");
  const kyaProfile = await ap.assess({
    passport,
    declaredIntent: "Search for wireless headphones across e-commerce sites and compare prices",
    targetSystem: "ecommerce",
    signals: [
      { type: "clean_history", count: 5, windowHours: 168 },
      { type: "normal_operation", count: 50, windowHours: 24 },
    ],
  });

  console.log(`  Status: ${kyaProfile.status}`);
  console.log(`  Trust Score: ${kyaProfile.trustScore}/100`);
  console.log(`  Risk Score: ${kyaProfile.riskScore}/100`);
  console.log("\n  Verification Replacement (what this agent replaces):");
  const vr = kyaProfile.verificationReplacement;
  console.log(`    ${vr.replacesCaptcha ? "✓" : "✗"} Replaces CAPTCHA (requires score >= 70, agent has ${kyaProfile.trustScore})`);
  console.log(`    ${vr.replacesLoginWall ? "✓" : "✗"} Replaces Login Wall (requires score >= 60 + tier >= verified)`);
  console.log(`    ${vr.replacesRateLimit ? "✓" : "✗"} Replaces Rate Limiting (requires score >= 50)`);
  console.log(`    ${vr.replacesOTP ? "✓" : "✗"} Replaces OTP (requires score >= 80 + verified principal)`);
  console.log(`    ${vr.replacesEmailVerification ? "✓" : "✗"} Replaces Email Verification (requires verified principal)\n`);

  // 3. Check if agent can act
  const canSearch = await ap.canAct({
    passport,
    kyaProfile,
    action: { capability: "commerce:search" },
  });
  console.log(`3. Can search commerce? ${canSearch.allowed ? "Yes" : "No"} — ${canSearch.reason}\n`);

  // 4. Search products (adapters inject X-AgentPass-* headers automatically)
  console.log("4. Searching products on a public e-commerce site...");
  console.log("   (X-AgentPass-* headers injected automatically on every request)");

  const searchResult = await ap.search({
    passport,
    kyaProfile,
    url: "https://fakestoreapi.com",
    query: "headphones",
  });

  console.log(`   Success: ${searchResult.success}`);
  console.log(`   Verification bypassed: ${JSON.stringify(searchResult.verificationBypassed ?? [])}`);
  if (searchResult.data) {
    console.log(`   Data received: ${JSON.stringify(searchResult.data).slice(0, 200)}...`);
  }
  console.log();

  // 5. Browse a product page
  console.log("5. Fetching product data via extract...");
  const extractResult = await ap.execute({
    passport,
    kyaProfile,
    url: "https://fakestoreapi.com/products/1",
    endpointId: "rest_call",
    input: {
      url: "https://fakestoreapi.com/products/1",
      method: "GET",
    },
  });
  console.log(`   Success: ${extractResult.success}`);
  if (extractResult.data) {
    const product = extractResult.data as Record<string, unknown>;
    console.log(`   Product: ${JSON.stringify(product).slice(0, 300)}`);
  }
  console.log();

  // 6. Print audit log with verificationUsed column
  console.log("6. Audit Log (verificationUsed column shows how agent authenticated):");
  console.log("─".repeat(80));
  console.log(
    "TIMESTAMP".padEnd(30) +
    "ACTION".padEnd(15) +
    "OUTCOME".padEnd(10) +
    "VERIFIED BY"
  );
  console.log("─".repeat(80));

  const log = ap.getAuditLog();
  for (const entry of log) {
    console.log(
      entry.timestamp.slice(0, 24).padEnd(30) +
      entry.action.type.padEnd(15) +
      entry.outcome.padEnd(10) +
      entry.verificationUsed
    );
  }
  console.log("─".repeat(80));

  // 7. Verify audit chain integrity
  const chainCheck = ap.verifyAuditChain();
  console.log(`\nAudit chain integrity: ${chainCheck.valid ? "✓ VALID" : "✗ BROKEN at entry " + chainCheck.brokenAt}`);
  console.log(`Total audit entries: ${log.length}`);

  console.log("\n=== Done ===");
}

main().catch(console.error);
