-- ══════════════════════════════════════════════════════════════════════
-- OFRECIMIENTOS — jugadores que nos ofrece alguien de fuera
--
-- Un agente, un intermediario, un club, la familia o Boulema nos ofrecen
-- un jugador. Antes solo existía para Boulema (tabla boulema_peticiones:
-- ficha ligera + a quién se le pide informe). Esto lo generaliza:
--
--   · quién lo ofrece (origen + nombre + contacto)
--   · condiciones pedidas (operación, coste, salario, comisión, fecha límite)
--   · responsable en AIS
--   · cadena de informes POR NIVELES: en cada nivel se pide a una o varias
--     personas un tipo de informe (técnico, entorno, mercado, personalidad)
--     y cada una contesta con un veredicto (ok / no / más vídeo)
--   · historial de contactos con quien lo ofrece (como en Firmar)
--   · estado: abierto → decidir → aceptado / descartado
--
-- Los niveles y los contactos van en jsonb, igual que captacion_firmas
-- guarda sus comments: se leen y escriben siempre enteros desde la ficha.
--
-- Al final MIGRA las peticiones de Boulema que ya existen (origen Boulema,
-- un solo nivel técnico, los informes ya enlazados cuentan como OK) y deja
-- boulema_peticiones tal cual, por si hay que volver atrás. La app ya no
-- la lee.
--
-- Ejecutar en el SQL Editor de Supabase. Es idempotente: se puede repetir
-- (la migración de Boulema no duplica: salta las ya migradas).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.ofrecimientos (
  id                 uuid primary key default gen_random_uuid(),

  -- jugador (ficha ligera; si existe en Captación, scouting_player_id)
  player_name        text not null,
  position           text,
  birth_year         text,
  birth_month        text,
  team               text,
  country            text,
  nationality        text,
  scouting_player_id uuid references public.scouting_players(id) on delete set null,

  -- quién lo ofrece
  origen             text not null default 'otro'
                     check (origen in ('boulema', 'agente', 'intermediario', 'club', 'familia', 'otro')),
  ofrece_nombre      text,
  ofrece_contacto    text,

  -- condiciones pedidas
  cond_operacion     text check (cond_operacion in ('libre', 'cesion', 'traspaso', 'representacion')),
  cond_coste         text,
  cond_salario       text,
  cond_comision      text,
  cond_fin_contrato  text,
  fecha_limite       date,
  notes              text,

  -- quién lo lleva y en qué punto está
  responsable        text,                 -- profiles.avatar ("PP", "NB"…)
  estado             text not null default 'abierto'
                     check (estado in ('abierto', 'decidir', 'aceptado', 'descartado')),
  decidido_por       text,                 -- avatar
  decidido_at        timestamptz,
  decision_nota      text,

  -- cadena de informes y contactos (ver src/types.ts: OfrecimientoNivel, FirmasComment)
  niveles            jsonb not null default '[]'::jsonb,
  contactos          jsonb not null default '[]'::jsonb,

  -- rastro de la migración desde boulema_peticiones (para no duplicar)
  boulema_peticion_id uuid,

  created_by         text,                 -- avatar
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists ofrecimientos_estado_idx on public.ofrecimientos (estado);
create index if not exists ofrecimientos_scouting_player_idx on public.ofrecimientos (scouting_player_id);
create unique index if not exists ofrecimientos_boulema_peticion_idx
  on public.ofrecimientos (boulema_peticion_id) where boulema_peticion_id is not null;

-- updated_at automático (misma función que el resto de tablas)
drop trigger if exists trg_ofrecimientos_updated_at on public.ofrecimientos;
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    create trigger trg_ofrecimientos_updated_at
      before update on public.ofrecimientos
      for each row execute function public.set_updated_at();
  end if;
end
$$;

-- Freno de borrado masivo (seguridad_2_cierre.sql), si está instalado
drop trigger if exists trg_freno_borrado on public.ofrecimientos;
do $$
begin
  if exists (select 1 from pg_proc where proname = 'freno_borrado_masivo') then
    create trigger trg_freno_borrado
      after delete on public.ofrecimientos
      referencing old table as filas_borradas
      for each statement execute function public.freno_borrado_masivo();
  end if;
end
$$;

-- ── Permisos ──
alter table public.ofrecimientos enable row level security;

drop policy if exists ofrecimientos_select on public.ofrecimientos;
create policy ofrecimientos_select on public.ofrecimientos
  for select to authenticated using ((select public.es_cuenta_activa()));

drop policy if exists ofrecimientos_insert on public.ofrecimientos;
create policy ofrecimientos_insert on public.ofrecimientos
  for insert to authenticated with check ((select public.es_cuenta_activa()));

drop policy if exists ofrecimientos_update on public.ofrecimientos;
create policy ofrecimientos_update on public.ofrecimientos
  for update to authenticated using ((select public.es_cuenta_activa()));

drop policy if exists ofrecimientos_delete on public.ofrecimientos;
create policy ofrecimientos_delete on public.ofrecimientos
  for delete to authenticated using ((select public.es_cuenta_activa()));

-- Las cuentas «solo Captación» no ven esto (lleva condiciones económicas),
-- igual que no veían boulema_peticiones (rls_captacion_only.sql)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'es_captacion_only') then
    drop policy if exists captacion_only_fuera on public.ofrecimientos;
    create policy captacion_only_fuera on public.ofrecimientos
      as restrictive for all to authenticated
      using (not public.es_captacion_only())
      with check (not public.es_captacion_only());
  end if;
