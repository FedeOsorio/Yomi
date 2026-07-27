CREATE TABLE `decks` (
	`id` text PRIMARY KEY NOT NULL,
	`language_code` text DEFAULT 'zh-CN' NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sentence_words` (
	`sentence_id` text NOT NULL,
	`word_id` text NOT NULL,
	PRIMARY KEY(`sentence_id`, `word_id`),
	FOREIGN KEY (`sentence_id`) REFERENCES `sentences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sentences` (
	`id` text PRIMARY KEY NOT NULL,
	`deck_id` text NOT NULL,
	`text_content` text NOT NULL,
	`reading_content` text NOT NULL,
	`translation` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sentences_deck` ON `sentences` (`deck_id`);--> statement-breakpoint
CREATE TABLE `srs_items` (
	`id` text PRIMARY KEY NOT NULL,
	`item_type` text NOT NULL,
	`item_id` text NOT NULL,
	`display_text` text NOT NULL,
	`display_reading` text NOT NULL,
	`display_meaning` text NOT NULL,
	`state` integer NOT NULL,
	`due` integer NOT NULL,
	`stability` real NOT NULL,
	`difficulty` real NOT NULL,
	`elapsed_days` integer NOT NULL,
	`scheduled_days` integer NOT NULL,
	`reps` integer NOT NULL,
	`lapses` integer NOT NULL,
	`last_review` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_srs_due` ON `srs_items` (`due`);--> statement-breakpoint
CREATE INDEX `idx_srs_type_item` ON `srs_items` (`item_type`,`item_id`);--> statement-breakpoint
CREATE TABLE `words` (
	`id` text PRIMARY KEY NOT NULL,
	`deck_id` text NOT NULL,
	`simplified` text NOT NULL,
	`traditional` text NOT NULL,
	`pinyin_display` text NOT NULL,
	`pinyin_numeric` text NOT NULL,
	`meanings` text NOT NULL,
	`auxiliary_info` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_words_deck` ON `words` (`deck_id`);