-- ============================================================
-- Amonn — Esquema inicial
-- Tareas del equipo + perfiles + soporte para avisos de WhatsApp
-- ============================================================

-- Enums --------------------------------------------------------
do $$ begin
  create type task_status as enum ('open', 'in_progress', 'done');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_priority as enum ('low', 'medium', 'high');
exception when duplicate_object then null; end $$;

-- Perfiles -----------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  phone        text,               -- formato E.164 para WhatsApp, ej. +34600111222
  avatar_color text not null default '#6366f1',
  created_at   timestamptz not null default now()
);

-- Tareas -------------------------------------------------------
create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  status           task_status not null default 'open',
  priority         task_priority not null default 'medium',
  assignee_id      uuid references public.profiles(id) on delete set null,
  created_by       uuid references public.profiles(id) on delete set null,
  due_date         date,
  completed_at     timestamptz,
  last_reminder_at timestamptz,     -- última vez que WhatsApp avisó de esta tarea
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists tasks_assignee_idx on public.tasks(assignee_id);
create index if not exists tasks_status_idx   on public.tasks(status);
create index if not exists tasks_due_idx      on public.tasks(due_date);

-- updated_at automático ---------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- Crear perfil automáticamente al registrarse ------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Seguridad a nivel de fila (RLS)
-- Modelo: toda persona autenticada de la empresa ve y edita las
-- tareas compartidas. Cada quien solo edita su propio perfil.
-- ============================================================
alter table public.profiles enable row level security;
alter table public.tasks    enable row level security;

-- Perfiles: todos los autenticados pueden leer; cada uno edita el suyo.
drop policy if exists "perfiles_lectura" on public.profiles;
create policy "perfiles_lectura" on public.profiles
  for select to authenticated using (true);

drop policy if exists "perfiles_insertar_propio" on public.profiles;
create policy "perfiles_insertar_propio" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "perfiles_editar_propio" on public.profiles;
create policy "perfiles_editar_propio" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- Tareas: cualquier autenticado puede leer, crear, editar y borrar.
drop policy if exists "tareas_lectura" on public.tasks;
create policy "tareas_lectura" on public.tasks
  for select to authenticated using (true);

drop policy if exists "tareas_insertar" on public.tasks;
create policy "tareas_insertar" on public.tasks
  for insert to authenticated with check (true);

drop policy if exists "tareas_editar" on public.tasks;
create policy "tareas_editar" on public.tasks
  for update to authenticated using (true);

drop policy if exists "tareas_borrar" on public.tasks;
create policy "tareas_borrar" on public.tasks
  for delete to authenticated using (true);

-- Realtime: habilitar difusión de cambios en tareas ------------
do $$ begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null; end $$;
