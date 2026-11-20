import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

let cachedRunner = undefined;

function resolveOpenSpecRunner() {
  if (cachedRunner !== undefined) {
    return cachedRunner;
  }

  if (process.platform !== "win32") {
    const check = spawnSync("openspec", ["--version"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (!check.error && check.status === 0) {
      cachedRunner = {
        command: "openspec",
        prefixArgs: [],
        version: check.stdout.trim(),
      };
      return cachedRunner;
    }
    cachedRunner = null;
    return null;
  }

  // On Windows, resolve the underlying JS entry point behind openspec.cmd so we
  // invoke node.exe directly without cmd.exe shell quoting or UTF-8 codepage issues.
  const whereResult = spawnSync("where.exe", ["openspec"], {
    encoding: "utf8",
    windowsHide: true,
  });

  const candidates = (whereResult.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    if (lower.endsWith(".exe")) {
      const check = spawnSync(candidate, ["--version"], {
        encoding: "utf8",
        windowsHide: true,
      });
      if (!check.error && check.status === 0) {
        cachedRunner = {
          command: candidate,
          prefixArgs: [],
          version: check.stdout.trim(),
        };
        return cachedRunner;
      }
    }

    if (lower.endsWith(".cmd") || lower.endsWith(".ps1") || !path.extname(candidate)) {
      const binDir = path.dirname(candidate);
      const jsEntry = path.join(
        binDir,
        "node_modules",
        "@fission-ai",
        "openspec",
        "bin",
        "openspec.js"
      );
      if (existsSync(jsEntry)) {
        const check = spawnSync(process.execPath, [jsEntry, "--version"], {
          encoding: "utf8",
          windowsHide: true,
        });
        if (!check.error && check.status === 0) {
          cachedRunner = {
            command: process.execPath,
            prefixArgs: [jsEntry],
            version: check.stdout.trim(),
          };
          return cachedRunner;
        }
      }
    }
  }

  cachedRunner = null;
  return null;
}

export function getOpenSpecVersion() {
  const runner = resolveOpenSpecRunner();
  return runner ? runner.version : null;
}

export function runOpenSpec(args, cwd, { inherit = false } = {}) {
  const runner = resolveOpenSpecRunner();
  if (!runner) {
    throw new Error(
      "未检测到 openspec CLI。请先安装: npm install -g @fission-ai/openspec@latest"
    );
  }

  const result = spawnSync(runner.command, [...runner.prefixArgs, ...args], {
    cwd,
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
    windowsHide: true,
    env: {
      ...process.env,
      OPENSPEC_TELEMETRY: process.env.OPENSPEC_TELEMETRY ?? "0",
    },
  });

  if (result.error) {
    throw result.error;
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}
