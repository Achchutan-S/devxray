module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint', 'react-refresh'],
  ignorePatterns: ['dist', 'dev-dist', 'node_modules', 'coverage', '*.cjs', '*.config.js'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/consistent-type-imports': [
      'error',
      { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
    ],
    // This is a privacy-first local tool: stray console calls risk leaking user
    // input, tokens or API keys into the devtools log.
    'no-console': ['error', { allow: ['warn', 'error'] }],
    eqeqeq: ['error', 'smart'],
    'no-implicit-coercion': 'error',
  },
  overrides: [
    {
      files: ['vite.config.ts', 'vitest.config.ts'],
      env: { node: true },
      parserOptions: { project: null },
    },
    {
      files: ['src/**/*.test.ts'],
      rules: { 'no-console': 'off' },
    },
  ],
};
