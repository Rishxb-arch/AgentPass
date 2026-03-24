import {
  issuePassport,
  verifyPassport,
  revokePassport,
  hasCapability,
  assessAgent,
  issueDelegation,
  verifyDelegation,
  deserializePassport,
  createEntry,
  verifyChain,
  exportLog,
  createSession,
  refreshSession,
  terminateSession,
  setPassportSecret,
  setDelegationSecret,
  setTrustSecret,
  type AgentPassport,
  type AgentTier,
  type AgentCapability,
  type KYAProfile,
  type DelegationToken,
  type DelegationScope,
  type AuditEntry,
  type AuditAction,
  type BehaviorSignal,
  type AgentSession,
  type VerificationMethod,
} from "@agentpass/core";
import {
  registry,
  AdapterRegistry,
  WebGenericAdapter,
  EcommerceGenericAdapter,
  NewsGenericAdapter,
  GovernmentIndiaAdapter,
  APIGenericAdapter,
  SocialGenericAdapter,
  type AdapterResult,
  type PageContent,
} from "@agentpass/adapters";

// ─── Re-exports ───────────────────────────────────────────────────────────────
export * from "@agentpass/core";
export * from "@agentpass/adapters";

// ─── AgentPass SDK ────────────────────────────────────────────────────────────

export class AgentPass {
  private readonly secret: string;
  private readonly issuerName: string;
  private auditLog: AuditEntry[] = [];
  private lastAuditHash = "genesis";

  constructor(options: { secret: string; issuer?: string }) {
    this.secret = options.secret;
    this.issuerName = options.issuer ?? "agentpass";

    // Initialize all module secrets
    setPassportSecret(options.secret);
    setDelegationSecret(options.secret);
    setTrustSecret(options.secret);

    // Register all 6 built-in adapters
    registry.register(new WebGenericAdapter());
    registry.register(new EcommerceGenericAdapter());
    registry.register(new NewsGenericAdapter());
    registry.register(new GovernmentIndiaAdapter());
    registry.register(new APIGenericAdapter());
    registry.register(new SocialGenericAdapter());
  }

  // ── Identity ───────────────────────────────────────────────────────────────

  /** Issue an agent passport. */
  async issue(options: {
    principal: string;
    name: string;
    tier?: AgentTier;
    capabilities?: AgentCapability[];
    expiresInHours?: number | null;
    metadata?: Record<string, string>;
  }): Promise<AgentPassport> {
    return issuePassport({
      principalId: options.principal,
      name: options.name,
      tier: options.tier,
      capabilities: options.capabilities,
      expiresInHours: options.expiresInHours,
      metadata: options.metadata,
    });
  }

  /** Verify a serialized passport token. */
  verify(token: string): {
    valid: boolean;
    passport?: AgentPassport;
    reason?: string;
  } {
    const passport = deserializePassport(token);
    if (!passport) {
      return { valid: false, reason: "Malformed token" };
    }
    const check = verifyPassport(passport);
    return { ...check, passport: check.valid ? passport : undefined };
  }

  /** Revoke a passport. */
  revoke(passport: AgentPassport): AgentPassport {
    return revokePassport(passport);
  }

  // ── Delegation ─────────────────────────────────────────────────────────────

  /** Issue a delegation token. */
  async delegate(options: {
    grantor: string;
    agentId: string;
    systems: string[];
    capabilities?: AgentCapability[];
    maxActions?: number | null;
    expiresInHours?: number;
    singleUse?: boolean;
    grantorCapabilities?: AgentCapability[];
  }): Promise<DelegationToken> {
    const scope: DelegationScope = {
      systems: options.systems,
      capabilities: options.capabilities ?? [],
      maxActions: options.maxActions ?? null,
      allowedHours: null,
    };
    return issueDelegation(options.grantor, options.agentId, scope, {
      expiresInHours: options.expiresInHours ?? 1,
      singleUse: options.singleUse ?? false,
      grantorCapabilities: options.grantorCapabilities,
    });
  }

  /** Verify a delegation token. */
  verifyDelegation(
    token: DelegationToken,
    agentId: string,
    action: { system: string; capability: AgentCapability }
  ): { valid: boolean; reason?: string } {
    return verifyDelegation(token, agentId, action);
  }

