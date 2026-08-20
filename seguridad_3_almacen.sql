-- ══════════════════════════════════════════════════════════════════════
--  SEGURIDAD · PASO 3 · EL ALMACÉN DE ARCHIVOS (pasaportes y contratos)
--
--  La buena noticia del diagnóstico: el bucket `attachments` es PRIVADO.
--  Sin un enlace firmado no se abre nada, así que lo de firmar a 5 minutos
--  que ya está desplegado sirve para lo que tiene que servir.
--
--  La mala: las políticas del almacén van por su cuenta, y las cuatro que
--  hay solo piden «estar autenticado». Nada de lo del paso 2 llega ahí
--  (aquello era sobre las tablas de public; esto es storage.objects).
--  O sea, hoy mismo:
--
--    · una cuenta «solo Captación» puede LISTAR Y DESCARGAR todos los
--      pasaportes y todos los contratos, saltándose la app entera;
--    · una cuenta recién registrada y SIN ACTIVAR, también;
--    · y cualquiera de las dos puede BORRARLOS. Todos. De un comando.
--
--  Esto lo cierra. Son políticas RESTRICTIVAS: se suman con Y a las cuatro
--  que ya tienes, no las tocan. Para las cuentas normales no cambia nada.
--
--  Ejecútalo entero. Es reejecutable.
-- ══════════════════════════════════════════════════════════════════════


-- ── 0 · ARREGLO: el candado de permisos te bloqueaba a TI ────────────
-- Probándolo he visto que el trigger de permisos (el que impide que
-- alguien se haga admin a sí mismo) también saltaba desde el editor SQL,
-- donde no hay usuario. O sea que un
--     update public.profiles set activo = true where name = 'Fulano';
-- fallaba con «Solo un administrador puede cambiar los permisos». Justo la
-- salida de emergencia que te dejé escrita.
--
-- Ahora, si no hay sesión (editor SQL / service_role), pasa.
create or replace function public.guard_profile_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $guard$
begin
  if auth.uid() is null then return new; end if;   -- editor SQL: paso libre

  if (new.is_admin       is distinct from old.is_admin)
  or (new.captacion_only is distinct from old.captacion_only)
  or (new.activo         is distinct from old.activo) then
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


-- ── ¿Soy admin? (la que faltaba; las otras dos ya existen) ───────────
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;


-- ── 1 · Cuenta sin activar: fuera del almacén ────────────────────────
drop policy if exists cuenta_activa on storage.objects;
create policy cuenta_activa on storage.objects
  as restrictive for all to public
  using      (public.es_cuenta_activa())
  with check (public.es_cuenta_activa());


-- ── 2 · «Solo Captación»: fuera del almacén ──────────────────────────
-- Un scout de captación no sube ni abre nada de aquí: los pasaportes y
-- los contratos son de la parte de agencia, y los adjuntos de tareas
-- también los tiene vedados desde el paso anterior.
drop policy if exists captacion_only_fuera on storage.objects;
create policy captacion_only_fuera on storage.objects
  as restrictive for all to public
  using      (not public.es_captacion_only())
  with check (not public.es_captacion_only());


-- ── 3 · Borrar ficheros: solo un admin ───────────────────────────────
-- La app NO borra ficheros en ningún sitio (al reemplazar un pasaporte
-- se sobreescribe, que es un update). Así que esto no rompe nada y quita
-- de la mesa el «me han vaciado el almacén».
drop policy if exists borrar_solo_admin on storage.objects;
create policy borrar_solo_admin on storage.objects
  as restrictive for delete to public
  using (public.es_admin());


-- ══════════════════════════════════════════════════════════════════════
--  COMPROBACIÓN
-- ══════════════════════════════════════════════════════════════════════

select bloque, detalle from (

  select 1 as orden, '1 · BUCKETS' as bloque,
         (id || ' · ' || case when public then 'PUBLICO ⚠' else 'privado ✓' end)::text as detalle
  from storage.buckets

  union all

  select 2, '2 · POLITICAS DEL ALMACEN',
         (p.policyname || ' · ' || p.cmd || ' · ' || p.permissive ||
          ' · using=' || coalesce(p.qual, '(nada)'))::text
  from pg_policies p
  where p.schemaname = 'storage' and p.tablename = 'objects'

  union all

  select 3, '3 · FICHEROS GUARDADOS',
         (split_part(name, '/', 1) || ' · ' || count(*)::text || ' archivos')::text
  from storage.objects
  where bucket_id = 'attachments'
  group by split_part(name, '/', 1)

) t
order by orden, detalle;


-- ══════════════════════════════════════════════════════════════════════
--  DESHACER, si algo se rompe
--    drop policy if exists cuenta_activa        on storage.objects;
--    drop policy if exists captacion_only_fuera on storage.objects;
--    drop policy if exists borrar_solo_admin    on storage.objects;
-- ══════════════════════════════════════════════════════════════════════
