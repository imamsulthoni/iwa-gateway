ALTER TABLE `messages` DROP FOREIGN KEY `messages_conversation_id_conversations_id_fk`;
--> statement-breakpoint
ALTER TABLE `messages` DROP INDEX `messages_conv_time`;
--> statement-breakpoint
ALTER TABLE `messages` DROP COLUMN `conversation_id`;
--> statement-breakpoint
ALTER TABLE `messages` DROP INDEX `messages_client_ref_uq`;
--> statement-breakpoint
ALTER TABLE `messages` RENAME COLUMN `client_ref` TO `reference_id`;
--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_session_reference_uq` UNIQUE(`session_id`,`reference_id`);
--> statement-breakpoint
ALTER TABLE `broadcasts` DROP INDEX `broadcasts_client_ref_uq`;
--> statement-breakpoint
ALTER TABLE `broadcasts` DROP COLUMN `scheduled_at`;
--> statement-breakpoint
ALTER TABLE `broadcasts` DROP COLUMN `started_at`;
--> statement-breakpoint
ALTER TABLE `broadcasts` DROP COLUMN `finished_at`;
--> statement-breakpoint
ALTER TABLE `broadcasts` RENAME COLUMN `text` TO `template`;
--> statement-breakpoint
ALTER TABLE `broadcasts` RENAME COLUMN `client_ref` TO `reference_id`;
--> statement-breakpoint
ALTER TABLE `broadcasts` ADD CONSTRAINT `broadcasts_session_reference_uq` UNIQUE(`session_id`,`reference_id`);
--> statement-breakpoint
ALTER TABLE `broadcasts` MODIFY COLUMN `status` enum('pending','running','done','failed','cancelled') NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE `broadcasts` MODIFY COLUMN `min_delay_ms` int NOT NULL DEFAULT 10000;
--> statement-breakpoint
ALTER TABLE `broadcasts` MODIFY COLUMN `max_delay_ms` int NOT NULL DEFAULT 30000;
--> statement-breakpoint
ALTER TABLE `broadcasts` ADD COLUMN `name` varchar(255) NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `broadcasts` ALTER COLUMN `name` DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE `broadcast_recipients` MODIFY COLUMN `status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE `broadcast_recipients` ADD COLUMN `contact_id` char(36);
--> statement-breakpoint
ALTER TABLE `wa_sessions` DROP COLUMN `pairing_method`;
--> statement-breakpoint
ALTER TABLE `wa_sessions` DROP COLUMN `auth_format`;
--> statement-breakpoint
ALTER TABLE `wa_sessions` DROP COLUMN `engine`;
--> statement-breakpoint
DROP TABLE `webhook_deliveries`;
--> statement-breakpoint
DROP TABLE `webhook_endpoints`;
--> statement-breakpoint
DROP TABLE `opt_outs`;
--> statement-breakpoint
DROP TABLE `conversations`;