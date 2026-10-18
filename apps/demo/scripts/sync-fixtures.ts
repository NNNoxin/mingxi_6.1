// 把 packages/demo-data 的录制数据复制到 public/demo-fixtures（该目录被 git 忽略，每次构建重新生成）。
import { cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../../../packages/demo-data/fixtures/", import.meta.url));
const target = fileURLToPath(new URL("../public/demo-fixtures/", import.meta.url));

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
process.stdout.write(`演示数据已同步到 ${target}\n`);
