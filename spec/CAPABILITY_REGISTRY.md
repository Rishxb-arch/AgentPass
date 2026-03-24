# AgentPass Capability Registry

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** 2026-03-17

---

## Table of Contents

1. [Overview](#1-overview)
2. [Capability Format](#2-capability-format)
3. [Capability-Tier Alignment](#3-capability-tier-alignment)
4. [Web Domain](#4-web-domain-web)
5. [API Domain](#5-api-domain-api)
6. [Files Domain](#6-files-domain-files)
7. [Commerce Domain](#7-commerce-domain-commerce)
8. [Payments Domain](#8-payments-domain-payments)
9. [Data Domain](#9-data-domain-data)
10. [Identity Domain](#10-identity-domain-identity)
11. [Capability Combinations](#11-capability-combinations)
12. [Granting and Revoking Capabilities](#12-granting-and-revoking-capabilities)

---

## 1. Overview

The capability registry is the authoritative reference for all valid capabilities in the AgentPass protocol. Every capability an agent can hold is defined here, including what it grants, what it does not grant, and which tier typically holds it.

Capabilities are the atomic units of agent authorization. An agent may only perform an action if it holds the specific capability that covers that action. Capabilities are declared in the passport at issuance time and cannot be modified without revoking the passport and issuing a new one.

**Total capabilities: 19**  
**Domains: 7** (`web`, `api`, `files`, `commerce`, `payments`, `data`, `identity`)

All 19 capabilities are declared in the `AgentCapability` type:

```typescript
export type AgentCapability =
  | "web:read"    | "web:write"    | "web:forms"    | "web:auth"    | "web:browse"
  | "api:read"    | "api:write"
  | "files:read"  | "files:write"
  | "commerce:search" | "commerce:cart" | "commerce:checkout" | "commerce:orders"
  | "payments:initiate" | "payments:read"
  | "data:extract" | "data:monitor"
  | "identity:delegate" | "identity:verify";
```

---

## 2. Capability Format

All capabilities follow the format `{domain}:{action}`.

- **Domain** — the category of system or operation being accessed.
- **Action** — the specific operation within that domain.

This two-part format allows systems and adapters to reason about capabilities at both the domain level ("does this agent have any web capabilities?") and the action level ("does this agent have `web:forms` specifically?").

**Wildcard matching** (for adapter authorization checks only):

```typescript
// Check if agent has any capability in the web domain
caps.some(c => c.startsWith("web:"))

// Check if agent has a specific capability
caps.includes("web:forms")
```

Wildcard capability grants (e.g., `web:*`) are **not** valid capability values. Every capability in a passport must be one of the 19 explicitly defined capabilities. Adapters may use prefix matching internally, but the passport itself must contain only fully specified capability strings.

---

## 3. Capability-Tier Alignment

The following table shows which tier typically holds each capability. This alignment is the recommended baseline. Passport issuers may deviate with documented justification, but the KYA `capability_scope` check will flag unusual tier-capability combinations as potential violations.

| Tier | Typical Capabilities |
|---|---|
| `basic` | `web:read`, `web:browse`, `api:read`, `files:read`, `data:extract`, `data:monitor`, `commerce:search`, `payments:read` |
| `verified` | All basic capabilities + `web:write`, `web:forms`, `web:auth`, `api:write`, `files:write`, `commerce:cart`, `commerce:orders`, `identity:verify` |
| `trusted` | All verified capabilities + `commerce:checkout`, `payments:initiate` |
| `sovereign` | All trusted capabilities + `identity:delegate` |

The specific flag-triggering mismatch in the KYA `capability_scope` check is `identity:delegate` at the `basic` tier. This is the clearest indicator of a misconfigured or maliciously issued passport.

---

## 4. Web Domain (`web:*`)

The web domain covers all interactions with web pages and browser-like navigation. Five capabilities cover the spectrum from passive reading to active authentication.

---

### `web:read`

**Tier:** Basic and above  
**Risk Level:** Low  

**What it grants:**
- Fetch the content of any publicly accessible web page via HTTP GET.
- Parse the HTML response into structured content (title, description, body text, links, images).
- Access publicly available resources (stylesheets, scripts) when they are needed to render the page content.
- Read page metadata (Open Graph tags, meta descriptions, structured data markup).

**What it does not grant:**
- Submit forms or POST data to web pages — that requires `web:forms`.
- Navigate through authentication flows — that requires `web:auth`.
- Maintain a stateful browsing session across multiple pages — that requires `web:browse`.
- Write or post content to web endpoints — that requires `web:write`.

**Example operations:**
- Fetching a product page to read its title, price, and description.
- Reading a news article's body text.
- Extracting links from a sitemap page.
- Reading publicly visible pricing information.

---

### `web:write`

**Tier:** Verified and above  
**Risk Level:** Medium  

**What it grants:**
- Post data to web endpoints via HTTP POST, PUT, or PATCH.
- Submit HTTP requests with a body payload to web URLs that accept it.
- Update publicly accessible web resources where the agent is authorized to do so.

**What it does not grant:**
- Submit HTML forms (form discovery and structured submission) — that requires `web:forms`.
- Authenticate to a system and maintain an authenticated session — that requires `web:auth`.
- Delete resources — this capability covers creation and update, not deletion. Destructive operations require explicit additional authorization in the delegation scope.

**Example operations:**
- Posting a comment to a blog that accepts unauthenticated comments.
- Updating a publicly writable data endpoint.
- Submitting an event notification to a webhook URL.

---

### `web:forms`

**Tier:** Verified and above  
**Risk Level:** Medium  

**What it grants:**
- Discover HTML forms on a web page (read form structure, field names, types, and labels).
- Fill form fields with structured data provided by the agent.
- Submit forms via the form's declared action URL and method.
- Handle form redirects that occur after submission.

**What it does not grant:**
- Solve visual CAPTCHAs embedded in forms — AgentPass credentials are used instead (see Section 3 of PROTOCOL.md).
- Authenticate via login forms — that requires `web:auth`.
- Multi-step form wizards that require session continuity — that requires `web:browse`.

**Example operations:**
- Filling and submitting a contact form.
- Submitting a search form and retrieving results.
- Completing a registration form for a service.
- Filling a data entry form in a web application.

---

### `web:auth`

**Tier:** Verified and above  
**Risk Level:** Medium-High  

**What it grants:**
- Authenticate to web systems using the agent's stored credentials (API keys, OAuth tokens, username/password managed by the principal).
- Establish authenticated HTTP sessions.
- Maintain and refresh authentication tokens.
- Access resources that are gated behind authentication.

**What it does not grant:**
- Create new accounts or manage account settings — these are separate operations that must be explicitly authorized in the delegation scope.
- Access resources beyond what the authenticated account is authorized to see.
- Authenticate on behalf of a different principal than the one declared in the passport.

**Example operations:**
- Logging in to a web service using stored OAuth credentials.
- Refreshing an expired session token.
- Accessing a protected API endpoint using a stored API key.
- Retrieving account-specific data after authentication.

---

### `web:browse`

**Tier:** Basic and above  
**Risk Level:** Low-Medium  

**What it grants:**
- Navigate through multi-page web flows by following links and redirects.
- Maintain HTTP session state (cookies, session tokens) across multiple requests in a single browsing flow.
- Handle server-side redirects (3xx responses) automatically.
- Manage browser-like state for paginated content, infinite scroll, and multi-step flows.

**What it does not grant:**
- Execute JavaScript in a full browser engine — `web:browse` covers HTTP-level navigation, not JavaScript runtime execution.
- Interact with forms — that requires `web:forms`.
- Access authenticated resources — that requires `web:auth`.

**Example operations:**
- Following pagination links to collect all results from a multi-page listing.
- Navigating from a product listing to a product detail page and back.
- Following a redirect chain to reach the final URL of a resource.
- Maintaining a cookie-based session across multiple reads on a news site.

---

## 5. API Domain (`api:*`)

The API domain covers structured HTTP API interactions. Two capabilities cover the full CRUD surface.

---

### `api:read`

**Tier:** Basic and above  
**Risk Level:** Low  

**What it grants:**
- Issue HTTP GET requests to API endpoints.
- Issue HTTP HEAD requests to API endpoints.
- Read API responses in any format (JSON, XML, CSV, plain text).
- Paginate through multi-page API responses.
- Use API keys or OAuth tokens for authenticated GET requests (requires the token to be provided by the principal; does not grant the ability to acquire credentials).

**What it does not grant:**
- Issue POST, PUT, PATCH, or DELETE requests — that requires `api:write`.
- Create, update, or delete resources via an API.
- Access APIs that require a minimum tier above `basic`.

**Example operations:**
- Fetching a list of products from an e-commerce API.
- Reading a user's public profile from a social API.
- Querying a weather data API for current conditions.
- Retrieving search results from a search API.
- Reading paginated order history from an API.

---

### `api:write`

**Tier:** Verified and above  
**Risk Level:** Medium-High  

**What it grants:**
- Issue HTTP POST, PUT, PATCH requests to API endpoints.
- Create new resources via API calls.
- Update existing resources via API calls.
- Submit data to API endpoints that process it (webhooks, data ingestion endpoints, notification APIs).

**What it does not grant:**
- Issue HTTP DELETE requests — deletion is treated as a higher-risk operation and must be explicitly authorized in the delegation scope alongside `api:write`.
- Access APIs that require a minimum tier above `verified`.
- Authenticate to acquire new API credentials — the agent uses credentials provided by the principal.

**Example operations:**
- Creating a new record via a REST API.
- Updating an existing resource's fields via PATCH.
- Posting an event to a webhook endpoint.
- Submitting a data payload to a data ingestion API.
- Creating a draft document via a content API.

---

## 6. Files Domain (`files:*`)

The files domain covers access to file system operations, document storage, and file attachments.

---

### `files:read`

**Tier:** Basic and above  
**Risk Level:** Low  

**What it grants:**
- Read files from a file system or document storage the principal has authorized access to.
- Download file attachments from web services.
- Read document content (PDFs, spreadsheets, text files, images).
- List directory contents if the underlying storage system permits it.
- Access files shared with the principal via a cloud storage service.

**What it does not grant:**
- Write, create, modify, or delete files — that requires `files:write`.
- Access files outside the scope the principal has authorized.
- Read encrypted files without the appropriate decryption key being provided.

**Example operations:**
- Reading a PDF report from a cloud storage bucket.
- Downloading an attachment from an email or document management system.
- Reading a configuration file to extract settings.
- Listing the contents of an authorized folder.

---

### `files:write`

**Tier:** Verified and above  
**Risk Level:** Medium-High  

**What it grants:**
- Create new files in locations the principal has authorized write access to.
- Modify existing files the principal owns or has write permission to.
- Upload files to cloud storage, document management systems, or web services.
- Delete files if the underlying system permits it and the principal has authorized deletion.

**What it does not grant:**
- Access files outside the principal's authorized scope.
- Overwrite files owned by other principals without explicit authorization.
- Access the file system of the host machine running the agent — only storage systems explicitly integrated via adapters.

**Example operations:**
- Saving a generated report to a cloud storage folder.
- Uploading an image to a content management system.
- Creating a new spreadsheet in a document management system.
- Modifying an existing document's content.

---

## 7. Commerce Domain (`commerce:*`)

The commerce domain covers participation in e-commerce workflows. Four capabilities map to the key stages of a shopping flow.

---

### `commerce:search`

**Tier:** Basic and above  
**Risk Level:** Low  

**What it grants:**
- Search product catalogs using text queries, filters, and sorting options.
- Browse product listings and category pages.
- Retrieve product details (name, price, description, images, availability, reviews).
- Compare products across listings.
- Read product availability and shipping information.

**What it does not grant:**
- Add items to a cart — that requires `commerce:cart`.
- Initiate any purchase flow — that requires `commerce:checkout`.
- Read the principal's order history — that requires `commerce:orders`.

**Example operations:**
- Searching for "wireless headphones under $100" and returning a list of results.
- Fetching detailed information for a specific product by ID or URL.
- Browsing a category page and listing all products with their prices.
- Reading product reviews and ratings.
- Checking stock availability for a specific SKU.

---

### `commerce:cart`

**Tier:** Verified and above  
**Risk Level:** Medium  

**What it grants:**
- Add items to a shopping cart.
- View the current contents and summary of a shopping cart.
- Modify item quantities in a cart.
- Remove items from a cart.
- Apply discount codes or promotional offers to a cart.

**What it does not grant:**
- Proceed to checkout or complete a purchase — that requires `commerce:checkout`.
- Access order history — that requires `commerce:orders`.
- Make any payment — that requires `payments:initiate`.

**Example operations:**
- Adding a specific product (with selected size and color) to a cart.
- Updating the quantity of an item already in the cart.
- Removing an out-of-stock item from the cart.
- Applying a promotional code to the cart.
- Reading the cart total to report it to the principal before checkout.

---

### `commerce:checkout`

**Tier:** Trusted and above  
**Risk Level:** High  

**What it grants:**
- Proceed through the checkout flow from cart to order placement.
- Enter shipping address and select shipping method.
- Select a payment method from the principal's saved payment options.
- Review the order summary and confirm placement.
- Place an order using the principal's authorized payment method.

**What it does not grant:**
- Add new payment methods or modify saved payment methods — the agent uses only payment methods the principal has pre-authorized.
- Initiate standalone payment transfers not tied to a checkout flow — that requires `payments:initiate`.
- Access the order history of other principals.

**Important:** This capability authorizes the agent to complete a purchase. Passport issuers must ensure the principal has explicitly authorized e-commerce purchasing before granting this capability. Combining `commerce:checkout` with `payments:initiate` at the `trusted` tier represents significant financial authorization and must be granted with care.

**Example operations:**
- Completing a checkout flow on an e-commerce site using a saved address and payment card.
- Confirming an order after reviewing the total, shipping cost, and delivery estimate.
- Placing a recurring subscription order.

---

### `commerce:orders`

**Tier:** Verified and above  
**Risk Level:** Low-Medium  

**What it grants:**
- Read the principal's order history on an e-commerce platform.
- Track the current status of placed orders.
- View order details (items purchased, quantities, prices, shipping status).
- Read invoices and receipts for completed orders.

**What it does not grant:**
- Cancel or modify orders — these are higher-risk write operations that require explicit delegation authorization beyond this capability.
- Initiate new orders — that requires `commerce:checkout`.
- Access order history belonging to other principals.

**Example operations:**
- Retrieving a list of the principal's recent orders.
- Checking the shipping status of a specific order by order ID.
- Extracting order details to populate a purchase report.
- Reading a receipt or invoice for a completed order.

---

## 8. Payments Domain (`payments:*`)

The payments domain covers financial transaction operations. These capabilities carry the highest risk in the registry and must be granted with explicit principal consent.

---

### `payments:initiate`

**Tier:** Trusted and above  
**Risk Level:** Very High  

**What it grants:**
- Initiate payment transfers on behalf of the principal.
- Send money to a specified recipient using the principal's authorized payment account.
- Initiate recurring payment schedules.
- Process refunds if the principal holds the authority to do so.

**What it does not grant:**
- Create or modify payment accounts — the agent uses only accounts the principal has pre-authorized.
- Access payment accounts belonging to other principals.
- Initiate payments that exceed limits set in the delegation scope (`maxActions`, time restrictions).

**Critical constraints:**
- This capability must only be granted to agents that have a verified principal (`principalVerified == true`).
- Delegation tokens for this capability should specify strict `maxActions` limits and `allowedHours` restrictions.
- Any audit entry for a `payments:initiate` action must record the full payment payload hash.
- If the agent holds this capability without an active delegation token scoping its usage, the adapter must verify the specific payment with the principal before proceeding.

**Example operations:**
- Sending a payment to a vendor on behalf of the principal.
- Initiating a recurring subscription payment.
- Processing a refund to a customer.
- Paying an invoice automatically when it matches principal-defined criteria.

---

### `payments:read`

**Tier:** Basic and above  
**Risk Level:** Low-Medium  

**What it grants:**
- Read the principal's payment history and transaction records.
- View account balances (read-only).
- Read payment receipts and statements.
- Access payment method information (masked card numbers, expiry — never full card numbers or CVVs).
- Monitor account activity and detect unusual transactions.

**What it does not grant:**
- Initiate any payment or transfer — that requires `payments:initiate`.
- Access full card numbers, CVVs, or other sensitive payment credentials.
- Read payment information of other principals.
- Modify any payment settings or preferences.

**Example operations:**
- Retrieving a list of recent transactions to categorize expenses.
- Reading the current balance of an account.
- Accessing a payment receipt for a specific transaction.
- Monitoring for unusual account activity and alerting the principal.

---

## 9. Data Domain (`data:*`)

The data domain covers structured data extraction and ongoing monitoring operations.

---

### `data:extract`

**Tier:** Basic and above  
**Risk Level:** Low-Medium  

**What it grants:**
- Extract structured data from web pages using CSS selectors, XPath, or JSONPath.
- Parse structured data formats embedded in HTML (JSON-LD, Microdata, RDFa).
- Extract tabular data from HTML tables.
- Convert unstructured page content into structured, schema-conformant objects.
- Batch extract data from multiple pages in a single operation.

**What it does not grant:**
- Monitor a resource continuously for changes — that requires `data:monitor`.
- Write extracted data to external systems — that requires `files:write` or `api:write`.
- Access data from pages that require authentication unless the agent also holds `web:auth`.

**Example operations:**
- Extracting product name, price, and availability from an e-commerce page using a CSS selector schema.
- Parsing JSON-LD structured data from a news article.
- Extracting a table of financial data from a report page.
- Batch-extracting contact information from a directory listing.

---

### `data:monitor`

**Tier:** Basic and above  
**Risk Level:** Low-Medium  

**What it grants:**
- Continuously monitor a specific page element or API endpoint for changes over time.
- Record the current value of a monitored element.
- Detect and report changes relative to a previously recorded value.
- Set up watch conditions and alert when a condition is met (e.g., price drops below threshold, stock status changes to in-stock).

**What it does not grant:**
- Take action when a change is detected — the agent reports the change; action requires the appropriate capability for the action type (e.g., `commerce:cart` to add a newly in-stock item to a cart).
- Store monitoring history beyond the current session — persistent history requires integration with `files:write` or an API endpoint.

**Example operations:**
- Monitoring a product page every hour and alerting when the price drops below a target.
- Watching a stock ticker element for value changes.
- Monitoring an API endpoint for changes in a specific field.
- Detecting when a sold-out product becomes available.

---

## 10. Identity Domain (`identity:*`)

The identity domain covers agent delegation and principal verification. These capabilities are restricted to higher tiers because they affect the trust structure of the entire agent ecosystem.

---

### `identity:delegate`

**Tier:** Sovereign only  
**Risk Level:** Very High  

**What it grants:**
- Issue delegation tokens that authorize sub-agents to act within a scoped subset of the delegating agent's capabilities.
- Specify system scope, capability scope, time constraints, and action limits in delegation tokens.
- Revoke previously issued delegation tokens.
- Create single-use delegation tokens for one-time operations.

**What it does not grant:**
- Grant capabilities to sub-agents that the delegating agent does not itself hold — the scope reduction rule is absolute.
- Delegate to an agent with a higher tier than the delegating agent.
- Create delegation tokens that outlive the delegating agent's passport.

**Critical constraints:**
- This capability is restricted to the `sovereign` tier. Any passport at a lower tier that claims `identity:delegate` is flagged as a scope violation by the KYA `capability_scope` check.
- Delegation tokens created by a `sovereign` agent must be signed with the HMAC secret and must carry the delegating agent's ID as `grantorId`.
- The scope reduction rule is enforced at issuance time: `effectiveCapabilities = requestedCapabilities ∩ grantorCapabilities`.

**Example operations:**
- An orchestrator agent issuing a delegation token to a specialist sub-agent authorizing it to perform `commerce:search` and `commerce:cart` on a specific e-commerce site.
- A `sovereign` agent creating a single-use delegation token for a one-time payment operation.
- Revoking a delegation token when the sub-agent's task is complete.

---

### `identity:verify`

**Tier:** Verified and above  
**Risk Level:** Medium  

**What it grants:**
- Verify the identity of other AgentPass agents by checking their passport signatures.
- Verify the tier and capability claims of other agents.
- Check whether another agent's passport is active and unexpired.
- Validate delegation tokens presented by other agents.

**What it does not grant:**
- Modify another agent's passport or capabilities.
- Issue delegation tokens — that requires `identity:delegate`.
- Access another agent's private credentials or HMAC keys.
- Verify the identity of human principals (principal verification is performed by the KYA system, not by agents).

**Example operations:**
- An orchestrator agent verifying the identity and capabilities of a sub-agent before assigning it a task.
- A system adapter verifying that an incoming agent request carries a valid, active passport.
- A multi-agent workflow coordinator checking that all participating agents have the required tier and capabilities.

---

## 11. Capability Combinations

Some operations require multiple capabilities working together. This section documents common multi-capability patterns and the combinations that enable them.

### 11.1 Full E-Commerce Shopping Flow

```
web:browse + commerce:search + commerce:cart + commerce:checkout + payments:initiate
```

This combination enables an agent to independently research products, build a cart, and complete a purchase. It represents significant financial authorization and should be granted only at the `trusted` tier with appropriate delegation constraints.

### 11.2 Research and Reporting

```
web:read + web:browse + data:extract + api:read + files:write
```

This combination enables an agent to browse web resources, extract structured data, call APIs, and save results to a file. Suitable for research and data aggregation workflows at the `verified` tier.

### 11.3 API Integration

```
api:read + api:write
```

The minimal combination for a full REST API integration. Enables reading and creating/updating resources. At the `verified` tier.

### 11.4 Passive Monitoring

```
web:read + web:browse + data:monitor
```

This combination enables an agent to watch web resources for changes without taking any action. Suitable at the `basic` tier for lightweight monitoring workflows.

### 11.5 Multi-Agent Orchestration

```
identity:delegate + identity:verify + (any other capabilities)
```

This combination, available only at the `sovereign` tier, enables an agent to orchestrate sub-agents by delegating scoped capability sets and verifying their identity.

### 11.6 Financial Monitoring

```
payments:read + data:extract + api:read
```

Enables an agent to read payment history, extract structured transaction data, and call financial APIs. Available at the `basic` tier. No capability to initiate payments.

---

## 12. Granting and Revoking Capabilities

### 12.1 Capability Granting at Issuance

Capabilities are granted at passport issuance time. The issuer specifies the full set of capabilities the agent holds:

```typescript
const passport = issuePassport({
  principalId: "user_123",
  name: "Shopping Assistant",
  tier: "verified",
  capabilities: [
    "web:read",
    "web:browse",
    "web:forms",
    "commerce:search",
    "commerce:cart",
    "commerce:orders",
  ],
  expiresInHours: 24,
});
```

The issuer is responsible for granting only the capabilities required for the agent's declared purpose (least-privilege principle). Over-granting capabilities exposes the principal to unnecessary risk and will be flagged if the KYA assessment detects tier-capability mismatches.

### 12.2 Capability Modification

Capabilities cannot be modified on an existing passport. If the agent's required capabilities change, the correct process is:

1. Revoke the existing passport: `revokePassport(passport)`.
2. Issue a new passport with the updated capability set.
3. Re-run KYA assessment on the new passport.

### 12.3 Capability Checking at Runtime

Adapters check capabilities at two levels:

**1. Adapter-level check** (in `authorize()`): verifies the agent holds all capabilities in `manifest.requiredCapabilities`.

**2. Endpoint-level check** (in `execute()`): verifies the agent holds the specific `requiredCapability` for the endpoint being called.

```typescript
// Checking adapter-level capability
const auth = adapter.authorize(passport, kyaProfile);

// Checking endpoint-level capability directly
const canSearch = hasCapability(passport, "commerce:search");
```

### 12.4 Capability Scope in Delegation

When an agent with `identity:delegate` issues a delegation token, the delegated capabilities are automatically reduced to the intersection of:
- What was requested in the delegation scope.
- What the delegating agent actually holds.

The scope reduction is irreversible. A delegation token cannot grant capabilities the delegating agent does not hold, regardless of what is specified in the token request.

### 12.5 Least Privilege Guideline

The following table provides guidance on the minimum capability set for common agent archetypes:

| Agent Archetype | Minimum Capabilities | Recommended Tier |
|---|---|---|
| Web reader / researcher | `web:read`, `web:browse`, `data:extract` | basic |
| API integrator (read-only) | `api:read` | basic |
| API integrator (read/write) | `api:read`, `api:write` | verified |
| Form automation | `web:read`, `web:browse`, `web:forms` | verified |
| E-commerce researcher | `web:read`, `web:browse`, `commerce:search` | basic |
| Shopping assistant | `web:browse`, `commerce:search`, `commerce:cart` | verified |
| Purchasing agent | `commerce:search`, `commerce:cart`, `commerce:checkout` | trusted |
| Financial monitor | `payments:read`, `data:extract` | basic |
| Financial transactor | `payments:initiate`, `payments:read` | trusted |
| Multi-agent orchestrator | `identity:delegate`, `identity:verify` + task capabilities | sovereign |
| Full autonomous agent | All capabilities | sovereign |

---

*This document is the authoritative capability registry for AgentPass Protocol 1.0. For the full protocol specification, see [PROTOCOL.md](./PROTOCOL.md). For the trust model rationale, see [TRUST_MODEL.md](./TRUST_MODEL.md). For adapter implementation details, see [ADAPTER_SPEC.md](./ADAPTER_SPEC.md).*
