CREATE TABLE `domains` (
	`name` text PRIMARY KEY NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_link_tags` (
	`link_domain` text DEFAULT '' NOT NULL,
	`link_slug` text NOT NULL,
	`tag_name` text NOT NULL,
	PRIMARY KEY(`link_domain`, `link_slug`, `tag_name`),
	FOREIGN KEY (`tag_name`) REFERENCES `tags`(`name`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_link_tags`("link_domain", "link_slug", "tag_name") SELECT '', "link_slug", "tag_name" FROM `link_tags`;
--> statement-breakpoint
DROP TABLE `link_tags`;
--> statement-breakpoint
ALTER TABLE `__new_link_tags` RENAME TO `link_tags`;
--> statement-breakpoint
CREATE TABLE `__new_links` (
	`domain` text DEFAULT '' NOT NULL,
	`slug` text NOT NULL,
	`id` text NOT NULL,
	`url` text NOT NULL,
	`comment` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expiration` integer,
	`title` text,
	`description` text,
	`image` text,
	`apple` text,
	`google` text,
	`cloaking` integer,
	`redirect_with_query` integer,
	`password` text,
	`unsafe` integer,
	`geo` text,
	`normalized_url` text NOT NULL,
	`effective_expires_at` integer,
	PRIMARY KEY(`domain`, `slug`)
);
--> statement-breakpoint
INSERT INTO `__new_links`("domain", "slug", "id", "url", "comment", "created_at", "updated_at", "expiration", "title", "description", "image", "apple", "google", "cloaking", "redirect_with_query", "password", "unsafe", "geo", "normalized_url", "effective_expires_at") SELECT '', "slug", "id", "url", "comment", "created_at", "updated_at", "expiration", "title", "description", "image", "apple", "google", "cloaking", "redirect_with_query", "password", "unsafe", "geo", "normalized_url", "effective_expires_at" FROM `links`;
--> statement-breakpoint
DROP TABLE `links`;
--> statement-breakpoint
ALTER TABLE `__new_links` RENAME TO `links`;
--> statement-breakpoint
CREATE TABLE `__new_link_tombstones` (
	`domain` text DEFAULT '' NOT NULL,
	`slug` text NOT NULL,
	`deleted_at` integer NOT NULL,
	PRIMARY KEY(`domain`, `slug`)
);
--> statement-breakpoint
INSERT INTO `__new_link_tombstones`("domain", "slug", "deleted_at") SELECT '', "slug", "deleted_at" FROM `link_tombstones`;
--> statement-breakpoint
DROP TABLE `link_tombstones`;
--> statement-breakpoint
ALTER TABLE `__new_link_tombstones` RENAME TO `link_tombstones`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
CREATE INDEX `link_tags_tag_name_link_domain_link_slug_idx` ON `link_tags` (`tag_name`,`link_domain`,`link_slug`);
--> statement-breakpoint
CREATE INDEX `links_created_at_domain_slug_idx` ON `links` (`created_at`,`domain`,`slug`);
--> statement-breakpoint
CREATE INDEX `links_created_at_desc_domain_slug_idx` ON `links` (`created_at` desc,`domain`,`slug`);
--> statement-breakpoint
CREATE INDEX `links_normalized_url_idx` ON `links` (`normalized_url`);
--> statement-breakpoint
CREATE INDEX `links_id_idx` ON `links` (`id`);
