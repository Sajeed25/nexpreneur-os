CREATE TABLE IF NOT EXISTS `audit_logs` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`actor_id` varchar(36),
	`action` varchar(80) NOT NULL,
	`entity` varchar(60),
	`entity_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
CREATE TABLE IF NOT EXISTS `locations` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`city` varchar(120),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` timestamp,
	CONSTRAINT `locations_id` PRIMARY KEY(`id`)
);
CREATE TABLE IF NOT EXISTS `membership_plans` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`price_paise` bigint NOT NULL,
	`billing_cycle` varchar(20) NOT NULL DEFAULT 'monthly',
	`included_days` int,
	`booking_credits` int,
	`benefits` json,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` timestamp,
	CONSTRAINT `membership_plans_id` PRIMARY KEY(`id`)
);
CREATE TABLE IF NOT EXISTS `organizations` (
	`id` varchar(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`slug` varchar(80) NOT NULL,
	`accent_color` varchar(9) DEFAULT '#5b4df5',
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` timestamp,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_slug_unique` UNIQUE(`slug`)
);
CREATE TABLE IF NOT EXISTS `resources` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`location_id` varchar(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`kind` enum('hot_desk','dedicated_desk','meeting_room','private_office','phone_booth','event_space','other') NOT NULL,
	`capacity` int NOT NULL DEFAULT 1,
	`hourly_price_paise` bigint,
	`daily_price_paise` bigint,
	`status` enum('available','reserved','maintenance','unavailable') NOT NULL DEFAULT 'available',
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` timestamp,
	CONSTRAINT `resources_id` PRIMARY KEY(`id`)
);
CREATE TABLE IF NOT EXISTS `users` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`location_id` varchar(36),
	`name` varchar(160) NOT NULL,
	`email` varchar(190) NOT NULL,
	`password_hash` varchar(100) NOT NULL,
	`role` enum('super_admin','owner','location_manager','reception','finance','community_manager','staff','member') NOT NULL DEFAULT 'member',
	`last_login_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` timestamp,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email` UNIQUE(`email`)
);
ALTER TABLE `locations` ADD CONSTRAINT `locations_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `membership_plans` ADD CONSTRAINT `membership_plans_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `resources` ADD CONSTRAINT `resources_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `resources` ADD CONSTRAINT `resources_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `users` ADD CONSTRAINT `users_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `users` ADD CONSTRAINT `users_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;
CREATE INDEX `audit_org_time` ON `audit_logs` (`organization_id`,`created_at`);
CREATE INDEX `loc_org` ON `locations` (`organization_id`);
CREATE INDEX `plan_org` ON `membership_plans` (`organization_id`);
CREATE INDEX `res_org_loc` ON `resources` (`organization_id`,`location_id`);
CREATE INDEX `users_org` ON `users` (`organization_id`);