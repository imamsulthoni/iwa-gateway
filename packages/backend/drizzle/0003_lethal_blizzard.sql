CREATE TABLE `app_settings` (
	`key` varchar(64) NOT NULL,
	`value` varchar(255) NOT NULL,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `app_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `user_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_sessions_token_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone_number` varchar(32) NOT NULL,
	`role` enum('admin','sales') NOT NULL DEFAULT 'sales',
	`pin_hash` varchar(255) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_phone_number_uq` UNIQUE(`phone_number`)
);
--> statement-breakpoint
ALTER TABLE `wa_sessions` ADD `owner_user_id` char(36);--> statement-breakpoint
ALTER TABLE `wa_sessions` ADD CONSTRAINT `wa_sessions_owner_uq` UNIQUE(`owner_user_id`);--> statement-breakpoint
ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `user_sessions_user_expires_idx` ON `user_sessions` (`user_id`,`expires_at`);--> statement-breakpoint
ALTER TABLE `wa_sessions` ADD CONSTRAINT `wa_sessions_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;