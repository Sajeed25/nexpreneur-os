CREATE TABLE IF NOT EXISTS `invoice_items` (
	`id` varchar(36) NOT NULL,
	`invoice_id` varchar(36) NOT NULL,
	`description` varchar(255) NOT NULL,
	`hsn_sac` varchar(12) NOT NULL DEFAULT '997212',
	`qty` int NOT NULL DEFAULT 1,
	`unit_paise` bigint NOT NULL,
	`tax_pct` int NOT NULL DEFAULT 18,
	CONSTRAINT `invoice_items_id` PRIMARY KEY(`id`)
);
CREATE TABLE IF NOT EXISTS `invoices` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`number` varchar(30) NOT NULL,
	`issue_date` date NOT NULL,
	`due_date` date NOT NULL,
	`subtotal_paise` bigint NOT NULL,
	`cgst_paise` bigint NOT NULL DEFAULT 0,
	`sgst_paise` bigint NOT NULL DEFAULT 0,
	`igst_paise` bigint NOT NULL DEFAULT 0,
	`total_paise` bigint NOT NULL,
	`paid_paise` bigint NOT NULL DEFAULT 0,
	`status` enum('unpaid','partial','paid','void') NOT NULL DEFAULT 'unpaid',
	`place_of_supply` varchar(60) NOT NULL DEFAULT 'Telangana',
	`buyer_gstin` varchar(20),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `inv_org_number` UNIQUE(`organization_id`,`number`)
);
CREATE TABLE IF NOT EXISTS `memberships` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`plan_id` varchar(36) NOT NULL,
	`start_date` date NOT NULL,
	`renewal_date` date NOT NULL,
	`status` enum('active','paused','cancelled','expired') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `memberships_id` PRIMARY KEY(`id`)
);
CREATE TABLE IF NOT EXISTS `payments` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`invoice_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`amount_paise` bigint NOT NULL,
	`method` enum('cash','upi','bank','card','razorpay') NOT NULL,
	`status` enum('captured','failed','refunded') NOT NULL DEFAULT 'captured',
	`razorpay_order_id` varchar(40),
	`razorpay_payment_id` varchar(40),
	`note` varchar(255),
	`recorded_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `pay_rzp` UNIQUE(`razorpay_payment_id`)
);
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_invoice_id_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_plan_id_membership_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `membership_plans`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `payments` ADD CONSTRAINT `payments_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `payments` ADD CONSTRAINT `payments_invoice_id_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE no action ON UPDATE no action;
ALTER TABLE `payments` ADD CONSTRAINT `payments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
CREATE INDEX `ii_invoice` ON `invoice_items` (`invoice_id`);
CREATE INDEX `inv_user` ON `invoices` (`user_id`);
CREATE INDEX `inv_org_due` ON `invoices` (`organization_id`,`due_date`);
CREATE INDEX `ms_org_renewal` ON `memberships` (`organization_id`,`renewal_date`);
CREATE INDEX `ms_user` ON `memberships` (`user_id`);
CREATE INDEX `pay_org_time` ON `payments` (`organization_id`,`created_at`);
CREATE INDEX `pay_invoice` ON `payments` (`invoice_id`);