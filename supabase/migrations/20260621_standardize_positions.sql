-- ============================================================
-- 2026-06-21 — Estandarización de posiciones
-- Convierte posiciones de jugadores y peticiones de clubes a los
-- códigos estándar: GK, RB, RCB, CB, LCB, LB, DM, CM, AM, RW, LW, FW
-- Ejecutar en: Supabase → SQL Editor → New Query
-- Idempotente: se puede ejecutar varias veces sin problema.
-- ============================================================

-- Función de normalización (es/abreviatura/inglés → código)
create or replace function public.norm_pos(x text)
returns text language sql immutable as $$
  select case lower(trim(coalesce(x, '')))
    when 'gk' then 'GK' when 'por' then 'GK' when 'portero' then 'GK' when 'goalkeeper' then 'GK' when 'arquero' then 'GK'
    when 'rb' then 'RB' when 'rwb' then 'RB' when 'ld' then 'RB' when 'lateral derecho' then 'RB' when 'right back' then 'RB' when 'rightback' then 'RB'
    when 'rcb' then 'RCB' when 'central derecho' then 'RCB' when 'right centreback' then 'RCB'
    when 'cb' then 'CB' when 'ct' then 'CB' when 'dfc' then 'CB' when 'central' then 'CB' when 'centreback' then 'CB' when 'centre back' then 'CB' when 'center back' then 'CB'
    when 'lcb' then 'LCB' when 'central izquierdo' then 'LCB' when 'left centreback' then 'LCB'
    when 'lb' then 'LB' when 'lwb' then 'LB' when 'li' then 'LB' when 'lateral izquierdo' then 'LB' when 'left back' then 'LB' when 'leftback' then 'LB'
    when 'dm' then 'DM' when 'cdm' then 'DM' when 'mcd' then 'DM' when 'pivote' then 'DM' when 'mediocentro defensivo' then 'DM'
    when 'cm' then 'CM' when 'mc' then 'CM' when 'mediocentro' then 'CM' when 'medio centro' then 'CM' when 'interior' then 'CM'
    when 'am' then 'AM' when 'cam' then 'AM' when 'mp' then 'AM' when 'mco' then 'AM' when 'mediapunta' then 'AM' when 'media punta' then 'AM' when 'mediocentro ofensivo' then 'AM' when 'enganche' then 'AM'
    when 'rw' then 'RW' when 'rm' then 'RW' when 'ed' then 'RW' when 'extremo derecho' then 'RW' when 'right winger' then 'RW'
    when 'lw' then 'LW' when 'lm' then 'LW' when 'ei' then 'LW' when 'extremo izquierdo' then 'LW' when 'left winger' then 'LW'
    when 'fw' then 'FW' when 'st' then 'FW' when 'cf' then 'FW' when 'at' then 'FW' when 'ss' then 'FW' when 'delantero' then 'FW' when 'delantero centro' then 'FW' when 'forward' then 'FW' when 'striker' then 'FW' when 'punta' then 'FW' when 'segunda punta' then 'FW'
    else x   -- desconocido: se conserva tal cual para no perder dato
  end;
$$;

-- 1) Jugadores: array de posiciones (text[])
update public.players
set positions = (
  select array_agg(public.norm_pos(elem))
  from unnest(positions) as elem
)
where positions is not null and array_length(positions, 1) > 0;

-- 2) Peticiones de clubes: clubs.needs es jsonb [{position, ...}]
update public.clubs
set needs = (
  select jsonb_agg(
    case when elem ? 'position'
      then jsonb_set(elem, '{position}', to_jsonb(public.norm_pos(elem->>'position')))
      else elem
    end
  )
  from jsonb_array_elements(needs) elem
)
where jsonb_typeof(needs) = 'array' and jsonb_array_length(needs) > 0;

-- 3) Negociaciones: posición concreta de la petición ligada
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name = 'club_negotiations' and column_name = 'need_position') then
    update public.club_negotiations
    set need_position = public.norm_pos(need_position)
    where need_position is not null and need_position <> '';
  end if;
end $$;

-- (opcional) eliminar la función auxiliar
drop function if exists public.norm_pos(text);
