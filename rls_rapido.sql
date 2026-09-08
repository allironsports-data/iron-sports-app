-- ══════════════════════════════════════════════════════════════════════
-- RLS RÁPIDO — 2026-09-08
--
-- Por qué tarda la carga: todas las tablas tienen políticas restrictivas
-- del tipo   using (public.es_cuenta_activa())   y esa función (security
-- definer, consulta a profiles) Postgres la ejecuta UNA VEZ POR FILA:
-- 8.000 informes = 8.000 consultas a profiles solo para leer informes.
-- Escribiéndola como   using ((select public.es_cuenta_activa()))   el
-- planificador la evalúa una sola vez por consulta (InitPlan) y el coste
-- desaparece. Es la recomendación oficial de Supabase para RLS.
--
-- Este script recorre TODAS las políticas de public que llamen a
-- es_cuenta_activa(), es_captacion_only() o es_admin() y las vuelve a
-- crear idénticas pero con la llamada envuelta en (select …).
-- Es idempotente: si ya están envueltas no las toca.
-- Ejecutar en el SQL Editor de Supabase. Se puede repetir sin peligro.
-- ══════════════════════════════════════════════════════════════════════

do $rapido$
declare
  p record;
  qual_nueva  text;
  check_nueva text;
  patron constant text := '(?<!select )\m(public\.)?(es_cuenta_activa|es_captacion_only|es_admin)\(\)';
  n int := 0;
begin
  for p in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~* patron or coalesce(with_check, '') ~* patron)
  loop
    qual_nueva  := regexp_replace(p.qual,       patron, '(select public.\2())', 'gi');
    check_nueva := regexp_replace(p.with_check, patron, '(select public.\2())', 'gi');

    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    execute format(
      'create policy %I on %I.%I as %s for %s to %s %s %s',
      p.policyname, p.schemaname, p.tablename,
      p.permissive,                                   -- PERMISSIVE / RESTRICTIVE
      p.cmd,                                          -- ALL / SELECT / INSERT / UPDATE / DELETE
      array_to_string(p.roles, ', '),
      case when qual_nueva  is not null then 'using ('      || qual_nueva  || ')' else '' end,
      case when check_nueva is not null then 'with check (' || check_nueva || ')' else '' end
    );
    n := n + 1;
    raise notice 'Política % en % reescrita', p.policyname, p.tablename;
  end loop;
  raise notice '% políticas reescritas', n;
end
$rapido$;

-- Comprobación: no debe quedar ninguna llamada sin envolver
select tablename, policyname, qual
from pg_policies
where schemaname = 'public'
  and (coalesce(qual, '') ~* '(?<!select )\m(public\.)?(es_cuenta_activa|es_captacion_only|es_admin)\(\)'
    or coalesce(with_check, '') ~* '(?<!select )\m(public\.)?(es_cuenta_activa|es_captacion_only|es_admin)\(\)');
-- (si devuelve 0 filas, todo bien)
