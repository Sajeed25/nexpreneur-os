-- Nexpreneur OS growth pack (credits, waitlist, messaging, pay links, TDS, credit notes, e-invoicing, door access,
-- tours, onboarding, 2FA, refund approvals, reports, marketplace, branding, push).
-- Safe to run more than once. Run it with your database selected in phpMyAdmin (SQL tab), BEFORE deploying the code.

-- Business and per-location profile / branding
ALTER TABLE `organizations` ADD COLUMN IF NOT EXISTS `legal_name` varchar(160);
ALTER TABLE `organizations` ADD COLUMN IF NOT EXISTS `gstin` varchar(20);
ALTER TABLE `organizations` ADD COLUMN IF NOT EXISTS `address` varchar(500);
ALTER TABLE `organizations` ADD COLUMN IF NOT EXISTS `state_code` varchar(2);
ALTER TABLE `organizations` ADD COLUMN IF NOT EXISTS `pincode` varchar(10);
ALTER TABLE `organizations` ADD COLUMN IF NOT EXISTS `phone` varchar(20);
ALTER TABLE `organizations` ADD COLUMN IF NOT EXISTS `email` varchar(190);
ALTER TABLE `organizations` ADD COLUMN IF NOT EXISTS `refund_approval_paise` bigint NOT NULL DEFAULT 1000000;
ALTER TABLE `organizations` ADD COLUMN IF NOT EXISTS `require_2fa_roles` varchar(200) NOT NULL DEFAULT '';
ALTER TABLE `organizations` ADD COLUMN IF NOT EXISTS `onboarding_items` varchar(120) NOT NULL DEFAULT 'kyc,agreement';
ALTER TABLE `organizations` ADD COLUMN IF NOT EXISTS `onboarding_blocks` boolean NOT NULL DEFAULT false;
ALTER TABLE `organizations` ADD COLUMN IF NOT EXISTS `agreement_text` varchar(4000);
ALTER TABLE `locations` ADD COLUMN IF NOT EXISTS `legal_name` varchar(160);
ALTER TABLE `locations` ADD COLUMN IF NOT EXISTS `gstin` varchar(20);
ALTER TABLE `locations` ADD COLUMN IF NOT EXISTS `address` varchar(500);
ALTER TABLE `locations` ADD COLUMN IF NOT EXISTS `phone` varchar(20);
ALTER TABLE `locations` ADD COLUMN IF NOT EXISTS `email` varchar(190);
ALTER TABLE `locations` ADD COLUMN IF NOT EXISTS `logo_image_id` varchar(36);
ALTER TABLE `locations` ADD COLUMN IF NOT EXISTS `brand_color` varchar(9);
ALTER TABLE `locations` ADD COLUMN IF NOT EXISTS `invoice_footer` varchar(500);

-- People: messaging consent, weekly report, 2FA, calendar feed
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `wa_opt_in` boolean NOT NULL DEFAULT false;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `sms_opt_in` boolean NOT NULL DEFAULT false;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `weekly_report` boolean NOT NULL DEFAULT false;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `totp_secret` varchar(200);
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `totp_enabled_at` datetime;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `calendar_token` varchar(40);
CREATE UNIQUE INDEX IF NOT EXISTS `users_cal_token` ON `users` (`calendar_token`);

-- Credits and recurring / waitlisted bookings
ALTER TABLE `memberships` ADD COLUMN IF NOT EXISTS `credits_cycle_start` date;
ALTER TABLE `bookings` ADD COLUMN IF NOT EXISTS `credit_minutes` int NOT NULL DEFAULT 0;
ALTER TABLE `bookings` ADD COLUMN IF NOT EXISTS `credit_passes` int NOT NULL DEFAULT 0;
ALTER TABLE `bookings` ADD COLUMN IF NOT EXISTS `series_id` varchar(36);
CREATE INDEX IF NOT EXISTS `bk_series` ON `bookings` (`series_id`);

CREATE TABLE IF NOT EXISTS `credit_ledger` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`kind` enum('room_min','day_pass') NOT NULL,
	`delta` int NOT NULL,
	`reason` enum('grant','use','refund','expire','adjust') NOT NULL,
	`booking_id` varchar(36),
	`membership_id` varchar(36),
	`note` varchar(200),
	`created_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `credit_ledger_id` PRIMARY KEY(`id`)
);
CREATE INDEX IF NOT EXISTS `cl_user_kind` ON `credit_ledger` (`user_id`,`kind`);
CREATE INDEX IF NOT EXISTS `cl_booking` ON `credit_ledger` (`booking_id`);

CREATE TABLE IF NOT EXISTS `booking_waitlist` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`location_id` varchar(36) NOT NULL,
	`kind` varchar(20) NOT NULL,
	`starts_at` datetime NOT NULL,
	`ends_at` datetime NOT NULL,
	`status` enum('waiting','notified','booked','cancelled','expired') NOT NULL DEFAULT 'waiting',
	`notified_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `booking_waitlist_id` PRIMARY KEY(`id`)
);
CREATE INDEX IF NOT EXISTS `wl_loc_kind` ON `booking_waitlist` (`location_id`,`kind`,`status`);
CREATE INDEX IF NOT EXISTS `wl_user` ON `booking_waitlist` (`user_id`);