end
$$;

-- Realtime: que el resto de usuarios vean los cambios sin recargar
do $$
begin
  alter publication supabase_realtime add table public.ofrecimientos;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;

-- ── Migración de las peticiones de Boulema ───────────────────────────
-- Cada petición → un ofrecimiento con origen 'boulema', un nivel 1 con un
-- paso técnico por persona pedida. Si ya había un informe enlazado escrito
-- por esa persona, el paso queda en 'ok' con su reportId.
do $mig$
declare
  p record;
  pasos jsonb;
  av text;
  rep record;
  veredicto text;
  rep_id text;
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = 'boulema_peticiones') then
    return;
  end if;

  for p in
    select * from public.boulema_peticiones b
    where not exists (select 1 from public.ofrecimientos o where o.boulema_peticion_id = b.id)
  loop
    pasos := '[]'::jsonb;
    for av in select trim(x) from unnest(string_to_array(coalesce(p.requested_from, ''), ',')) x where trim(x) <> '' loop
      veredicto := 'pendiente';
      rep_id := null;
      -- ¿alguno de los informes enlazados lo escribió esta persona?
      for rep in
        select r.id, r.conclusion
          from unnest(string_to_array(coalesce(p.report_id, ''), ',')) rid
          join public.scouting_reports r on r.id::text = trim(rid)
         where r.persona = av
         limit 1
      loop
        rep_id := rep.id::text;
        veredicto := case
          when rep.conclusion ilike 'descartar%' then 'no'
          when rep.conclusion ilike 'más video%' or rep.conclusion ilike 'mas video%' then 'mas'
          else 'ok'
        end;
      end loop;
      pasos := pasos || jsonb_build_object(
        'avatar', av, 'tipo', 'tecnico', 'veredicto', veredicto,
        'reportId', rep_id,
        'respondidoAt', case when rep_id is null then null else p.created_at end
      );
    end loop;

    insert into public.ofrecimientos (
      player_name, position, birth_year, birth_month, team, country, nationality,
      origen, ofrece_nombre, responsable, notes, created_by, created_at, updated_at,
      niveles, boulema_peticion_id
    ) values (
      p.player_name, p.position, p.birth_year, p.birth_month, p.team, p.country, p.nationality,
      'boulema', p.offered_by, p.requested_by, p.notes, p.requested_by, p.created_at, p.created_at,
      case when jsonb_array_length(pasos) = 0 then '[]'::jsonb
           else jsonb_build_array(jsonb_build_object(
             'n', 1, 'pedidoPor', p.requested_by, 'pedidoAt', p.created_at, 'pasos', pasos))
      end,
      p.id
    );
  end loop;
end
$mig$;

-- Vincular con la ficha de Captación cuando el nombre coincide exactamente
update public.ofrecimientos o
   set scouting_player_id = sp.id
  from public.scouting_players sp
 where o.scouting_player_id is null
   and lower(trim(sp.full_name)) = lower(trim(o.player_name));

-- Comprobación
select estado, origen, count(*) as n
  from public.ofrecimientos
 group by estado, origen
 order by estado, origen;
