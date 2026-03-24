# AgentPass Trust Model

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** 2026-03-17

---

## Table of Contents

1. [Why CAPTCHAs Exist](#1-why-captchas-exist)
2. [Why CAPTCHAs Are Wrong for Agents](#2-why-captchas-are-wrong-for-agents)
3. [The AgentPass Trust Stack](#3-the-agentpass-trust-stack)
4. [Why This Stack Is More Rigorous Than Any CAPTCHA](#4-why-this-stack-is-more-rigorous-than-any-captcha)
5. [Verification Replacement Mapping](#5-verification-replacement-mapping)
6. [Adoption Path](#6-adoption-path)
7. [Long-Term Vision](#7-long-term-vision)

---

## 1. Why CAPTCHAs Exist

To understand why CAPTCHAs fail for agents, you have to understand why they were created.

### 1.1 The Original Trust Gap

In the late 1990s and early 2000s, web services discovered that programmatic access — bots — could abuse their systems at scale. Ticket scalpers bought out concert venues in seconds. Spammers flooded comment sections and registration forms. Scrapers harvested contact databases. Each attack relied on the same fundamental capability: the ability to send HTTP requests far faster and more repeatedly than any human could.

The solution was a class of challenges designed to be easy for humans and hard for machines: **Completely Automated Public Turing tests to tell Computers and Humans Apart** — CAPTCHAs.

CAPTCHAs exploited a genuine asymmetry. In 2003, distinguishing distorted text in an image was computationally hard for OCR software but trivial for human visual processing. The challenge created a verification gate that, in practice, only humans could pass.

### 1.2 What CAPTCHAs Actually Verify

A CAPTCHA verifies one thing: **the actor can perform a specific cognitive or perceptual task in real time**.

It verifies nothing about:
- Who the actor is.
- Who they act on behalf of.
- What they are authorized to do.
- Whether they have behaved appropriately in the past.
- Whether their intent is legitimate.
- Whether they will behave appropriately in the future.

The CAPTCHA was always a proxy. It was not measuring trust. It was measuring humanity — because in 2003, humanity was a sufficient proxy for "not a scalper bot." The bot operators were unsophisticated. The gap between human capability and machine capability was large. The proxy worked.

### 1.3 The Proxy Broke

Two things killed the proxy:

**First, machine learning closed the perception gap.** Modern computer vision systems solve image-based CAPTCHAs with greater than 98% accuracy. Audio CAPTCHAs are transcribed automatically. Behavioral heuristics used by invisible CAPTCHAs (tracking mouse movement, scroll patterns, keystroke timing) are simulated by headless browser automation. The asymmetry that CAPTCHAs exploited no longer exists at the technical level.

**Second, AI agents are not the threat CAPTCHAs were designed to stop.** A CAPTCHA stops anonymous, automated abuse. An AI agent acting for a verified human principal is not anonymous and is not abusive by definition — it is authorized by a human who has accepted the system's terms of service. Using a CAPTCHA to block an authorized agent is equivalent to using a bouncer to stop the venue owner's representative because they did not look human enough.

CAPTCHAs are now failing at both jobs simultaneously. They do not reliably block the bots they were designed for, and they block legitimate agents they were never meant to affect.

---

## 2. Why CAPTCHAs Are Wrong for Agents

### 2.1 The Category Error

The core problem is a category error. CAPTCHAs ask: **is this actor human?** For AI agents, the correct question is: **is this actor authorized, trustworthy, and acting within declared scope?**

These are different questions with different answers requiring different evidence.

A malicious human who has passed a CAPTCHA is more dangerous than a trusted AI agent that failed one. The CAPTCHA cannot distinguish a human with harmful intent from one without. It cannot verify authorization. It cannot verify scope. It cannot check behavioral history. All it can confirm is that the actor solved a visual puzzle.

An AI agent that has passed KYA assessment has provided cryptographic proof of identity, a verified principal linkage, a scoped capability declaration, and a behavioral history. This is categorically more informative than "can identify a fire hydrant in a grid of photographs."

### 2.2 The Operational Impossibility

Beyond the philosophical mismatch, CAPTCHAs create a practical impossibility for autonomous agents.

Agents are, by definition, systems that operate without requiring human input for each action. The entire value proposition of an AI agent is that it can execute multi-step tasks — browsing, form-filling, data extraction, order placement — without interrupting the human for routine verification steps.

A CAPTCHA in the middle of an agent workflow breaks this promise. The agent must either:

1. **Pause and route the CAPTCHA to a human** — destroying the autonomy the agent was built to provide.
2. **Use a CAPTCHA-solving service** — which is exactly the anonymous automated abuse CAPTCHAs were designed to prevent, and which does not improve trust.
3. **Fail** — degrading the agent's utility.

None of these outcomes are acceptable. The CAPTCHA does not make the interaction more secure. It makes it impossible to secure correctly.

### 2.3 The Rate Limit Problem

Rate limiting has the same fundamental problem, expressed differently. Rate limits apply equally to all actors, regardless of trust level. A trusted agent with a verified principal and a clean behavioral history is throttled at the same rate as an anonymous scraper.

This is economically irrational for systems. The anonymous scraper provides no value and carries all the risk. The trusted agent has a verifiable principal who accepts liability. Treating them identically means turning away legitimate, high-value traffic in order to slow down bad actors who will simply acquire more IP addresses.

AgentPass rate limit replacement is not about giving agents special treatment. It is about allowing systems to implement trust-based rate limiting that is more economically rational and more aligned with actual risk.

### 2.4 The Login Wall Problem

Login walls serve a legitimate security function: they prevent unauthorized access to protected resources. But they conflate authentication (proving identity) with authorization (proving permission).

An AI agent operating on behalf of a verified principal has already authenticated — its passport carries cryptographic proof of identity and principal linkage. Requiring it to pass through a human-centric login flow (username/password entry, possibly with CAPTCHA) is asking it to re-prove something it has already proven by stronger means.

The correct model for login walls in an agent-aware world is: if the agent presents valid AgentPass credentials with a verified principal and sufficient KYA score, treat the agent as authenticated. This is exactly what the verification replacement model specifies.

---

## 3. The AgentPass Trust Stack

AgentPass replaces the single-layer proxy of humanity-verification with a four-layer trust stack. Each layer addresses a distinct dimension of trustworthiness.

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 4: Audit History                                         │
│  Immutable, hash-chained log of every action the agent has      │
│  taken. Provides empirical behavioral evidence.                 │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: Delegation                                            │
│  Cryptographically scoped authorization tokens. Proves the      │
│  agent is operating within bounds set by its principal.         │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: KYA Assessment                                        │
│  Six-check trust scoring framework. Produces a numeric trust    │
│  score and explicit verification replacement claims.            │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: Passport                                              │
│  Cryptographically signed identity document. Proves who the     │
│  agent is, who it acts for, and what it is permitted to do.    │
└─────────────────────────────────────────────────────────────────┘
```

### 3.1 Layer 1: Passport

The passport is the agent's identity document. It is signed with HMAC-SHA-256 and contains:

- **Agent ID** (`agentId`) — a unique identifier derived from the principal and a random salt.
- **Principal ID** (`principalId`) — the verified human or organization the agent acts for.
- **Tier** — the trust level granted to this agent.
- **Capabilities** — the explicit, enumerated list of actions the agent is permitted to take.
- **Fingerprint** — a stable, non-secret identifier for logging.
- **Expiry** — the time at which the passport ceases to be valid.
- **Signature** — an HMAC-SHA-256 over the canonical payload, proving the passport was issued by the legitimate AgentPass authority.

The passport alone answers: **who is this agent, and who authorized it?**

A passport signature cannot be forged without access to the HMAC secret. A passport cannot be modified without invalidating the signature. An expired passport is automatically invalid. A revoked passport (`active: false`) is immediately treated as invalid by all verifiers.

### 3.2 Layer 2: KYA Assessment

KYA (Know Your Agent) is the trust scoring framework. It evaluates the agent against six independent checks and produces a `trustScore` between 0 and 100.

The six checks are:

| Check | What It Assesses |
|---|---|
| `passport_validity` | Is the passport cryptographically valid and unexpired? |
| `principal_verification` | Is the principal ID non-anonymous and non-empty? |
| `capability_scope` | Are the declared capabilities appropriate for the agent's tier? |
| `behavior_history` | What does the agent's operational history look like? |
| `intent_declaration` | Has the agent declared a meaningful intent for this operation? |
| `clean_history_bonus` | Does the agent have a track record of clean behavior? |

Each check contributes to a composite score. The composite score directly determines which human verification mechanisms the agent's credentials replace (see Section 5).

### 3.3 Layer 3: Delegation

When an agent operates under delegation from a principal or a higher-tier agent, the delegation token provides additional evidence:

- **Who authorized this specific operation** — the grantor's identity.
- **Scope constraints** — which systems and capabilities are covered.
- **Temporal constraints** — when the delegation expires and during which hours it is valid.
- **Usage constraints** — maximum number of actions, single-use flag.

The delegation token is signed with HMAC-SHA-256 and carries the same tamper-evident guarantees as the passport. Crucially, delegation scope can only be reduced, never expanded — an agent cannot delegate capabilities it does not hold.

Delegation provides the answer to: **is this agent operating within the specific bounds the principal set for this task?**

### 3.4 Layer 4: Audit History

The audit chain is the empirical record of everything the agent has ever done. It is:

- **Append-only** — entries cannot be deleted.
- **Hash-chained** — each entry's hash is embedded in the next entry, making tampering detectable.
- **Comprehensive** — every action (read, write, form submission, API call, auth attempt) produces an entry.

The audit chain provides the answer to: **has this agent behaved consistently with its claimed intent and capabilities over time?**

Behavioral signals extracted from the audit chain feed directly into the KYA `behavior_history` check. An agent with a long history of `normal_operation` and `clean_history` signals earns higher KYA scores. An agent with repeated `auth_failure` or `scope_violation` signals earns lower scores and may be flagged or blocked.

---

## 4. Why This Stack Is More Rigorous Than Any CAPTCHA

The comparison is not close. Here is a side-by-side analysis of what each verification approach actually provides:

### 4.1 Dimension Comparison

| Trust Dimension | CAPTCHA | OTP | Login Wall | AgentPass |
|---|---|---|---|---|
| Cryptographic identity | No | Partial | No | Yes — HMAC-SHA-256 signed |
| Principal linkage | No | No | Partial | Yes — verified principalId |
| Capability scoping | No | No | No | Yes — per-capability authorization |
| Behavioral history | No | No | No | Yes — hash-chained audit trail |
| Intent declaration | No | No | No | Yes — explicit declaredIntent |
| Tamper evidence | No | No | No | Yes — immutable chain + signatures |
| Forgery resistance | Low* | Medium | Low | High |
| Time-bounded validity | No | Yes | Sometimes | Yes — expiry + temporal delegation |
| Scope reduction | No | No | No | Yes — delegation scope reduction |
| Revocability | No | Partial | Yes | Yes — immediate revocation |

*CAPTCHA forgery resistance is effectively zero against modern ML systems.

### 4.2 Cryptographic Signing

Every AgentPass credential is signed with HMAC-SHA-256. This means:

- **A forged passport is mathematically detectable.** Without the HMAC secret, an attacker cannot produce a valid signature for a fabricated passport. Any modification to any field of the passport invalidates the signature.
- **A forged CAPTCHA solution is not detectable.** There is no cryptographic binding between the human who solved the CAPTCHA and the session that submits the form. Cookie theft, session hijacking, and CAPTCHA-solving-as-a-service are all undetectable by the system receiving the submission.

### 4.3 Verifiable Scores

The KYA score is a specific, numeric claim about the agent's trust level. It is:

- **Deterministic** — given the same inputs, the same score is produced.
- **Explainable** — every check that contributed to the score is recorded in the `KYAProfile.checks` array.
- **Signable** — the score is embedded in the `TrustCredentials` package and signed alongside the passport token.

A system receiving an AgentPass trust presentation can verify cryptographically that the claimed score matches the signed credentials. There is no equivalent in any human verification system. A CAPTCHA provides a binary pass/fail with no record of the specific challenges presented, the time taken, the user's history, or any other trust-relevant context.

### 4.4 Scoped Delegation

Delegation tokens provide something no human verification system offers: **proof that the specific action being taken was explicitly authorized by the principal for this specific context**.

A CAPTCHA confirms that a human is present. It does not confirm that the human intended to authorize the specific form submission, API call, or data extraction that follows. AgentPass delegation tokens carry exactly that authorization, signed by the grantor and verifiable by the receiving system.

### 4.5 Behavioral History

The audit chain transforms trust from a point-in-time assessment into a longitudinal record. A CAPTCHA measures the actor at the moment of the challenge. AgentPass measures the agent across its entire operational history.

An agent that has made 10,000 API calls with zero auth failures, zero scope violations, and zero rate limit hits has a `behavior_history` score of 100 and receives a `clean_history_bonus`. This is a fundamentally different quality of evidence from "solved a puzzle correctly once."

---

## 5. Verification Replacement Mapping

### 5.1 Formal Mapping

The following mappings are the authoritative definitions of when AgentPass credentials replace human verification mechanisms. These are implemented as strict inequality checks with no exceptions.

```
replacesCaptcha           := trustScore >= 70

replacesOTP               := trustScore >= 80
                             AND principalVerified == true

replacesLoginWall         := trustScore >= 60
                             AND tier ∈ {verified, trusted, sovereign}

replacesRateLimit         := trustScore >= 50

replacesEmailVerification := principalVerified == true
                             AND tier ∈ {basic, verified, trusted, sovereign}
```

### 5.2 Threshold Rationale

**CAPTCHA threshold: 70**

At trust score 70, the agent has passed passport validity (full marks), has a verified or partially-verified principal, appropriate capability scope, and reasonable behavioral history. This score requires no significant behavioral violations and some intent declaration. An agent at 70+ is more identifiable, more accountable, and harder to impersonate than any human who has clicked a CAPTCHA checkbox.

**OTP threshold: 80 + principalVerified**

OTP is the strongest of the traditional verification mechanisms — it proves control of a physical device. Replacing it requires both a high KYA score (demonstrating sustained trustworthiness) and an explicitly verified, non-anonymous principal. This combination provides stronger identity assurance than OTP alone because it includes cryptographic identity, not just device control.

**Login wall threshold: 60 + verified tier**

The login wall requires both a minimum KYA score and a minimum tier. A `verified`-tier agent has been issued with explicit form-submission and authentication capabilities. Combined with a KYA score of 60, the agent has demonstrated sufficient trustworthiness to access authenticated resources. The tier requirement ensures this replacement is not available to `basic`-tier read-only agents.

**Rate limit threshold: 50**

Rate limits are the lowest bar because they are the bluntest instrument. A KYA score of 50 indicates the agent has a valid passport and a non-anonymous principal — it is not an anonymous scraper. Legitimate agents above this threshold deserve differentiated rate limits. The threshold is intentionally low because the cost of incorrectly granting higher rate limits to a slightly-lower-trust agent is lower than the cost of throttling legitimate traffic.

**Email verification threshold: principalVerified + basic tier**

Email verification is entirely about confirming principal identity. AgentPass `principalVerified` satisfies this directly — the agent's passport carries a verified, non-anonymous principal ID. The `basic` tier minimum is essentially no constraint, since all tiers are at or above basic. This replacement applies to almost all valid AgentPass agents with a non-anonymous principal.

### 5.3 Replacement Claim Presentation

When an agent encounters a verification gate it can replace, it presents the replacement claim as a signed `X-AgentPass-Verification-Proof` header. The proof includes:

```json
{
  "agentId": "ap_3d7a9f2c...",
  "principalId": "user_123",
  "tier": "verified",
  "trustScore": 82,
  "verificationType": "captcha",
  "replacesVerification": true,
  "issuedAt": "2026-01-01T00:00:00Z"
}
```

This claim is HMAC-signed and base64url-encoded. A system that understands AgentPass can verify the signature and bypass the corresponding verification step.

### 5.4 Non-Replaceable Verification

Some verification types are not in the replacement model:

- **Age verification (`age_verify`)** — Requires identity documents or legal attestation. AgentPass does not carry age data; this must be handled through a separate principal identity layer.
- **Geographic restrictions (`geo_block`)** — Based on IP address or jurisdiction, not agent identity. AgentPass does not replace geo-based access controls.
- **Legally mandated verification** — Any verification required by law (KYC for financial services, COPPA compliance, etc.) must not be bypassed by AgentPass credentials. Legal requirements supersede protocol claims.

---

## 6. Adoption Path

### 6.1 The Problem of Incremental Adoption

A trust protocol is only valuable if systems accept the credentials. A chicken-and-egg problem exists: agents have limited incentive to implement AgentPass if systems do not accept it, and systems have limited incentive to accept it if agents do not present it.

AgentPass resolves this by designing for compatibility. Agents present `X-AgentPass-*` headers on every request regardless of whether the system is AgentPass-aware. Systems that do not understand the headers ignore them harmlessly. As systems adopt AgentPass, agents immediately benefit without any protocol change.

### 6.2 Stage 0: Unaware Systems

At Stage 0, the system ignores all `X-AgentPass-*` headers. Agents still present credentials (for audit purposes and to pre-position for future system upgrades). The adapter handles any verification challenges through detection and graceful failure.

This is the current state for most web systems. It imposes no cost on the system and no behavioral change on the agent.

### 6.3 Stage 1: Header-Aware Systems

At Stage 1, the system reads `X-AgentPass-Tier` and `X-AgentPass-KYA-Score` to apply differentiated rate limits. This requires minimal implementation effort (two header reads and a rate limit lookup table) and provides immediate value by allowing legitimate agents to operate at higher throughput.

No cryptographic verification is required at Stage 1. The system trusts the presented values for rate limiting purposes only — the consequence of a falsified score is at most a slightly elevated rate limit, which is an acceptable risk for most systems.

### 6.4 Stage 2: Verification-Bypassing Systems

At Stage 2, the system:
1. Parses the `X-AgentPass-Passport` header and decodes the base64url payload.
2. Verifies the HMAC-SHA-256 signature (requires sharing the verification key or using a public-key variant).
3. Checks the `X-AgentPass-KYA-Score` against verification replacement thresholds.
4. Bypasses the appropriate verification steps (CAPTCHA, rate limit, etc.).
5. Responds with `X-AgentPass-Accepted`, `X-AgentPass-Granted-Tier`, and `X-AgentPass-Bypassed` headers.

Stage 2 is the primary target for most web services. It requires implementing one verification function and updating the response handling for a handful of endpoints. The benefit is immediate: verified agents can access the system without CAPTCHA friction, improving the experience for legitimate traffic while maintaining strong security for unverified actors.

### 6.5 Stage 3: AgentPass-Native Systems

At Stage 3, the system is a full participant in the AgentPass ecosystem:
- Sessions are established via AgentPass credentials alone.
- Behavioral signals are reported back to the agent's audit chain.
- Per-agent behavioral records are maintained by the system.
- The system participates in the distributed KYA reputation network, contributing behavioral signals that affect the agent's score across all systems.
- Rate limits, access tiers, and capability grants are all derived directly from AgentPass credentials.

Stage 3 represents the long-term end state where human-centric verification is entirely replaced by agent-native verification for agent actors.

### 6.6 Migration Signals

Systems moving from Stage 0 to Stage 1+ should:
1. Log all incoming `X-AgentPass-*` headers alongside existing request logs to build a baseline understanding of agent traffic.
2. Identify the verification steps that generate the most friction for known-legitimate agents.
3. Implement Stage 1 rate limit differentiation as a low-risk first step.
4. Measure the impact on traffic patterns before proceeding to Stage 2.
5. Implement Stage 2 verification bypassing for the highest-friction verification types first (typically CAPTCHA and rate limits).

---

## 7. Long-Term Vision

### 7.1 The End State

The long-term vision for AgentPass is a web where:

- **Every AI agent has a cryptographic identity** — agent interactions are as traceable and accountable as human interactions with strong identity verification.
- **Trust is composable** — a high-KYA agent from System A presents credentials to System B and receives proportional trust without System B needing to independently verify the agent from scratch.
- **Verification gates are agent-aware** — systems present different verification flows to agents and humans, asking agents for credentials rather than puzzle-solving.
- **Audit trails are universal** — regulators, principals, and system operators can audit the full history of any agent's operations across any system it has accessed.
- **Human principals are in control** — the principal can inspect, limit, pause, or revoke any agent's access at any time, with the revocation propagating immediately across all systems.

### 7.2 The Distributed KYA Network

In the long-term vision, KYA scores are not computed in isolation. An agent's behavioral signals from System A contribute to its KYA score when accessing System B. This creates a distributed reputation network where:

- **Good behavior is rewarded globally** — an agent that operates cleanly across many systems builds a reputation that reduces friction everywhere.
- **Bad behavior is penalized globally** — an agent that violates scope on one system sees its KYA score drop, affecting its access to all systems.
- **Principal accountability is enforced** — since agents are linked to principals, a pattern of abusive agent behavior can be traced back to a principal, who can be held accountable.

This network must be designed with privacy safeguards. Individual action data should not be shared between systems; only aggregate behavioral signals should flow across system boundaries.

### 7.3 Regulatory Alignment

As AI agent regulation matures, AgentPass is positioned to serve as the identity and audit infrastructure that regulators require. The immutable audit chain, principal linkage, and capability scoping provide exactly the accountability mechanisms that regulatory frameworks for AI systems are likely to mandate.

Systems that adopt AgentPass before regulatory requirements solidify will be ahead of compliance obligations and will have built the operational muscle needed to manage agent identity at scale.

### 7.4 The Replacement of Verification Theater

The ultimate goal is the elimination of verification theater — security measures that create friction without providing proportionate security value. CAPTCHAs that do not stop bots. Rate limits that do not distinguish trustworthy from malicious traffic. Login walls that are bypassed by credential stuffing but block authorized agents.

When systems can verify agents cryptographically, these measures become unnecessary for the class of actors who have already provided stronger evidence of trustworthiness. The friction they impose — both on agents and on the systems that implement them — is pure waste.

AgentPass replaces theater with substance: real identity, real accountability, real behavioral evidence, and real cryptographic guarantees. This is the foundation on which secure, autonomous agent ecosystems can be built.

---

*This document provides the conceptual and analytical foundation for the AgentPass trust model. For formal protocol definitions, see [PROTOCOL.md](./PROTOCOL.md). For capability and verification specifics, see [CAPABILITY_REGISTRY.md](./CAPABILITY_REGISTRY.md).*