  // ── KYA ────────────────────────────────────────────────────────────────────

  /** Assess an agent and produce a KYA profile with verificationReplacement. */
  async assess(options: {
    passport: AgentPassport;
    declaredIntent?: string;
    targetSystem?: string;
    signals?: BehaviorSignal[];
  }): Promise<KYAProfile> {
    return assessAgent({
      passport: options.passport,
      declaredIntent: options.declaredIntent,
      targetSystem: options.targetSystem,
      behaviorSignals: options.signals,
    });
  }

  /** Check if an agent can perform an action. */
  async canAct(options: {
    passport: AgentPassport;
    kyaProfile: KYAProfile;
    delegation?: DelegationToken;
    action: { capability: AgentCapability; system?: string };
  }): Promise<{ allowed: boolean; reason: string }> {
    const passportCheck = verifyPassport(options.passport);
    if (!passportCheck.valid) {
      return { allowed: false, reason: `Invalid passport: ${passportCheck.reason}` };
    }

    if (options.kyaProfile.status === "blocked") {
      return { allowed: false, reason: "Agent is blocked by KYA assessment" };
    }

    if (options.delegation) {
      const delCheck = verifyDelegation(options.delegation, options.passport.agentId, {
        system: options.action.system ?? "*",
        capability: options.action.capability,
      });
      if (!delCheck.valid) {
        return { allowed: false, reason: `Delegation invalid: ${delCheck.reason}` };
      }
    }

    if (!hasCapability(options.passport, options.action.capability)) {
      return { allowed: false, reason: `Missing capability: ${options.action.capability}` };
    }

    return { allowed: true, reason: "Action allowed" };
  }

  // ── Adapters ───────────────────────────────────────────────────────────────

  /** Register a custom adapter. */
  useAdapter(adapter: import("@agentpass/adapters").BaseAdapter): void {
    registry.register(adapter);
  }

  /** Get an adapter by systemId. */
  getAdapter(systemId: string): import("@agentpass/adapters").BaseAdapter | null {
    return registry.get(systemId);
  }

  /** Auto-detect the best adapter for a URL. */
  autoDetect(url: string): import("@agentpass/adapters").BaseAdapter | null {
    return registry.autoDetect(url);
  }

  // ── Execute ────────────────────────────────────────────────────────────────

  /** Execute an adapter endpoint for a given URL. */
  async execute(options: {
    passport: AgentPassport;
    kyaProfile: KYAProfile;
    delegation?: DelegationToken;
    url: string;
    endpointId: string;
    input: Record<string, unknown>;
  }): Promise<AdapterResult> {
    const adapter = registry.autoDetect(options.url) ?? new WebGenericAdapter();

    const auth = adapter.authorize(options.passport, options.kyaProfile, options.delegation);
    if (!auth.authorized) {
      return {
        success: false,
        error: auth.reason,
        errorCode: "UNAUTHORIZED",
        auditEntry: {
          agentId: options.passport.agentId,
          principalId: options.passport.principalId,
          action: { type: "read", system: options.url, endpoint: options.endpointId, payloadHash: "" },
          outcome: "blocked",
          verificationUsed: "none",
          timestamp: new Date().toISOString(),
        },
      };
    }

    const canAct = await this.canAct({
      passport: options.passport,
      kyaProfile: options.kyaProfile,
      delegation: options.delegation,
      action: { capability: "web:read", system: options.url },
    });
    if (!canAct.allowed) {
      return {
        success: false,
        error: canAct.reason,
        errorCode: "CANNOT_ACT",
        auditEntry: {
          agentId: options.passport.agentId,
          principalId: options.passport.principalId,
          action: { type: "read", system: options.url, endpoint: options.endpointId, payloadHash: "" },
          outcome: "blocked",
          verificationUsed: "none",
          timestamp: new Date().toISOString(),
        },
      };
    }

    const result = await adapter.execute(
      options.endpointId,
      { ...options.input, url: options.input["url"] ?? options.url },
      options.passport,
      options.kyaProfile
    );

    // Append to audit log
    await this.log({
      agentId: options.passport.agentId,
      action: result.auditEntry.action,
      outcome: result.success ? "success" : "failure",
      verificationUsed: result.auditEntry.verificationUsed,
    });

    return result;
  }

