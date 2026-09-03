# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Correo diario «Tu día» (resumen-diario)

Cada mañana (08:00 Madrid en verano) cada persona con algo pendiente recibe un correo con sus partidos de hoy, las acciones del pipeline Firmar vencidas/de hoy y sus tareas vencidas/de hoy. Lo envía la Edge Function `supabase/functions/resumen-diario` (Resend), disparada por `pg_cron` + `pg_net`.

### Desplegar

1. Secrets de la función (`RESEND_API_KEY` ya existe, lo usa `notify-task`):
   ```bash
   supabase secrets set CRON_SECRET="$(openssl rand -hex 32)" APP_URL="https://<dominio-de-la-app>"
   supabase secrets list   # apunta el valor de CRON_SECRET, lo necesitas en el paso 3
   ```
2. Desplegar la función sin verificación de JWT (la protege la cabecera `x-cron-secret`):
   ```bash
   supabase functions deploy resumen-diario --no-verify-jwt
   ```
3. Abrir `migration_cron_resumen_diario.sql`, sustituir `<project-ref>` y `<CAMBIA-ESTO-POR-EL-CRON_SECRET>` (mismo valor que `CRON_SECRET`) y ejecutarlo en el SQL Editor de Supabase. Habilita `pg_cron`/`pg_net`, guarda URL y secreto en la tabla `app_config` (solo legible por service_role) y programa el job `resumen-diario` a las `0 6 * * *` UTC. Es idempotente: vuelve a ejecutarlo para cambiar hora o secreto.
4. Cambio de hora: pg_cron va en UTC. `0 6` = 08:00 en verano y 07:00 en invierno; si quieres 08:00 todo el año, pon `0 7` a finales de octubre y `0 6` a finales de marzo.

### Probar

```bash
# Sin enviar nada: devuelve en JSON quién recibiría qué
curl -X POST "https://<project-ref>.supabase.co/functions/v1/resumen-diario" \
  -H "x-cron-secret: <CRON_SECRET>" -H "Content-Type: application/json" -d '{"dry": true}'

# Envío real solo a una persona (profiles.id)
curl -X POST "https://<project-ref>.supabase.co/functions/v1/resumen-diario" \
  -H "x-cron-secret: <CRON_SECRET>" -H "Content-Type: application/json" -d '{"solo": "<profile-uuid>"}'

# Envío real a todo el mundo (lo que hace el cron)
curl -X POST "https://<project-ref>.supabase.co/functions/v1/resumen-diario" \
  -H "x-cron-secret: <CRON_SECRET>" -H "Content-Type: application/json" -d '{}'
```

Sin la cabecera (o con otro valor) responde `403`. También acepta `{"hoy": "2026-09-02"}` para simular otro día. Logs: `supabase functions logs resumen-diario`. Ejecuciones del cron: `select * from cron.job_run_details order by start_time desc limit 5;`.

## CI (GitHub Actions)

`.github/workflows/ci.yml` corre en cada push y pull request con Node 22: `npm ci`, `npx tsc -b`, `npx vitest run` y `npx vite build`. ESLint (`npx eslint . --max-warnings=0`) va en un job aparte con `continue-on-error: true` hasta que esté a cero avisos; entonces quitar esa línea para que bloquee.

En local: `npm run build` (tipos + build) y `npm test`.
