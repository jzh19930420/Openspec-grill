import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { getOpenSpecVersion, runOpenSpec } from "./openspec.js";
import {
  AGENTS_END_MARKER,
  AGENTS_START_MARKER,
  CLAUDE_STUB_MARKER,
  GITIGNORE_END_MARKER,
  GITIGNORE_START_MARKER,
  OPENSPEC_SKILL_DIRS,
  renderAgentsManagedBlock,
  renderClaudeStub,
  renderGrillMeSkill,
  renderOpenSpecConfig,
} from "./templates.js";
import {
  isDefaultOpenSpecConfig,
  isGitRepo,
  isGitTracked,
  normalizeLineEndings,
  readTextSafe,
  removeIfExists,
  removeManagedBlock,
  upsertManagedBlock,
  writeFileEnsureDir,
} from "./fs-utils.js";

const AGENTS_ROOT_TOOLS = new Set([
  "antigravity",
  "antigravity-cli",
  "codex",
  "cursor",
  "agents",
  "amp",
  "zed",
  "gsd",
]);

function parseTools(toolsCsv) {
  return toolsCsv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function getGrillSkillRoots(targetDir, toolsList) {
  const roots = new Set();
  if (toolsList && toolsList.length > 0) {
    const includesClaude = toolsList.includes("claude") || toolsList.includes("all");
    const includesSharedAgents =
      toolsList.includes("all") || toolsList.some((t) => AGENTS_ROOT_TOOLS.has(t));
    if (includesSharedAgents || !includesClaude) {
      roots.add(path.join(targetDir, ".agents", "skills"));
    }
    if (includesClaude) {
      roots.add(path.join(targetDir, ".claude", "skills"));
    }
    return [...roots];
  }

  // Auto-detect for `update`
  if (existsSync(path.join(targetDir, ".agents", "skills"))) {
    roots.add(path.join(targetDir, ".agents", "skills"));
  }
  if (existsSync(path.join(targetDir, ".claude", "skills"))) {
    roots.add(path.join(targetDir, ".claude", "skills"));
  }
  if (roots.size === 0) {
    roots.add(path.join(targetDir, ".agents", "skills"));
  }
  return [...roots];
}

function ensureTargetDir(targetDir) {
  if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
    throw new Error(`目标目录不存在或不是文件夹: ${targetDir}`);
  }
}

function updateGitignore(targetDir, toolsList, dryRun) {
  const gitignorePath = path.join(targetDir, ".gitignore");
  const existing = readTextSafe(gitignorePath) || "";
  const existingLines = new Set(
    normalizeLineEndings(existing)
      .split("\n")
      .map((l) => l.trim())
  );

  const inGit = isGitRepo(targetDir);
  const includesClaude = toolsList.includes("claude") || toolsList.includes("all");
  const candidates = [
    { pattern: "/openspec", relPath: "openspec" },
    { pattern: "/.agents/skills", relPath: ".agents/skills" },
    ...(includesClaude ? [{ pattern: "/.claude", relPath: ".claude" }] : []),
    { pattern: "/AGENTS.md", relPath: "AGENTS.md" },
    ...(includesClaude ? [{ pattern: "/CLAUDE.md", relPath: "CLAUDE.md" }] : []),
  ];

  // Strip our old managed block before checking which entries already exist elsewhere
  const withoutManaged = removeManagedBlock(
    existing,
    GITIGNORE_START_MARKER,
    GITIGNORE_END_MARKER
  ).content;
  const outsideLines = new Set(
    normalizeLineEndings(withoutManaged)
      .split("\n")
      .map((l) => l.trim())
  );

  const toIgnore = [];
  const skippedTracked = [];

  for (const item of candidates) {
    if (inGit && isGitTracked(targetDir, item.relPath)) {
      skippedTracked.push(item.relPath);
      continue;
    }
    if (outsideLines.has(item.pattern) || outsideLines.has(item.relPath)) {
      continue;
    }
    toIgnore.push(item.pattern);
  }

  if (toIgnore.length === 0) {
    return {
      changed: false,
      added: [],
      skippedTracked,
      hadExisting: existingLines.size > 0,
    };
  }

  const block = [
    GITIGNORE_START_MARKER,
    ...toIgnore,
    GITIGNORE_END_MARKER,
  ].join("\n");

  const { content } = upsertManagedBlock(
    existing,
    GITIGNORE_START_MARKER,
    GITIGNORE_END_MARKER,
    block
  );

  writeFileEnsureDir(gitignorePath, content, dryRun);
  return { changed: true, added: toIgnore, skippedTracked };
}

