CREATE TABLE `conversations` (
	`id` char(36) NOT NULL,
	`session_id` char(36) NOT NULL,
	`wa_jid` varchar(191) NOT NULL,
	`wa_jid_alt` varchar(191),
	`last_message_at` datetime(3),
	`unread_count` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`),
	CONSTRAINT `conversations_session_jid_uq` UNIQUE(`session_id`,`wa_jid`)
);
--> statement-breakpoint
CREATE TABLE `opt_outs` (
	`id` char(36) NOT NULL,
	`phone_e164` varchar(32) NOT NULL,
	`source` enum('keyword','manual') NOT NULL DEFAULT 'keyword',
	`opted_out_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `opt_outs_id` PRIMARY KEY(`id`),
	CONSTRAINT `opt_outs_phone_uq` UNIQUE(`phone_e164`)
);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` char(36) NOT NULL,
	`endpoint_id` char(36) NOT NULL,
	`event_type` varchar(64) NOT NULL,
	`payload` json NOT NULL,
	`status` enum('pending','delivered','failed') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`next_attempt_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`last_status_code` int,
	`last_error` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `webhook_deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhook_endpoints` (
	`id` char(36) NOT NULL,
	`url` text NOT NULL,
	`secret` varchar(255) NOT NULL,
	`events` json NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `webhook_endpoints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `broadcasts` RENAME COLUMN `template` TO `text`;--> statement-breakpoint
ALTER TABLE `broadcasts` DROP INDEX `broadcasts_session_reference_uq`;--> statement-breakpoint
ALTER TABLE `messages` DROP INDEX `messages_session_reference_uq`;--> statement-breakpoint
ALTER TABLE `broadcast_recipients` MODIFY COLUMN `status` enum('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `broadcasts` MODIFY COLUMN `status` enum('draft','scheduled','pending','running','paused','done','failed','cancelled') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `broadcasts` MODIFY COLUMN `min_delay_ms` int NOT NULL DEFAULT 5000;--> statement-breakpoint
ALTER TABLE `broadcasts` MODIFY COLUMN `max_delay_ms` int NOT NULL DEFAULT 15000;--> statement-breakpoint
ALTER TABLE `broadcasts` RENAME COLUMN `reference_id` TO `client_ref`;--> statement-breakpoint
ALTER TABLE `broadcasts` ADD `scheduled_at` datetime(3);--> statement-breakpoint
ALTER TABLE `broadcasts` ADD `started_at` datetime(3);--> statement-breakpoint
ALTER TABLE `broadcasts` ADD `finished_at` datetime(3);--> statement-breakpoint
ALTER TABLE `messages` ADD `conversation_id` char(36);--> statement-breakpoint
ALTER TABLE `messages` RENAME COLUMN `reference_id` TO `client_ref`;--> statement-breakpoint
ALTER TABLE `wa_sessions` ADD `engine` enum('baileys') DEFAULT 'baileys' NOT NULL;--> statement-breakpoint
ALTER TABLE `wa_sessions` ADD `auth_format` varchar(16) DEFAULT 'v7' NOT NULL;--> statement-breakpoint
ALTER TABLE `wa_sessions` ADD `pairing_method` enum('qr','code') DEFAULT 'qr' NOT NULL;--> statement-breakpoint
ALTER TABLE `broadcasts` ADD CONSTRAINT `broadcasts_client_ref_uq` UNIQUE(`session_id`,`client_ref`);--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_client_ref_uq` UNIQUE(`session_id`,`client_ref`);--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_session_id_wa_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `wa_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `webhook_deliveries` ADD CONSTRAINT `webhook_deliveries_endpoint_id_webhook_endpoints_id_fk` FOREIGN KEY (`endpoint_id`) REFERENCES `webhook_endpoints`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `conversations_session_recent` ON `conversations` (`session_id`,last_message_at DESC);--> statement-breakpoint
CREATE INDEX `webhook_deliveries_due` ON `webhook_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `webhook_deliveries_endpoint_fk` ON `webhook_deliveries` (`endpoint_id`);--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `messages_conv_time` ON `messages` (`conversation_id`,created_at DESC);--> statement-breakpoint
ALTER TABLE `broadcast_recipients` DROP COLUMN `contact_id`;--> statement-breakpoint
ALTER TABLE `broadcasts` DROP COLUMN `name`;