  // ── Hero API ───────────────────────────────────────────────────────────────

  /**
   * Browse any URL. Agent credentials are presented automatically.
   * Returns structured page content — no HTML, no cookies, just data.
   */
  async browse(options: {
    passport: AgentPassport;
    kyaProfile: KYAProfile;
    delegation?: DelegationToken;
    url: string;
  }): Promise<PageContent> {
    const adapter = registry.autoDetect(options.url);

    // Find the right endpoint
    let endpointId = "fetch_page";
    if (adapter?.manifest.systemType === "news") endpointId = "get_article";
    else if (adapter?.manifest.systemType === "ecommerce") endpointId = "get_listing";

    const result = await this.execute({
      passport: options.passport,
      kyaProfile: options.kyaProfile,
      delegation: options.delegation,
      url: options.url,
      endpointId,
      input: { url: options.url },
    });

    if (!result.success) {
      throw new Error(`Browse failed: ${result.error ?? result.errorCode}`);
    }

    return result.data as PageContent;
  }

  /**
   * Search any site. Auto-detects adapter type and calls the right search endpoint.
   */
  async search(options: {
    passport: AgentPassport;
    kyaProfile: KYAProfile;
    delegation?: DelegationToken;
    url: string;
    query: string;
    filters?: Record<string, string>;
  }): Promise<AdapterResult> {
    const adapter = registry.autoDetect(options.url);
    let endpointId = "search_site";
    if (adapter?.manifest.systemType === "ecommerce") endpointId = "search_products";
    else if (adapter?.manifest.systemType === "news") endpointId = "search_site";
    else if (adapter?.manifest.systemType === "social") endpointId = "search";
    else if (adapter?.manifest.systemType === "government") endpointId = "search_registry";

    return this.execute({
      passport: options.passport,
      kyaProfile: options.kyaProfile,
      delegation: options.delegation,
      url: options.url,
      endpointId,
      input: { url: options.url, baseUrl: options.url, query: options.query, filters: options.filters },
    });
  }

  /**
   * Extract structured data from any URL using CSS selector schema.
   */
  async extract(options: {
    passport: AgentPassport;
    kyaProfile: KYAProfile;
    delegation?: DelegationToken;
    url: string;
    schema: Record<string, string>;
  }): Promise<Record<string, unknown>> {
    const result = await this.execute({
      passport: options.passport,
      kyaProfile: options.kyaProfile,
      delegation: options.delegation,
      url: options.url,
      endpointId: "extract_structured",
      input: { url: options.url, schema: options.schema },
    });

    if (!result.success) {
      throw new Error(`Extract failed: ${result.error ?? result.errorCode}`);
    }

    const data = result.data as { extracted: Record<string, unknown>; confidence: number } | undefined;
    return data?.extracted ?? {};
  }

  // ── Audit ──────────────────────────────────────────────────────────────────

  /** Log an audit entry. */
  async log(options: {
    agentId: string;
    action: AuditAction;
    outcome: "success" | "failure" | "blocked";
    verificationUsed?: VerificationMethod;
  }): Promise<AuditEntry> {
    const entry = createEntry(
      options.agentId,
      this.issuerName,
      options.action,
      options.outcome,
      this.lastAuditHash,
      options.verificationUsed
    );
    this.auditLog.push(entry);
    this.lastAuditHash = entry.entryHash;
    return entry;
  }

  /** Get the audit log, optionally filtered by agentId. */
  getAuditLog(agentId?: string): AuditEntry[] {
    return exportLog(this.auditLog, agentId);
  }

  /** Verify the integrity of the audit chain. */
  verifyAuditChain(): { valid: boolean; brokenAt?: number } {
    return verifyChain(this.auditLog);
  }

  // ── Session ────────────────────────────────────────────────────────────────

  createSession(passport: AgentPassport, systemId: string): AgentSession {
    return createSession(passport, systemId);
  }

  refreshSession(session: AgentSession): AgentSession {
    return refreshSession(session);
  }

  terminateSession(session: AgentSession): AgentSession {
    return terminateSession(session);
  }
}

export default AgentPass;
