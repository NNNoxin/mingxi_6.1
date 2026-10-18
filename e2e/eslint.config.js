import { createConfig } from "@mingxi/config/eslint";

// .artifacts 是截图输出与本地排查脚本目录（已被 git 忽略）。
export default createConfig(import.meta.dirname, { ignores: [".artifacts/**"] });
