create table if not exists ot_date_unlocks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  unlocked_by uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (employee_id, date)
);

create index on ot_date_unlocks (employee_id, date);
