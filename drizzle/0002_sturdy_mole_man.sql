CREATE TABLE `user_logs` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`user_id` integer,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL,
	`text` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
