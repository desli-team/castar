CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`remote_id` text,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`currency` text DEFAULT 'UZS' NOT NULL,
	`balance` real DEFAULT 0 NOT NULL,
	`icon` text,
	`color` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`remote_id` text,
	`user_id` text NOT NULL,
	`family_group_id` text,
	`category_id` text,
	`name` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'UZS' NOT NULL,
	`period` text NOT NULL,
	`start_date` integer NOT NULL,
	`end_date` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_budgets_user` ON `budgets` (`user_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`remote_id` text,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '📁' NOT NULL,
	`color` text DEFAULT '#808080' NOT NULL,
	`type` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`parent_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_categories_user` ON `categories` (`user_id`);--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`base_currency` text NOT NULL,
	`target_currency` text NOT NULL,
	`rate` real NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recurrings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`category_id` text NOT NULL,
	`type` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'UZS' NOT NULL,
	`description` text,
	`frequency` text NOT NULL,
	`next_date` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`action` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `idx_sync_queue_pending` ON `sync_queue` (`attempts`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`remote_id` text,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`category_id` text NOT NULL,
	`family_group_id` text,
	`type` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'UZS' NOT NULL,
	`amount_in_default` real,
	`exchange_rate` real,
	`description` text,
	`date` integer NOT NULL,
	`is_recurring` integer DEFAULT false NOT NULL,
	`recurring_id` text,
	`voice_input` integer DEFAULT false NOT NULL,
	`reviewed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_transactions_user_date` ON `transactions` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_transactions_category` ON `transactions` (`category_id`);