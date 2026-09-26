CREATE TYPE "public"."certification_outcome" AS ENUM('in_progress', 'cancelled_by_signal', 'cancelled_by_subject', 'cancelled_by_withdrawal', 'resolved_by_attestation', 'disclosed');--> statement-breakpoint
CREATE TYPE "public"."monitoring_state" AS ENUM('normal', 'unresponsive', 'watchers_alerted', 'voting', 'certified_grace', 'disclosed');--> statement-breakpoint
CREATE TYPE "public"."presence_state" AS ENUM('none', 'eating', 'sleeping');--> statement-breakpoint
CREATE TYPE "public"."signal_kind" AS ENUM('alarm_dismiss', 'meal', 'sleep', 'app_open', 'device_unlock', 'web_checkin');--> statement-breakpoint
CREATE TYPE "public"."watcher_status" AS ENUM('pending', 'accepted', 'declined', 'revoked');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"account_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attestations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_user_id" text NOT NULL,
	"attester_user_id" text NOT NULL,
	"certification_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concern_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_user_id" text NOT NULL,
	"raised_by_connection_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_user_id" text NOT NULL,
	"other_user_id" text,
	"external_email" text,
	"display_name" text NOT NULL,
	"is_watcher" boolean DEFAULT false NOT NULL,
	"watcher_status" "watcher_status",
	"watcher_last_seen_at" timestamp with time zone,
	"passphrase_hint" text,
	"invited_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_party_ck" CHECK (("connections"."other_user_id" is not null) <> ("connections"."external_email" is not null))
);
--> statement-breakpoint
CREATE TABLE "death_certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_user_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stage" "monitoring_state" DEFAULT 'unresponsive' NOT NULL,
	"grace_until" timestamp with time zone,
	"outcome" "certification_outcome" DEFAULT 'in_progress' NOT NULL,
	"cancel_reason" text,
	"cancelled_at" timestamp with time zone,
	"disclosed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "death_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certification_id" uuid NOT NULL,
	"voter_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "legacy_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_user_id" text NOT NULL,
	"encrypted_label" text NOT NULL,
	"ciphertext" text NOT NULL,
	"cipher_algo" text DEFAULT 'AES-GCM' NOT NULL,
	"iv" text NOT NULL,
	"author_wrapped_dek" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"wrapped_dek" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"fcm_token" text NOT NULL,
	"platform" text DEFAULT 'android' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_fcm_token_unique" UNIQUE("fcm_token")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_user_id" text NOT NULL,
	"kind" "signal_kind" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text
);
--> statement-breakpoint
CREATE TABLE "subject_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"detection_window_hours" integer DEFAULT 30 NOT NULL,
	"grace_period_hours" integer DEFAULT 48 NOT NULL,
	"last_signal_at" timestamp with time zone,
	"state" "monitoring_state" DEFAULT 'normal' NOT NULL,
	"state_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"current_presence" "presence_state" DEFAULT 'none' NOT NULL,
	"presence_since" timestamp with time zone,
	"travel_until" timestamp with time zone,
	"travel_started_at" timestamp with time zone,
	"disclosure_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_attester_user_id_user_id_fk" FOREIGN KEY ("attester_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_certification_id_death_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."death_certifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concern_flags" ADD CONSTRAINT "concern_flags_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concern_flags" ADD CONSTRAINT "concern_flags_raised_by_connection_id_connections_id_fk" FOREIGN KEY ("raised_by_connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_other_user_id_user_id_fk" FOREIGN KEY ("other_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "death_certifications" ADD CONSTRAINT "death_certifications_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "death_votes" ADD CONSTRAINT "death_votes_certification_id_death_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."death_certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "death_votes" ADD CONSTRAINT "death_votes_voter_user_id_user_id_fk" FOREIGN KEY ("voter_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_messages" ADD CONSTRAINT "legacy_messages_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_message_id_legacy_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."legacy_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_settings" ADD CONSTRAINT "subject_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attestations_subject_idx" ON "attestations" USING btree ("subject_user_id","created_at");--> statement-breakpoint
CREATE INDEX "concern_flags_subject_idx" ON "concern_flags" USING btree ("subject_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_subject_other_uniq" ON "connections" USING btree ("subject_user_id","other_user_id") WHERE "connections"."other_user_id" is not null;--> statement-breakpoint
CREATE INDEX "connections_subject_idx" ON "connections" USING btree ("subject_user_id");--> statement-breakpoint
CREATE INDEX "connections_watcher_idx" ON "connections" USING btree ("subject_user_id","is_watcher","watcher_status");--> statement-breakpoint
CREATE UNIQUE INDEX "death_cert_one_active_idx" ON "death_certifications" USING btree ("subject_user_id") WHERE "death_certifications"."outcome" = 'in_progress';--> statement-breakpoint
CREATE INDEX "death_cert_grace_idx" ON "death_certifications" USING btree ("outcome","grace_until");--> statement-breakpoint
CREATE UNIQUE INDEX "death_votes_uniq" ON "death_votes" USING btree ("certification_id","voter_user_id");--> statement-breakpoint
CREATE INDEX "legacy_messages_subject_idx" ON "legacy_messages" USING btree ("subject_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_recipients_uniq" ON "message_recipients" USING btree ("message_id","connection_id");--> statement-breakpoint
CREATE INDEX "message_recipients_conn_idx" ON "message_recipients" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "push_tokens_user_idx" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "signals_subject_time_idx" ON "signals" USING btree ("subject_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "subject_settings_scan_idx" ON "subject_settings" USING btree ("state","last_signal_at");