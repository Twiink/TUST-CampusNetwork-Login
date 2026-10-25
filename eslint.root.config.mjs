import js from '@eslint/js';

// 根配置只覆盖仓库级脚本；apps/* 与 packages/* 由各自的 eslint.config.js 管理。
export default [
  {
    ignores: ['**/node_modules/**', '.pnpm-store/**', 'apps/**', 'packages/**', '**/dist/**'],
  },
  js.configs.recommended,
  {
    files: ['shell/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        fetch: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },
];
