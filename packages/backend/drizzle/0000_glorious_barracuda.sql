CREATE TABLE `api_keys` (
	`id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`key_hash` char(64) NOT NULL,
	`revoked_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_keys_key_hash_uq` UNIQUE(`key_hash`)
);
--> statement-breakpoint
CREATE TABLE `broadcast_recipients` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`broadcast_id` char(36) NOT NULL,
	`to_jid` varchar(191) NOT NULL,
	`name` varchar(255),
	`contact_id` char(36),
	`message_id` char(36),
	`status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
	`error` text,
	CONSTRAINT `broadcast_recipients_id` PRIMARY KEY(`id`),
	CONSTRAINT `broadcast_recipients_to_uq` UNIQUE(`broadcast_id`,`to_jid`)
);
--> statement-breakpoint
CREATE TABLE `broadcasts` (
	`id` char(36) NOT NULL,
	`session_id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`template` text NOT NULL,
	`status` enum('pending','running','done','failed','cancelled') NOT NULL DEFAULT 'pending',
	`min_delay_ms` int NOT NULL DEFAULT 10000,
	`max_delay_ms` int NOT NULL DEFAULT 30000,
	`reference_id` varchar(191),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `broadcasts_id` PRIMARY KEY(`id`),
	CONSTRAINT `broadcasts_session_reference_uq` UNIQUE(`session_id`,`reference_id`)
);
--> statement-breakpoint
CREATE TABLE `message_status_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`message_id` char(36) NOT NULL,
	`status` varchar(32) NOT NULL,
	`occurred_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `message_status_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` char(36) NOT NULL,
	`session_id` char(36) NOT NULL,
	`wa_message_id` varchar(191),
	`reference_id` varchar(191),
	`direction` enum('in','out') NOT NULL DEFAULT 'out',
	`type` varchar(32) NOT NULL DEFAULT 'text',
	`body` text,
	`raw` json,
	`status` enum('queued','sent','delivered','read','failed') NOT NULL DEFAULT 'queued',
	`error` text,
	`to_jid` varchar(191),
	`customer_id` varchar(64),
	`customer_name` varchar(255),
	`broadcast_id` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`wa_timestamp` datetime(3),
	`deleted_at` datetime(3),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `messages_session_reference_uq` UNIQUE(`session_id`,`reference_id`),
	CONSTRAINT `messages_session_wa_id_uq` UNIQUE(`session_id`,`wa_message_id`)
);
--> statement-breakpoint
CREATE TABLE `wa_auth_creds` (
	`session_id` char(36) NOT NULL,
	`creds` json NOT NULL,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `wa_auth_creds_session_id` PRIMARY KEY(`session_id`)
);
--> statement-breakpoint
CREATE TABLE `wa_auth_keys` (
	`session_id` char(36) NOT NULL,
	`type` varchar(50) NOT NULL,
	`key_id` varchar(191) NOT NULL,
	`value` json NOT NULL,
	CONSTRAINT `wa_auth_keys_session_id_type_key_id_pk` PRIMARY KEY(`session_id`,`type`,`key_id`)
);
--> statement-breakpoint
CREATE TABLE `wa_sessions` (
	`id` char(36) NOT NULL,
	`public_id` varchar(32) NOT NULL,
	`label` varchar(255) NOT NULL,
	`phone_number` varchar(32),
	`status` enum('created','qr_pending','connecting','connected','disconnected','logged_out') NOT NULL DEFAULT 'created',
	`last_qr` text,
	`last_connected_at` datetime(3),
	`token_hash` char(64),
	`token_rotated_at` datetime(3),
	`sales_id` varchar(64),
	`agent_id` varchar(64),
	`daily_send_limit` int NOT NULL DEFAULT 200,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `wa_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `wa_sessions_public_id_uq` UNIQUE(`public_id`),
	CONSTRAINT `wa_sessions_phone_uq` UNIQUE(`phone_number`)
);
--> statement-breakpoint
ALTER TABLE `broadcast_recipients` ADD CONSTRAINT `broadcast_recipients_broadcast_id_broadcasts_id_fk` FOREIGN KEY (`broadcast_id`) REFERENCES `broadcasts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `broadcasts` ADD CONSTRAINT `broadcasts_session_id_wa_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `wa_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `message_status_events` ADD CONSTRAINT `message_status_events_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_session_id_wa_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `wa_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wa_auth_creds` ADD CONSTRAINT `wa_auth_creds_session_id_wa_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `wa_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wa_auth_keys` ADD CONSTRAINT `wa_auth_keys_session_id_wa_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `wa_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `broadcasts_session_created_idx` ON `broadcasts` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `message_status_events_message_idx` ON `message_status_events` (`message_id`);--> statement-breakpoint
CREATE INDEX `messages_session_created_idx` ON `messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `messages_created_idx` ON `messages` (`created_at`);--> statement-breakpoint
ALTER TABLE `wa_auth_keys` MODIFY COLUMN `key_id` varchar(191) COLLATE utf8mb4_bin NOT NULL;
