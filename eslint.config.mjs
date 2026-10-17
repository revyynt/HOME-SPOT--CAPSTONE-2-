import js from '@eslint/js';
import globals from 'globals';

/**
 * ESLint flat config.
 *
 * The custom rules at the bottom encode the three failure modes that kept
 * biting this codebase: globals leaking onto `window`, template-literal
 * `onclick` (an XSS vector), and implicit globals that would explode the moment
 * a file becomes an ES module.
 */
export default [
  {
    ignores: ['node_modules/**', '.git/**', 'dist/**']
  },

  js.configs.recommended,

  // ---------------------------------------------------------------------
  // Browser ES modules
  // ---------------------------------------------------------------------
  {
    files: ['assets/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser
      }
    },
    rules: {
      // `caughtErrors: none` -- an empty `catch {}` is idiomatic for
      // deliberately-swallowed errors (BF-cache, optional globals).
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-implicit-globals': 'error',
      // Empty `catch {}` is used deliberately for errors we genuinely do not
      // want to handle (optional storage, BF-cache, clipboard fallbacks).
      // A non-empty catch is required for anything else.
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'off',
      // `event` is a legacy global that silently refers to the last event.
      'no-restricted-globals': [
        'error',
        { name: 'event', message: 'Use the event parameter passed to the listener.' }
      ]
    }
  },

  {
    files: ['assets/js/**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser }
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      eqeqeq: ['error', 'smart']
    }
  },

  // ---------------------------------------------------------------------
  // Tests
  // ---------------------------------------------------------------------
  {
    files: ['tests/**/*.js', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      // smoke.test.js installs a DOM stub on globalThis, so browser globals
      // are legitimately referenced from tests.
      globals: { ...globals.node, ...globals.browser }
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }]
    }
  },

  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node }
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }]
    }
  },

  // ---------------------------------------------------------------------
  // Custom rules
  //
  // Scoped to JS only -- ESLint cannot parse HTML. The equivalent
  // inline-handler check for .html lives in tests/structure.test.js.
  // ---------------------------------------------------------------------
  {
    files: ['assets/js/**/*.js'],
    plugins: {
      homespot: {
        rules: {
          'no-global-leak': {
            meta: {
              type: 'problem',
              docs: {
                description:
                  'Disallow assigning to window so modules keep an explicit, importable surface.'
              },
              schema: [
                {
                  type: 'object',
                  properties: {
                    allow: { type: 'array', items: { type: 'string' } }
                  },
                  additionalProperties: false
                }
              ],
              messages: {
                leak: 'Do not publish "{{name}}" on window. Export it and import it, or allowlist it.'
              }
            },
            create(context) {
              const options = context.options[0] || {};
              const allow = new Set(options.allow || []);
              return {
                'MemberExpression[object.name="window"]'(node) {
                  const parent = node.parent;
                  const isWrite =
                    parent && parent.type === 'AssignmentExpression' && parent.left === node;
                  if (!isWrite) return;
                  const name = node.property.name || node.property.value;
                  if (!name || allow.has(name)) return;
                  context.report({ node, messageId: 'leak', data: { name } });
                }
              };
            }
          }
        }
      }
    },
    rules: {
      // `warn` while the remaining classic-script bridges are migrated; this
      // flips to `error` once every page is a module (see README).
      'homespot/no-global-leak': [
        'warn',
        {
          allow: [
            // Console/CLI affordance. Both assignments delegate to the single
            // implementation in assets/js/room-availability.js; the later one
            // (property-detail.js) simply adds a page-specific room default.
            'setRoomAvailability',
            'decrementRoomAvailability',

            // Standard window event-handler property, not a leaked global.
            'onpopstate'
          ]
        }
      ]
    }
  }
];
