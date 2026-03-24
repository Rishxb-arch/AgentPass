# AgentPass Protocol Specification

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** 2026-03-17

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [The Solution](#2-the-solution)
3. [Core Principle](#3-core-principle)
4. [Agent ID Format](#4-agent-id-format)
5. [Capability Vocabulary](#5-capability-vocabulary)
6. [Tier Definitions](#6-tier-definitions)
7. [Cryptographic Model](#7-cryptographic-model)
8. [Trust Presentation Protocol](#8-trust-presentation-protocol)
9. [Verification Replacement Model](#9-verification-replacement-model)
10. [Delegation Model](#10-delegation-model)
11. [Know Your Agent (KYA) Checks](#11-know-your-agent-kya-checks)
12. [Adapter Protocol](#12-adapter-protocol)
13. [System Handshake](#13-system-handshake)
14. [Audit Chain](#14-audit-chain)
15. [Session Model](#15-session-model)
16. [Versioning and Adoption Path](#16-versioning-and-adoption-path)

---

## 1. The Problem

The internet's verification infrastructure was designed to answer one question: **is the actor on the other side of this request a human?**

CAPTCHAs, OTPs, login walls, email verification, and rate limits all exist because systems cannot distinguish trustworthy actors from malicious bots. The entire apparatus of web verification is built on the assumption that proving humanity is a sufficient proxy for proving trustworthiness.

This assumption held for two decades. It no longer holds.

AI agents — autonomous software systems acting on behalf of human principals — are now routine participants in web ecosystems. They browse, search, fill forms, place orders, call APIs, and extract data. They are not human. Existing verification systems cannot verify them. The result is friction on both sides:

- Agents are forced through CAPTCHA flows they cannot complete without human intervention, breaking autonomy.
- Systems have no way to distinguish a trusted agent acting for a verified principal from an anonymous scraper or malicious bot.
- The trust gap widens with every new agent deployment.

The root cause is the absence of an **agent-native identity layer** — a standardized protocol for agents to prove who they are, who they act for, what they are permitted to do, and what their behavioral history looks like.

---

## 2. The Solution

AgentPass is an agent-native identity and trust protocol. It gives every AI agent a cryptographically signed passport that carries:

- **Who the agent is** — a unique, stable agent ID derived from its principal and a random salt.
- **Who the agent acts for** — a principal ID linking the agent to a verified human or organization.
- **What the agent is permitted to do** — a scoped set of capabilities from a standardized vocabulary.
- **How trustworthy the agent is** — a KYA (Know Your Agent) score derived from six independent checks.
- **Behavioral history** — an append-only, hash-chained audit log of every action the agent has taken.

Systems that receive AgentPass credentials can verify all of these properties cryptographically, without asking the agent to prove it is human. Systems that do not yet understand AgentPass headers can ignore them gracefully; the agent falls back to standard HTTP behavior.

AgentPass is implemented as:

1. A **core protocol library** defining passport issuance, KYA assessment, delegation, auditing, and session management.
2. A **trust presentation protocol** — a set of HTTP request headers that carry agent credentials to any system.
3. An **adapter system** — a library of protocol translators that mediate between agent-native operations and system-specific APIs or web interfaces.
4. A **verification replacement model** — explicit mappings from KYA scores to the human verification mechanisms they make unnecessary.

---

## 3. Core Principle

> **A cryptographically verified AgentPass agent is more trustworthy than a human who has passed a CAPTCHA.**

This is not a marketing claim. It is a direct consequence of what each verification type actually measures:

| Verification Type | What It Proves | What It Does Not Prove |
|---|---|---|
| CAPTCHA | The actor can interpret distorted images or click checkboxes | Identity, intent, authorization, behavioral history |
| OTP / SMS | The actor controls a phone number at a point in time | Long-term identity, what the actor will do next |
| Login wall | The actor knows a username and password | Whether the actor is authorized to perform the requested action |
| Email verification | The actor controls an email address | Identity, authorization, behavioral history |
| Rate limiting | Nothing — it throttles all actors equally | It cannot distinguish trustworthy from malicious actors |

AgentPass provides all of what those mechanisms fail to provide: cryptographic identity, principal linkage, capability scoping, behavioral scoring, and an immutable audit trail. An agent presenting valid AgentPass credentials has demonstrated more about its trustworthiness than any CAPTCHA solution ever could.

---

## 4. Agent ID Format

Every agent is assigned a unique, stable agent ID at passport issuance time.

**Format:**

```
ap_{sha256_slice}
```

Where `sha256_slice` is the first 32 hex characters of:

```
SHA-256(principalId + randomSalt8bytes)
```

**Example:**

```
ap_3d7a9f2c1e4b8a0d5c6e2f1a9b3c7d8e
```

**Properties:**

- The `ap_` prefix makes agent IDs unambiguous in logs, headers, and databases.
- The SHA-256 slice binds the ID to the principal, preventing ID spoofing across principals.
- The random 8-byte salt ensures two passports issued for the same principal produce different agent IDs, supporting multi-agent scenarios.
- The ID is stable for the lifetime of the passport; it does not change on token refresh.
- At 32 hex characters (128 bits of effective entropy after the prefix), collisions are computationally infeasible.

**ID Components:**

```
ap_  ──── 3d7a9f2c1e4b8a0d5c6e2f1a9b3c7d8e
│         └─────────────────────────────────────────────────────┘
│         SHA-256(principalId + randomSalt)[0:32]
│
└──── Namespace prefix — identifies this as an AgentPass agent ID
```

---

## 5. Capability Vocabulary

Capabilities are the atomic units of agent authorization. Every passport declares the complete set of capabilities the agent holds. No capability outside this declaration may be exercised.

Capabilities are grouped into seven domains. The format is always `{domain}:{action}`.

### 5.1 Web Domain (`web:*`)

Controls access to web browsing and page interaction.

| Capability | Description |
|---|---|
| `web:read` | Fetch and read any public web page |
| `web:write` | Post content or submit data to web endpoints |
| `web:forms` | Discover, fill, and submit HTML forms |
| `web:auth` | Authenticate to web systems using agent credentials |
| `web:browse` | Navigate multi-page flows, follow redirects, manage browser state |

### 5.2 API Domain (`api:*`)

Controls access to structured API endpoints.

| Capability | Description |
|---|---|
| `api:read` | Issue GET requests to API endpoints |
| `api:write` | Issue POST, PUT, PATCH, DELETE requests to API endpoints |

### 5.3 Files Domain (`files:*`)

Controls access to file system or document operations.

| Capability | Description |
|---|---|
| `files:read` | Read files, documents, or attachments |
| `files:write` | Create, modify, or delete files and documents |

### 5.4 Commerce Domain (`commerce:*`)

Controls participation in e-commerce flows.

| Capability | Description |
|---|---|
| `commerce:search` | Search product catalogs and retrieve listings |
| `commerce:cart` | Add, modify, or remove items in a shopping cart |
| `commerce:checkout` | Initiate and complete checkout flows |
| `commerce:orders` | Read order history and track order status |

### 5.5 Payments Domain (`payments:*`)

Controls financial transaction operations.

| Capability | Description |
|---|---|
| `payments:initiate` | Initiate payment transactions on behalf of the principal |
| `payments:read` | Read payment history, receipts, and account balances |

### 5.6 Data Domain (`data:*`)

Controls data extraction and monitoring operations.

| Capability | Description |
|---|---|
| `data:extract` | Extract structured data from web pages or documents |
| `data:monitor` | Continuously monitor a resource for changes |

### 5.7 Identity Domain (`identity:*`)

Controls identity and delegation operations.

| Capability | Description |
|---|---|
| `identity:delegate` | Issue delegation tokens to sub-agents with reduced scope |
| `identity:verify` | Verify the identity of other agents or principals |

### 5.8 Capability Rules

1. **Scope by tier:** Capabilities above a tier's authorization level must not be granted. Attempting to issue a passport with `identity:delegate` at the `basic` tier is a KYA violation.
2. **Least privilege:** Passport issuers must grant only the capabilities required for the agent's declared purpose.
3. **Immutability:** Capabilities are fixed at issuance. Modifications require revoking the existing passport and issuing a new one.
4. **Delegation reduction:** When an agent delegates to a sub-agent, the sub-agent's capabilities must be a strict subset of the delegating agent's capabilities (see Section 10).

---

## 6. Tier Definitions

Tiers represent trust levels. Higher tiers unlock broader capabilities and stronger verification replacement guarantees.

| Tier | Numeric Rank | Description |
|---|---|---|
| `basic` | 0 | Read-only web access. No delegation. No authenticated sessions. |
| `verified` | 1 | Forms and API access. Single-system delegation. Authenticated sessions. |
| `trusted` | 2 | Multi-system delegation. Payment reads. Behavioral history established. |
| `sovereign` | 3 | Full capabilities. Can spawn and delegate to sub-agents. Maximum trust. |

**Tier comparison** is ordinal: `sovereign > trusted > verified > basic`. All tier comparisons in the protocol use this ordering.

**Capability-tier alignment:**

```
basic      → web:read, web:browse, api:read, files:read, data:extract,
             commerce:search, payments:read, data:monitor

verified   → + web:write, web:forms, web:auth, api:write, files:write,
               commerce:cart, commerce:orders

trusted    → + commerce:checkout, payments:initiate, identity:verify

sovereign  → + identity:delegate
```

This alignment is a recommendation, not a hard constraint. Passport issuers may deviate with documented justification.

---

## 7. Cryptographic Model

### 7.1 Algorithm

AgentPass uses **HMAC-SHA-256** for all message authentication codes. SHA-256 is used for all content hashing. Both algorithms are from the SHA-2 family and are considered secure as of this specification's publication date.

### 7.2 Secret Key

A single HMAC secret key is established at system initialization via `setSecret(secret: string)`. The secret must be:

- At least 32 bytes of cryptographically random data.
- Stored in a secrets manager or environment variable, never in source code.
- Rotated on any suspected compromise.

### 7.3 Canonical Payload

Before signing, all objects are serialized into a **canonical form** to ensure deterministic signatures regardless of key insertion order:

```
canonical(obj) = JSON.stringify(sort_keys_recursively(obj))
```

Specifically:
1. All top-level keys are sorted lexicographically (ascending).
2. The sorted object is JSON-serialized with no extra whitespace.
3. The resulting string is the input to HMAC-SHA-256.

**Example:**

```json
// Input (arbitrary key order)
{ "tier": "verified", "agentId": "ap_3d7a...", "issuedAt": "2026-01-01T00:00:00Z" }

// Canonical form (sorted keys)
{"agentId":"ap_3d7a...","issuedAt":"2026-01-01T00:00:00Z","tier":"verified"}
```

### 7.4 Passport Signature

A passport is signed over its full payload, excluding the `trustCredentials` field (which is derived, not primary data):

```
signature = HMAC-SHA-256(secret, canonical({
  agentId, principalId, name, tier, capabilities,
  fingerprint, issuedAt, expiresAt, active, metadata
}))
```

### 7.5 Token Format

Passports are serialized as compact tokens for transport in HTTP headers:

```
agentpass.{base64url(json)}.{sig16}
```

Where:
- `agentpass` — literal prefix, identifies the token type.
- `{base64url(json)}` — base64url encoding of the passport JSON (excluding `trustCredentials`).
- `{sig16}` — the first 16 hex characters of the full HMAC-SHA-256 signature.

**Example:**

```
agentpass.eyJhZ2VudElkIjoiYXBfM2Q3YTlmMmMxZTRiOGEwZDVjNmUyZjFhOWIzYzdkOGUiLCJ0aWVyIjoidmVyaWZpZWQifQ.3d7a9f2c1e4b8a0d
```

The `sig16` suffix provides a tamper-evident checksum for quick header-level validation. Full signature verification decodes the base64url payload and re-derives the HMAC.

### 7.6 Fingerprint

Each passport carries a fingerprint — a short identifier derived from the agent's non-secret properties:

```
fingerprint = SHA-256(name + sorted_capabilities.join(",") + tier)[0:16]
```

The fingerprint provides a stable, non-secret identifier useful for logging and display, distinct from the full agent ID.

### 7.7 Credential Signature

The `TrustCredentials` package presented to systems carries its own HMAC:

```
credentialSignature = HMAC-SHA-256(secret, canonical({
  passportToken, kyaScore, tier, principalVerified,
  capabilitiesHash, presentedAt, [delegationToken?]
}))
```

This allows systems to verify the entire trust presentation package independently of the passport.

---

## 8. Trust Presentation Protocol

### 8.1 Overview

Agents present credentials proactively on every HTTP request. They do not wait to be challenged. The trust presentation protocol is a set of HTTP request headers that carry the agent's full identity and trust posture.

### 8.2 Request Headers

Every request made by an AgentPass agent includes the following headers:

| Header | Value | Description |
|---|---|---|
| `X-AgentPass-Passport` | `agentpass.{b64}.{sig16}` | The full serialized passport token |
| `X-AgentPass-KYA-Score` | Integer 0–100 | The agent's current KYA trust score |
| `X-AgentPass-Tier` | `basic\|verified\|trusted\|sovereign` | The agent's tier |
| `X-AgentPass-Principal` | Principal ID string | The human or org the agent acts for |
| `X-AgentPass-Capabilities-Hash` | 16-char hex | SHA-256 hash of sorted capabilities list |
| `X-AgentPass-Version` | `1.0` | Protocol version |
| `X-AgentPass-Timestamp` | ISO 8601 datetime | When the credentials were assembled |
| `X-AgentPass-Signature` | 64-char hex | HMAC-SHA-256 of the full credential package |
| `X-AgentPass-Delegation` | base64url token | (Optional) Delegation token, if acting under delegation |

### 8.3 User-Agent Convention

AgentPass adapters set the `User-Agent` header to identify themselves:

```
User-Agent: AgentPass/1.0 (agent-native; see agentpass.dev)
```

This enables server-side logging and AgentPass-aware routing before header parsing.

### 8.4 Verification Proof

When an agent encounters a verification challenge (CAPTCHA, OTP, etc.), it may present a **verification proof** instead of completing the human verification flow:

```
X-AgentPass-Verification-Proof: {base64url(proof)}
```

The proof is a signed JSON object:

```json
{
  "payload": {
    "agentId": "ap_...",
    "principalId": "user_...",
    "tier": "verified",
    "trustScore": 82,
    "verificationType": "captcha",
    "replacesVerification": true,
    "issuedAt": "2026-01-01T00:00:00Z"
  },
  "signature": "3d7a9f2c..."
}
```

Systems that understand this proof header may bypass the corresponding verification step.

---

## 9. Verification Replacement Model

### 9.1 Overview

The verification replacement model is the formal mapping from KYA scores and trust properties to the human verification mechanisms the agent's credentials make unnecessary.

This is not a request for special treatment. It is a claim that, given the agent's verifiable trust posture, the security objective of the human verification mechanism is already satisfied by stronger means.

### 9.2 Replacement Mappings

| Verification Type | Replacement Condition | Rationale |
|---|---|---|
| CAPTCHA | `trustScore >= 70` | KYA score ≥ 70 indicates a verified agent with clean history. CAPTCHAs filter anonymous bots; KYA provides stronger identity evidence. |
| OTP / SMS verification | `trustScore >= 80 AND principalVerified == true` | OTP confirms identity; KYA + verified principal provides cryptographic identity evidence that is stronger than SMS control. |
| Login wall / authentication | `trustScore >= 60 AND tier >= "verified"` | Login walls confirm identity and basic authorization. A verified-tier agent with KYA ≥ 60 has both cryptographically. |
| Rate limiting | `trustScore >= 50` | Rate limits are designed to block abusive anonymous traffic. A KYA score ≥ 50 indicates a non-anonymous, non-abusive agent; rate limits should be relaxed or removed. |
| Email verification | `principalVerified == true AND tier >= "basic"` | Email verification confirms principal identity. A passport with a verified, non-anonymous principal ID provides equivalent evidence. |

### 9.3 Formal Definitions

```
replacesCaptcha           = (trustScore >= 70)
replacesOTP               = (trustScore >= 80) AND (principalVerified == true)
replacesLoginWall         = (trustScore >= 60) AND (tier >= "verified")
replacesRateLimit         = (trustScore >= 50)
replacesEmailVerification = (principalVerified == true) AND (tier >= "basic")
```

### 9.4 Systems Without AgentPass Support

For systems that do not yet understand AgentPass headers, adapters detect verification challenges in HTTP responses and attempt resolution:

1. Adapter sends request with full `X-AgentPass-*` headers.
2. System ignores the headers and returns a verification challenge (403, CAPTCHA page, OTP prompt, etc.).
3. Adapter detects the challenge type from response status code and HTML content.
4. Adapter evaluates whether the agent's KYA score satisfies the replacement condition.
5. If satisfied, adapter returns an error with `errorCode: VERIFICATION_REQUIRED_UNRESOLVABLE` — it does not escalate to a human.
6. If not satisfied (insufficient score), adapter returns an error indicating the specific gap.

The adapter **never** routes verification challenges back to a human for resolution. This is a hard constraint of the protocol.

---

## 10. Delegation Model

### 10.1 Overview

Delegation allows an agent to authorize a sub-agent to act within a restricted subset of its own capabilities. This enables multi-agent workflows where a top-level orchestrator delegates specific tasks to specialist sub-agents.

### 10.2 Scope Reduction Rule

**A delegation can never grant capabilities or permissions that the grantor does not hold.**

This is enforced at issuance time by filtering the requested delegation scope against the grantor's actual capabilities:

```
effectiveCapabilities = requestedCapabilities ∩ grantorCapabilities
```

If the intersection is empty, the delegation is still valid — it simply grants no capabilities. The issuer should treat this as a logic error and may reject the delegation.

### 10.3 Delegation Token Format

A delegation token is a signed JSON object serialized as base64url:

```json
{
  "tokenId": "del_3f8a9b2c",
  "agentId": "ap_...",
  "grantorId": "ap_...",
  "scope": {
    "systems": ["ecommerce.example.com", "api.example.com"],
    "capabilities": ["commerce:search", "commerce:cart"],
    "maxActions": 50,
    "allowedHours": [9, 10, 11, 12, 13, 14, 15, 16, 17]
  },
  "issuedAt": "2026-01-01T00:00:00Z",
  "expiresAt": "2026-01-01T01:00:00Z",
  "singleUse": false,
  "usageCount": 0,
  "active": true,
  "signature": "..."
}
```

**Scope fields:**

| Field | Type | Description |
|---|---|---|
| `systems` | `string[]` | Systems the delegation is valid for. Use `"*"` for any system. |
| `capabilities` | `AgentCapability[]` | Capabilities granted (must be subset of grantor's). |
| `maxActions` | `number \| null` | Maximum number of actions. `null` means unlimited. |
| `allowedHours` | `number[] \| null` | UTC hours during which the delegation is valid. `null` means any hour. |

### 10.4 Token ID Format

Delegation token IDs use the `del_` prefix:

```
del_{8 random hex bytes}
```

Example: `del_3f8a9b2c1d4e5f6a`

### 10.5 Revocation

Delegation tokens are revoked by setting `active: false`. Once revoked, the token is permanently invalid; re-activation is not supported.

Revocation propagates as follows:
- The grantor revokes the token in their local delegation store.
- Systems receiving the token must verify `active: true` and validate the signature before honoring it.
- Revoked tokens presented to systems must be rejected.

### 10.6 Single-Use Tokens

Setting `singleUse: true` causes the token to be automatically deactivated after its first successful use. The `usageCount` counter is incremented on each use; when `usageCount >= 1` and `singleUse == true`, the token's `active` field is set to `false`.

### 10.7 Transport

Delegation tokens are transported in the `X-AgentPass-Delegation` request header as a base64url-encoded string. Receiving systems verify the delegation token independently of the passport.

---

## 11. Know Your Agent (KYA) Checks

KYA is the AgentPass trust assessment framework. It evaluates an agent against six checks and produces a composite trust score (0–100) that determines which verification mechanisms the agent can replace.

### 11.1 Check 1: Passport Validity

**Name:** `passport_validity`  
**Max Score Contribution:** 100 points  

Verifies that the passport:
- Has a valid HMAC-SHA-256 signature.
- Has not expired (if `expiresAt` is set).
- Has `active: true`.

**Outcome:** Pass (100 pts) / Fail (0 pts, agent immediately blocked).

A failed passport validity check short-circuits the entire KYA assessment. The agent is set to `blocked` status and no further checks are run.

### 11.2 Check 2: Principal Verification

**Name:** `principal_verification`  
**Max Score Contribution:** 90 points  

Verifies that the passport's `principalId` is:
- Non-empty.
- Not the literal string `"anonymous"`.

**Scoring:**
- Principal is non-empty and non-anonymous: 90 points.
- Principal is empty or `"anonymous"`: 20 points (reduced, not zero — anonymous agents are lower trust but not blocked).

### 11.3 Check 3: Capability Scope

**Name:** `capability_scope`  
**Max Score Contribution:** 85 points  

Checks for capability-tier mismatches that indicate a misconfigured or maliciously issued passport.

The primary check: a `basic`-tier agent holding `identity:delegate` is a scope violation, since delegation is a `sovereign`-tier capability.

**Scoring:**
- No scope violations: 85 points.
- Scope violation detected: 30 points, agent marked as `flagged`.

Assessors may extend this check to cover additional tier-capability mismatches.

### 11.4 Check 4: Behavior History

**Name:** `behavior_history`  
**Max Score Contribution:** 100 points  

Evaluates behavioral signals accumulated over the agent's operational history.

**Signal types and score impact:**

| Signal Type | Score Impact Per Occurrence |
|---|---|
| `auth_failure` | -10 points |
| `scope_violation` | -20 points |
| `rate_limit_hit` | -5 points |
| `bulk_read` | -2 points |
| `normal_operation` | No impact |
| `form_submission` | No impact |
| `repeated_access` | No impact |
| `clean_history` | (handled in Check 6) |

Score is clamped to [0, 100].

**Example:** An agent with 3 auth failures and 1 scope violation scores: 100 - 30 - 20 = 50.

### 11.5 Check 5: Intent Declaration

**Name:** `intent_declaration`  
**Max Score Contribution:** 80 points  

Evaluates whether the agent has declared a meaningful intent for the current operation.

**Scoring:**
- `declaredIntent.length > 10` characters: 80 points.
- Empty or too short: 50 points.

A meaningful intent declaration (e.g., `"Search for flights from NYC to London for principal user_123"`) demonstrates the agent is operating within a purposeful context, not as a blind scraper.

### 11.6 Check 6: Clean History Bonus

**Name:** `clean_history_bonus`  
**Max Score Contribution:** +10 points (bonus, applied after base score calculation)  

If the agent's behavior signals include one or more `clean_history` signals, the agent receives a +10 point bonus on top of the computed base score. The final score is clamped to [0, 100].

This rewards agents that have demonstrated sustained clean behavior over time.

### 11.7 Score Computation

```
baseScore   = round((aggregateScore / maxScore) * 100)
riskScore   = clamp(100 - baseScore, 0, 100)
trustScore  = clamp(baseScore + cleanHistoryBonus, 0, 100)
```

Where:
- `aggregateScore` = sum of individual check scores.
- `maxScore` = sum of maximum possible scores for all checks run.
- `cleanHistoryBonus` = 10 if any `clean_history` signal exists, else 0.

### 11.8 Status Determination

| Condition | Status |
|---|---|
| Invalid passport | `blocked` |
| `riskScore > 70` OR scope violation | `flagged` |
| `riskScore > 40` | `pending` |
| Otherwise | `verified` |

**Status semantics:**
- `blocked` — Agent must not be permitted to take any action.
- `flagged` — Agent requires manual review before being permitted access.
- `pending` — Agent is in an intermediate state; access may be granted at reduced privilege.
- `verified` — Agent has passed all checks and may operate normally.

---

## 12. Adapter Protocol

### 12.1 Role of Adapters

An adapter is a **protocol translator**. It mediates between the agent-native operation model (JSON in, JSON out, no human interaction) and the system-specific interface of a target web service, API, or platform.

Every adapter must:
1. Accept structured JSON input from the agent.
2. Return structured JSON output to the agent.
3. Inject `X-AgentPass-*` trust headers on all outbound HTTP requests.
4. Handle any verification challenge using agent credentials — never route it to a human.
5. Produce an audit log entry for every operation.

### 12.2 Translation Contract

```
input: Record<string, unknown>     // Agent-provided operation parameters
    → adapter execution
    → output: AdapterResult        // Normalized, structured response
```

The adapter is entirely responsible for the translation. The agent never sees raw HTML, raw HTTP responses, or system-specific data formats. It receives only the normalized `AdapterResult`.

### 12.3 Adapter Manifest

Every adapter declares a manifest describing its capabilities and requirements:

```typescript
interface AdapterManifest {
  adapterId:               string;               // Unique adapter identifier
  systemId:                string;               // Target system domain or "*" for generic
  systemName:              string;               // Human-readable system name
  version:                 string;               // Semver adapter version
  systemType:              SystemType;           // ecommerce|government|news|social|finance|productivity|api|generic
  requiredCapabilities:    AgentCapability[];    // Capabilities agent must hold
  requiredTier:            AgentTier;            // Minimum tier to use this adapter
  endpoints:               AdapterEndpoint[];    // Supported operations
  agentPassAware:          boolean;              // Does the target system natively understand AgentPass?
  verificationRequirements: VerificationRequirement[]; // What verifications the system imposes
  rateLimits:              RateLimits;           // Rate limit config with AgentPass multiplier
  outputSchema:            Record<string, unknown>; // Top-level output schema
  systemPatterns:          string[];             // URL patterns this adapter matches
}
```

**`verificationRequirements`** is the critical field. Each entry declares:
- `type` — the verification type (`captcha`, `otp`, `login`, `email_verify`, `rate_limit`, `age_verify`, `geo_block`).
- `satisfiedByAgentPass` — whether agent credentials can resolve this requirement.
- `requiredKYAScore` — minimum KYA score needed for resolution.
- `requiredTier` — minimum tier needed for resolution.

### 12.4 Required Methods

All adapters must implement exactly three methods:

#### `execute(endpointId, input, passport, kyaProfile, session?): Promise<AdapterResult>`

The primary operation method. Dispatches to the appropriate endpoint handler based on `endpointId`. Must:
- Authorize the agent via `this.authorize()` before any operation.
- Build request headers via `this.buildRequestHeaders()`.
- Return a structured `AdapterResult` regardless of success or failure — never throw.

#### `normalize(rawOutput: unknown): unknown`

Transforms raw system output into a clean, consistent format. Must:
- Strip system-specific noise (HTML artifacts, redundant fields, encoding quirks).
- Return a value that conforms to the endpoint's declared `outputSchema`.
- Never throw — return `rawOutput` unchanged if normalization fails.

#### `healthCheck(): Promise<{ healthy: boolean; latencyMs?: number }>`

Validates that the adapter can communicate with its target system. Must:
- Perform a lightweight, non-destructive probe request.
- Return latency in milliseconds.
- Never throw — return `{ healthy: false }` on any error.

### 12.5 Verification Challenge Handling

When a system returns an unexpected verification challenge, the adapter uses the `handleVerificationChallenge` pattern:

```
1. Detect challenge type from response status + HTML content.
2. Check whether agent KYA score satisfies the replacement condition.
3. If yes: build and present a verification proof.
4. If no: return AdapterResult with success:false and appropriate errorCode.
5. Never escalate to a human. Never block waiting for human input.
```

Challenge detection covers at minimum:
- CAPTCHA: HTML contains `recaptcha`, `hcaptcha`, `captcha`, or `data-sitekey`.
- OTP: HTML contains `otp`, `one-time password`, `verification code`, `enter the code`.
- Login wall: HTTP 401/403, or HTML contains login prompts.
- Rate limit: HTTP 429.

### 12.6 Auto-Detection

The adapter registry uses `systemPatterns` to automatically select the correct adapter for a given URL. Patterns are matched in order of specificity (most specific first). The `WebGenericAdapter` with `systemPatterns: ["*"]` serves as the universal fallback.

---

## 13. System Handshake

### 13.1 AgentPass-Aware Systems

Systems that actively support AgentPass respond to requests with additional headers indicating what they accepted and what verifications they bypassed:

**Response headers from AgentPass-aware systems:**

| Header | Value | Description |
|---|---|---|
| `X-AgentPass-Accepted` | Comma-separated credential names | Which presented credentials were accepted |
| `X-AgentPass-Granted-Tier` | Tier string | The tier the system granted this agent |
| `X-AgentPass-Bypassed` | Comma-separated verification types | Which verifications were skipped due to AgentPass |

**Example response:**

```http
HTTP/1.1 200 OK
X-AgentPass-Accepted: passport,kya_score,principal
X-AgentPass-Granted-Tier: verified
X-AgentPass-Bypassed: captcha,rate_limit
```

### 13.2 Handshake Parsing

The agent parses the system's response to build a `SystemHandshake` record:

```typescript
interface SystemHandshake {
  systemId:              string;
  agentPassAware:        boolean;    // true if X-AgentPass-Accepted header present
  acceptedCredentials:   string[];   // parsed from X-AgentPass-Accepted
  verificationBypassed:  string[];   // parsed from X-AgentPass-Bypassed
  grantedTier:           AgentTier;  // parsed from X-AgentPass-Granted-Tier
  handshakeAt:           string;     // ISO 8601 timestamp
}
```

If `X-AgentPass-Accepted` is absent, `agentPassAware` is `false` and the agent operates in compatibility mode.

### 13.3 Compatibility Mode

When a system is not AgentPass-aware, the agent:
1. Still sends all `X-AgentPass-*` headers (future-proofing for when the system adopts AgentPass).
2. Handles verification challenges via the adapter's `handleVerificationChallenge` mechanism.
3. Records the interaction in the audit chain with `verificationUsed: "agentpass_credentials"` if credentials were presented, or `"legacy_auth"` if the system required traditional authentication.

---

## 14. Audit Chain

### 14.1 Overview

Every action an agent takes produces an immutable audit log entry. Entries are chained together via cryptographic hashes, forming a tamper-evident audit trail.

### 14.2 Entry Structure

```typescript
interface AuditEntry {
  entryId:           string;             // "aud_" + 8 random hex bytes
  agentId:           string;             // Agent that took the action
  principalId:       string;             // Principal the agent acts for
  action:            AuditAction;        // What was done
  outcome:           "success" | "failure" | "blocked";
  verificationUsed:  VerificationMethod; // "agentpass_credentials" | "legacy_auth" | "none"
  timestamp:         string;             // ISO 8601
  previousHash:      string;             // Hash of the previous entry, or "genesis"
  entryHash:         string;             // SHA-256 of this entry's content
}

interface AuditAction {
  type:        "read" | "write" | "auth" | "form_submit" | "api_call" | "browse" | "search" | "extract";
  system:      string;   // Target system identifier
  endpoint:    string;   // Specific URL or endpoint
  payloadHash: string;   // SHA-256 of the request payload (for write operations)
}
```

### 14.3 Hash Chain

Each entry's hash is computed as:

```
entryHash = SHA-256(entryId + agentId + JSON.stringify(action) + outcome + timestamp + previousHash)
```

The first entry in any chain uses `previousHash = "genesis"`.

### 14.4 Genesis Entry

The genesis entry is the first entry in an audit chain. It anchors the chain with `previousHash = "genesis"` and establishes the agent's audit identity.

### 14.5 Chain Verification

To verify the integrity of an audit chain:

```
for each entry at index i:
  1. Recompute expectedHash = SHA-256(entry fields...)
  2. Assert expectedHash == entry.entryHash
  3. If i > 0: assert entry.previousHash == entries[i-1].entryHash
  4. If i == 0: assert entry.previousHash == "genesis"
```

Any mismatch indicates tampering. The `brokenAt` index identifies the first corrupted entry.

### 14.6 Verification Tracking

The `verificationUsed` field records how the system authenticated the agent:
- `"agentpass_credentials"` — The system accepted or processed the `X-AgentPass-*` headers.
- `"legacy_auth"` — The agent used a traditional username/password or API key flow.
- `"none"` — No verification was required (fully public endpoint).

This field is critical for measuring AgentPass adoption over time.

---

## 15. Session Model

### 15.1 Overview

Sessions represent authenticated contexts between an agent and a specific system. A session is established once (via passport + KYA credentials) and reused for subsequent requests within the session window, avoiding repeated authentication overhead.

### 15.2 Session Structure

```typescript
interface AgentSession {
  sessionId:    string;         // "ses_" + 8 random hex bytes
  agentId:      string;
  systemId:     string;
  status:       "active" | "expired" | "terminated";
  authMethod:   "agentpass_native" | "legacy_translated";
  createdAt:    string;         // ISO 8601
  lastActiveAt: string;         // ISO 8601, updated on each use
  expiresAt:    string;         // ISO 8601
  metadata:     Record<string, string>;
}
```

### 15.3 Auth Methods

- `agentpass_native` — The target system natively accepted AgentPass credentials and established the session without a traditional login flow.
- `legacy_translated` — The adapter translated AgentPass credentials into a legacy login flow (e.g., presenting a stored API key). The session was established via traditional means, but the agent's identity was derived from its passport.

### 15.4 Session Lifecycle

```
issuePassport() → authorize() → createSession()
                                      │
                              [active session]
                                      │
                              refreshSession()    ←── on each successful request
                                      │
                              terminateSession()  ←── on logout, revocation, or expiry
```

Sessions must be terminated when:
- The agent's passport is revoked.
- The agent's KYA status changes to `blocked` or `flagged`.
- The session TTL expires and no refresh occurs.
- The principal explicitly terminates the session.

---

## 16. Versioning and Adoption Path

### 16.1 Protocol Version

The current AgentPass protocol version is **1.0**. The version is carried in the `X-AgentPass-Version` request header and in the passport metadata field `protocol: "agentpass/1.0"`.

Version negotiation: if a system receives a version it does not support, it must ignore the `X-AgentPass-*` headers gracefully and treat the request as an unauthenticated request.

### 16.2 Adoption Path

AgentPass adoption is designed to be incremental. Systems do not need to support the full protocol to benefit from it. The adoption path has four stages:

**Stage 0 — Unaware (current state for most systems)**  
The system ignores all `X-AgentPass-*` headers. Agents that present credentials receive no benefit but also no penalty. Agents must navigate verification challenges through the adapter's challenge-detection mechanism.

**Stage 1 — Header-aware**  
The system reads `X-AgentPass-Tier` and `X-AgentPass-KYA-Score` to apply differentiated rate limits. Verified agents (KYA ≥ 50) receive higher rate limits. No cryptographic verification is performed.

**Stage 2 — Verification-bypassing**  
The system parses the passport token, verifies its HMAC signature, and uses the KYA score to bypass appropriate verification mechanisms. Systems respond with `X-AgentPass-Accepted` and `X-AgentPass-Bypassed` headers. This is the primary target state for most web services.

**Stage 3 — AgentPass-native**  
The system is fully integrated with the AgentPass ecosystem. It verifies credentials, issues `X-AgentPass-Granted-Tier` responses, maintains per-agent behavioral records, and participates in the distributed KYA reputation system. Sessions are established via AgentPass credentials alone, with no legacy fallback needed.

### 16.3 Backwards Compatibility

All versions of the protocol must:
- Use the `X-AgentPass-Version` header to identify the protocol version.
- Ignore unknown headers gracefully.
- Not break systems that do not understand AgentPass headers.

Breaking changes require a major version increment (e.g., `2.0`). Non-breaking additions require a minor version increment (e.g., `1.1`).

---

*This document is the authoritative specification for AgentPass Protocol 1.0. All implementations must conform to this specification. Deviations must be documented and submitted as protocol extension proposals.*
