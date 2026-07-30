-- ============================================================
-- 20260730 · Gestión de usuarios desde el panel Admin
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
-- Arregla:
--  · delete_user: fallaba con usuarios que tienen tareas/comentarios/
--    informes (las FK hacia profiles bloqueaban el borrado).
--    Ahora desvincula primero todas las referencias y luego borra
--    la cuenta (auth.users → cascada a profiles).
--  · update_user_password: versión robusta con chequeo de admin.
-- ============================================================

-- ── Borrar usuario (solo admins) ─────────────────────────────
create or replace function public.delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean;
  r record;
begin
  select is_admin into caller_is_admin from public.profiles where id = auth.uid();
  if not coalesce(caller_is_admin, false) then
    raise exception 'Solo un administrador puede eliminar usuarios';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'No puedes eliminar tu propia cuenta';
  end if;

  -- Recorre TODAS las columnas de public.* que referencian a
  -- profiles o a auth.users y las desvincula:
  --  · columna anulable  → se pone a NULL (la tarea/informe/comentario
  --    se conserva, solo pierde el autor/asignado)
  --  · columna NO anulable → se borra la fila (p. ej. su fila de
  --    estado del equipo), porque no puede existir sin el usuario
  for r in
    select tc.table_schema, tc.table_name, kcu.column_name, c.is_nullable
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_schema = tc.constraint_schema
     and kcu.constraint_name  = tc.constraint_name
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_schema = tc.constraint_schema
     and ccu.constraint_name  = tc.constraint_name
    join information_schema.columns c
      on c.table_schema = tc.table_schema
     and c.table_name   = tc.table_name
     and c.column_name  = kcu.column_name
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and ( (ccu.table_schema = 'public' and ccu.table_name = 'profiles')
         or (ccu.table_schema = 'auth'   and ccu.table_name = 'users') )
      and tc.table_name <> 'profiles'
  loop
    if r.is_nullable = 'YES' then
      execute format('update %I.%I set %I = null where %I = $1',
                     r.table_schema, r.table_name, r.column_name, r.column_name)
        using target_user_id;
    else
      execute format('delete from %I.%I where %I = $1',
                     r.table_schema, r.table_name, r.column_name)
        using target_user_id;
    end if;
  end loop;

  -- Borra la cuenta; profiles cae en cascada
  delete from auth.users where id = target_user_id;
  if not found then
    raise exception 'Usuario no encontrado';
  end if;
end;
$$;

revoke all on function public.delete_user(uuid) from public, anon;
grant execute on function public.delete_user(uuid) to authenticated;

-- ── Cambiar contraseña (solo admins) ─────────────────────────
-- Nota: la contraseña actual NUNCA se puede "ver" — Supabase solo
-- guarda el hash. Esta función establece una nueva.
create or replace function public.update_user_password(target_user_id uuid, new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  caller_is_admin boolean;
begin
  select is_admin into caller_is_admin from public.profiles where id = auth.uid();
  if not coalesce(caller_is_admin, false) then
    raise exception 'Solo un administrador puede cambiar contraseñas';
  end if;
  if new_password is null or length(new_password) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = target_user_id;
  if not found then
    raise exception 'Usuario no encontrado';
  end if;
end;
$$;

revoke all on function public.update_user_password(uuid, text) from public, anon;
grant execute on function public.update_user_password(uuid, text) to authenticated;
