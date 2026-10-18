// 一次性导入：把明晰 demo 5 基准提交（81f92d7）的界面文件原样复制进 packages/ui。
// 唯一的改动是把 "@/..." 别名导入改写为包内相对路径（docs/02 §1.4 允许的第 1 类改动）。
// 用法：node packages/ui/scripts/import-baseline.mjs <基准仓库目录>
// 之后对这些文件的任何改动都必须登记在 packages/ui/BASELINE.md 的“偏离清单”里。
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASELINE_COMMIT = "81f92d7";
const baselineRoot = resolve(process.argv[2] ?? "");
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const head = execFileSync("git", ["-C", baselineRoot, "rev-parse", "--short=7", "HEAD"]).toString().trim();
if (head !== BASELINE_COMMIT) {
  throw new Error(`基准仓库必须检出在 ${BASELINE_COMMIT}，当前是 ${head}`);
}

/** [基准路径, packages/ui/src 下的目标路径] */
const FILES = [
  ["app/globals.css", "styles/globals.css"],
  ["components/demo/FloatBall.tsx"],
  ["components/demo/OppoPhoneDemo.tsx"],
  ["components/demo/oppo-phone-demo.css"],
  ["components/mindtrace/ServiceWorkerRegister.tsx"],
  ["components/mingxi/DomainFanAtlas.tsx"],
  ["components/mingxi/DomainPurposeRail.tsx"],
  ["components/mingxi/ExternalVerificationFlow.tsx"],
  ["components/mingxi/KnowledgeExpansionDemo.tsx"],
  ["components/mingxi/LogicChainDeliveryCard.tsx"],
  ["components/mingxi/LogicMindMap.tsx"],
  ["components/mingxi/MarkdownView.tsx"],
  ["components/mingxi/NoteMediaView.tsx"],
  ["components/mingxi/ProductAgentPanels.tsx"],
  ["components/mingxi/ProductDemoTour.tsx"],
  ["components/mingxi/ThinkLogicNoteUi.tsx"],
  ["components/mingxi/ThinkLogicReplayDemo.tsx"],
  ["components/mingxi/ThinkLogicReportDrawer.tsx"],
  ["components/mingxi/WebWorkbench.tsx"],
  ["components/mingxi/external-verification-flow.css"],
  ["components/mingxi/knowledge-expansion-demo.css"],
  ["components/mingxi/logic-chain-delivery-card.css"],
  ["components/mingxi/product-demo-tour.css"],
  ["components/mingxi/think-logic-demo.css"],
  ["components/mingxi/web-workbench.css"],
  ["data/mingxi/eval/vocab/domain-backbone.json"],
  ["data/mingxi/eval/vocab/domain-synonyms.json"],
  ["lib/mingxi/demo/product-tour-script.ts"],
  ["lib/mingxi/demo/tour-bus.ts"],
  ["lib/mingxi/intent/canonicalize-domain.ts"],
  ["lib/mingxi/web/domain-coverage.ts"],
  ["lib/mingxi/web/external-verification.ts"],
  ["lib/mingxi/web/note-media.ts"],
  ["lib/mingxi/web/think-demo-notes.ts"],
  ["lib/mingxi/web/think-replay-cases.ts"],
  ["lib/mingxi/web/think-replay-contrast-deep.ts"],
  ["lib/mingxi/web/think-replay-live.ts"],
  ["lib/mingxi/web/think-replay-notegraph.ts"],
  ["lib/mingxi/web/think-replay-report.ts"],
  ["lib/mingxi/web/think-replay-script.ts"],
  ["lib/mingxi/web/think-replay-skill-loop.ts"],
  ["lib/mingxi/web/think-replay-stm.ts"],
  ["lib/mingxi/web/think-replay-types.ts"],
];

const IMPORT_PATTERN = /((?:from|import)\s*\(?\s*["'])@\/([^"']+)(["'])/g;

function rewriteImports(source, targetRel) {
  let count = 0;
  const rewritten = source.replace(IMPORT_PATTERN, (_match, before, aliased, after) => {
    const mapped = FILES.find(
      ([from]) => from.replace(/\.(tsx?|css|json)$/, "") === aliased.replace(/\.(tsx?|css|json)$/, ""),
    );
    if (!mapped) throw new Error(`${targetRel} 引用了不在导入清单里的模块：@/${aliased}`);
    const mappedTarget = mapped[1] ?? mapped[0];
    const keepExtension = /\.(css|json)$/.test(aliased);
    let spec = relative(
      dirname(targetRel),
      keepExtension ? mappedTarget : mappedTarget.replace(/\.(tsx?)$/, ""),
    );
    if (!spec.startsWith(".")) spec = `./${spec}`;
    count += 1;
    return `${before}${spec}${after}`;
  });
  return { rewritten, count };
}

const manifest = [];
for (const [from, to = from] of FILES) {
  const source = await readFile(join(baselineRoot, from), "utf8");
  const { rewritten, count } = /\.(tsx?|css)$/.test(from)
    ? rewriteImports(source, to)
    : { rewritten: source, count: 0 };
  const target = join(packageRoot, "src", to);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, rewritten);
  manifest.push({ from, to: `src/${to}`, rewrittenImports: count });
}
await writeFile(
  join(packageRoot, "baseline-manifest.json"),
  `${JSON.stringify({ baseline: { repo: "noxinsun-source/mingxi-demo-5", commit: BASELINE_COMMIT }, files: manifest }, null, 2)}\n`,
);
process.stdout.write(
  `已导入 ${manifest.length} 个文件，改写导入 ${manifest.reduce((n, f) => n + f.rewrittenImports, 0)} 处\n`,
);
