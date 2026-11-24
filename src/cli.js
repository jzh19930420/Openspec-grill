import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cmdDoctor, cmdInit, cmdUninstall, cmdUpdate } from "./commands.js";

const DEFAULT_TOOLS = "antigravity-cli,antigravity,claude,codex,cursor";
const DEFAULT_LANGUAGE = "中文";

function getVersion() {
  const pkgPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../package.json"
  );
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  return pkg.version;
}

function printHelp() {
  console.log(`openspec-grill (osg) v${getVersion()}

项目级 OpenSpec + grill-me 工作流接入工具（类似 trellis init，仅作用于目标项目）。

用法:
  osg init [path] [options]       在目标项目初始化 OpenSpec + grill-me 工作流
  osg update [path] [options]     更新托管技能、AGENTS.md 区块与 OpenSpec 技能
  osg doctor [path]               检查当前项目工作流接入与规范健康状态
  osg uninstall [path] [options]  移除工作流技能与托管区块（默认保留 openspec/ 沉淀内容）
  osg --version | -v              显示版本
  osg --help | -h                 显示帮助

init 选项:
  --tools <list>       逗号分隔的工具列表 (默认: ${DEFAULT_TOOLS})
  --language <lang>    OpenSpec 产物语言 (默认: ${DEFAULT_LANGUAGE})
  --commit             不修改 .gitignore（默认纯本地忽略）
  --no-gitignore       与 --commit 等价
  --force              覆盖已有自定义 openspec/config.yaml
  --dry-run            仅预览将要执行的变更，不写入文件

update 选项:
  --tools <list>       显式指定需要刷新的工具列表（默认按项目已有目录自动识别）
  --dry-run            仅预览将要执行的变更

uninstall 选项:
  --remove-openspec    同时删除 openspec/ 目录（默认保留 openspec/specs 与 changes）
  --dry-run            仅预览将要执行的变更

示例:
  cd D:\\path\\to\\my-project
  osg init
  osg init --tools antigravity-cli,claude --commit
  osg doctor
  osg update
`);
}

function parseArgs(argv) {
  const positionals = [];
  const flags = {
    tools: null,
    language: DEFAULT_LANGUAGE,
    gitignore: true,
    force: false,
    dryRun: false,
    removeOpenspec: false,
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      flags.help = true;
    } else if (arg === "-v" || arg === "--version") {
      flags.version = true;
    } else if (arg === "--commit" || arg === "--no-gitignore") {
      flags.gitignore = false;
    } else if (arg === "--gitignore") {
      flags.gitignore = true;
    } else if (arg === "--force" || arg === "-f") {
      flags.force = true;
    } else if (arg === "--dry-run") {
      flags.dryRun = true;
    } else if (arg === "--remove-openspec") {
      flags.removeOpenspec = true;
    } else if (arg === "--tools") {
      const value = argv[++i];
      if (!value) {
        throw new Error("--tools 需要提供工具列表参数，例如 --tools antigravity-cli,claude");
      }
      flags.tools = value;
    } else if (arg.startsWith("--tools=")) {
      flags.tools = arg.slice("--tools=".length);
    } else if (arg === "--language") {
      const value = argv[++i];
      if (!value) {
        throw new Error("--language 需要提供语言参数，例如 --language 中文");
      }
      flags.language = value;
    } else if (arg.startsWith("--language=")) {
      flags.language = arg.slice("--language=".length);
    } else if (arg.startsWith("-")) {
      throw new Error(`未知选项: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  return { positionals, flags };
}

export async function runCli(argv) {
  try {
    const { positionals, flags } = parseArgs(argv);

    if (flags.version) {
      console.log(getVersion());
      return 0;
    }

    if (flags.help || positionals.length === 0) {
      printHelp();
      return 0;
    }

    const [command, targetArg] = positionals;
    const targetDir = path.resolve(targetArg || process.cwd());

    switch (command) {
      case "init":
        return await cmdInit(targetDir, {
          tools: flags.tools || DEFAULT_TOOLS,
          language: flags.language,
          gitignore: flags.gitignore,
          force: flags.force,
          dryRun: flags.dryRun,
        });
      case "update":
        return await cmdUpdate(targetDir, {
          tools: flags.tools,
          dryRun: flags.dryRun,
        });
      case "doctor":
        return await cmdDoctor(targetDir);
      case "uninstall":
        return await cmdUninstall(targetDir, {
          removeOpenspec: flags.removeOpenspec,
          dryRun: flags.dryRun,
        });
      case "help":
        printHelp();
        return 0;
      default:
        console.error(`未知命令: ${command}\n运行 "osg --help" 查看用法。`);
        return 1;
    }
  } catch (err) {
    console.error(`错误: ${err.message}`);
    return 1;
  }
}