-- Messaging (WhatsApp / SMS / web push)
CREATE TABLE IF NOT EXISTS `message_outbox` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`channel` enum('whatsapp','sms','push') NOT NULL,
	`to_addr` varchar(40),
	`title` varchar(160) NOT NULL,
	`body` varchar(500),
	`link` varchar(200),
	`status` enum('queued','sent','failed','skipped') NOT NULL DEFAULT 'queued',
	`attempts` int NOT NULL DEFAULT 0,
	`error` varchar(200),
	`provider_id` varchar(80),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`sent_at` datetime,
	CONSTRAINT `message_outbox_id` PRIMARY KEY(`id`)
);
CREATE INDEX IF NOT EXISTS `ob_status_time` ON `message_outbox` (`status`,`created_at`);
CREATE INDEX IF NOT EXISTS `ob_user` ON `message_outbox` (`user_id`);

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`endpoint` varchar(600) NOT NULL,
	`endpoint_hash` varchar(64) NOT NULL,
	`p256dh` varchar(120) NOT NULL,
	`auth` varchar(60) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `ps_endpoint` UNIQUE(`endpoint_hash`)
);
CREATE INDEX IF NOT EXISTS `ps_user` ON `push_subscriptions` (`user_id`);

-- Billing: pay links, e-invoice, TDS / credit-note settlements, credit notes, autopay
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `pay_link_id` varchar(40);
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `pay_link_url` varchar(300);
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `irn` varchar(64);
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `irn_ack_no` varchar(30);
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `irn_ack_date` datetime;
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `irn_signed_qr` text;
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `irn_status` varchar(12);
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `irn_error` varchar(300);
ALTER TABLE `payments` MODIFY COLUMN `method` enum('cash','upi','bank','card','razorpay','tds','credit_note') NOT NULL;

CREATE TABLE IF NOT EXISTS `credit_notes` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`invoice_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`number` varchar(30) NOT NULL,
	`issue_date` date NOT NULL,
	`subtotal_paise` bigint NOT NULL,
	`cgst_paise` bigint NOT NULL DEFAULT 0,
	`sgst_paise` bigint NOT NULL DEFAULT 0,
	`igst_paise` bigint NOT NULL DEFAULT 0,
	`total_paise` bigint NOT NULL,
	`reason` varchar(255),
	`created_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `credit_notes_id` PRIMARY KEY(`id`),
	CONSTRAINT `cn_org_number` UNIQUE(`organization_id`,`number`)
);
CREATE INDEX IF NOT EXISTS `cn_invoice` ON `credit_notes` (`invoice_id`);

CREATE TABLE IF NOT EXISTS `credit_note_items` (
	`id` varchar(36) NOT NULL,
	`credit_note_id` varchar(36) NOT NULL,
	`description` varchar(255) NOT NULL,
	`hsn_sac` varchar(12) NOT NULL DEFAULT '997212',
	`qty` int NOT NULL DEFAULT 1,
	`unit_paise` bigint NOT NULL,
	`tax_pct` int NOT NULL DEFAULT 18,
	CONSTRAINT `credit_note_items_id` PRIMARY KEY(`id`)
);
CREATE INDEX IF NOT EXISTS `cni_note` ON `credit_note_items` (`credit_note_id`);

CREATE TABLE IF NOT EXISTS `autopay_mandates` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`membership_id` varchar(36) NOT NULL,
	`rzp_plan_id` varchar(40),
	`rzp_subscription_id` varchar(40) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'created',
	`short_url` varchar(300),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `autopay_mandates_id` PRIMARY KEY(`id`),
	CONSTRAINT `am_sub` UNIQUE(`rzp_subscription_id`)
);
CREATE INDEX IF NOT EXISTS `am_membership` ON `autopay_mandates` (`membership_id`);

-- Door access
CREATE TABLE IF NOT EXISTS `doors` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`location_id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`key_hash` varchar(64) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`last_seen_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `doors_id` PRIMARY KEY(`id`),
	CONSTRAINT `door_key` UNIQUE(`key_hash`)
);
CREATE INDEX IF NOT EXISTS `door_org` ON `doors` (`organization_id`);

