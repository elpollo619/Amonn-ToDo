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

-- ─── Preferencias de avisos (añadidas después; idempotente) ───────────
alter table users add column if not exists notify_whatsapp boolean not null default true;
alter table users add column if not exists notify_email    boolean not null default true;
-- Desde dónde se creó la tarea: 'app' o 'whatsapp' (asistente).
alter table tasks add column if not exists source text not null default 'app';

-- Idioma del asistente por persona: 'es' | 'de' | 'pt'. Se rellena solo al
-- detectarlo en el primer mensaje largo, y se puede cambiar a mano.
alter table users add column if not exists language text not null default 'es';

-- Conversación a medias con el asistente de WhatsApp. Guarda la tarea que se
-- está construyendo mientras se pregunta lo que falta (¿para quién?,
-- ¿para cuándo?). Una fila por teléfono; caduca sola a los 10 minutos.
create table if not exists wa_conversations (
  phone      text primary key,
  user_id    uuid references users(id) on delete cascade,
  pending    jsonb not null,
  updated_at timestamptz not null default now()
);

-- ¿El idioma se sigue detectando solo? Pasa a false en cuanto alguien lo
-- elige a mano ("habla en alemán"), para no volver a pisárselo.
alter table users add column if not exists language_auto boolean not null default true;

-- Vocabulario del equipo: cómo llama la gente a las personas y a las tareas.
--  kind='person' → phrase apunta a un usuario ("jasmi" → Jasmina)
--  kind='task'   → phrase apunta a unas palabras clave ("la caldera" →
--                  "caldera revision"), no a una tarea concreta: las tareas se
--                  completan y se repiten, las palabras duran.
-- Se llena solo cuando alguien corrige al asistente, y a mano ("jasmi es Jasmina").
create table if not exists aliases (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('person', 'task')),
  phrase       text not null,
  user_id      uuid references users(id) on delete cascade,
  keywords     text,
  created_by   uuid references users(id) on delete set null,
  hits         integer not null default 0,
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (kind, phrase)
);
create index if not exists aliases_kind_phrase_idx on aliases (kind, phrase);
