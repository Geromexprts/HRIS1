-- HRIS migration 2026-10-27
-- Run this in Supabase SQL editor before deploying the updated code.

-- 1. OT requests: add start/end time columns
ALTER TABLE ot_requests
  ADD COLUMN IF NOT EXISTS ot_start_time timestamptz,
  ADD COLUMN IF NOT EXISTS ot_end_time timestamptz;

-- 2. Employees: add hourly_rate and employment_end_date
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS hourly_rate numeric,
  ADD COLUMN IF NOT EXISTS employment_end_date date;

-- 3. Payroll deductions: add incentive/reimbursement columns + extra tracking columns
ALTER TABLE payroll_deductions
  ADD COLUMN IF NOT EXISTS intake_booking_incentive numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS google_review_incentive numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS performance_incentive numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_incentive numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reimbursements numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_ot_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_pto_days numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unpaid_pto_days numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS working_days integer;
