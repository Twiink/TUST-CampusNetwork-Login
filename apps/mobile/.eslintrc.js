module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      files: ['e2e/**/*.mjs'],
      parser: 'espree',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      env: { node: true, es2022: true },
    },
  ],
  ignorePatterns: ['coverage/', 'android/', 'ios/'],
};
