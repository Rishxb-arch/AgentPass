# AgentPass Adapter Specification

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** 2026-03-17

---

## Table of Contents

1. [What an Adapter Is](#1-what-an-adapter-is)
2. [The Agent-Native Contract](#2-the-agent-native-contract)
3. [The Verification Handling Contract](#3-the-verification-handling-contract)
4. [Three Required Methods](#4-three-required-methods)
5. [The Adapter Manifest](#5-the-adapter-manifest)
6. [Building Request Headers](#6-building-request-headers)
7. [Handling Verification Challenges](#7-handling-verification-challenges)
8. [The normalize() Contract](#8-the-normalize-contract)
9. [The Never-Throw Rule](#9-the-never-throw-rule)
10. [Writing a Custom Adapter](#10-writing-a-custom-adapter)
11. [Auto-Detection](#11-auto-detection)
12. [Built-In Adapters](#12-built-in-adapters)

---

## 1. What an Adapter Is

An adapter is a **protocol translator**.

Web systems were built for human users. They present HTML pages, require form interactions, impose verification steps, return inconsistent data formats, and expect HTTP sessions managed by browsers. AI agents are not browsers. They cannot fill out visual CAPTCHAs, they do not maintain browser state naturally, and they need structured data, not markup.

An adapter bridges this gap. It accepts a structured JSON operation request from the agent, translates it into whatever HTTP interactions the target system requires, handles any verification challenges using the agent's credentials, and returns structured JSON output.

```
[Agent]
   │
   │  { endpointId: "search_products",
   │    input: { query: "wireless headphones", maxPrice: 100 } }
   │
   ▼
[Adapter]
   │
   ├── Authorizes agent credentials
   ├── Builds X-AgentPass-* request headers
   ├── Makes HTTP requests to target system
   ├── Handles any CAPTCHA / rate limit challenges
   ├── Parses and normalizes the response
   │
   ▼
[Agent]
   { success: true,
     data: { products: [...], totalFound: 47 },
     verificationBypassed: ["rate_limit"] }
```

The agent never sees raw HTML. The agent never sees system-specific quirks. The adapter absorbs all of that complexity.

---

## 2. The Agent-Native Contract

The agent-native contract is the promise every adapter makes to the agents that use it:

1. **JSON in** — All inputs are structured, typed, JSON-serializable objects. No raw HTTP, no HTML manipulation, no browser automation APIs.
2. **JSON out** — All outputs are structured, typed, JSON-serializable objects. No raw HTTP responses, no unparsed HTML, no opaque binary data.
3. **No human interaction** — The adapter never pauses execution to ask a human to resolve a verification step, confirm an action, or provide a credential. The adapter uses agent credentials or fails with a structured error.
4. **Always returns** — The adapter always returns an `AdapterResult`, even on failure. It never throws unhandled exceptions to the agent layer.
5. **Audit always produced** — Every `execute()` call produces an audit entry, regardless of success or failure.

These five properties are absolute. Violating any of them is a protocol violation and disqualifies an adapter from the AgentPass ecosystem.

---

## 3. The Verification Handling Contract

The verification handling contract is the most important constraint on adapter behavior.

**An adapter must never route a verification challenge back to a human.**

When a target system presents a CAPTCHA, OTP prompt, login wall, or rate limit:

1. The adapter detects the challenge type from the response.
2. The adapter checks whether the agent's KYA score satisfies the replacement condition for that challenge type.
3. If satisfied: the adapter presents a verification proof and attempts to proceed.
4. If not satisfied: the adapter returns a structured `AdapterResult` with `success: false`, an appropriate `errorCode`, and an explanation in `error`. The agent receives this result and can decide what to do next.

**What the adapter must never do:**

- Display a CAPTCHA to a human user for manual solving.
- Pause execution and wait for a human to provide an OTP.
- Use a third-party CAPTCHA-solving service that routes the challenge to human workers.
- Silently skip the verification step without either using credentials or returning an error.

The rationale is straightforward: the moment an adapter routes a verification challenge to a human, the agent has lost its autonomy. The agent is no longer autonomous — it has become a human-in-the-loop workflow. This defeats the purpose of deploying an agent.

If the agent's KYA score is insufficient to replace a required verification, the correct response is a structured error. The principal can then choose to upgrade the agent's tier, build KYA score, or operate the workflow manually.

---

## 4. Three Required Methods

Every adapter must implement exactly three public methods. No more are required at the protocol level, though concrete adapters add private helpers freely.

### 4.1 `execute()`

```typescript
execute(
  endpointId: string,
  input: Record<string, unknown>,
  passport: AgentPassport,
  kyaProfile: KYAProfile,
  session?: AgentSession
): Promise<AdapterResult>
```

The primary operation method. All agent-initiated work flows through this method.

**Responsibilities:**

1. Authorize the agent using `this.authorize(passport, kyaProfile)` before any operation.
2. Validate that `endpointId` is a known endpoint in the manifest.
3. Validate required input fields for the endpoint.
4. Build request headers using `this.buildRequestHeaders()`.
5. Execute the HTTP interaction(s) required by the endpoint.
6. Handle any verification challenges using `this.handleVerificationChallenge()`.
7. Normalize the response using `this.normalize()`.
8. Return a complete `AdapterResult`, including an `auditEntry`.

**Never:**
- Throw an unhandled exception.
- Return a result without an `auditEntry`.
- Skip authorization.

### 4.2 `normalize()`

```typescript
normalize(rawOutput: unknown): unknown
```

Transforms raw system output into a clean, consistent format aligned with the endpoint's declared `outputSchema`.

**Responsibilities:**

1. Strip system-specific noise (HTML artifacts, redundant wrapper objects, null-padded arrays, encoding quirks).
2. Normalize field names to consistent camelCase.
3. Ensure numeric types are numbers, not strings.
4. Ensure date fields are ISO 8601 strings.
5. Return a value that conforms to the endpoint's output schema.

**Never:**
- Throw. If normalization fails for any reason, return `rawOutput` unchanged.
- Remove data the agent requested. Normalization strips noise, not content.

### 4.3 `healthCheck()`

```typescript
healthCheck(): Promise<{ healthy: boolean; latencyMs?: number }>
```

Validates that the adapter can communicate with its target system.

**Responsibilities:**

1. Perform a lightweight, non-destructive probe request (a HEAD request to the system's root, or a lightweight API ping endpoint).
2. Measure round-trip latency in milliseconds.
3. Return `{ healthy: true, latencyMs: N }` on success.
4. Return `{ healthy: false }` on any failure.

**Never:**
- Perform a destructive operation (no writes, no form submissions, no checkout flows).
- Throw. Catch all errors and return `{ healthy: false }`.

---

## 5. The Adapter Manifest

The manifest is the adapter's self-declaration. It is a static property on the adapter class (`readonly manifest: AdapterManifest`) that describes everything the adapter does and requires.

```typescript
interface AdapterManifest {
  adapterId:                string;
  systemId:                 string;
  systemName:               string;
  version:                  string;
  systemType:               SystemType;
  requiredCapabilities:     AgentCapability[];
  requiredTier:             AgentTier;
  endpoints:                AdapterEndpoint[];
  agentPassAware:           boolean;
  verificationRequirements: VerificationRequirement[];
  rateLimits:               RateLimits;
  outputSchema:             Record<string, unknown>;
  systemPatterns:           string[];
}
```

### 5.1 Key Fields Explained

**`systemId`**  
The unique identifier for the target system. For system-specific adapters, use the primary domain (e.g., `"amazon.com"`). For generic adapters, use `"*"`.

**`agentPassAware`**  
`true` if the target system natively understands and accepts `X-AgentPass-*` headers. `false` for all other systems. This field determines whether the adapter expects an `X-AgentPass-Accepted` response header or must use challenge detection instead.

**`verificationRequirements`**  
The array of verification mechanisms the target system imposes on unknown actors. Each entry:

```typescript
interface VerificationRequirement {
  type:                "captcha" | "otp" | "login" | "email_verify" | "rate_limit" | "age_verify" | "geo_block";
  satisfiedByAgentPass: boolean;   // Can AgentPass credentials resolve this?
  requiredKYAScore?:    number;    // Minimum KYA score needed for resolution
  requiredTier?:        AgentTier; // Minimum tier needed for resolution
}
```

The `satisfiedByAgentPass` field must accurately reflect whether the system's verification can actually be resolved using agent credentials. Setting this to `true` for a verification type that cannot be resolved is a protocol violation.

**`rateLimits.agentPassVerifiedMultiplier`**  
How much higher the rate limit is for verified AgentPass agents compared to anonymous actors. A value of `3` means an agent with a valid AgentPass passport gets 3x the requests per minute of an unauthenticated request.

**`systemPatterns`**  
URL patterns used for auto-detection. The registry matches incoming URLs against these patterns to select the correct adapter. Use specific domain patterns for system-specific adapters and `["*"]` only for the generic fallback adapter.

### 5.2 Endpoint Declaration

Each endpoint in `manifest.endpoints` declares:

```typescript
interface AdapterEndpoint {
  id:                  string;           // Unique within this adapter
  description:         string;           // Human-readable
  requiredCapability:  AgentCapability;  // Which capability the agent must hold
  inputSchema:         Record<string, unknown>; // Expected input shape
  outputSchema:        Record<string, unknown>; // Promised output shape
  category:            string;           // Grouping label
}
```

The `requiredCapability` on each endpoint is checked individually by `execute()`. An agent that holds `web:read` but not `commerce:cart` can call `fetch_page` but not `add_to_cart`.

---

## 6. Building Request Headers

Every HTTP request the adapter makes must carry the full `X-AgentPass-*` trust credential set. The `buildRequestHeaders()` protected helper handles this automatically.

```typescript
protected buildRequestHeaders(
  passport: AgentPassport,
  kyaProfile: KYAProfile,
  delegation?: DelegationToken,
  extraHeaders: Record<string, string> = {}
): Record<string, string>
```

This method:
1. Calls `presentCredentials(passport, kyaProfile, delegation)` to assemble the full `X-AgentPass-*` header set.
2. Sets the `User-Agent` to `AgentPass/1.0 (agent-native; see agentpass.dev)`.
3. Sets standard `Accept` and `Accept-Language` headers.
4. Merges any `extraHeaders` (adapter-specific headers like `Authorization` for API keys).

**Every `fetch()` call in an adapter must use headers returned from `buildRequestHeaders()`.**

Do not manually construct the `X-AgentPass-*` headers. Do not call `buildAgentHeaders()` directly. Use `buildRequestHeaders()` which assembles the complete, correct header set including the agent's passport token, KYA score, tier, principal ID, capabilities hash, timestamp, and signature.

### 6.1 Example Usage

```typescript
// Inside an adapter endpoint handler
const headers = this.buildRequestHeaders(passport, kyaProfile, delegation, {
  "Authorization": `Bearer ${apiKey}`,
  "X-Custom-Header": "value",
});

const response = await fetch(url, { headers });
```

---

## 7. Handling Verification Challenges

When a target system responds with a verification challenge (CAPTCHA, rate limit, OTP, login wall), the `handleVerificationChallenge()` protected method resolves it using agent credentials.

```typescript
protected handleVerificationChallenge(
  responseStatus: number,
  responseBody: string,
  responseHeaders: Record<string, string>,
  passport: AgentPassport,
  kyaProfile: KYAProfile
): {
  resolved: boolean;
  resolution?: string;    // base64url-encoded signed proof, if resolved
  errorCode?: string;     // Error code, if not resolved
  challengeType?: string; // Detected challenge type
}
```

### 7.1 Detection Logic

The method detects the challenge type by examining:

| Detection Method | Challenge Type |
|---|---|
| HTML contains `recaptcha`, `hcaptcha`, `captcha`, `data-sitekey` | `captcha` |
| HTML contains `otp`, `one-time password`, `verification code`, `enter the code` | `otp` |
| HTTP status 401 or 403, or HTML contains login prompts | `login` |
| HTTP status 429 | `rate_limit` |

### 7.2 Resolution Logic

After detecting the challenge type:

1. Call `evaluateVerificationReplacement(kyaProfile, challengeType)` to check if the agent's score satisfies the replacement condition.
2. If `requiredKYAScore` is set in the manifest for this challenge type, also check `kyaProfile.trustScore >= requiredKYAScore`.
3. If both conditions are met: call `buildVerificationProof(passport, kyaProfile, challengeType)` and return `{ resolved: true, resolution: proof }`.
4. If conditions are not met: return `{ resolved: false, errorCode: "VERIFICATION_REQUIRED_UNRESOLVABLE" }`.

### 7.3 Using the Result

```typescript
// Inside an adapter endpoint handler
const response = await fetch(url, { headers });

if (!response.ok) {
  const challenge = this.handleVerificationChallenge(
    response.status,
    await response.text(),
    Object.fromEntries(response.headers.entries()),
    passport,
    kyaProfile
  );

  if (!challenge.resolved) {
    return {
      success: false,
      error: `Verification required: ${challenge.challengeType}`,
      errorCode: challenge.errorCode,
      auditEntry: this.buildAuditEntry(passport, "read", url, "blocked"),
    };
  }

  // If resolved, the proof is in challenge.resolution
  // Some systems may accept this proof as a header on retry
  // For now, proceed as if resolved (system-specific handling)
}
```

---

## 8. The normalize() Contract

`normalize()` is the data cleaning layer. It runs on every piece of output before it is returned to the agent.

### 8.1 What normalize() Must Do

1. **Remove structural noise** — Extra wrapper objects, metadata fields the agent did not request, system-internal identifiers.
2. **Standardize field names** — Convert `snake_case`, `PascalCase`, and other conventions to `camelCase`.
3. **Standardize types** — Numeric strings (`"42"`) to numbers (`42`), boolean strings (`"true"`) to booleans (`true`).
4. **Standardize dates** — Any date format to ISO 8601 (`2026-01-01T00:00:00Z`).
5. **Truncate excessive content** — Long text fields should be truncated to reasonable lengths (e.g., 50,000 characters for page text).

### 8.2 What normalize() Must Not Do

1. **Remove requested data** — If the agent asked for `price` and the system returned it, `price` must appear in the normalized output.
2. **Throw** — Any error in normalization must be caught, and the raw output returned unchanged.
3. **Make HTTP requests** — `normalize()` operates on data already in memory. It must not fetch additional data.
4. **Mutate the input** — `normalize()` must return a new object, not modify `rawOutput` in place.

### 8.3 Example

```typescript
normalize(rawOutput: unknown): unknown {
  if (typeof rawOutput !== "object" || rawOutput === null) return rawOutput;

  const raw = rawOutput as Record<string, unknown>;

  // Return a new object — never mutate rawOutput
  return {
    productId: raw["product_id"] ?? raw["productId"],
    name: typeof raw["name"] === "string" ? raw["name"].trim() : raw["name"],
    price: typeof raw["price"] === "string"
      ? parseFloat(raw["price"])
      : raw["price"],
    inStock: raw["in_stock"] === "true" || raw["in_stock"] === true,
    url: raw["url"] ?? raw["product_url"],
  };
}
```

---

## 9. The Never-Throw Rule

Adapters must never throw unhandled exceptions to the agent layer.

Every `execute()` implementation must wrap its body in a top-level try/catch. Every `healthCheck()` implementation must wrap its probe in a try/catch. `normalize()` must wrap its transformation logic in a try/catch.

**Rationale:** Unhandled exceptions break agent workflows unpredictably. An agent that calls 10 adapters in parallel cannot recover from an uncaught exception in adapter 3. Structured `AdapterResult` errors are recoverable; thrown exceptions may not be.

**Pattern:**

```typescript
async execute(
  endpointId: string,
  input: Record<string, unknown>,
  passport: AgentPassport,
  kyaProfile: KYAProfile,
): Promise<AdapterResult> {
  try {
    // ... all implementation logic ...
  } catch (err) {
    return {
      success: false,
      error: String(err),
      errorCode: "INTERNAL_ERROR",
      auditEntry: this.buildAuditEntry(passport, "read", "unknown", "failure"),
    };
  }
}
```

---

## 10. Writing a Custom Adapter

This section walks through writing a complete, correct custom adapter. Every annotation explains the contract being satisfied.

```typescript
import { BaseAdapter } from "@agentpass/adapters";
import type {
  AdapterManifest,
  AdapterResult,
} from "@agentpass/adapters";
import type { AgentPassport, KYAProfile, AgentSession } from "@agentpass/core";

// ─── 1. Extend BaseAdapter ────────────────────────────────────────────────────
//
// All adapters extend BaseAdapter. This gives you:
//   - this.authorize() — checks passport, tier, capabilities, KYA status
//   - this.buildRequestHeaders() — assembles X-AgentPass-* headers
//   - this.handleVerificationChallenge() — resolves CAPTCHA/OTP/login using agent credentials
//   - this.retry() — exponential backoff on 429/503
//
export class WeatherServiceAdapter extends BaseAdapter {

  // ─── 2. Declare the manifest ────────────────────────────────────────────────
  //
  // The manifest is static metadata. It tells the registry:
  //   - What system this adapter targets
  //   - What capabilities an agent must hold
  //   - What verification this system imposes
  //   - Which URLs this adapter should handle (systemPatterns)
  //
  readonly manifest: AdapterManifest = {
    adapterId: "adapter_weather_service",

    // The primary domain of the target system.
    // Used by the registry for pattern matching.
    systemId: "weather.example.com",

    systemName: "Weather Service",
    version: "1.0.0",
    systemType: "api",

    // The agent must hold ALL of these capabilities.
    // Check against each endpoint's requiredCapability too.
    requiredCapabilities: ["api:read"],

    // The agent must be at least this tier.
    requiredTier: "basic",

    // Does the target system natively accept X-AgentPass-* headers?
    // Most systems do not. Set false unless confirmed otherwise.
    agentPassAware: false,

    // What verification does this system impose on unknown actors?
    // satisfiedByAgentPass: true means we can resolve it with agent credentials.
    // requiredKYAScore is the minimum score needed for resolution.
    verificationRequirements: [
      {
        type: "rate_limit",
        satisfiedByAgentPass: true,
        requiredKYAScore: 50,
      },
    ],

    rateLimits: {
      requestsPerMinute: 60,
      requestsPerHour: 1000,
      // AgentPass-verified agents get 2x the rate limit.
      agentPassVerifiedMultiplier: 2,
    },

    outputSchema: {},
    systemPatterns: ["weather.example.com", "api.weather.example.com"],

    // Each endpoint must declare:
    //   - id: unique within this adapter
    //   - requiredCapability: what the agent must hold to call this endpoint
    //   - inputSchema: document the expected input shape
    //   - outputSchema: document the promised output shape
    endpoints: [
      {
        id: "get_current",
        description: "Get current weather for a location",
        requiredCapability: "api:read",
        inputSchema: {
          location: "string",       // city name or "lat,lon"
          units: "string?",         // "metric" | "imperial" — optional
        },
        outputSchema: {
          temperature: "number",
          conditions: "string",
          humidity: "number",
          windSpeedKph: "number",
          observedAt: "string",     // ISO 8601
        },
        category: "weather",
      },
      {
        id: "get_forecast",
        description: "Get 7-day forecast for a location",
        requiredCapability: "api:read",
        inputSchema: {
          location: "string",
          days: "number?",          // 1-7, defaults to 7
        },
        outputSchema: {
          days: "array",
        },
        category: "weather",
      },
    ],
  };

  // ─── 3. Implement execute() ─────────────────────────────────────────────────
  //
  // execute() is the primary dispatch method. It must:
  //   1. Authorize the agent — ALWAYS first
  //   2. Dispatch to the correct endpoint handler
  //   3. Never throw — wrap everything in try/catch
  //   4. Always return an AdapterResult with an auditEntry
  //
  async execute(
    endpointId: string,
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    _session?: AgentSession
  ): Promise<AdapterResult> {
    // Step 1: Authorize. This checks passport validity, tier, capabilities,
    // and KYA blocked/flagged status. Always do this first.
    const auth = this.authorize(passport, kyaProfile);
    if (!auth.authorized) {
      return {
        success: false,
        error: auth.reason,
        errorCode: "UNAUTHORIZED",
        auditEntry: this.buildAuditEntry(passport, "api_call", endpointId, "blocked"),
      };
    }

    // Step 2: Build request headers. This injects the full X-AgentPass-* set.
    // Every HTTP call this adapter makes uses these headers.
    const headers = this.buildRequestHeaders(passport, kyaProfile, undefined, {
      // Add system-specific headers here (API keys, content-type, etc.)
      "Accept": "application/json",
    });

    // Step 3: Dispatch to endpoint handlers.
    try {
      switch (endpointId) {
        case "get_current":
          return this.getCurrentWeather(input, passport, kyaProfile, headers);
        case "get_forecast":
          return this.getForecast(input, passport, kyaProfile, headers);
        default:
          return {
            success: false,
            error: `Unknown endpoint: ${endpointId}`,
            errorCode: "UNKNOWN_ENDPOINT",
            auditEntry: this.buildAuditEntry(passport, "api_call", endpointId, "failure"),
          };
      }
    } catch (err) {
      // Never throw. Return a structured error.
      return {
        success: false,
        error: String(err),
        errorCode: "INTERNAL_ERROR",
        auditEntry: this.buildAuditEntry(passport, "api_call", endpointId, "failure"),
      };
    }
  }

  // ─── 4. Endpoint handler ────────────────────────────────────────────────────
  //
  // Each endpoint handler is a private async method.
  // It performs the HTTP interaction and returns an AdapterResult.
  //
  private async getCurrentWeather(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult> {
    const location = input["location"] as string;
    const units = (input["units"] as string | undefined) ?? "metric";

    if (!location) {
      return {
        success: false,
        error: "location is required",
        errorCode: "VALIDATION_ERROR",
        auditEntry: this.buildAuditEntry(passport, "api_call", "get_current", "failure"),
      };
    }

    const url = `https://weather.example.com/v1/current?location=${encodeURIComponent(location)}&units=${units}`;

    try {
      // Use this.retry() for automatic exponential backoff on 429/503.
      const response = await this.retry(() => fetch(url, { headers }));

      // Check for verification challenges before processing the response.
      if (!response.ok) {
        const html = await response.text();
        const challenge = this.handleVerificationChallenge(
          response.status,
          html,
          Object.fromEntries(response.headers.entries()),
          passport,
          kyaProfile
        );

        if (!challenge.resolved) {
          return {
            success: false,
            error: `System verification required: ${challenge.challengeType}. Agent KYA score may be insufficient.`,
            errorCode: challenge.errorCode ?? "VERIFICATION_FAILED",
            auditEntry: this.buildAuditEntry(passport, "api_call", url, "blocked"),
          };
        }

        // If challenge was resolved, a proof was built.
        // For AgentPass-aware systems, retry with the proof header.
        // For legacy systems, this is a best-effort resolution.
      }

      const rawData = await response.json();

      // normalize() cleans the response into the promised output shape.
      const normalized = this.normalize(rawData);

      return {
        success: true,
        data: normalized,
        verificationBypassed: [],
        auditEntry: this.buildAuditEntry(passport, "api_call", url, "success"),
        metadata: { location, units },
      };

    } catch (err) {
      return {
        success: false,
        error: String(err),
        errorCode: "FETCH_FAILED",
        auditEntry: this.buildAuditEntry(passport, "api_call", url, "failure"),
      };
    }
  }

  private async getForecast(
    input: Record<string, unknown>,
    passport: AgentPassport,
    kyaProfile: KYAProfile,
    headers: Record<string, string>
  ): Promise<AdapterResult> {
    const location = input["location"] as string;
    const days = Math.min(7, Math.max(1, (input["days"] as number | undefined) ?? 7));

    const url = `https://weather.example.com/v1/forecast?location=${encodeURIComponent(location)}&days=${days}`;

    try {
      const response = await this.retry(() => fetch(url, { headers }));
      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}`,
          errorCode: "HTTP_ERROR",
          auditEntry: this.buildAuditEntry(passport, "api_call", url, "failure"),
        };
      }

      const rawData = await response.json();
      return {
        success: true,
        data: this.normalize(rawData),
        auditEntry: this.buildAuditEntry(passport, "api_call", url, "success"),
      };
    } catch (err) {
      return {
        success: false,
        error: String(err),
        errorCode: "FETCH_FAILED",
        auditEntry: this.buildAuditEntry(passport, "api_call", url, "failure"),
      };
    }
  }

  // ─── 5. Implement normalize() ───────────────────────────────────────────────
  //
  // normalize() transforms raw API responses into the shape declared
  // in the endpoint's outputSchema. Always return a new object.
  // Never throw — return rawOutput unchanged on any error.
  //
  normalize(rawOutput: unknown): unknown {
    if (typeof rawOutput !== "object" || rawOutput === null) return rawOutput;

    try {
      const raw = rawOutput as Record<string, unknown>;

      // Handle the current weather endpoint response shape.
      if ("temperature" in raw || "temp" in raw) {
        const temp = raw["temperature"] ?? raw["temp"];
        return {
          temperature: typeof temp === "string" ? parseFloat(temp) : temp,
          conditions: raw["conditions"] ?? raw["description"] ?? raw["weather"],
          humidity: raw["humidity"],
          windSpeedKph: raw["wind_speed_kph"] ?? raw["windSpeed"],
          // Normalize date to ISO 8601 if it is a Unix timestamp.
          observedAt: typeof raw["observed_at"] === "number"
            ? new Date(raw["observed_at"] * 1000).toISOString()
            : (raw["observed_at"] ?? raw["observedAt"] ?? new Date().toISOString()),
        };
      }

      // Handle forecast response shape.
      if (Array.isArray(raw["days"]) || Array.isArray(raw["forecast"])) {
        const days = (raw["days"] ?? raw["forecast"]) as unknown[];
        return {
          days: days.map((day) => this.normalize(day)),
        };
      }

      // Fall through: return raw if structure is unrecognized.
      return rawOutput;
    } catch {
      // Never throw. Return raw output on normalization failure.
      return rawOutput;
    }
  }

  // ─── 6. Implement healthCheck() ────────────────────────────────────────────
  //
  // healthCheck() must:
  //   - Be lightweight and non-destructive
  //   - Measure latency
  //   - Never throw
  //
  async healthCheck(): Promise<{ healthy: boolean; latencyMs?: number }> {
    const start = Date.now();
    try {
      const response = await fetch("https://weather.example.com/v1/ping", {
        method: "HEAD",
      });
      return {
        healthy: response.ok,
        latencyMs: Date.now() - start,
      };
    } catch {
      return { healthy: false };
    }
  }

  // ─── 7. Private helper: buildAuditEntry ─────────────────────────────────────
  //
  // Every AdapterResult must include an auditEntry.
  // This helper builds a consistent entry for all outcomes.
  //
  private buildAuditEntry(
    passport: AgentPassport,
    type: import("@agentpass/core").AuditAction["type"],
    endpoint: string,
    outcome: "success" | "failure" | "blocked"
  ): AdapterResult["auditEntry"] {
    return {
      agentId: passport.agentId,
      principalId: passport.principalId,
      action: {
        type,
        system: this.manifest.systemId,
        endpoint,
        payloadHash: "",
      },
      outcome,
      verificationUsed: "agentpass_credentials",
      timestamp: new Date().toISOString(),
    };
  }
}
```

### 10.1 Registering the Adapter

After writing the adapter class, register it with the adapter registry:

```typescript
import { registry } from "@agentpass/adapters";
import { WeatherServiceAdapter } from "./weather-service-adapter.js";

registry.register(new WeatherServiceAdapter());
```

The registry uses `systemPatterns` from the manifest to route requests to the correct adapter automatically.

---

## 11. Auto-Detection

The adapter registry automatically selects the correct adapter for a given URL using the `systemPatterns` field in each manifest.

### 11.1 Pattern Matching

Patterns are matched in order of **specificity** (most specific pattern wins):

1. Exact domain match: `"weather.example.com"` matches only that domain.
2. Wildcard subdomain: `"*.example.com"` matches any subdomain of `example.com`.
3. Universal fallback: `"*"` matches any URL (used only by `WebGenericAdapter`).

When multiple patterns match, the most specific (longest, least wildcard) pattern wins.

### 11.2 Fallback Behavior

The `WebGenericAdapter` uses `systemPatterns: ["*"]` and serves as the universal fallback. If no registered adapter matches the URL, the request is handled by `WebGenericAdapter`.

This means:
- Agents can access any URL without a system-specific adapter.
- System-specific adapters provide richer, more structured output for their target systems.
- Adding a new adapter for a system automatically takes over from the generic fallback for that system's URLs.

### 11.3 Registry Lookup

```typescript
import { registry } from "@agentpass/adapters";

// Find the best adapter for a URL
const adapter = registry.getAdapterForUrl("https://weather.example.com/current");
// → WeatherServiceAdapter (matched "weather.example.com")

const fallback = registry.getAdapterForUrl("https://unknown-system.example.org/data");
// → WebGenericAdapter (matched "*")
```

---

## 12. Built-In Adapters

AgentPass ships with the following built-in adapters:

| Adapter | System ID | System Type | Description |
|---|---|---|---|
| `WebGenericAdapter` | `*` | `generic` | Universal fallback. Works on any website. |
| `ApiGenericAdapter` | `*` | `api` | Universal API adapter for JSON/REST endpoints. |
| `EcommerceGenericAdapter` | `*` | `ecommerce` | Generic e-commerce: product search, cart, checkout flows. |
| `NewsGenericAdapter` | `*` | `news` | Generic news/article reader with paywall handling. |
| `SocialGenericAdapter` | `*` | `social` | Generic social media post and profile reader. |
| `GovernmentIndiaAdapter` | `*.gov.in` | `government` | Adapter for Indian government portals. |

All built-in adapters extend `BaseAdapter` and conform fully to this specification. They serve as reference implementations for custom adapter authors.

---

*This document is the authoritative specification for the AgentPass adapter protocol. For the full system protocol, see [PROTOCOL.md](./PROTOCOL.md). For capability definitions, see [CAPABILITY_REGISTRY.md](./CAPABILITY_REGISTRY.md).*
