ALTER TABLE `wa_sessions` DROP FOREIGN KEY `wa_sessions_owner_user_id_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `wa_sessions` DROP INDEX `wa_sessions_owner_uq`;
--> statement-breakpoint
ALTER TABLE `wa_sessions` DROP COLUMN `owner_user_id`;
--> statement-breakpoint
DROP TABLE `user_sessions`;
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
DROP TABLE `app_settings`;
