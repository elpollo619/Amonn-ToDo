-- ============================================================
-- Amonn — Esquema de la base de datos (Postgres, auto-alojado en el NAS)
-- Aquí viven las tareas abiertas y las personas del equipo.
-- ============================================================

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  password_hash text not null,
  full_name     text,
  phone         text,                       -- E.164 para WhatsApp, ej. +34600111222
  avatar_color  text not null default '#6366f1',
  created_at    timestamptz not null default now()
);

create table if not exists tasks (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  status           text not null default 'open'
                     check (status in ('open', 'in_progress', 'done')),
  priority         text not null default 'medium'
                     check (priority in ('low', 'medium', 'high')),
  assignee_id      uuid references users(id) on delete set null,
  created_by       uuid references users(id) on delete set null,
  due_date         date,
  completed_at     timestamptz,
  last_reminder_at timestamptz,             -- última vez que WhatsApp avisó de esta tarea
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists tasks_assignee_idx on tasks(assignee_id);
create index if not exists tasks_status_idx   on tasks(status);
create index if not exists tasks_due_idx      on tasks(due_date);
