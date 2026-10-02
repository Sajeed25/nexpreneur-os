-- Nexpreneur OS — core PostgreSQL schema (Supabase-compatible)
-- Tenant isolation: every tenant table carries organization_id; RLS policies at the bottom.

create extension if not exists "pgcrypto";

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text unique not null, accent_color text default '#5b4df5',
  created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null, city text, address text, timezone text default 'Asia/Kolkata',
  created_at timestamptz default now(), deleted_at timestamptz
);
create index on locations(organization_id);

create table floors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  location_id uuid not null references locations(id), name text not null, level int default 0, plan_json jsonb,
  created_at timestamptz default now()
);
create table zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  floor_id uuid not null references floors(id), name text not null, created_at timestamptz default now()
);
create table resource_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null, kind text not null check (kind in
    ('hot_desk','dedicated_desk','meeting_room','private_office','phone_booth','event_space','other'))
);
create table resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  location_id uuid not null references locations(id),
  floor_id uuid references floors(id), zone_id uuid references zones(id),
  resource_type_id uuid not null references resource_types(id),
  name text not null, capacity int default 1, amenities text[] default '{}',
  hourly_price_paise bigint, daily_price_paise bigint, monthly_price_paise bigint,
  status text not null default 'available' check (status in ('available','reserved','maintenance','unavailable')),
  map_x int, map_y int, map_w int, map_h int,
  created_at timestamptz default now(), deleted_at timestamptz
);
create index on resources(organization_id, location_id);

create table companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null, gstin text, billing_address text, created_at timestamptz default now(), deleted_at timestamptz
);
create table roles (
  id uuid primary key default gen_random_uuid(), key text unique not null, label text not null
);
create table permissions (
  id uuid primary key default gen_random_uuid(), key text unique not null, description text
);
create table access_permissions (
  role_id uuid references roles(id), permission_id uuid references permissions(id),
  primary key (role_id, permission_id)
);
create table staff (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  auth_user_id uuid unique, role_id uuid not null references roles(id),
  location_id uuid references locations(id), name text not null, email text not null,
  created_at timestamptz default now(), deleted_at timestamptz
);
create table members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  location_id uuid not null references locations(id),
  company_id uuid references companies(id), auth_user_id uuid unique,
  name text not null, email text not null, phone text, job_title text,
  emergency_contact jsonb, status text default 'active',
  created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz,
  unique (organization_id, email)
);
create index on members(organization_id, location_id, status);
create table teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  company_id uuid references companies(id), name text not null
);
create table membership_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null, price_paise bigint not null, billing_cycle text default 'monthly',
  included_days int, booking_credits int, access_hours jsonb, benefits text[], discount_pct numeric,
  renewal_rules jsonb, location_ids uuid[], resource_type_ids uuid[], active boolean default true,
  created_at timestamptz default now(), deleted_at timestamptz
);
create table memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  member_id uuid not null references members(id), plan_id uuid not null references membership_plans(id),
  start_date date not null, renewal_date date, status text default 'active',
  created_at timestamptz default now()
);
create index on memberships(organization_id, renewal_date);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  location_id uuid not null references locations(id),
  member_id uuid references members(id),
  starts_at timestamptz not null, ends_at timestamptz not null check (ends_at > starts_at),
  status text not null default 'pending' check (status in ('confirmed','pending','cancelled','completed','no_show')),
  total_paise bigint default 0, created_at timestamptz default now()
);
create index on bookings(organization_id, location_id, starts_at);
create table booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  resource_id uuid not null references resources(id), price_paise bigint default 0,
  period tstzrange not null,
  -- prevents double-booking a resource
  exclude using gist (resource_id with =, period with &&)
);
-- (requires: create extension btree_gist;)