export async function cmdInit(targetDir, options) {
  ensureTargetDir(targetDir);
  const { tools, language, gitignore, force, dryRun } = options;
  const toolsList = parseTools(tools);
  const openspecVersion = getOpenSpecVersion();

  if (!openspecVersion) {
    throw new Error(
      "未检测到 openspec CLI。请先全局安装:\n  npm install -g @fission-ai/openspec@latest"
    );
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}正在初始化 OpenSpec + grill-me 工作流: ${targetDir}`
  );
  console.log(`  OpenSpec CLI: v${openspecVersion}`);
  console.log(`  目标工具:     ${toolsList.join(", ")}`);
  console.log(`  产物语言:     ${language}`);
  console.log(`  Git 策略:     ${gitignore ? "纯本地忽略 (.gitignore)" : "允许提交 (--commit)"}`);

  // 1. Run official `openspec init`
  if (dryRun) {
    console.log(
      `[dry-run] 将执行: openspec init --tools "${tools}" --scope project --language "${language}" --no-animation`
    );
  } else {
    const res = runOpenSpec(
      [
        "init",
        "--tools",
        tools,
        "--scope",
        "project",
        "--language",
        language,
        "--no-animation",
      ],
      targetDir
    );
    if (res.status !== 0) {
      throw new Error(
        `openspec init 执行失败 (exit ${res.status}):\n${res.stderr || res.stdout}`
      );
    }
    console.log("✔ 已完成 openspec init（生成 openspec/ 与项目级 openspec-* 技能）");
  }

  // 2. Enrich openspec/config.yaml
  const configPath = path.join(targetDir, "openspec", "config.yaml");
  const existingConfig = readTextSafe(configPath);
  if (force || existingConfig === null || isDefaultOpenSpecConfig(existingConfig)) {
    writeFileEnsureDir(configPath, renderOpenSpecConfig(language), dryRun);
    console.log("✔ 已写入 openspec/config.yaml 通用规则与操作指引");
  } else {
    console.log("• 保留已自定义的 openspec/config.yaml（传 --force 可重置）");
  }

  // 3. Install grill-me skill
  const skillRoots = getGrillSkillRoots(targetDir, toolsList);
  const skillContent = renderGrillMeSkill();
  for (const root of skillRoots) {
    const skillPath = path.join(root, "grill-me", "SKILL.md");
    writeFileEnsureDir(skillPath, skillContent, dryRun);
    console.log(`✔ 已写入技能: ${path.relative(targetDir, skillPath)}`);
  }

  // 4. Upsert managed block in AGENTS.md
  const agentsPath = path.join(targetDir, "AGENTS.md");
  const existingAgents = readTextSafe(agentsPath);
  if (existingAgents === null) {
    const initial = `# Repository Guidelines\n\n${renderAgentsManagedBlock()}\n`;
    writeFileEnsureDir(agentsPath, initial, dryRun);
    console.log("✔ 已创建 AGENTS.md（含复杂度分流与动码前询问门禁）");
  } else {
    const { content, action } = upsertManagedBlock(
      existingAgents,
      AGENTS_START_MARKER,
      AGENTS_END_MARKER,
      renderAgentsManagedBlock()
    );
    writeFileEnsureDir(agentsPath, content, dryRun);
    console.log(
      `✔ 已${action === "updated" ? "更新" : "追加"} AGENTS.md 中的 OpenSpec + grill-me 托管区块`
    );
  }

  // 5. Optional CLAUDE.md stub when claude is enabled and CLAUDE.md does not exist
  if (toolsList.includes("claude") || toolsList.includes("all")) {
    const claudePath = path.join(targetDir, "CLAUDE.md");
    const existingClaude = readTextSafe(claudePath);
    if (existingClaude === null) {
      writeFileEnsureDir(claudePath, renderClaudeStub(), dryRun);
      console.log("✔ 已创建 CLAUDE.md（通过 @AGENTS.md 复用规则）");
    } else if (!existingClaude.includes("@AGENTS.md")) {
      console.log(
        "• 检测到已有 CLAUDE.md 且未包含 @AGENTS.md，未自动改写（建议手动添加 @AGENTS.md）"
      );
    }
  }

  // 6. .gitignore local-only ignore
  if (gitignore) {
    const gi = updateGitignore(targetDir, toolsList, dryRun);
    if (gi.changed) {
      console.log(`✔ 已更新 .gitignore（新增本地忽略: ${gi.added.join(", ")}）`);
    } else {
      console.log("• .gitignore 无需新增条目（已覆盖或已跟踪）");
    }
    if (gi.skippedTracked.length > 0) {
      console.log(
        `  提示: 以下文件已在 Git 跟踪中，未加入忽略: ${gi.skippedTracked.join(", ")}`
      );
    }
  }

  console.log("\n接入完成！常用流程:");
  console.log("  1. 复杂/模糊需求: 先用 grill-me 拷问对齐 → /openspec-propose → 审完 /openspec-apply-change → /openspec-archive-change");
  console.log("  2. 健康检查:      osg doctor");
  console.log("  3. 重启/新开 AI 会话以加载新安装的技能。");
  return 0;
}