CREATE TABLE IF NOT EXISTS `access_credentials` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`identifier_hash` varchar(64) NOT NULL,
	`label` varchar(60),
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `access_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `ac_hash` UNIQUE(`organization_id`,`identifier_hash`)
);
CREATE INDEX IF NOT EXISTS `ac_user` ON `access_credentials` (`user_id`);

CREATE TABLE IF NOT EXISTS `access_events` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`door_id` varchar(36) NOT NULL,
	`user_id` varchar(36),
	`credential` varchar(10) NOT NULL,
	`result` enum('allowed','denied') NOT NULL,
	`reason` varchar(80),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `access_events_id` PRIMARY KEY(`id`)
);
CREATE INDEX IF NOT EXISTS `ae_org_time` ON `access_events` (`organization_id`,`created_at`);
CREATE INDEX IF NOT EXISTS `ae_user` ON `access_events` (`user_id`);

-- Tours, onboarding, refund approvals, 2FA recovery, reports
CREATE TABLE IF NOT EXISTS `tours` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`lead_id` varchar(36) NOT NULL,
	`location_id` varchar(36) NOT NULL,
	`starts_at` datetime NOT NULL,
	`status` enum('scheduled','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `tours_id` PRIMARY KEY(`id`)
);
CREATE INDEX IF NOT EXISTS `tour_loc_time` ON `tours` (`location_id`,`starts_at`);
CREATE INDEX IF NOT EXISTS `tour_lead` ON `tours` (`lead_id`);

CREATE TABLE IF NOT EXISTS `member_onboarding` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`item` varchar(20) NOT NULL,
	`status` enum('pending','done','waived') NOT NULL DEFAULT 'pending',
	`note` varchar(255),
	`ref_invoice_id` varchar(36),
	`done_by` varchar(36),
	`done_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `member_onboarding_id` PRIMARY KEY(`id`),
	CONSTRAINT `mo_user_item` UNIQUE(`user_id`,`item`)
);
CREATE INDEX IF NOT EXISTS `mo_ref_invoice` ON `member_onboarding` (`ref_invoice_id`);

CREATE TABLE IF NOT EXISTS `refund_requests` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`payment_id` varchar(36) NOT NULL,
	`invoice_id` varchar(36) NOT NULL,
	`amount_paise` bigint NOT NULL,
	`reason` varchar(255),
	`status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`requested_by` varchar(36) NOT NULL,
	`decided_by` varchar(36),
	`decided_at` datetime,
	`decision_note` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `refund_requests_id` PRIMARY KEY(`id`)
);
CREATE INDEX IF NOT EXISTS `rr_org_status` ON `refund_requests` (`organization_id`,`status`);
CREATE INDEX IF NOT EXISTS `rr_payment` ON `refund_requests` (`payment_id`);

CREATE TABLE IF NOT EXISTS `recovery_codes` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`code_hash` varchar(64) NOT NULL,
	`used_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `recovery_codes_id` PRIMARY KEY(`id`)
);
CREATE INDEX IF NOT EXISTS `rc_user` ON `recovery_codes` (`user_id`);

CREATE TABLE IF NOT EXISTS `report_runs` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`week_start` date NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `report_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `rr_user_week` UNIQUE(`user_id`,`week_start`)
);

-- Member perks and marketplace
CREATE TABLE IF NOT EXISTS `marketplace_listings` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`author_id` varchar(36) NOT NULL,
	`kind` enum('perk','offer','request') NOT NULL,
	`title` varchar(160) NOT NULL,
	`description` varchar(2000),
	`price_text` varchar(80),
	`category` varchar(40),
	`perk_code` varchar(80),
	`link` varchar(300),
	`valid_until` date,
	`image_id` varchar(36),
	`active` boolean NOT NULL DEFAULT true,
	`redeem_count` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` timestamp,
	CONSTRAINT `marketplace_listings_id` PRIMARY KEY(`id`)
);
CREATE INDEX IF NOT EXISTS `ml_org_kind` ON `marketplace_listings` (`organization_id`,`kind`,`created_at`);

CREATE TABLE IF NOT EXISTS `listing_contacts` (
	`id` varchar(36) NOT NULL,
	`listing_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`message` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `listing_contacts_id` PRIMARY KEY(`id`)
);
CREATE INDEX IF NOT EXISTS `lc_listing` ON `listing_contacts` (`listing_id`,`created_at`);

CREATE TABLE IF NOT EXISTS `perk_redemptions` (
	`id` varchar(36) NOT NULL,
	`listing_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `perk_redemptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `pr_listing_user` UNIQUE(`listing_id`,`user_id`)
);
