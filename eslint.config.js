import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // _to_delete y supabase/functions (Deno) no forman parte del build de Vite.
  globalIgnores(['dist', '_to_delete', 'supabase/functions', 'src-fix']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },
  {
    // Tipografía mínima 11px: prohíbe `text-[Npx]` con N ≤ 10 (incluye 9.5 y 10.5).
    // Los ficheros de gráficos quedan excluidos.
    // Ya es 'error': los módulos están migrados y los usos a cero.
    files: ['src/**/*.tsx'],
    ignores: ['src/views/ScoutStats.tsx', 'src/views/CaptacionStats.tsx', 'src/views/ModeloLlamar.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: String.raw`Literal[value=/text-\[(?:[0-9](?:\.5)?|10(?:\.5)?)px\]/]`,
          message: 'Tipografía mínima 11px (usa text-badge/text-meta)',
        },
        {
          selector: String.raw`TemplateElement[value.raw=/text-\[(?:[0-9](?:\.5)?|10(?:\.5)?)px\]/]`,
          message: 'Tipografía mínima 11px (usa text-badge/text-meta)',
        },
      ],
    },
  },
  {
    // main.tsx es el punto de entrada: monta la app y no exporta nada,
    // así que fast refresh no aplica.
    files: ['src/main.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
