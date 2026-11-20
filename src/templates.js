export const AGENTS_START_MARKER = "<!-- OPENSPEC-GRILL:START -->";
export const AGENTS_END_MARKER = "<!-- OPENSPEC-GRILL:END -->";
export const CLAUDE_STUB_MARKER = "<!-- OPENSPEC-GRILL:CLAUDE-STUB -->";
export const GITIGNORE_START_MARKER = "# >>> openspec-grill (local workflow) >>>";
export const GITIGNORE_END_MARKER = "# <<< openspec-grill <<<";

export const OPENSPEC_SKILL_DIRS = [
  "openspec-apply-change",
  "openspec-archive-change",
  "openspec-bulk-archive-change",
  "openspec-continue-change",
  "openspec-explore",
  "openspec-ff-change",
  "openspec-new-change",
  "openspec-onboard",
  "openspec-propose",
  "openspec-sync-specs",
  "openspec-update-change",
  "openspec-verify-change",
];

export function renderGrillMeSkill() {
  return `---
name: grill-me
description: Relentless, design-tree interview to stress-test a plan, requirement, or architecture decision before proposing an OpenSpec change. Use ONLY when the user explicitly invokes /grill-me, asks to grill/interview their plan, or confirms choosing grill-me after complexity triage.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:

\`\`\`
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
\`\`\`

Word each question so "yes" accepts your recommended answer. Match the project's primary language (default Chinese).

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

**Finding facts is your job, never the user's.** Before asking any question that depends on existing code, schemas, protocols, or contracts, inspect the codebase yourself (use CodeGraph \`codegraph_explore\` when \`.codegraph/\` exists, read relevant source files, and check \`openspec/specs/\`) — or dispatch a read-only research subagent when exploration is broad. Do not ask the user for anything you could look up in the repository. Don't block on long exploration: only questions downstream of an open lookup wait; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

**Stateless & OpenSpec handoff:** Do not write stray files (\`GLOSSARY.md\`, \`docs/adr/\`, or code edits) during the interview. The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Summarize the settled decisions concisely and wait for confirmation; once confirmed, hand off cleanly to \`/openspec-propose\` to persist the plan into \`openspec/changes/\`.
`;
}

export function renderAgentsManagedBlock() {
  return `${AGENTS_START_MARKER}
## AI 工作流（OpenSpec + grill-me）

本项目采用 **OpenSpec + \`grill-me\`** 作为 AI 协作工作流：

### 动码前复杂度分流与询问门禁

收到开发或修改需求后，在编辑产品代码前先判断复杂度。**命中以下任一条即判为复杂需求**：

1. **跨层或跨项目改动**：同时涉及多个模块/端（如前后端、多服务、DB），或预计改动超过 3 个关键文件；
2. **契约与结构变更**：涉及数据库表结构、API/RPC 协议、已有 \`openspec/specs/\` 契约、多端同步发布或公共接口变更；
3. **边界不清或重构**：需求存在明显歧义、有多种架构/交互取舍，或属于模块级重构。

分流规则：

- **纯问答 / 排查 / 简单明确的小改动或单点 Bug**：直接按项目工程规范处理与验证，**不要**多余询问是否走工作流。
- **命中复杂需求**（且当前未处于已批准的 OpenSpec change 中、用户也未明确说“直接改 / 跳过工作流”）：**先不编辑代码**，用 1~2 句话说明为何判为复杂需求，询问用户选择：
  1. 先用 \`grill-me\` 拷问对齐，再进入 \`/openspec-propose\`；
  2. 直接 \`/openspec-propose\` 生成规划产物；
  3. 跳过工作流直接修改。
  待用户明确回复后再执行对应分支。

### 标准执行步骤（进入工作流后）

1. **\`grill-me\`（无状态设计树访谈）**：按轮次收敛需求边界、取舍和验收标准；凡是能通过代码检索（有 \`.codegraph/\` 时优先 \`codegraph_explore\`）、读源码或 \`openspec/specs/\` 确认的技术事实须先自行核查，不向用户问事实性问题，也不在仓库中额外创建 \`GLOSSARY.md\` / \`docs/adr/\`。
2. **\`/openspec-propose\`**：达成共识后在 \`openspec/changes/<change>/\` 下生成规划产物（\`proposal.md\`、delta \`specs/\`、\`design.md\`、\`tasks.md\`），等待用户确认，不自动进入改码。
3. **\`/openspec-apply-change\` → \`/openspec-archive-change\`**：用户确认后逐项实施并验证；验收通过后归档，将增量规范合并回 \`openspec/specs/\`。

- **系统规范真相源**：核心模块契约沉淀在 \`openspec/specs/\`，配置在 \`openspec/config.yaml\`。修改相关模块前先读对应 \`openspec/specs/<capability>/spec.md\`。
${AGENTS_END_MARKER}`;
}

export function renderClaudeStub() {
  return `${CLAUDE_STUB_MARKER}
# CLAUDE.md

通用项目规范与 OpenSpec + grill-me 工作流约定统一维护在 \`AGENTS.md\`：

@AGENTS.md
`;
}

export function renderOpenSpecConfig(language) {
  return `schema: spec-driven

context: |
  Language: ${language}
  All artifacts must be written in ${language}.
  Keep OpenSpec structural headings and SHALL/MUST keywords in English.
  项目特有背景（技术栈、构建/测试命令、目录边界等）请补充在下方或项目 AGENTS.md 中。

rules:
  proposal:
    - 简明说明问题背景、改动目标与明确的非目标（Out of Scope）。
    - 若涉及数据库表结构、接口/协议变更或跨端发布，须显式标出。
  specs:
    - 严格遵循 OpenSpec 主/增量规范格式：结构标题与 SHALL/MUST 关键字保留英文，正文用 ${language}。
    - 每个 Requirement 保持精炼（避免超长段落），将具体案例与边界条件拆到 #### Scenario（- **WHEN** / - **THEN**）中。
  design:
    - 涉及跨层或结构改动时，写清接口契约、数据/状态边界、兼容性与回滚方案。
  tasks:
    - 按可独立编译和验证的小步拆分任务清单。
    - 明确区分自动化验证命令与需要人工确认的验收项。

operations:
  apply:
    guidance:
      - 实施前先阅读相关 openspec/specs/ 与受影响代码，避免破坏已有契约。
      - 完成后执行项目构建或测试验证，如实汇报结果与未自动化的验收项。
      - 不要擅自执行 git commit / git push 或未经授权的数据库写操作。
  archive:
    guidance:
      - 归档前运行 openspec validate --specs --strict 确认主规范有效。
      - 汇总本次合并到 openspec/specs/ 的变更，将 Git 提交交由用户决定。
`;
}
