CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`scopes` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_used_at` integer,
	`expires_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE INDEX `api_keys_token_hash_idx` ON `api_keys` (`token_hash`);