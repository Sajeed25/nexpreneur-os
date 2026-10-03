-- Nexpreneur OS catch-up: creates any table from phases 5-6 that is missing, then applies the latest changes.
-- Safe to run more than once. Run it with your database selected in phpMyAdmin (SQL tab).

-- Phase 5: support tickets + profile columns
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
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `phone` varchar(20);
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `job_title` varchar(120);
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `company` varchar(160);
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `emergency_name` varchar(120);
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `emergency_phone` varchar(20);
CREATE INDEX IF NOT EXISTS `tk_org_status` ON `support_tickets` (`organization_id`,`status`);
CREATE INDEX IF NOT EXISTS `tk_user` ON `support_tickets` (`user_id`);

-- Phase 6: visitors, CRM, events, community
CREATE TABLE IF NOT EXISTS `community_comments` (
	`id` varchar(36) NOT NULL,
	`post_id` varchar(36) NOT NULL,
	`author_id` varchar(36) NOT NULL,
	`body` varchar(1000) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `community_comments_id` PRIMARY KEY(`id`)
);
CREATE TABLE IF NOT EXISTS `community_likes` (
	`id` varchar(36) NOT NULL,
	`post_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	CONSTRAINT `community_likes_id` PRIMARY KEY(`id`),
	CONSTRAINT `cl_post_user` UNIQUE(`post_id`,`user_id`)
);
CREATE TABLE IF NOT EXISTS `community_posts` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`author_id` varchar(36) NOT NULL,
	`kind` enum('update','opportunity','job','question','announcement') NOT NULL DEFAULT 'update',
	`body` varchar(2000) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` timestamp,
	CONSTRAINT `community_posts_id` PRIMARY KEY(`id`)
);
CREATE TABLE IF NOT EXISTS `event_registrations` (
	`id` varchar(36) NOT NULL,
	`event_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`invoice_id` varchar(36),
	`status` enum('registered','cancelled') NOT NULL DEFAULT 'registered',
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `event_registrations_id` PRIMARY KEY(`id`),
	CONSTRAINT `er_event_user` UNIQUE(`event_id`,`user_id`)
);
CREATE TABLE IF NOT EXISTS `events` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`title` varchar(160) NOT NULL,
	`description` varchar(2000),
	`starts_at` datetime NOT NULL,
	`ends_at` datetime NOT NULL,
	`venue` varchar(160),
	`capacity` int NOT NULL DEFAULT 50,
	`price_paise` bigint NOT NULL DEFAULT 0,
	`organizer` varchar(120),
	`published` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `events_id` PRIMARY KEY(`id`)
);
CREATE TABLE IF NOT EXISTS `lead_activities` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`lead_id` varchar(36) NOT NULL,
	`kind` enum('note','call','stage') NOT NULL DEFAULT 'note',
	`note` varchar(1000) NOT NULL,
	`created_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `lead_activities_id` PRIMARY KEY(`id`)
);
CREATE TABLE IF NOT EXISTS `leads` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`company` varchar(160),
	`phone` varchar(20),
	`email` varchar(190),
	`requirements` varchar(1000),
	`interested_plan` varchar(120),
	`expected_value_paise` bigint NOT NULL DEFAULT 0,
	`stage` enum('new','contacted','tour_scheduled','proposal_sent','negotiation','won','lost') NOT NULL DEFAULT 'new',
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);
CREATE TABLE IF NOT EXISTS `visitor_invites` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`host_user_id` varchar(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`phone` varchar(20),
	`visit_date` date NOT NULL,
	`visit_time` varchar(5) NOT NULL,
	`purpose` varchar(255),
	`token` varchar(40) NOT NULL,
	`status` enum('invited','checked_in','checked_out','cancelled') NOT NULL DEFAULT 'invited',
	`checked_in_at` datetime,
	`checked_out_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `visitor_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `vi_token` UNIQUE(`token`)
);
CREATE INDEX IF NOT EXISTS `cc_post` ON `community_comments` (`post_id`,`created_at`);
CREATE INDEX IF NOT EXISTS `cp_org_time` ON `community_posts` (`organization_id`,`created_at`);
CREATE INDEX IF NOT EXISTS `ev_org_start` ON `events` (`organization_id`,`starts_at`);
CREATE INDEX IF NOT EXISTS `la_lead` ON `lead_activities` (`lead_id`,`created_at`);
CREATE INDEX IF NOT EXISTS `lead_org_stage` ON `leads` (`organization_id`,`stage`);
CREATE INDEX IF NOT EXISTS `vi_org_date` ON `visitor_invites` (`organization_id`,`visit_date`);
CREATE INDEX IF NOT EXISTS `vi_host` ON `visitor_invites` (`host_user_id`);