export async function cmdUpdate(targetDir, options) {
  ensureTargetDir(targetDir);
  const { tools, dryRun } = options;

  if (!existsSync(path.join(targetDir, "openspec"))) {
    throw new Error(
      `当前目录尚未初始化 openspec/。请先执行: osg init`
    );
  }

  const toolsList = tools ? parseTools(tools) : null;
  const skillRoots = getGrillSkillRoots(targetDir, toolsList);
  const skillContent = renderGrillMeSkill();

  for (const root of skillRoots) {
    const skillPath = path.join(root, "grill-me", "SKILL.md");
    writeFileEnsureDir(skillPath, skillContent, dryRun);
    console.log(`✔ 已刷新技能: ${path.relative(targetDir, skillPath)}`);
  }

  const agentsPath = path.join(targetDir, "AGENTS.md");
  const existingAgents = readTextSafe(agentsPath);
  if (existingAgents !== null) {
    const { content } = upsertManagedBlock(
      existingAgents,
      AGENTS_START_MARKER,
      AGENTS_END_MARKER,
      renderAgentsManagedBlock()
    );
    writeFileEnsureDir(agentsPath, content, dryRun);
    console.log("✔ 已刷新 AGENTS.md 托管区块");
  } else {
    console.log("• 未找到 AGENTS.md，跳过规则区块刷新（可运行 osg init 补建）");
  }

  if (dryRun) {
    console.log("[dry-run] 将执行: openspec update");
  } else {
    const res = runOpenSpec(["update"], targetDir);
    if (res.status !== 0) {
      throw new Error(`openspec update 失败:\n${res.stderr || res.stdout}`);
    }
    console.log("✔ 已完成 openspec update");
  }

  return 0;
}