create table products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null, price_paise bigint not null, tax_pct numeric default 18
);
create table services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  location_id uuid references locations(id), name text not null, description text,
  price_paise bigint not null, tax_pct numeric default 18, image_url text, available boolean default true,
  created_at timestamptz default now(), deleted_at timestamptz
);
create table invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  member_id uuid references members(id), company_id uuid references companies(id),
  number text not null, issue_date date not null, due_date date,
  subtotal_paise bigint not null, cgst_paise bigint default 0, sgst_paise bigint default 0, igst_paise bigint default 0,
  total_paise bigint not null, status text default 'unpaid', gstin text, place_of_supply text,
  created_at timestamptz default now(), unique (organization_id, number)
);
create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description text not null, hsn_sac text default '997212', qty numeric default 1,
  unit_paise bigint not null, tax_pct numeric default 18
);
create table payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  invoice_id uuid references invoices(id), amount_paise bigint not null,
  method text, razorpay_order_id text, razorpay_payment_id text unique,
  status text default 'created', refunded_paise bigint default 0, created_at timestamptz default now()
);
create table visitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id), location_id uuid references locations(id),
  name text not null, phone text, host_member_id uuid references members(id),
  checked_in_at timestamptz, checked_out_at timestamptz
);
create table visitor_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  visitor_id uuid references visitors(id), host_member_id uuid not null references members(id),
  visit_at timestamptz not null, purpose text, qr_token text unique not null default encode(gen_random_bytes(16),'hex'),
  status text default 'invited'
);
create table events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id), location_id uuid references locations(id),
  title text not null, description text, starts_at timestamptz, ends_at timestamptz,
  capacity int, price_paise bigint default 0, organizer text, image_url text,
  published boolean default false, created_at timestamptz default now(), deleted_at timestamptz
);
create table event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id), member_id uuid not null references members(id),
  payment_id uuid references payments(id), status text default 'registered', unique (event_id, member_id)
);
create table leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id), location_id uuid references locations(id),
  name text not null, company text, phone text, email text, requirements text,
  interested_plan_id uuid references membership_plans(id), expected_value_paise bigint,
  stage text default 'new' check (stage in ('new','contacted','tour_scheduled','proposal_sent','negotiation','won','lost')),
  created_at timestamptz default now(), deleted_at timestamptz
);
create table crm_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id), kind text, note text, due_at timestamptz, created_by uuid,
  created_at timestamptz default now()
);
create table community_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id), author_member_id uuid references members(id),
  kind text default 'update', body text not null, created_at timestamptz default now(), deleted_at timestamptz
);
create table comments (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references community_posts(id),
  author_member_id uuid references members(id), body text not null, created_at timestamptz default now()
);
create table likes (
  post_id uuid references community_posts(id), member_id uuid references members(id),
  primary key (post_id, member_id)
);
create table messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  from_member_id uuid references members(id), to_member_id uuid references members(id),
  body text not null, created_at timestamptz default now()
);
create table notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id), user_id uuid not null,
  kind text not null, title text not null, body text, read_at timestamptz, created_at timestamptz default now()
);
create index on notifications(user_id, read_at);
create table access_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id), location_id uuid references locations(id),
  member_id uuid references members(id), door text, granted boolean, at timestamptz default now()
);
create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id), member_id uuid references members(id),
  subject text not null, body text, status text default 'open', created_at timestamptz default now()
);
create table documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id), member_id uuid references members(id),
  name text not null, storage_path text not null, created_at timestamptz default now(), deleted_at timestamptz
);
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id), actor_id uuid,
  action text not null, entity text, entity_id uuid, diff jsonb, ip inet, created_at timestamptz default now()
);
create index on audit_logs(organization_id, created_at desc);

-- ---------- Tenant isolation (RLS) ----------
-- JWT carries org_id as a custom claim (set via Supabase auth hook).
create or replace function auth_org() returns uuid language sql stable as
$$ select nullif(auth.jwt() ->> 'org_id','')::uuid $$;

do $$
declare t text;
begin
  for t in select table_name from information_schema.columns
           where table_schema='public' and column_name='organization_id'
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_isolation on %I using (organization_id = auth_org()) with check (organization_id = auth_org())', t);
  end loop;
end $$;