-- Latest features (same as mysql-0007-features.sql)
CREATE TABLE IF NOT EXISTS `companies` (
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
CREATE TABLE IF NOT EXISTS `coupons` (
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
CREATE TABLE IF NOT EXISTS `images` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`mime` varchar(40) NOT NULL,
	`data` longblob NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `images_id` PRIMARY KEY(`id`)
);
CREATE TABLE IF NOT EXISTS `login_tokens` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` datetime NOT NULL,
	`used_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `login_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `lt_token` UNIQUE(`token_hash`)
);
CREATE TABLE IF NOT EXISTS `notifications` (
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
CREATE TABLE IF NOT EXISTS `refunds` (
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
CREATE TABLE IF NOT EXISTS `service_orders` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`service_id` varchar(36) NOT NULL,
	`qty` int NOT NULL DEFAULT 1,
	`invoice_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `service_orders_id` PRIMARY KEY(`id`)
);
CREATE TABLE IF NOT EXISTS `services` (
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
ALTER TABLE `events` ADD COLUMN IF NOT EXISTS `image_id` varchar(36);
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `discount_paise` bigint DEFAULT 0 NOT NULL;
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `coupon_code` varchar(40);
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `location_id` varchar(36);
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `company_id` varchar(36);
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `emailed_at` datetime;
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `last_reminded_at` datetime;
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `reminder_count` int DEFAULT 0 NOT NULL;
ALTER TABLE `memberships` ADD COLUMN IF NOT EXISTS `location_id` varchar(36);
ALTER TABLE `memberships` ADD COLUMN IF NOT EXISTS `cancelled_at` datetime;
ALTER TABLE `payments` ADD COLUMN IF NOT EXISTS `refunded_paise` bigint DEFAULT 0 NOT NULL;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `company_id` varchar(36);
ALTER TABLE `visitor_invites` ADD COLUMN IF NOT EXISTS `email` varchar(190);
CREATE INDEX IF NOT EXISTS `co_org` ON `companies` (`organization_id`);
CREATE INDEX IF NOT EXISTS `img_org` ON `images` (`organization_id`);
CREATE INDEX IF NOT EXISTS `lt_user` ON `login_tokens` (`user_id`);
CREATE INDEX IF NOT EXISTS `nt_user_read` ON `notifications` (`user_id`,`read_at`,`created_at`);
CREATE INDEX IF NOT EXISTS `rf_payment` ON `refunds` (`payment_id`);
CREATE INDEX IF NOT EXISTS `rf_org_time` ON `refunds` (`organization_id`,`created_at`);
CREATE INDEX IF NOT EXISTS `so_org_time` ON `service_orders` (`organization_id`,`created_at`);
CREATE INDEX IF NOT EXISTS `so_user` ON `service_orders` (`user_id`);
CREATE INDEX IF NOT EXISTS `svc_org` ON `services` (`organization_id`);
-- Backfill: give existing memberships/invoices the organisation's first location, so the new location filters include them.
UPDATE `memberships` SET `location_id` = (SELECT `id` FROM `locations` WHERE `organization_id` = `memberships`.`organization_id` ORDER BY `created_at` LIMIT 1) WHERE `location_id` IS NULL;
UPDATE `invoices` SET `location_id` = (SELECT `id` FROM `locations` WHERE `organization_id` = `invoices`.`organization_id` ORDER BY `created_at` LIMIT 1) WHERE `location_id` IS NULL;