CREATE TABLE `companies` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`gstin` varchar(20),
	`billing_address` varchar(500),
	`email` varchar(190),
	`phone` varchar(20),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` timestamp,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`code` varchar(40) NOT NULL,
	`kind` enum('percent','fixed') NOT NULL,
	`value` int NOT NULL,
	`max_uses` int,
	`used_count` int NOT NULL DEFAULT 0,
	`valid_until` date,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `cpn_org_code` UNIQUE(`organization_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `images` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`mime` varchar(40) NOT NULL,
	`data` longblob NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `login_tokens` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` datetime NOT NULL,
	`used_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `login_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `lt_token` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`kind` varchar(30) NOT NULL,
	`title` varchar(160) NOT NULL,
	`body` varchar(500),
	`link` varchar(200),
	`read_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`payment_id` varchar(36) NOT NULL,
	`invoice_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`amount_paise` bigint NOT NULL,
	`reason` varchar(255),
	`razorpay_refund_id` varchar(40),
	`created_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `refunds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `service_orders` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`service_id` varchar(36) NOT NULL,
	`qty` int NOT NULL DEFAULT 1,
	`invoice_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `service_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` varchar(1000),
	`price_paise` bigint NOT NULL,
	`tax_pct` int NOT NULL DEFAULT 18,
	`available` boolean NOT NULL DEFAULT true,
	`image_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` timestamp,
	CONSTRAINT `services_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `events` ADD `image_id` varchar(36);--> statement-breakpoint
ALTER TABLE `invoices` ADD `discount_paise` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `coupon_code` varchar(40);--> statement-breakpoint
ALTER TABLE `invoices` ADD `location_id` varchar(36);--> statement-breakpoint
ALTER TABLE `invoices` ADD `company_id` varchar(36);--> statement-breakpoint
ALTER TABLE `invoices` ADD `emailed_at` datetime;--> statement-breakpoint
ALTER TABLE `invoices` ADD `last_reminded_at` datetime;--> statement-breakpoint
ALTER TABLE `invoices` ADD `reminder_count` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `memberships` ADD `location_id` varchar(36);--> statement-breakpoint
ALTER TABLE `memberships` ADD `cancelled_at` datetime;--> statement-breakpoint
ALTER TABLE `payments` ADD `refunded_paise` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `company_id` varchar(36);--> statement-breakpoint
ALTER TABLE `visitor_invites` ADD `email` varchar(190);--> statement-breakpoint
CREATE INDEX `co_org` ON `companies` (`organization_id`);--> statement-breakpoint
CREATE INDEX `img_org` ON `images` (`organization_id`);--> statement-breakpoint
CREATE INDEX `lt_user` ON `login_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `nt_user_read` ON `notifications` (`user_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `rf_payment` ON `refunds` (`payment_id`);--> statement-breakpoint
CREATE INDEX `rf_org_time` ON `refunds` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `so_org_time` ON `service_orders` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `so_user` ON `service_orders` (`user_id`);--> statement-breakpoint
CREATE INDEX `svc_org` ON `services` (`organization_id`);