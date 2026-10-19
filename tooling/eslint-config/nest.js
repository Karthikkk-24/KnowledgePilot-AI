import { baseConfig } from './base.js';

/** @type {import('eslint').Linter.Config[]} */
export const nestConfig = [
  ...baseConfig,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Nest DI needs runtime imports for constructor-injected classes (emitDecoratorMetadata).
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },

  },
];

export default nestConfig;
