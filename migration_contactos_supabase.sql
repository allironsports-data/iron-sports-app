-- ══════════════════════════════════════════════════════════════════════
--  CONTACTOS → SUPABASE
--
--  Hasta ahora la agenda vivía en public/contactos.json + localStorage de
--  cada navegador: nadie compartía nada. Esto crea las dos tablas:
--
--    public.contactos            la agenda compartida (los 3.065 de base +
--                                los añadidos a mano). Se conservan los ids
--                                del JSON para no romper favoritos.
--    public.contactos_favoritos  favoritos POR USUARIO.
--
--  Reejecutable: cada paso comprueba antes de crear. Ejecútalo en
--  Supabase → SQL Editor → New Query. Los datos NO los sube este script:
--  los sube la app con el botón «Importar ahora» (solo admin).
--
--  Reglas de acceso (mismo patrón que el resto de tablas):
--   · leer y escribir: cualquier cuenta autenticada y ACTIVA
--     (candado `cuenta_activa`, igual que en seguridad_2_cierre.sql).
--   · las cuentas «solo Captación» no ven la agenda (tiene teléfonos).
--   · borrar de verdad: solo admin. La app nunca borra: marca deleted.
--   · freno de borrado masivo (> 25 filas) para no-admin.
--   · favoritos: cada uno solo ve y toca los suyos.
-- ══════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 1 · TABLAS
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.contactos (
  id          text primary key,             -- id del JSON o 'custom_<uuid>'
  name        text,
  team        text,
  region      text not null default 'Sin clasificar',
  role        text,
  phone1      text,
  phone2      text,
  tier        text,
  no_contact  boolean not null default false,   -- club sin persona asignada
  no_club     boolean not null default false,   -- persona sin club
  origen      text not null default 'manual'
                check (origen in ('base', 'manual')),
  deleted     boolean not null default false,   -- borrado lógico
  created_by  uuid references public.profiles on delete set null default auth.uid(),
  updated_by  uuid references public.profiles on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists contactos_region_idx  on public.contactos (region);
create index if not exists contactos_deleted_idx on public.contactos (deleted);

create table if not exists public.contactos_favoritos (
  user_id     uuid not null references public.profiles on delete cascade,
  contacto_id text not null references public.contactos on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, contacto_id)
);

alter table public.contactos           enable row level security;
alter table public.contactos_favoritos enable row level security;


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 2 · TRIGGER updated_at / updated_by
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.contactos_set_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  -- Desde el editor SQL auth.uid() es nulo: se conserva el que hubiera.
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end
$$;

drop trigger if exists trg_contactos_set_updated on public.contactos;
create trigger trg_contactos_set_updated
  before insert or update on public.contactos
  for each row execute function public.contactos_set_updated();


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 3 · RLS de contactos
-- ══════════════════════════════════════════════════════════════════════

drop policy if exists "Autenticados leen contactos"       on public.contactos;
drop policy if exists "Autenticados crean contactos"      on public.contactos;
drop policy if exists "Autenticados actualizan contactos" on public.contactos;
drop policy if exists "Solo admin borra contactos"        on public.contactos;

create policy "Autenticados leen contactos"
  on public.contactos for select using (auth.role() = 'authenticated');
create policy "Autenticados crean contactos"
  on public.contactos for insert with check (auth.role() = 'authenticated');
create policy "Autenticados actualizan contactos"
  on public.contactos for update using (auth.role() = 'authenticated');
create policy "Solo admin borra contactos"
  on public.contactos for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );

-- 3b. Candados RESTRICTIVOS del proyecto (se suman con Y). Solo si las
--     funciones existen (las crean seguridad_2_cierre.sql y
--     rls_captacion_only.sql); si no, se avisa y se sigue.
do $candados$
declare t text;
begin
  foreach t in array array['contactos', 'contactos_favoritos'] loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'es_cuenta_activa') then
      execute format('drop policy if exists %I on public.%I', 'cuenta_activa', t);
      execute format($p$
        create policy %I on public.%I
          as restrictive for all to public
          using       (public.es_cuenta_activa())
          with check  (public.es_cuenta_activa())
      $p$, 'cuenta_activa', t);
    else
      raise notice 'es_cuenta_activa() no existe: ejecuta antes seguridad_2_cierre.sql y repite este script';
    end if;

    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'es_captacion_only') then
      execute format('drop policy if exists %I on public.%I', 'captacion_only_fuera', t);
      execute format($p$
        create policy %I on public.%I
          as restrictive for all to authenticated
          using       (not public.es_captacion_only())
          with check  (not public.es_captacion_only())
      $p$, 'captacion_only_fuera', t);
    else
      raise notice 'es_captacion_only() no existe: ejecuta antes rls_captacion_only.sql y repite este script';
    end if;
  end loop;
end
$candados$;

-- 3c. Freno de borrado masivo (misma función que el resto de tablas).
do $freno$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'freno_borrado_masivo') then
    drop trigger if exists trg_freno_borrado on public.contactos;
    create trigger trg_freno_borrado
      after delete on public.contactos
      referencing old table as filas_borradas
      for each statement execute function public.freno_borrado_masivo();
  else
    raise notice 'freno_borrado_masivo() no existe: ejecuta antes seguridad_2_cierre.sql y repite este script';
  end if;
end
$freno$;


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 4 · RLS de favoritos: solo el propio usuario
-- ══════════════════════════════════════════════════════════════════════

drop policy if exists "Usuario gestiona sus favoritos" on public.contactos_favoritos;
create policy "Usuario gestiona sus favoritos"
  on public.contactos_favoritos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 5 · REALTIME (la app escucha cambios en `contactos`)
-- ══════════════════════════════════════════════════════════════════════

do $realtime$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No existe la publicación supabase_realtime: la app funcionará sin sincronización en vivo';
    return;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contactos'
  ) then
    alter publication supabase_realtime add table public.contactos;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contactos_favoritos'
  ) then
    alter publication supabase_realtime add table public.contactos_favoritos;
  end if;
end
$realtime$;


-- ══════════════════════════════════════════════════════════════════════
--  COMPROBACIÓN (lo único que verás en pantalla)
-- ══════════════════════════════════════════════════════════════════════

select bloque, detalle from (

  select 1 as orden, '1 · FILAS' as bloque,
         ('contactos: ' || (select count(*) from public.contactos)::text ||
          ' · favoritos: ' || (select count(*) from public.contactos_favoritos)::text)::text as detalle

  union all

  select 2, '2 · POLÍTICAS',
         (tablename || ' · ' || policyname || ' · ' || permissive)::text
  from pg_policies
  where schemaname = 'public' and tablename in ('contactos', 'contactos_favoritos')

  union all

  select 3, '3 · TRIGGERS',
         (c.relname || ' · ' || g.tgname)::text
  from pg_trigger g join pg_class c on c.oid = g.tgrelid
  where c.relname = 'contactos' and not g.tgisinternal

  union all

  select 4, '4 · REALTIME',
         tablename::text
  from pg_publication_tables
  where pubname = 'supabase_realtime' and tablename in ('contactos', 'contactos_favoritos')

) t
order by orden, detalle;


-- ══════════════════════════════════════════════════════════════════════
--  SI ALGO SE ROMPE — cómo deshacerlo
--    drop table if exists public.contactos_favoritos;
--    drop table if exists public.contactos;
--    drop function if exists public.contactos_set_updated();
--  (la app vuelve sola al modo «solo en este dispositivo»)
-- ══════════════════════════════════════════════════════════════════════
