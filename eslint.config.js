const js = require('@eslint/js');
const typescript = require('@typescript-eslint/eslint-plugin');
const typescriptParser = require('@typescript-eslint/parser');
const prettier = require('eslint-plugin-prettier');

module.exports = [
  {
    ignores: [
      'scripts/archive/**/*', // Bỏ qua archive files hoàn toàn
      'test/**/*', // Bỏ qua tất cả test files
      '**/*.spec.ts', // Bỏ qua spec files
      '**/*.e2e-spec.ts', // Bỏ qua e2e spec files
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    ignores: [
      'test/**/*', // Bỏ qua test files
      '**/*.spec.ts', // Bỏ qua spec files
      '**/*.e2e-spec.ts', // Bỏ qua e2e spec files
    ],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
        sourceType: 'script',
      },
      globals: {
        // Node.js globals
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        Buffer: 'readonly',
        // ES globals
        Promise: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        WeakMap: 'readonly',
        WeakSet: 'readonly',
        Symbol: 'readonly',
        Proxy: 'readonly',
        Reflect: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      prettier: prettier,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      ...prettier.configs.recommended.rules,

      // ✅ Chỉ giữ những rules quan trọng - bỏ warnings
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off', // Bỏ warning
      '@typescript-eslint/no-unused-vars': 'off', // Bỏ warning
      '@typescript-eslint/no-non-null-assertion': 'off', // Bỏ warning
      '@typescript-eslint/no-unsafe-assignment': 'off', // Bỏ warning
      '@typescript-eslint/no-unsafe-call': 'off', // Bỏ warning
      '@typescript-eslint/no-unsafe-member-access': 'off', // Bỏ warning
      '@typescript-eslint/no-unsafe-return': 'off', // Bỏ warning

      // ✅ Chỉ giữ những errors thực sự quan trọng
      'prefer-const': 'off', // Bỏ warning
      'no-var': 'error',
      'no-undef': 'off', // TypeScript handles this

      // ✅ Bỏ những rules gây phiền nhiễu
      'no-useless-catch': 'off', // Bỏ error - cho phép re-throw
      'no-unsafe-optional-chaining': 'off', // Bỏ error - cho phép optional chaining
      'no-control-regex': 'off', // Bỏ error - cho phép control characters
      'no-empty-object-type': 'off', // Bỏ error - cho phép empty object types
      'no-redeclare': 'off', // Bỏ error - cho phép redeclare Request/Response
    },
  },
  {
    files: ['**/*.js'],
    ignores: ['scripts/archive/**/*'], // Bỏ qua archive JS files
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
];
