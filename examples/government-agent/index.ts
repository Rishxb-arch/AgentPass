/**
 * AgentPass Government Agent Example
 *
 * Demonstrates: Indian government portal access with verified tier,
 * CAPTCHA challenge handling via agent credentials (not human),
 * tabular data extraction, and audit trail.
 */

import AgentPass from "@agentpass/sdk";

const ap = new AgentPass({
  secret: process.env["AGENTPASS_SECRET"] ?? "example-secret-change-in-production",
  issuer: "government-example",
});

async function main() {
  console.log("=== AgentPass Government Agent ===\n");

  // 1. Issue a verified-tier passport (required for government portals)
  const passport = await ap.issue({
    principal: "compliance_team_acme",
    name: "GovDataBot v1",
    tier: "verified",
    capabilities: [
      "web:read",
      "web:forms",
      "api:read",
      "data:extract",
    ],
    expiresInHours: 2,
    metadata: {
      purpose: "company registry lookup and compliance data extraction",
      organizationId: "acme_corp_001",
    },
  });

  console.log(`Agent: ${passport.name} (${passport.agentId})`);
  console.log(`Tier: ${passport.tier} (required for gov.in portals)\n`);

  // 2. KYA Assessment — government portals require higher scores
  const kyaProfile = await ap.assess({
    passport,
    declaredIntent: "Look up company registrations in MCA portal for compliance audit",
    targetSystem: "mca.gov.in",
    signals: [
      { type: "clean_history", count: 20, windowHours: 720 },
      { type: "normal_operation", count: 100, windowHours: 24 },
    ],
  });

  console.log(`KYA Status: ${kyaProfile.status}`);
  console.log(`Trust Score: ${kyaProfile.trustScore}/100`);

  const vr = kyaProfile.verificationReplacement;
  console.log("\nGovernment Portal Verification Replacement:");
  console.log(`  ${vr.replacesCaptcha ? "✓" : "✗"} CAPTCHA (gov requires score >= 75, agent has ${kyaProfile.trustScore})`);
  console.log(`  ${vr.replacesOTP ? "✓" : "✗"} OTP (gov requires score >= 85 + trusted tier)`);
  console.log(`  ${vr.replacesLoginWall ? "✓" : "✗"} Login Wall (gov requires score >= 70 + verified tier)`);
  console.log();

  // 3. Fetch data from a government portal (MCA)
  console.log("3. Querying MCA government portal...");
  console.log("   (If CAPTCHA is encountered, agent credentials are used — no human needed)");

  const portalResult = await ap.execute({
    passport,
    kyaProfile,
    url: "https://www.mca.gov.in",
    endpointId: "fetch_portal_data",
    input: {
      url: "https://www.mca.gov.in/content/mca/global/en/mca/master-data/MDS.html",
    },
  });

  console.log(`   Portal fetch success: ${portalResult.success}`);
  if (portalResult.success && portalResult.data) {
    const data = portalResult.data as {
      tables: Record<string, string>[][];
      forms: unknown[];
      downloadLinks: unknown[];
    };
    console.log(`   Tables found: ${data.tables?.length ?? 0}`);
    console.log(`   Forms found: ${data.forms?.length ?? 0}`);
    console.log(`   Download links: ${data.downloadLinks?.length ?? 0}`);
    if (data.tables?.[0]?.[0]) {
      console.log(`   First table row: ${JSON.stringify(data.tables[0][0])}`);
    }
  }
  if (!portalResult.success) {
    console.log(`   Note: ${portalResult.error ?? portalResult.errorCode} (expected for demo without live connection)`);
  }
  console.log();

  // 4. Search company registry
  console.log("4. Searching company registry...");
  const searchResult = await ap.search({
    passport,
    kyaProfile,
    url: "https://www.mca.gov.in",
    query: "Tata Consultancy Services",
  });

  console.log(`   Search success: ${searchResult.success}`);
  if (searchResult.data) {
    const results = searchResult.data as { results?: unknown[] };
    console.log(`   Results: ${results?.results?.length ?? 0} companies found`);
  }
  console.log();

  // 5. GST verification
  console.log("5. GSTIN Validation...");
  const gstinResult = await ap.execute({
    passport,
    kyaProfile,
    url: "https://www.gst.gov.in",
    endpointId: "search_registry",
    input: {
      baseUrl: "https://www.gst.gov.in",
      query: "27AAPFU0939F1ZV",  // Example GSTIN format
    },
  });

  console.log(`   GSTIN lookup success: ${gstinResult.success}`);
  if (gstinResult.data) {
    console.log(`   Result: ${JSON.stringify(gstinResult.data)}`);
  }
  console.log();

  // 6. Simulate CAPTCHA challenge resolution
  console.log("6. CAPTCHA Challenge Simulation:");
  console.log("   If a gov portal returns a CAPTCHA challenge:");
  console.log("   → Agent credentials are presented instead of solving it");
  console.log("   → buildVerificationProof() generates a signed proof payload");
  console.log(`   → Required KYA score for gov CAPTCHA: 75`);
  console.log(`   → Agent score: ${kyaProfile.trustScore} → ${kyaProfile.trustScore >= 75 ? "SATISFIED" : "INSUFFICIENT"}`);
  console.log();

  // 7. Audit log
  console.log("7. Audit Trail:");
  const log = ap.getAuditLog();
  console.log(`   Total entries: ${log.length}`);
  for (const entry of log) {
    const url = entry.action.endpoint.slice(0, 50);
    console.log(`   [${entry.outcome}] ${entry.action.type} ${url} → ${entry.verificationUsed}`);
  }

  const chain = ap.verifyAuditChain();
  console.log(`\n   Chain verified: ${chain.valid ? "✓" : "✗"}`);

  console.log("\n=== Done ===");
}

main().catch(console.error);
