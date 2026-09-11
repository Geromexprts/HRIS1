-- HRIS Portal — Full Database Schema
-- Run this in Supabase > SQL Editor > New Query

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── Employees ─────────────────────────────────────────────────────────────────
create table employees (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  work_email            text not null unique,
  role                  text not null check (role in ('employee', 'approver', 'admin')),
  status                text not null default 'active' check (status in ('active', 'inactive')),
  employee_code         text,
  employment_type       text default 'full-time',
  employment_start_date date,
  office_location       text,
  monthly_salary        numeric,
  shift_schedule        text,
  payslip_delivery      text default 'email',
  approver_id           uuid references employees(id) on delete set null,
  manager_id            uuid references employees(id) on delete set null,
  created_at            timestamptz not null default now()
);

-- ── PTO Balances ──────────────────────────────────────────────────────────────
create table pto_balances (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null unique references employees(id) on delete cascade,
  current_balance   numeric not null default 0,
  last_accrual_date date,
  accrual_history   jsonb not null default '[]',
  created_at        timestamptz not null default now()
);

-- ── Leave Requests ────────────────────────────────────────────────────────────
create table leave_requests (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references employees(id) on delete cascade,
  approver_id    uuid references employees(id) on delete set null,
  leave_type     text default 'pto',
  start_date     date not null,
  end_date       date not null,
  is_half_day    boolean not null default false,
  days_requested numeric not null,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  reason         text,
  file_url       text,
  approver_note  text,
  reviewed_by    text,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- ── Time Entries ──────────────────────────────────────────────────────────────
create table time_entries (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date        date not null,
  clock_in    timestamptz not null,
  clock_out   timestamptz,
  breaks      jsonb not null default '[]',
  total_hours numeric,
  is_edited   boolean not null default false,
  edit_note   text,
  created_at  timestamptz not null default now(),
  unique (employee_id, date)
);

-- ── Payroll Deductions ────────────────────────────────────────────────────────
create table payroll_deductions (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid not null references employees(id) on delete cascade,
  pay_period_start    date not null,
  pay_period_end      date not null,
  monthly_salary      numeric not null,
  daily_rate          numeric not null,
  leave_days          numeric not null default 0,
  pto_days_used       numeric not null default 0,
  shortfall_days      numeric not null default 0,
  shortfall_deduction numeric not null default 0,
  net_pay             numeric not null,
  created_at          timestamptz not null default now(),
  unique (employee_id, pay_period_start)
);

-- ── Notifications ─────────────────────────────────────────────────────────────
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  title       text not null,
  body        text not null,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── Audit Log ─────────────────────────────────────────────────────────────────
create table audit_log (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  action       text not null,
  details      jsonb,
  performed_at timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index on employees (status);
create index on leave_requests (employee_id);
create index on leave_requests (status);
create index on leave_requests (start_date, end_date);
create index on time_entries (employee_id);
create index on time_entries (date);
create index on notifications (employee_id, is_read);
create index on audit_log (employee_id);
create index on payroll_deductions (employee_id, pay_period_start);
