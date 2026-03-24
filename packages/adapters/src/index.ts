// ─── Types ─────────────────────────────────────────────────────────────────────
export type {
  AdapterManifest,
  AdapterEndpoint,
  AdapterResult,
  SystemType,
  VerificationRequirement,
  PageContent,
  Link,
  Image,
  SearchResult,
  FormField,
  FormDefinition,
  Product,
  CartItem,
  CartSummary,
  OrderItem,
  Order,
  Article,
  Post,
  SocialProfile,
} from "./types.js";

// ─── Base adapter ─────────────────────────────────────────────────────────────
export { BaseAdapter } from "./base-adapter.js";

// ─── Registry ─────────────────────────────────────────────────────────────────
export { AdapterRegistry, registry } from "./registry.js";

// ─── Built-in adapters ────────────────────────────────────────────────────────
export { WebGenericAdapter } from "./built-in/web-generic.js";
export { EcommerceGenericAdapter } from "./built-in/ecommerce-generic.js";
export { NewsGenericAdapter } from "./built-in/news-generic.js";
export { GovernmentIndiaAdapter } from "./built-in/government-india.js";
export { APIGenericAdapter } from "./built-in/api-generic.js";
export { SocialGenericAdapter } from "./built-in/social-generic.js";
