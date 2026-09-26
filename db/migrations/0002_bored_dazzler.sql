CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `decks` ADD `folder_id` text REFERENCES `folders`(`id`) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_srs_item_id` ON `srs_items` (`item_id`);