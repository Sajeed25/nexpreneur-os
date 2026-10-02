CREATE TABLE IF NOT EXISTS `bookings` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`location_id` varchar(36) NOT NULL,
	`resource_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`starts_at` datetime NOT NULL,
	`ends_at` datetime NOT NULL,
	`status` enum('confirmed','pending','cancelled','completed','no_show') NOT NULL DEFAULT 'confirmed',
	`subtotal_paise` bigint NOT NULL,
	`tax_paise` bigint NOT NULL,
	`total_paise` bigint NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `bookings_id` PRIMARY KEY(`id`)
);
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_resource_id_resources_id_fk` FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
CREATE INDEX `bk_res_time` ON `bookings` (`resource_id`,`starts_at`,`ends_at`);
CREATE INDEX `bk_org_loc_time` ON `bookings` (`organization_id`,`location_id`,`starts_at`);
CREATE INDEX `bk_user` ON `bookings` (`user_id`);