CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`account_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `attestations` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_user_id` text NOT NULL,
	`attester_user_id` text NOT NULL,
	`certification_id` text,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subject_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attester_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`certification_id`) REFERENCES `death_certifications`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `attestations_subject_idx` ON `attestations` (`subject_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `concern_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_user_id` text NOT NULL,
	`raised_by_connection_id` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subject_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`raised_by_connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `concern_flags_subject_idx` ON `concern_flags` (`subject_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_user_id` text NOT NULL,
	`other_user_id` text,
	`external_email` text,
	`display_name` text NOT NULL,
	`is_watcher` integer DEFAULT false NOT NULL,
	`watcher_status` text,
	`watcher_last_seen_at` integer,
	`passphrase_hint` text,
	`invited_at` integer,
	`responded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`subject_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`other_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "connections_party_ck" CHECK(("connections"."other_user_id" is not null) <> ("connections"."external_email" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connections_subject_other_uniq` ON `connections` (`subject_user_id`,`other_user_id`) WHERE "connections"."other_user_id" is not null;--> statement-breakpoint
CREATE INDEX `connections_subject_idx` ON `connections` (`subject_user_id`);--> statement-breakpoint
CREATE INDEX `connections_watcher_idx` ON `connections` (`subject_user_id`,`is_watcher`,`watcher_status`);--> statement-breakpoint
CREATE TABLE `death_certifications` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_user_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`stage` text DEFAULT 'unresponsive' NOT NULL,
	`grace_until` integer,
	`outcome` text DEFAULT 'in_progress' NOT NULL,
	`cancel_reason` text,
	`cancelled_at` integer,
	`disclosed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`subject_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `death_cert_one_active_idx` ON `death_certifications` (`subject_user_id`) WHERE "death_certifications"."outcome" = 'in_progress';--> statement-breakpoint
CREATE INDEX `death_cert_grace_idx` ON `death_certifications` (`outcome`,`grace_until`);--> statement-breakpoint
CREATE TABLE `death_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`certification_id` text NOT NULL,
	`voter_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`withdrawn_at` integer,
	FOREIGN KEY (`certification_id`) REFERENCES `death_certifications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`voter_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `death_votes_uniq` ON `death_votes` (`certification_id`,`voter_user_id`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`inviter_user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`consumed_by_user_id` text,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`inviter_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`consumed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_unique` ON `invitations` (`token`);--> statement-breakpoint
CREATE INDEX `invitations_inviter_idx` ON `invitations` (`inviter_user_id`);--> statement-breakpoint
CREATE TABLE `legacy_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_user_id` text NOT NULL,
	`encrypted_label` text NOT NULL,
	`ciphertext` text NOT NULL,
	`cipher_algo` text DEFAULT 'AES-GCM' NOT NULL,
	`iv` text NOT NULL,
	`author_wrapped_dek` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`subject_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `legacy_messages_subject_idx` ON `legacy_messages` (`subject_user_id`);--> statement-breakpoint
CREATE TABLE `message_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`wrapped_dek` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `legacy_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_recipients_uniq` ON `message_recipients` (`message_id`,`connection_id`);--> statement-breakpoint
CREATE INDEX `message_recipients_conn_idx` ON `message_recipients` (`connection_id`);--> statement-breakpoint
CREATE TABLE `push_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`fcm_token` text NOT NULL,
	`platform` text DEFAULT 'android' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_tokens_fcm_token_unique` ON `push_tokens` (`fcm_token`);--> statement-breakpoint
CREATE INDEX `push_tokens_user_idx` ON `push_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `signals` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_user_id` text NOT NULL,
	`kind` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	`source` text,
	FOREIGN KEY (`subject_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `signals_subject_time_idx` ON `signals` (`subject_user_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `subject_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`detection_window_hours` integer DEFAULT 30 NOT NULL,
	`grace_period_hours` integer DEFAULT 48 NOT NULL,
	`last_signal_at` integer,
	`state` text DEFAULT 'normal' NOT NULL,
	`state_changed_at` integer NOT NULL,
	`current_presence` text DEFAULT 'none' NOT NULL,
	`presence_since` integer,
	`travel_until` integer,
	`travel_started_at` integer,
	`app_logged_out_at` integer,
	`disclosure_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subject_settings_scan_idx` ON `subject_settings` (`state`,`last_signal_at`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);