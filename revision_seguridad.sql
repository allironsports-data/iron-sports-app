-- ══════════════════════════════════════════════════════════════════════
--  REVISIÓN DE SEGURIDAD · 18-ago-2026
--
--  Contexto: la app es 100% cliente (React) hablando con Supabase. Todo lo
--  que la interfaz "esconde" (botones de admin, la restricción de las
--  cuentas «solo Captación») es SOLO pintura: cualquiera con la sesión
--  abierta puede llamar a la API desde la consola del navegador. Lo único
--  que protege de verdad son las políticas RLS de la base de datos.
--
--  Este script tiene tres partes. La 1 solo MIRA. La 2 y la 3 arreglan.
--  Ejecuta la 1, mírala, y luego las otras dos.
-- ══════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 1 · DIAGNÓSTICO (no cambia nada)
--  ¿Qué tablas tienen RLS encendido y qué políticas hay?
--  Cualquier tabla con rls_activo = false está abierta de par en par para
--  cualquier usuario con sesión: puede leer, editar y BORRAR todo.
-- ══════════════════════════════════════════════════════════════════════

select
  c.relname                                   as tabla,
  c.relrowsecurity                            as rls_activo,
  count(p.polname)                            as n_politicas,
  coalesce(string_agg(p.polname, ', ' order by p.polname), '—') as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by c.relrowsecurity, c.relname;


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 2 · CANDADO A LOS PERMISOS  ← lo más importante
--
--  Hoy, un usuario cualquiera (incluido uno «solo Captación») puede
--  abrir la consola del navegador y ejecutar un PATCH sobre su propia
--  fila de profiles poniéndose is_admin = true. La app no lo impide
--  porque la comprobación vive en el botón, no en la base de datos.
--
--  Esto lo bloquea sin tocar la app: un admin sigue pudiendo pulsar
--  «Hacer admin» y «Solo Captación» como hasta ahora; cualquier otro
--  recibe un error al intentar cambiarse los permisos a sí mismo.
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.guard_profile_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $guard$
begin
  -- ¿Se están tocando los permisos?
  if (new.is_admin       is distinct from old.is_admin)
  or (new.captacion_only is distinct from old.captacion_only) then
    -- Solo puede hacerlo alguien que YA sea admin
    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and coalesce(p.is_admin, false)
    ) then
      raise exception 'Solo un administrador puede cambiar los permisos de una cuenta';
    end if;
  end if;
  return new;
end
$guard$;

drop trigger if exists trg_guard_profile_flags on public.profiles;
create trigger trg_guard_profile_flags
  before update on public.profiles
  for each row execute function public.guard_profile_flags();

-- Comprobación: esto debe FALLAR si lo ejecutas con una cuenta no admin,
-- y funcionar si eres admin.
--   update public.profiles set is_admin = true where id = auth.uid();


-- ══════════════════════════════════════════════════════════════════════
--  PARTE 3 · UN JUGADOR, UNA TARJETA EN EL PIPELINE
--
--  Si dos personas pulsan «Añadir a Firmar» sobre el mismo jugador casi a
--  la vez, salen dos tarjetas duplicadas (la comprobación de la app mira
--  solo lo que tiene cargado en memoria). Esto lo impide de raíz.
--
--  Primero enseña los duplicados que ya existan (para fusionarlos a mano
--  antes), y solo crea el índice si no queda ninguno.
-- ══════════════════════════════════════════════════════════════════════

-- 3a. ¿Hay duplicados ahora mismo?
select scouting_player_id, count(*) as tarjetas,
       string_agg(player_name, ' · ') as nombres
from public.captacion_firmas
where scouting_player_id is not null
group by scouting_player_id
having count(*) > 1;

-- 3b. Si la consulta de arriba sale vacía, crea el índice único.
--     (Si sale con filas, borra primero las tarjetas duplicadas que sobren
--      y vuelve a ejecutar.)
create unique index if not exists captacion_firmas_scouting_player_uniq
  on public.captacion_firmas (scouting_player_id)
  where scouting_player_id is not null;


-- ══════════════════════════════════════════════════════════════════════
--  NOTA SOBRE LOS PASAPORTES  (no es SQL, es una decisión tuya)
--
--  Los pasaportes y los PDF de contrato se suben al bucket privado y se
--  guardan como enlaces firmados de 10 AÑOS de validez. Si uno de esos
--  enlaces se filtra (una captura, un WhatsApp reenviado), da acceso al
--  documento durante una década y no hay forma de revocarlo salvo borrar
--  el fichero. Lo suyo sería firmarlos al abrirlos, con validez de una
--  hora — como ya se hace con los adjuntos de las tareas. Es un cambio de
--  código, dímelo y lo hago.
-- ══════════════════════════════════════════════════════════════════════
