import js from '@eslint/js';

export default [
  { ignores: ['dist', 'node_modules', '**/*.node'] },
  js.configs.recommended,
  {
    rules: {
      'no-undef': ['off'],
    },
  },
];
