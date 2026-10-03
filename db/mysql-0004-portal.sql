CREATE TABLE IF NOT EXISTS `support_tickets` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`subject` varchar(160) NOT NULL,
	`body` varchar(2000) NOT NULL,
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`closed_at` timestamp,
	CONSTRAINT `support_tickets_id` PRIMARY KEY(`id`)
);
ALTER TABLE `users` ADD `phone` varchar(20);
ALTER TABLE `users` ADD `job_title` varchar(120);
ALTER TABLE `users` ADD `company` varchar(160);
ALTER TABLE `users` ADD `emergency_name` varchar(120);
ALTER TABLE `users` ADD `emergency_phone` varchar(20);
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
CREATE INDEX `tk_org_status` ON `support_tickets` (`organization_id`,`status`);
CREATE INDEX `tk_user` ON `support_tickets` (`user_id`);