CREATE TABLE `access_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`link_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`slug` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`ua` text DEFAULT '' NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`referer` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`timezone` text DEFAULT '' NOT NULL,
	`language` text DEFAULT '' NOT NULL,
	`os` text DEFAULT '' NOT NULL,
	`browser` text DEFAULT '' NOT NULL,
	`browser_type` text DEFAULT '' NOT NULL,
	`device` text DEFAULT '' NOT NULL,
	`device_type` text DEFAULT '' NOT NULL,
	`colo` text DEFAULT '' NOT NULL,
	`domain` text DEFAULT '' NOT NULL,
	`latitude` real DEFAULT 0 NOT NULL,
	`longitude` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `access_logs_link_id_idx` ON `access_logs` (`link_id`);--> statement-breakpoint
CREATE INDEX `access_logs_timestamp_idx` ON `access_logs` (`timestamp`);