export async function cmdDoctor(targetDir) {
  ensureTargetDir(targetDir);
  let failures = 0;

  const check = (ok, label, detail = "") => {
    const icon = ok ? "✔" : "✗";
    console.log(`${icon} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures += 1;
  };

  // 1. OpenSpec CLI
  const ver = getOpenSpecVersion();
  check(Boolean(ver), "OpenSpec CLI", ver ? `v${ver}` : "未安装");

  // 2. openspec/ & config.yaml
  const openspecDir = path.join(targetDir, "openspec");
  const configPath = path.join(openspecDir, "config.yaml");
  check(existsSync(openspecDir), "openspec/ 目录", existsSync(openspecDir) ? "存在" : "缺失，请运行 osg init");
  check(existsSync(configPath), "openspec/config.yaml", existsSync(configPath) ? "存在" : "缺失");

  // 3. openspec doctor + validate --specs --strict
  if (ver && existsSync(openspecDir)) {
    const doc = runOpenSpec(["doctor", "--json"], targetDir);
    let healthy = false;
    try {
      const parsed = JSON.parse(doc.stdout);
      healthy = Boolean(parsed?.root?.healthy);
    } catch {
      healthy = doc.status === 0;
    }
    check(healthy, "openspec doctor", healthy ? "healthy" : (doc.stderr || doc.stdout).trim());

    const specsDir = path.join(openspecDir, "specs");
    const hasSpecs =
      existsSync(specsDir) &&
      readdirSync(specsDir).some((name) => name !== ".gitkeep");
    if (hasSpecs) {
      const val = runOpenSpec(["validate", "--specs", "--strict"], targetDir);
      check(
        val.status === 0,
        "openspec validate --specs --strict",
        val.status === 0 ? "全部通过" : (val.stdout || val.stderr).trim().split("\n")[0]
      );
    } else {
      console.log("• openspec/specs/ 暂无主规范，跳过 strict 校验");
    }
  }

  // 4. grill-me & openspec-* skills
  const agentsGrill = path.join(targetDir, ".agents", "skills", "grill-me", "SKILL.md");
  const agentsPropose = path.join(targetDir, ".agents", "skills", "openspec-propose", "SKILL.md");
  check(existsSync(agentsGrill), ".agents/skills/grill-me/SKILL.md", existsSync(agentsGrill) ? "就绪" : "缺失");
  check(existsSync(agentsPropose), ".agents/skills/openspec-propose/SKILL.md", existsSync(agentsPropose) ? "就绪" : "缺失");

  if (existsSync(path.join(targetDir, ".claude"))) {
    const claudeGrill = path.join(targetDir, ".claude", "skills", "grill-me", "SKILL.md");
    const claudePropose = path.join(targetDir, ".claude", "skills", "openspec-propose", "SKILL.md");
    check(existsSync(claudeGrill), ".claude/skills/grill-me/SKILL.md", existsSync(claudeGrill) ? "就绪" : "缺失");
    check(existsSync(claudePropose), ".claude/skills/openspec-propose/SKILL.md", existsSync(claudePropose) ? "就绪" : "缺失");
  }

  // 5. AGENTS.md managed block
  const agentsText = readTextSafe(path.join(targetDir, "AGENTS.md")) || "";
  const hasBlock =
    agentsText.includes(AGENTS_START_MARKER) && agentsText.includes(AGENTS_END_MARKER);
  const hasManualWorkflow = agentsText.includes("OpenSpec + `grill-me`");
  check(
    hasBlock || hasManualWorkflow,
    "AGENTS.md 分流门禁",
    hasBlock
      ? "托管区块就绪"
      : hasManualWorkflow
        ? "已手动配置（未带托管标记）"
        : "缺失，请运行 osg init"
  );

  return failures === 0 ? 0 : 1;
}

export async function cmdUninstall(targetDir, options) {
  ensureTargetDir(targetDir);
  const { removeOpenspec, dryRun } = options;

  console.log(`${dryRun ? "[dry-run] " : ""}正在卸载 OpenSpec + grill-me 工作流: ${targetDir}`);

  // 1. Remove grill-me & openspec-* skills
  const skillRoots = [
    path.join(targetDir, ".agents", "skills"),
    path.join(targetDir, ".claude", "skills"),
  ];
  for (const root of skillRoots) {
    if (!existsSync(root)) continue;
    for (const skillName of ["grill-me", ...OPENSPEC_SKILL_DIRS]) {
      const skillDir = path.join(root, skillName);
      if (removeIfExists(skillDir, dryRun)) {
        console.log(`✔ 已移除: ${path.relative(targetDir, skillDir)}`);
      }
    }
    const targetMarker = path.join(root, ".openspec-target");
    if (removeIfExists(targetMarker, dryRun)) {
      console.log(`✔ 已移除: ${path.relative(targetDir, targetMarker)}`);
    }
  }

  // 2. Remove managed block from AGENTS.md
  const agentsPath = path.join(targetDir, "AGENTS.md");
  const agentsText = readTextSafe(agentsPath);
  if (agentsText !== null) {
    const { found, content } = removeManagedBlock(
      agentsText,
      AGENTS_START_MARKER,
      AGENTS_END_MARKER
    );
    if (found) {
      const stripped = content.trim();
      if (!stripped || stripped === "# Repository Guidelines") {
        removeIfExists(agentsPath, dryRun);
        console.log("✔ 已移除仅含托管区块的 AGENTS.md");
      } else {
        writeFileEnsureDir(agentsPath, content, dryRun);
        console.log("✔ 已从 AGENTS.md 移除托管区块（保留项目原有规则）");
      }
    }
  }

  // 3. Remove CLAUDE.md only if created as our stub
  const claudePath = path.join(targetDir, "CLAUDE.md");
  const claudeText = readTextSafe(claudePath);
  if (claudeText !== null && claudeText.includes(CLAUDE_STUB_MARKER)) {
    removeIfExists(claudePath, dryRun);
    console.log("✔ 已移除自动生成的 CLAUDE.md 存根");
  }

  // 4. Remove managed block from .gitignore
  const gitignorePath = path.join(targetDir, ".gitignore");
  const gitignoreText = readTextSafe(gitignorePath);
  if (gitignoreText !== null) {
    const { found, content } = removeManagedBlock(
      gitignoreText,
      GITIGNORE_START_MARKER,
      GITIGNORE_END_MARKER
    );
    if (found) {
      writeFileEnsureDir(gitignorePath, content, dryRun);
      console.log("✔ 已从 .gitignore 移除 openspec-grill 忽略区块");
    }
  }

  // 5. Preserve openspec/ by default
  const openspecDir = path.join(targetDir, "openspec");
  if (removeOpenspec) {
    if (removeIfExists(openspecDir, dryRun)) {
      console.log("✔ 已删除 openspec/ 目录");
    }
  } else if (existsSync(openspecDir)) {
    console.log("• 已保留 openspec/ 目录中的规范与变更历史（如需一并删除请加 --remove-openspec）");
  }

  return 0;
}
