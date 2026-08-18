-- ══════════════════════════════════════════════════════════════════════
--  TARJETAS DUPLICADAS EN EL PIPELINE (captacion_firmas)
--
--  Al crear el índice único saltó el error: hay jugadores con dos tarjetas.
--  Pasa cuando dos personas pulsan «Añadir a Firmar» casi a la vez (la
--  comprobación de la app mira solo lo que tiene cargado en memoria).
--
--  Este script las FUSIONA sin perder nada:
--    · se queda la tarjeta con más historial (y a igualdad, la más reciente),
--    · le pega los apuntes de la otra, sin repetir,
--    · une los encargados de ambas,
--    · rellena los huecos (zona, notas, próxima acción, fecha de firma…)
--      con lo que tuviera la tarjeta que se elimina,
--    · si una estaba «firmado», ese estatus manda,
--    · y borra la sobrante.
--
--  Todo en un único bloque, y deja el detalle en public._firmas_duplicados.
--  Al final crea ya el índice único que impide que vuelva a pasar.
-- ══════════════════════════════════════════════════════════════════════


-- ── PASO 1 · Ver qué hay (esto no cambia nada) ───────────────────────
select
  f.scouting_player_id,
  count(*)                                             as tarjetas,
  string_agg(f.player_name || ' [' || f.status || ', ' ||
             coalesce(jsonb_array_length(f.comments), 0) || ' apuntes]', '  ·  '
             order by f.created_at)                    as detalle
from public.captacion_firmas f
where f.scouting_player_id is not null
group by f.scouting_player_id
having count(*) > 1
order by 2 desc;


-- ── PASO 2 · Fusionar ────────────────────────────────────────────────
drop table if exists public._firmas_duplicados;
create table public._firmas_duplicados (
  jugador        text,
  se_queda       uuid,
  se_elimina     uuid,
  estatus_final  text,
  apuntes_antes  int,
  apuntes_final  int,
  detalle        text
);

do $fusion$
declare
  g            record;
  ganadora     record;
  perdedora    record;
  v_comments   jsonb;
  v_status     text;
  v_antes      int;
  v_detalle    text;
begin
  -- Orden de "avance" del pipeline: si una tarjeta está más adelantada, manda
  for g in
    select scouting_player_id
    from public.captacion_firmas
    where scouting_player_id is not null
    group by scouting_player_id
    having count(*) > 1
  loop
    -- La superviviente: más apuntes; a igualdad, la tocada más recientemente
    select * into ganadora
    from public.captacion_firmas
    where scouting_player_id = g.scouting_player_id
    order by coalesce(jsonb_array_length(comments), 0) desc,
             coalesce(updated_at, created_at) desc
    limit 1;

    v_comments := coalesce(ganadora.comments, '[]'::jsonb);
    v_status   := ganadora.status;

    -- Encargados: unión de TODAS las tarjetas de ese jugador. Se hace en SQL
    -- puro y antes de borrar nada, para no depender del tipo de la columna
    -- (en esta base es uuid[], pero así vale igual si fuera texto).
    update public.captacion_firmas t
       set managers = coalesce((
             select array_agg(distinct m)
             from public.captacion_firmas o, unnest(coalesce(o.managers, '{}')) m
             where o.scouting_player_id = g.scouting_player_id
           ), t.managers)
     where t.id = ganadora.id;
    v_antes    := jsonb_array_length(v_comments);
    v_detalle  := '';

    for perdedora in
      select * from public.captacion_firmas
      where scouting_player_id = g.scouting_player_id and id <> ganadora.id
    loop
      -- Apuntes de la perdedora que no estén ya (se comparan por id)
      v_comments := v_comments || coalesce((
        select jsonb_agg(c)
        from jsonb_array_elements(coalesce(perdedora.comments, '[]'::jsonb)) c
        where not exists (
          select 1 from jsonb_array_elements(v_comments) y
          where y->>'id' = c->>'id'
        )
      ), '[]'::jsonb);

      -- «firmado» siempre manda; si no, se respeta el de la superviviente
      if perdedora.status = 'firmado' then v_status := 'firmado'; end if;

      -- Rellenar huecos con lo que tuviera la que se va
      update public.captacion_firmas t set
        zone                 = coalesce(nullif(trim(t.zone), ''), perdedora.zone),
        notes                = coalesce(nullif(trim(coalesce(t.notes, '')), ''), perdedora.notes),
        trello_url           = coalesce(t.trello_url, perdedora.trello_url),
        known_team           = coalesce(t.known_team, perdedora.known_team),
        signed_at            = coalesce(t.signed_at, perdedora.signed_at),
        status_updated_at    = coalesce(t.status_updated_at, perdedora.status_updated_at),
        next_action          = coalesce(t.next_action, perdedora.next_action),
        next_action_kind     = coalesce(t.next_action_kind, perdedora.next_action_kind),
        next_action_date     = coalesce(t.next_action_date, perdedora.next_action_date),
        next_action_assignee = coalesce(t.next_action_assignee, perdedora.next_action_assignee),
        next_action_task_id  = coalesce(t.next_action_task_id, perdedora.next_action_task_id),
        created_at           = least(t.created_at, perdedora.created_at)
      where t.id = ganadora.id;

      v_detalle := v_detalle ||
        case when v_detalle = '' then '' else ' | ' end ||
        'absorbida tarjeta ' || perdedora.status || ' con ' ||
        coalesce(jsonb_array_length(perdedora.comments), 0) || ' apuntes';

      insert into public._firmas_duplicados values
        (ganadora.player_name, ganadora.id, perdedora.id, v_status,
         v_antes, jsonb_array_length(v_comments), v_detalle);

      delete from public.captacion_firmas where id = perdedora.id;
    end loop;

    -- Guardar apuntes fusionados y estatus final (los encargados ya se
    -- unieron arriba, antes de borrar las tarjetas sobrantes)
    update public.captacion_firmas set
      comments = v_comments,
      status   = v_status
    where id = ganadora.id;
  end loop;
end
$fusion$;


-- ── PASO 3 · Resultado de la fusión ──────────────────────────────────
select jugador, estatus_final, apuntes_antes, apuntes_final, detalle
from public._firmas_duplicados
order by jugador;


-- ── PASO 4 · Ahora sí: candado para que no vuelva a pasar ────────────
create unique index if not exists captacion_firmas_scouting_player_uniq
  on public.captacion_firmas (scouting_player_id)
  where scouting_player_id is not null;


-- ── PASO 5 · Comprobación: debe salir vacío ──────────────────────────
select scouting_player_id, count(*)
from public.captacion_firmas
where scouting_player_id is not null
group by scouting_player_id
having count(*) > 1;
