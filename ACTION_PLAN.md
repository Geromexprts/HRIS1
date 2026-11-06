# HRIS Action Plan

> Combined from meetings with Gerome — Oct 29 & Nov 6, 2026  
> Finalized Nov 7, 2026

---

## Team Time — `/dashboard/admin/time`

| # | Task | Notes |
|---|---|---|
| 1 | **Investigate pay period bug** — Abraham's copy shows Oct 26→Nov 25 correctly; find why Gerome sees wrong period | Likely timezone or caching issue on client's deployment |
| 2 | **Rename "Regular" → "Covered Hrs"** | Header only, no logic change. Already computes correctly: clocked hours capped at 8h/day, PTO excluded, OT beyond 8h excluded |
| 3 | **Add "Expected Days" column** | Working days elapsed from period start to today (current period); full period business days (previous/custom period) |
| 4 | **Add "Expected Hrs to Date" summary tile** | Expected Days × 8h — sits alongside existing Total Hours, OT Hours, Business Days, Avg Attendance tiles |

---

## Site-wide rename

| # | Task | Notes |
|---|---|---|
| 5 | **Rename "Unpaid PTO" → "Unpaid TO" everywhere** | Team Time column, Payroll column, Leave pages, CSV exports — do all in one pass |

---

## Leave Request Form — `/dashboard/leave` (employee-facing)

| # | Task | Notes |
|---|---|---|
| 6 | **Simplify leave types to Paid / Unpaid only** | Change dropdown options for NEW submissions only; already-submitted leaves are unaffected |
| 7 | **Block "Paid" when PTO balance = 0** | Disable/grey out Paid option; employee can only select Unpaid |

---

## Leave Management — `/dashboard/admin/leave` (admin-facing)

| # | Task | Notes |
|---|---|---|
| 8 | **Allow admin to undo/edit approved leave** | Revert to pending or change leave type if approved in error |

---

## PTO — `/dashboard/admin/pto` + leave approval API

| # | Task | Notes |
|---|---|---|
| 9 | **Verify PTO balance deduction logic** | Confirm approved Paid leaves correctly deduct from PTO balance; fix if not |

---

## Payroll — `/dashboard/admin/payroll`

| # | Task | Notes |
|---|---|---|
| 10 | **Update net pay formula** | See formula details below |

### Net Pay Formula

```
hourly_rate     = monthly_salary / 173.33
covered_hours   = sum of min(total_hours, 8) per day from time_entries  ← same logic as "Covered Hrs" in Team Time
expected_hours  = working_days × 8
missing_hours   = max(0, expected_hours - covered_hours - paid_pto_days × 8)

net_pay = monthly_salary
        - (missing_hours × hourly_rate)
        + (approved_ot_hours × hourly_rate)   ← 1× rate, not 1.5×
        + incentives
```

**Rules:**
- Paid PTO offsets missing hours (counts as if the employee worked those days)
- Unpaid TO does NOT offset missing hours (counts as missing)
- OT pay is at 1× hourly rate (not 1.5×)
- Filter (current/previous period) must be respected — same as Team Time

---

## Notifications — `/api/cron/*` + `lib/email.ts` + `notifications` table

| # | Task | Notes |
|---|---|---|
| 11 | **Clock-in reminder** — 8am LA weekdays | Email (CC Gerome) + in-app notification to employees who haven't clocked in yet that day |
| 12 | **Forgotten clock-out reminder** — next morning | Notify employees who have an open entry (clock-in but no clock-out) from the previous day |
| 13 | **Missing time entry alert** — on login | In-app banner if the previous workday has no time entry and no approved leave on file |
| 14 | **Idempotency safeguard** | One notification per employee per type per day — no duplicate sends |
| 15 | **CRON_SECRET protection** | Bearer token header check on all `/api/cron/*` routes |
| 16 | **Schedule on cron-job.org** | America/Los_Angeles timezone — handles DST automatically (not Vercel cron, not Supabase pg_cron) |

---

## Non-code

| # | Task | Who |
|---|---|---|
| 17 | Add `NEXT_PUBLIC_DEV_LOGIN=true` to personal Vercel env vars | Abraham |
| 18 | Transfer Claude project to work account (abraham@xprts.com) | Abraham |

---

## Already confirmed correct / no changes needed

| Item | Status |
|---|---|
| "Days In" column in Team Time | Already exists — count of days with a time entry |
| "Biz Days" column in Team Time | Already exists — total business days in the full period |
| "Covered Hrs" logic (8h cap, PTO excluded) | Already correct in existing "Regular" column — just needs rename (#2) |
| Dev login bypass | Implemented and pushed to `origin` (abraham-crt/xprts-hris) only |
| DB migrations (time_entries, pto_balances, ot_date_unlocks, columns) | Run on Abraham's personal Supabase |

---

*Last updated: Nov 7, 2026*
