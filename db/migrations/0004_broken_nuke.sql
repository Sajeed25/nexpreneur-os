CREATE TABLE `community_comments` (
	`id` varchar(36) NOT NULL,
	`post_id` varchar(36) NOT NULL,
	`author_id` varchar(36) NOT NULL,
	`body` varchar(1000) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `community_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `community_likes` (
	`id` varchar(36) NOT NULL,
	`post_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	CONSTRAINT `community_likes_id` PRIMARY KEY(`id`),
	CONSTRAINT `cl_post_user` UNIQUE(`post_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `community_posts` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`author_id` varchar(36) NOT NULL,
	`kind` enum('update','opportunity','job','question','announcement') NOT NULL DEFAULT 'update',
	`body` varchar(2000) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`deleted_at` timestamp,
	CONSTRAINT `community_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `event_registrations` (
	`id` varchar(36) NOT NULL,
	`event_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`invoice_id` varchar(36),
	`status` enum('registered','cancelled') NOT NULL DEFAULT 'registered',
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `event_registrations_id` PRIMARY KEY(`id`),
	CONSTRAINT `er_event_user` UNIQUE(`event_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `events` (
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
--> statement-breakpoint
CREATE TABLE `lead_activities` (
	`id` varchar(36) NOT NULL,
	`organization_id` varchar(36) NOT NULL,
	`lead_id` varchar(36) NOT NULL,
	`kind` enum('note','call','stage') NOT NULL DEFAULT 'note',
	`note` varchar(1000) NOT NULL,
	`created_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `lead_activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
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
--> statement-breakpoint
CREATE TABLE `visitor_invites` (
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
--> statement-breakpoint
ALTER TABLE `community_comments` ADD CONSTRAINT `community_comments_post_id_community_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `community_posts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_comments` ADD CONSTRAINT `community_comments_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_likes` ADD CONSTRAINT `community_likes_post_id_community_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `community_posts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_likes` ADD CONSTRAINT `community_likes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_posts` ADD CONSTRAINT `community_posts_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_posts` ADD CONSTRAINT `community_posts_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_registrations` ADD CONSTRAINT `event_registrations_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_registrations` ADD CONSTRAINT `event_registrations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `events` ADD CONSTRAINT `events_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lead_activities` ADD CONSTRAINT `lead_activities_lead_id_leads_id_fk` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leads` ADD CONSTRAINT `leads_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `visitor_invites` ADD CONSTRAINT `visitor_invites_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `visitor_invites` ADD CONSTRAINT `visitor_invites_host_user_id_users_id_fk` FOREIGN KEY (`host_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `cc_post` ON `community_comments` (`post_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `cp_org_time` ON `community_posts` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ev_org_start` ON `events` (`organization_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `la_lead` ON `lead_activities` (`lead_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `lead_org_stage` ON `leads` (`organization_id`,`stage`);--> statement-breakpoint
CREATE INDEX `vi_org_date` ON `visitor_invites` (`organization_id`,`visit_date`);--> statement-breakpoint
CREATE INDEX `vi_host` ON `visitor_invites` (`host_user_id`);