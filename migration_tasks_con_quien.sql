-- Tareas de tipo Llamada: con quién se habla (texto libre: «director
-- deportivo del Valencia», «el padre»…), aparte del jugador al que se
-- refiere. Hasta ahora «A quién» solo admitía un jugador. Sin esta columna
-- la app funciona igual: el nombre va en el título de la tarea.
-- Reejecutable.
alter table public.tasks add column if not exists con_quien text;
