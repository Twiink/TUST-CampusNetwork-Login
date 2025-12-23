/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'commonjs',
  },
  ignorePatterns: ['node_modules/', 'dist/', 'build/', 'coverage/', 'apps/', 'packages/'],
  rules: {
    'no-console': 'off',
  },
};
