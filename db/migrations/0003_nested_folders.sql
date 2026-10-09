ALTER TABLE `folders` ADD `parent_id` text;--> statement-breakpoint
ALTER TABLE `folders` ADD `position` integer DEFAULT 0 NOT NULL;
