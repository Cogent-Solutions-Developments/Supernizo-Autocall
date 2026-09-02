import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const basePathHelpers = new Set(['fetchAppApi', 'withAppBasePath']);

function isClientModule(sourceCode) {
  const firstStatement = sourceCode.ast.body[0];
  return (
    firstStatement?.type === 'ExpressionStatement' &&
    firstStatement.expression.type === 'Literal' &&
    firstStatement.expression.value === 'use client'
  );
}

function isBasePathHelperArgument(node) {
  const parent = node.parent;
  return (
    parent?.type === 'CallExpression' &&
    parent.callee.type === 'Identifier' &&
    basePathHelpers.has(parent.callee.name) &&
    parent.arguments.includes(node)
  );
}

const clientRoutingPlugin = {
  rules: {
    'no-direct-fetch': {
      meta: {
        messages: {
          directFetch:
            'Use fetchAppApi from @/lib/app-fetch so browser requests include the application base path.',
        },
        schema: [],
        type: 'problem',
      },
      create(context) {
        if (!isClientModule(context.sourceCode)) return {};

        return {
          CallExpression(node) {
            if (node.callee.type === 'Identifier' && node.callee.name === 'fetch') {
              context.report({ messageId: 'directFetch', node: node.callee });
            }
          },
        };
      },
    },
    'no-unprefixed-api-path': {
      meta: {
        messages: {
          unprefixedPath:
            'Pass application API paths directly to fetchAppApi or withAppBasePath before using them in the browser.',
        },
        schema: [],
        type: 'problem',
      },
      create(context) {
        if (!isClientModule(context.sourceCode)) return {};

        function checkPath(node, value) {
          if (value.startsWith('/api/') && !isBasePathHelperArgument(node)) {
            context.report({ messageId: 'unprefixedPath', node });
          }
        }

        return {
          Literal(node) {
            if (typeof node.value === 'string') checkPath(node, node.value);
          },
          TemplateLiteral(node) {
            checkPath(node, node.quasis[0]?.value.raw ?? '');
          },
        };
      },
    },
  },
};

export default tseslint.config(
  {
    ignores: [
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/platform/src/**/*.{ts,tsx}'],
    plugins: {
      'client-routing': clientRoutingPlugin,
    },
    rules: {
      'client-routing/no-direct-fetch': 'error',
      'client-routing/no-unprefixed-api-path': 'error',
    },
  },
  {
    files: ['packages/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'separate-type-imports' },
      ],
    },
  },
);
