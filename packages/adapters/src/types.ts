import type {
  AgentCapability,
  AgentTier,
  AuditEntry,
} from "@agentpass/core";

// ─── System types ─────────────────────────────────────────────────────────────

export type SystemType =
  | "ecommerce"
  | "government"
  | "news"
  | "social"
  | "finance"
  | "productivity"
  | "api"
  | "generic";

// ─── Verification requirement ─────────────────────────────────────────────────

/**
 * Describes a verification requirement a system imposes on unknown actors.
 * satisfiedByAgentPass=true means agent credentials can replace this requirement.
 */
export interface VerificationRequirement {
  type: "captcha" | "otp" | "login" | "email_verify" | "rate_limit" | "age_verify" | "geo_block";
  satisfiedByAgentPass: boolean;
  requiredKYAScore?: number;
  requiredTier?: AgentTier;
}

// ─── Adapter manifest ─────────────────────────────────────────────────────────

export interface AdapterEndpoint {
  id: string;
  description: string;
  requiredCapability: AgentCapability;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  category: string;
}

export interface AdapterManifest {
  adapterId: string;
  systemId: string;
  systemName: string;
  version: string;
  systemType: SystemType;
  requiredCapabilities: AgentCapability[];
  requiredTier: AgentTier;
  endpoints: AdapterEndpoint[];
  agentPassAware: boolean;
  verificationRequirements: VerificationRequirement[];
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour: number;
    /** How much higher the rate limit is for verified AgentPass agents */
    agentPassVerifiedMultiplier: number;
  };
  outputSchema: Record<string, unknown>;
  systemPatterns: string[];
}

// ─── Adapter result ───────────────────────────────────────────────────────────

export interface AdapterResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  /** Which verification steps were bypassed using AgentPass credentials */
  verificationBypassed?: string[];
  auditEntry: Omit<AuditEntry, "entryId" | "previousHash" | "entryHash">;
  metadata?: Record<string, unknown>;
}

// ─── Page & content types ─────────────────────────────────────────────────────

export interface Link {
  href: string;
  text: string;
  type: "internal" | "external" | "anchor";
}

export interface Image {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface PageContent {
  url: string;
  title: string;
  description: string;
  text: string;
  html: string;
  links: Link[];
  images: Image[];
  structured: Record<string, unknown>;
  publishedAt?: string;
}

export interface SearchResult {
  url: string;
  title: string;
  description: string;
  source: string;
  relevanceScore?: number;
}

export interface FormField {
  name: string;
  type: string;
  label: string;
  required: boolean;
  options?: string[];
  value?: string;
}

export interface FormDefinition {
  action: string;
  method: string;
  fields: FormField[];
}

// ─── E-commerce types ─────────────────────────────────────────────────────────

export interface Product {
  productId: string;
  name: string;
  brand?: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  currency: string;
  rating?: number;
  reviewCount?: number;
  images: string[];
  sizes?: string[];
  colors?: string[];
  inStock: boolean;
  url: string;
  category?: string;
  description?: string;
}

export interface CartItem {
  itemId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  size?: string;
  color?: string;
  image?: string;
}

export interface CartSummary {
  items: CartItem[];
  subtotal: number;
  discount?: number;
  shipping?: number;
  total: number;
  currency: string;
  itemCount: number;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

export interface Order {
  orderId: string;
  date: string;
  status: string;
  total: number;
  currency: string;
  items?: OrderItem[];
}

// ─── News / article types ─────────────────────────────────────────────────────

export interface Article {
  url: string;
  title: string;
  author?: string;
  publishedAt?: string;
  updatedAt?: string;
  body: string;
  summary?: string;
  tags?: string[];
  category?: string;
  images: Image[];
  source: string;
  paywalled: boolean;
}

// ─── Social types ─────────────────────────────────────────────────────────────

export interface Post {
  postId?: string;
  url: string;
  author?: string;
  content: string;
  publishedAt?: string;
  likes?: number;
  comments?: number;
  shares?: number;
  media?: Image[];
  platform: string;
}

export interface SocialProfile {
  profileId?: string;
  url: string;
  username: string;
  displayName?: string;
  bio?: string;
  followerCount?: number;
  followingCount?: number;
  postCount?: number;
  verified?: boolean;
  platform: string;
}
