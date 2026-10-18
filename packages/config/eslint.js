// 全仓共享的 ESLint 门禁。规则对应 CLAUDE.md 红线 3：
// 不允许死代码（常量条件）、吞错误（空 catch）、类型逃逸（any）、遗忘的 Promise。
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * @param {string} tsconfigRootDir 调用方包的根目录（传 import.meta.dirname）
 * @param {{ ignores?: string[] }} [options]
 */
export function createConfig(tsconfigRootDir, options = {}) {
  return tseslint.config(
    { ignores: ["dist/**", ".next/**", "out/**", "coverage/**", ...(options.ignores ?? [])] },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        "no-constant-condition": ["error", { checkLoops: "all" }],
        "no-constant-binary-expression": "error",
        "no-empty": ["error", { allowEmptyCatch: false }],
        "no-console": "error",
        eqeqeq: ["error", "always"],
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-misused-promises": "error",
        "@typescript-eslint/only-throw-error": "error",
        "@typescript-eslint/switch-exhaustiveness-check": "error",
        "@typescript-eslint/consistent-type-imports": "error",
        "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      },
    },
    {
      files: ["**/*.config.{js,ts}", "eslint.config.js"],
      ...tseslint.configs.disableTypeChecked,
    },
    prettier,
  );
}
