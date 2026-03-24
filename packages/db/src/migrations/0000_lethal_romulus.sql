CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"principal_id" text NOT NULL,
	"name" text NOT NULL,
	"tier" text DEFAULT 'basic' NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"entry_id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"principal_id" text NOT NULL,
	"action" jsonb NOT NULL,
	"outcome" text NOT NULL,
	"verification_used" text NOT NULL,
	"target_url" text,
	"payload_hash" text,
	"previous_hash" text NOT NULL,
	"entry_hash" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delegation_tokens" (
	"token_id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"grantor_id" text NOT NULL,
	"scope" jsonb NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"single_use" boolean DEFAULT false NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"signature" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kya_behavior_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"signal_type" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"window_hours" integer DEFAULT 24 NOT NULL,
	"source" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kya_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"trust_score" integer NOT NULL,
	"risk_score" integer NOT NULL,
	"status" text NOT NULL,
	"classification_type" text,
	"replaces_captcha" boolean DEFAULT false NOT NULL,
	"replaces_otp" boolean DEFAULT false NOT NULL,
	"replaces_login_wall" boolean DEFAULT false NOT NULL,
	"replaces_rate_limit" boolean DEFAULT false NOT NULL,
	"replaces_email_verification" boolean DEFAULT false NOT NULL,
	"signals_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passports" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"token" text NOT NULL,
	"signature" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "principals" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kya_behavior_signals" ADD CONSTRAINT "kya_behavior_signals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kya_scores" ADD CONSTRAINT "kya_scores_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passports" ADD CONSTRAINT "passports_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_principal_idx" ON "agents" USING btree ("principal_id");--> statement-breakpoint
CREATE INDEX "audit_agent_idx" ON "audit_log" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "audit_timestamp_idx" ON "audit_log" USING btree ("agent_id","timestamp");--> statement-breakpoint
CREATE INDEX "delegation_agent_idx" ON "delegation_tokens" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "delegation_grantor_idx" ON "delegation_tokens" USING btree ("grantor_id");--> statement-breakpoint
CREATE INDEX "kya_signals_agent_idx" ON "kya_behavior_signals" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "kya_signals_type_idx" ON "kya_behavior_signals" USING btree ("agent_id","signal_type");--> statement-breakpoint
CREATE INDEX "kya_scores_agent_idx" ON "kya_scores" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "kya_scores_computed_idx" ON "kya_scores" USING btree ("agent_id","computed_at");--> statement-breakpoint
CREATE INDEX "passports_agent_idx" ON "passports" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "passports_active_idx" ON "passports" USING btree ("agent_id","active");