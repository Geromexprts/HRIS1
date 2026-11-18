create table if not exists day_tag_overrides (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  tag text not null check (tag in ('off', 'paid_leave', 'unpaid_leave', 'missing')),
  overridden_by uuid references employees(id),
  created_at timestamptz not null default now(),
  unique (employee_id, date)
);

alter table day_tag_overrides enable row level security;

create policy "admin full access" on day_tag_overrides
  using (exists (select 1 from employees where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from employees where id = auth.uid() and role = 'admin'));
