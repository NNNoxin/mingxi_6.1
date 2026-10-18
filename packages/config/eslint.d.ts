import type { Linter } from "eslint";

export function createConfig(tsconfigRootDir: string, options?: { ignores?: string[] }): Linter.Config[];
