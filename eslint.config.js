import importPlugin from 'eslint-plugin-import'
import tseslint from 'typescript-eslint'

const zone = (target, from, message) => ({ target, from, message })

const zones = [
  zone('./packages/shared', './packages/backend', 'shared tidak boleh mengimpor backend'),
  zone('./packages/shared', './packages/web', 'shared tidak boleh mengimpor web'),
  zone('./packages/backend', './packages/web', 'backend tidak boleh mengimpor web'),
  zone('./packages/web', './packages/backend', 'web tidak boleh mengimpor backend'),

  zone('./packages/backend/src/db', './packages/backend/src/api', 'db tidak boleh mengimpor api'),
  zone(
    './packages/backend/src/db',
    './packages/backend/src/worker',
    'db tidak boleh mengimpor worker',
  ),
  zone(
    './packages/backend/src/db',
    './packages/backend/src/modules',
    'db tidak boleh mengimpor modules',
  ),
  zone(
    './packages/backend/src/db',
    './packages/backend/src/baileys',
    'db tidak boleh mengimpor baileys',
  ),

  zone(
    './packages/backend/src/modules',
    './packages/backend/src/api',
    'modules tidak boleh mengimpor api',
  ),
  zone(
    './packages/backend/src/modules',
    './packages/backend/src/worker',
    'modules tidak boleh mengimpor worker',
  ),
  zone(
    './packages/backend/src/modules',
    './packages/backend/src/baileys',
    'modules tidak boleh mengimpor baileys',
  ),

  zone(
    './packages/backend/src/api',
    './packages/backend/src/worker',
    'api tidak boleh mengimpor worker',
  ),
  zone(
    './packages/backend/src/api',
    './packages/backend/src/baileys',
    'api tidak boleh mengimpor baileys',
  ),

  zone(
    './packages/backend/src/worker',
    './packages/backend/src/api',
    'worker tidak boleh mengimpor api',
  ),

  zone(
    './packages/backend/src/baileys',
    './packages/backend/src/api',
    'baileys tidak boleh mengimpor api',
  ),
  zone(
    './packages/backend/src/baileys',
    './packages/backend/src/worker',
    'baileys tidak boleh mengimpor worker',
  ),
]

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'packages/web/src/routeTree.gen.ts',
      'packages/backend/drizzle/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          noWarnOnMultipleProjects: true,
          project: ['packages/*/tsconfig.json'],
        },
      },
    },
    rules: {
      'no-console': 'error',
      'import/no-restricted-paths': ['error', { zones }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Gunakan modul env terpusat, bukan process.env langsung.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.type='MetaProperty'][property.name='env']",
          message: 'Gunakan modul env terpusat, bukan import.meta.env langsung.',
        },
      ],
    },
  },
  {
    files: [
      'packages/backend/src/infra/load-env.ts',
      'packages/backend/src/infra/env.ts',
      'packages/backend/drizzle.config.ts',
      'packages/backend/src/db/seed/api-key.ts',
      'packages/backend/test/**',
      'packages/web/src/lib/env.ts',
      'packages/web/vite.config.ts',
      'vitest.config.ts',
    ],
    rules: {
      'no-restricted-properties': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'packages/backend/test/**'],
    rules: { 'no-console': 'off' },
  },
)
