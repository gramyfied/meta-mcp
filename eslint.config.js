import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

// ESLint v9 uses "flat config" by default. This keeps the existing lint intent
// from `.eslintrc.json` without requiring legacy config loading.
export default [
  {
    ignores: ["build/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...(tsPlugin.configs.recommended?.rules ?? {}),
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },
];

