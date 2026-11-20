# openspec-grill (`osg`)

项目级 **OpenSpec + `grill-me`** AI 工作流初始化工具（零第三方依赖，Node.js >= 22）。

与全局插件不同，`osg` **不污染任何全局配置**；只在你执行 `osg init` 的项目目录下接入完整工作流（类似 `trellis init`）。

## 前置依赖

```bash
npm install -g @fission-ai/openspec@latest
```

## 安装

```bash
npm install -g openspec-grill
```

安装后全局提供 `osg` 与 `openspec-grill` 两个命令；也可通过 `npx openspec-grill init` 免安装直接运行。

## 在任意新项目接入

```bash
cd /path/to/your-project
osg init
```

默认行为：
- 工具列表：`antigravity-cli,antigravity,claude,codex,cursor`
- 产物语言：`中文`
- Git 策略：**纯本地忽略**（自动幂等追加本地工作流条目到 `.gitignore`，已在 Git 跟踪中的文件自动跳过；如需随仓库提交则传 `--commit`）

执行 `osg init` 会在目标项目内完成：
1. 调用官方 `openspec init --scope project` 生成 `openspec/` 与项目级 `openspec-*` 技能；
2. 补齐通用中文 `openspec/config.yaml`（保留已有自定义配置，传 `--force` 可重置）；
3. 写入 `.agents/skills/grill-me/SKILL.md`（启用 Claude 时同步写入 `.claude/skills/grill-me/SKILL.md`）；
4. 在项目 `AGENTS.md` 写入/更新托管区块 `<!-- OPENSPEC-GRILL:START/END -->`（含复杂度分流判据、动码前询问门禁与标准闭环），不破坏项目原有规则；
5. 若启用 Claude 且项目尚无 `CLAUDE.md`，创建仅含 `@AGENTS.md` 的轻量存根。

## 常用子命令

```powershell
# 初始化（自定义工具 / 随项目提交）
osg init --tools antigravity-cli,claude --commit

# 仅预览变更不写入
osg init --dry-run

# 健康检查（验证 OpenSpec 根、strict 规范校验、grill-me 技能与 AGENTS.md 门禁）
osg doctor

# 同步更新 grill-me 技能、AGENTS.md 托管区块及 OpenSpec 技能
osg update

# 卸载工作流接入（默认保留 openspec/ 下的规范与变更沉淀；传 --remove-openspec 一并删除）
osg uninstall
```
