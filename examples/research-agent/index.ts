/**
 * AgentPass Research Agent Example
 *
 * Demonstrates: browsing any URL, extracting structured data, calling public REST APIs,
 * and logging everything with chain verification.
 */

import AgentPass from "@agentpass/sdk";

const ap = new AgentPass({
  secret: process.env["AGENTPASS_SECRET"] ?? "example-secret-change-in-production",
  issuer: "research-example",
});

async function main() {
  console.log("=== AgentPass Research Agent ===\n");

  // 1. Issue passport with research capabilities
  const passport = await ap.issue({
    principal: "researcher_xyz",
    name: "ResearchBot v2",
    tier: "verified",
    capabilities: [
      "web:browse",
      "web:read",
      "data:extract",
      "data:monitor",
      "api:read",
    ],
    expiresInHours: 4,
    metadata: { purpose: "market research and data aggregation" },
  });

  console.log(`Agent: ${passport.name} (${passport.agentId})`);
  console.log(`Tier: ${passport.tier}\n`);

  // 2. Assess KYA
  const kyaProfile = await ap.assess({
    passport,
    declaredIntent: "Research technology news and extract article summaries for analysis",
    signals: [
      { type: "clean_history", count: 10, windowHours: 720 },
      { type: "normal_operation", count: 200, windowHours: 24 },
    ],
  });

  console.log(`KYA Score: ${kyaProfile.trustScore}/100 | Status: ${kyaProfile.status}`);
  const vr = kyaProfile.verificationReplacement;
  console.log(`Replaces: ${[
    vr.replacesCaptcha && "CAPTCHA",
    vr.replacesLoginWall && "Login Wall",
    vr.replacesRateLimit && "Rate Limits",
  ].filter(Boolean).join(", ")}\n`);

  // 3. Browse a news URL
  console.log("3. Browsing Hacker News...");
  try {
    const page = await ap.browse({
      passport,
      kyaProfile,
      url: "https://news.ycombinator.com",
    });
    console.log(`   Title: ${page.title}`);
    console.log(`   Links found: ${page.links.length}`);
    console.log(`   Text preview: ${page.text.slice(0, 200)}...\n`);
  } catch (err) {
    console.log(`   Browse result: ${String(err).slice(0, 100)}\n`);
  }

  // 4. Extract structured data from a page
  console.log("4. Extracting structured data from a public site...");
  try {
    const extracted = await ap.extract({
      passport,
      kyaProfile,
      url: "https://example.com",
      schema: {
        title: "h1",
        description: "p",
        heading: "h2",
      },
    });
    console.log(`   Extracted: ${JSON.stringify(extracted, null, 2)}\n`);
  } catch (err) {
    console.log(`   Extract result: ${String(err).slice(0, 100)}\n`);
  }

  // 5. Call a public REST API
  console.log("5. Calling public REST API (JSONPlaceholder)...");
  const apiResult = await ap.execute({
    passport,
    kyaProfile,
    url: "https://jsonplaceholder.typicode.com",
    endpointId: "rest_call",
    input: {
      url: "https://jsonplaceholder.typicode.com/posts/1",
      method: "GET",
    },
  });

  console.log(`   API call success: ${apiResult.success}`);
  if (apiResult.data) {
    const data = apiResult.data as { data: Record<string, unknown> };
    const post = data.data as Record<string, unknown>;
    console.log(`   Post title: "${post?.["title"]}"`);
    console.log(`   Verification used: ${apiResult.auditEntry.verificationUsed}\n`);
  }

  // 6. Make a GraphQL query
  console.log("6. GraphQL query...");
  const graphqlResult = await ap.execute({
    passport,
    kyaProfile,
    url: "https://countries.trevorblades.com/graphql",
    endpointId: "graphql_query",
    input: {
      url: "https://countries.trevorblades.com/graphql",
      query: `{ countries { code name } }`,
    },
  });

  console.log(`   GraphQL success: ${graphqlResult.success}`);
  if (graphqlResult.data) {
    const gqlData = graphqlResult.data as { data?: { data?: { countries?: unknown[] } } };
    const countries = gqlData.data?.data?.countries;
    if (Array.isArray(countries)) {
      console.log(`   Countries returned: ${countries.length}`);
      console.log(`   First 3: ${countries.slice(0, 3).map((c: unknown) => (c as Record<string, string>)["name"]).join(", ")}`);
    }
  }
  console.log();

  // 7. Audit log and chain verification
  console.log("7. Audit Summary:");
  const log = ap.getAuditLog();
  console.log(`   Total entries: ${log.length}`);
  for (const entry of log) {
    console.log(`   [${entry.outcome.toUpperCase()}] ${entry.action.type} → ${entry.action.endpoint.slice(0, 60)} (${entry.verificationUsed})`);
  }

  const chain = ap.verifyAuditChain();
  console.log(`\n   Chain integrity: ${chain.valid ? "✓ VALID" : "✗ BROKEN"}`);

  console.log("\n=== Done ===");
}

main().catch(console.error);
