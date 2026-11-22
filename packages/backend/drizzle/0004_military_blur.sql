ALTER TABLE `broadcast_recipients` ADD `ref` varchar(191);--> statement-breakpoint
ALTER TABLE `broadcast_recipients` ADD CONSTRAINT `broadcast_recipients_ref_uq` UNIQUE(`broadcast_id`,`ref`);