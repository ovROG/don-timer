CREATE TABLE `timers` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'New Timer',
	`format` text DEFAULT 'HH[h]:mm[m]:ss[s]',
	`css` text DEFAULT '.timer { color: #bb2020; font-family: "Manrope"; font-weight: bold; font-size: 100px; }',
	`time` integer DEFAULT 3600000 NOT NULL,
	`price` integer DEFAULT 100 NOT NULL,
	`donations_enabled` integer DEFAULT true NOT NULL,
	`limit_mode` text DEFAULT 'none' NOT NULL,
	`limit_time` integer,
	`user_id` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_logs` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`user_id` integer,
	`timer_id` text,
	`source` text,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL,
	`text` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_logs_user_id_timestamp_idx` ON `user_logs` (`user_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`avatar` text NOT NULL,
	`token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`expiresIn` integer,
	`obtainmentTimestamp` integer,
	`da_socket_token` text NOT NULL,
	`timers_limit` integer DEFAULT 2,
	`is_admin` integer DEFAULT false
);
