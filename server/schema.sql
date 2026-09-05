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

-- ─── Plazos de inicio a fin (paso 1 del rediseño) ─────────────────────
-- due_date pasa a significar la fecha de FIN. start_date es cuándo empieza
-- (si está vacío, la tarea es de un solo día: el de due_date).
-- work_days son los días de trabajo que lleva, que es como se mide la carga
-- del equipo: siete tareas de media hora no son siete de dos días.
alter table tasks add column if not exists start_date date;
alter table tasks add column if not exists work_days  numeric(4,1);
create index if not exists tasks_start_idx on tasks(start_date);

-- ─── Estados propios del taller (paso 2 del rediseño) ─────────────────
-- Cada equipo define sus estados ("Esperando material", "Pendiente de
-- cliente", "Por facturar") en vez de conformarse con tres.
--
-- `kind` es la CLASE del estado y es lo que mantiene compatible todo lo que
-- ya existía: el asistente de WhatsApp, los recordatorios y las consultas
-- siguen preguntando por tasks.status ('open' | 'in_progress' | 'done'), y el
-- servidor lo mantiene sincronizado con el estado elegido. Así no hay dos
-- fuentes de verdad ni hubo que reescribir media aplicación.
create table if not exists task_states (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null check (kind in ('open', 'in_progress', 'done')),
  color      text not null default 'slate',
  position   integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists task_states_name_idx on task_states (lower(name));

alter table tasks add column if not exists state_id uuid references task_states(id) on delete set null;
create index if not exists tasks_state_idx on tasks(state_id);

-- Los tres de siempre, para que nada empiece vacío. is_default marca a cuál
-- van las tareas si se borra un estado de esa misma clase.
insert into task_states (name, kind, color, position, is_default)
  select * from (values
    ('Abierta',   'open',        'slate', 0, true),
    ('En curso',  'in_progress', 'blue',  1, true),
    ('Hecha',     'done',        'green', 2, true)
  ) as v(name, kind, color, position, is_default)
  where not exists (select 1 from task_states);

-- Las tareas que ya existían se enganchan al estado por defecto de su clase.
update tasks t
   set state_id = s.id
  from task_states s
 where t.state_id is null and s.is_default and s.kind = t.status;

-- ─── Subtareas / pasos (paso 3 del rediseño) ──────────────────────────
-- Una tarea grande ("Reforma piso 2") tiene pasos dentro ("medir ventanas",
-- "pedir material"). Los pasos NO son tareas: no se asignan, no tienen plazo
-- ni avisos. Son una lista de comprobación dentro de la tarea, y su valor
-- está en el avance del conjunto (2 de 5).
create table if not exists subtasks (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  title      text not null,
  done       boolean not null default false,
  position   integer not null default 0,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists subtasks_task_idx on subtasks(task_id, position);

-- ─── Comentarios y adjuntos (paso 5 del rediseño) ─────────────────────
create table if not exists comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  user_id    uuid references users(id) on delete set null,
  body       text not null,
  -- De dónde vino: 'app' o 'whatsapp'. Sirve para enseñarlo y para auditar.
  source     text not null default 'app',
  created_at timestamptz not null default now()
);
create index if not exists comments_task_idx on comments(task_id, created_at);

-- Ficheros adjuntos. `path` es RELATIVO al directorio de subidas
-- (UPLOAD_DIR), nunca absoluto: así mover el almacén no invalida la tabla.
create table if not exists attachments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  comment_id uuid references comments(id) on delete cascade,
  filename   text not null,
  mime       text not null,
  bytes      integer not null,
  path       text not null,
  user_id    uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists attachments_task_idx on attachments(task_id, created_at);

-- Lista de la compra de la oficina: compartida, no una por persona.
create table if not exists shopping_items (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  requested_by uuid references users(id) on delete set null,
  bought_by    uuid references users(id) on delete set null,
  bought_at    timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists shopping_items_pendientes on shopping_items (bought_at, created_at);

-- Citas (Termine): tienen HORA, a diferencia de las tareas, que tienen plazo.
create table if not exists appointments (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  with_whom   text,                      -- cliente, empresa o persona
  place       text,
  starts_at   timestamptz not null,
  minutes     integer not null default 60,
  notes       text,
  created_by  uuid references users(id) on delete set null,
  attendee_id uuid references users(id) on delete set null,
  source      text not null default 'app',
  reminded_at timestamptz,               -- cuándo se avisó de que se acerca
  created_at  timestamptz not null default now()
);
create index if not exists appointments_por_fecha on appointments (starts_at);
-- Migración: la columna del recordatorio llegó después de crear la tabla.
alter table appointments add column if not exists reminded_at timestamptz;

-- Cajón de estado pequeño de la app (último Referenzzinssatz visto, etc.).
create table if not exists app_state (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Mensajes de huéspedes ya espejados (Beds24). Como seen_mails: se recuerda
-- el id para no reenviar dos veces; nada se marca ni se toca en el origen.
create table if not exists seen_guest_messages (
  id          text primary key,
  created_at  timestamptz not null default now()
);

-- Lecturas de contadores: «luz 204: 4521». El tipo se guarda en alemán
-- (strom, wasser, gas, heizung) diga como se diga, para que la serie de un
-- contador no se parta entre idiomas.
create table if not exists meter_readings (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,             -- strom | wasser | gas | heizung | zahler
  unit        text not null,             -- habitación o edificio: 204, A14...
  value       numeric not null,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists meter_readings_serie on meter_readings (kind, unit, created_at desc);

-- Ausencias del equipo: vacaciones, bajas, permisos. Mientras duran, la
-- persona no recibe el aviso diario y al asignarle tareas se advierte.
create table if not exists absences (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  starts_on   date not null,
  ends_on     date not null,
  reason      text,                      -- vacaciones | baja | permiso...
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists absences_por_fecha on absences (user_id, starts_on, ends_on);

-- Contactos de obra: quién es quién en cada proyecto (de la Adressliste).
create table if not exists contacts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  company     text,
  role        text,                      -- Arbeitsgattung: gipser, holzbau...
  bkp         text,                      -- código de partida suizo
  project     text,                      -- G60 Muri, 770 Bremgarten...
  phone       text,
  mobile      text,
  email       text,
  address     text,
  -- Estado de la oferta: adjudicado, oferta recibida, sin respuesta... Es el
  -- seguimiento de licitación que hoy vive en la Kontaktliste.
  status      text,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists contacts_busqueda on contacts (lower(name));
create index if not exists contacts_empresa on contacts (lower(company));

-- Migración: en bases donde la tabla ya existía, `create table if not exists`
-- no añade columnas nuevas. Hay que pedirlas explícitamente.
alter table contacts add column if not exists status text;
alter table contacts add column if not exists notes text;
create index if not exists contacts_status on contacts (lower(coalesce(status,'')));

-- Spesen: gastos adelantados que hay que devolver a quien los pagó.
-- Una fila aquí = una fila en el Excel de Spesen.
create table if not exists expenses (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,              -- HAAG · A14 · B22 · A4 · CR · SWE
  spent_on      date not null,
  merchant      text,                       -- Coop, Migros, Bauhaus...
  concept       text not null,              -- lo que va en Bemerkung
  amount_cents  integer not null,
  vat           text,                       -- '2.6' | '8.1' | null
  category      text not null,              -- clave del catálogo
  account       text,                       -- cuenta contable de esa columna
  person_id     uuid references users(id) on delete set null,  -- a quién se le debe
  receipt_path  text,                       -- fichero guardado en uploads
  receipt_name  text,                       -- nombre según la convención de la casa
  status        text not null default 'open',   -- open | exported | reimbursed
  created_at    timestamptz not null default now()
);
create index if not exists expenses_abiertos on expenses (status, spent_on);
create index if not exists expenses_persona on expenses (person_id, status);

-- Cierres de mes del Spesen. El CSV vive en la base, no en un fichero: así
-- el enlace de descarga sigue funcionando aunque Watchtower recree el
-- contenedor o UPLOAD_DIR no esté definido.
create table if not exists expense_exports (
  id           uuid primary key default gen_random_uuid(),
  month        text not null,               -- '2026-08'
  token        text not null unique,        -- va en la URL de descarga
  csv          text not null,
  gastos       integer not null,
  total_cents  integer not null,
  created_at   timestamptz not null default now()
);

-- Correos ya procesados por el vigilante. Se recuerdan aquí para no tocar el
-- buzón de nadie: nada se marca como leído ni se mueve de sitio.
create table if not exists seen_mails (
  message_id  text primary key,
  kind        text,
  task_id     uuid references tasks(id) on delete set null,
  seen_at     timestamptz not null default now()
);
alter table seen_mails add column if not exists subject_key text;
create index if not exists seen_mails_asunto on seen_mails (subject_key, seen_at);
