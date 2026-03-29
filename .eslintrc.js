module.exports = {
  env: {
    node:    true,
    es2022:  true,
    jest:    true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType:  'commonjs',
  },
  rules: {
    // Code quality
    'no-unused-vars':    ['warn', { argsIgnorePattern: '^_|next' }],
    'no-console':        'warn',
    'no-var':            'error',
    'prefer-const':      'error',
    'prefer-template':   'warn',
    'object-shorthand':  'warn',

    // Error handling
    'no-throw-literal': 'error',

    // Async
    'require-await': 'warn',

    // Style
    'eqeqeq':          ['error', 'always'],
    'curly':           ['error', 'all'],
    'no-trailing-spaces': 'warn',
    'semi':            ['error', 'never'],
    'quotes':          ['warn', 'single', { avoidEscape: true }],
  },
  ignorePatterns: ['node_modules/', 'coverage/', 'dist/'],
}
