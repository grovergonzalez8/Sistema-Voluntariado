import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export function createRepositoryConfig(tsconfigRootDir) {
  return tseslint.config(
    {
      ignores: [
        '**/dist/**',
        '**/coverage/**',
        '**/node_modules/**',
        '**/playwright-report/**',
        '**/test-results/**',
        '**/.turbo/**',
        'supabase/.temp/**',
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: {
        '@typescript-eslint/consistent-type-exports': 'error',
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports' },
        ],
        '@typescript-eslint/no-import-type-side-effects': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: ['apps/web/src/**/*.{ts,tsx}', 'packages/ui/src/**/*.{ts,tsx}'],
      plugins: {
        'react-hooks': reactHooks,
        'react-refresh': reactRefresh,
      },
      rules: {
        ...reactHooks.configs.flat.recommended.rules,
        'react-refresh/only-export-components': [
          'warn',
          { allowConstantExport: true },
        ],
      },
    },
    {
      files: ['apps/web/src/**/*.{ts,tsx}'],
      plugins: { boundaries },
      settings: {
        'boundaries/root-path': tsconfigRootDir,
        'import/resolver': {
          typescript: {
            project: ['apps/web/tsconfig.json'],
          },
        },
        'boundaries/elements': [
          { type: 'app', pattern: 'apps/web/src/app' },
          {
            type: 'domain',
            pattern: 'apps/web/src/modules/*/domain',
            capture: ['module'],
          },
          {
            type: 'application',
            pattern: 'apps/web/src/modules/*/application',
            capture: ['module'],
          },
          {
            type: 'infrastructure',
            pattern: 'apps/web/src/modules/*/infrastructure',
            capture: ['module'],
          },
          {
            type: 'presentation',
            pattern: 'apps/web/src/modules/*/presentation',
            capture: ['module'],
          },
          {
            type: 'module-public',
            pattern: 'apps/web/src/modules/*',
            capture: ['module'],
          },
          { type: 'shared', pattern: 'apps/web/src/shared' },
          { type: 'entry', pattern: 'apps/web/src' },
        ],
        'boundaries/files': [
          {
            category: 'entry',
            pattern: 'apps/web/src/*.{ts,tsx}',
          },
          {
            category: 'test',
            pattern: '**/*.{test,spec}.{ts,tsx}',
          },
        ],
        'boundaries/include': ['apps/web/src/**/*.{ts,tsx}'],
      },
      rules: {
        'boundaries/dependencies': [
          'error',
          {
            default: 'disallow',
            policies: [
              {
                from: { file: { categories: 'test' } },
                allow: {
                  to: {
                    element: {
                      types: {
                        anyOf: [
                          'app',
                          'application',
                          'domain',
                          'entry',
                          'infrastructure',
                          'module-public',
                          'presentation',
                          'shared',
                        ],
                      },
                    },
                  },
                },
              },
              {
                from: { element: { type: 'domain' } },
                allow: {
                  to: {
                    element: {
                      type: 'domain',
                      captured: {
                        module: '{{ from.element.captured.module }}',
                      },
                    },
                  },
                },
              },
              {
                from: { element: { type: 'application' } },
                allow: {
                  to: {
                    element: {
                      types: { anyOf: ['application', 'domain'] },
                      captured: {
                        module: '{{ from.element.captured.module }}',
                      },
                    },
                  },
                },
              },
              {
                from: { element: { type: 'infrastructure' } },
                allow: {
                  to: {
                    element: {
                      types: {
                        anyOf: [
                          'infrastructure',
                          'application',
                          'domain',
                          'shared',
                        ],
                      },
                      captured: {
                        module: '{{ from.element.captured.module }}',
                      },
                    },
                  },
                },
              },
              {
                from: { element: { type: 'presentation' } },
                allow: {
                  to: {
                    element: {
                      types: {
                        anyOf: [
                          'presentation',
                          'application',
                          'domain',
                          'shared',
                        ],
                      },
                      captured: {
                        module: '{{ from.element.captured.module }}',
                      },
                    },
                  },
                },
              },
              {
                from: { element: { type: 'module-public' } },
                allow: {
                  to: {
                    element: {
                      types: {
                        anyOf: [
                          'presentation',
                          'application',
                          'domain',
                          'infrastructure',
                        ],
                      },
                      captured: {
                        module: '{{ from.element.captured.module }}',
                      },
                    },
                  },
                },
              },
              {
                from: {
                  element: {
                    types: { anyOf: ['infrastructure', 'presentation'] },
                  },
                },
                allow: { to: { element: { type: 'shared' } } },
              },
              {
                from: { element: { type: 'app' } },
                allow: {
                  to: {
                    element: {
                      types: { anyOf: ['app', 'module-public', 'shared'] },
                    },
                  },
                },
              },
              {
                from: { element: { type: 'entry' } },
                allow: {
                  to: {
                    element: { types: { anyOf: ['app', 'entry', 'shared'] } },
                  },
                },
              },
              {
                from: { element: { type: 'shared' } },
                allow: { to: { element: { type: 'shared' } } },
              },
            ],
          },
        ],
        'boundaries/no-unknown-dependencies': 'error',
        'boundaries/no-unknown-files': 'error',
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/modules/*/**/internal/**'],
                message: 'Importe únicamente la API pública del módulo.',
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        'apps/web/src/modules/*/domain/**/*.{ts,tsx}',
        'apps/web/src/modules/*/application/**/*.{ts,tsx}',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '@hookform/**',
                  '@supabase/**',
                  '@tanstack/**',
                  'i18next',
                  'i18next/**',
                  'react',
                  'react/**',
                  'react-dom',
                  'react-dom/**',
                  'react-hook-form',
                  'react-hook-form/**',
                  'react-i18next',
                  'react-i18next/**',
                  'react-router-dom',
                  'react-router-dom/**',
                  'zod',
                  'zod/**',
                ],
                message:
                  'Domain and application may not import frameworks or browser adapters.',
              },
            ],
          },
        ],
        'no-restricted-globals': [
          'error',
          'document',
          'fetch',
          'localStorage',
          'navigator',
          'sessionStorage',
          'window',
        ],
      },
    },
    {
      files: ['**/*.{js,mjs,cjs}'],
      ...tseslint.configs.disableTypeChecked,
    },
  );
}
