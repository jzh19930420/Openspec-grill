import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, "\n");
}

export function writeFileEnsureDir(filePath, content, dryRun = false) {
  if (dryRun) {
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

export function removeIfExists(targetPath, dryRun = false) {
  if (!existsSync(targetPath)) {
    return false;
  }
  if (!dryRun) {
    rmSync(targetPath, { recursive: true, force: true });
  }
  return true;
}

export function upsertManagedBlock(existingContent, startMarker, endMarker, block) {
  const normalized = normalizeLineEndings(existingContent);
  const startIdx = normalized.indexOf(startMarker);
  const endIdx = normalized.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = normalized.slice(0, startIdx).trimEnd();
    const after = normalized.slice(endIdx + endMarker.length).trimStart();
    const parts = [];
    if (before) parts.push(before);
    parts.push(block);
    if (after) parts.push(after);
    return {
      content: `${parts.join("\n\n")}\n`,
      action: "updated",
    };
  }

  const trimmed = normalized.trimEnd();
  if (!trimmed) {
    return {
      content: `${block}\n`,
      action: "created",
    };
  }

  return {
    content: `${trimmed}\n\n${block}\n`,
    action: "appended",
  };
}

export function removeManagedBlock(existingContent, startMarker, endMarker) {
  const normalized = normalizeLineEndings(existingContent);
  const startIdx = normalized.indexOf(startMarker);
  const endIdx = normalized.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return { found: false, content: existingContent };
  }

  const before = normalized.slice(0, startIdx).trimEnd();
  const after = normalized.slice(endIdx + endMarker.length).trimStart();
  const parts = [];
  if (before) parts.push(before);
  if (after) parts.push(after);
  const next = parts.length ? `${parts.join("\n\n")}\n` : "";
  return { found: true, content: next };
}

export function isGitTracked(repoDir, relPath) {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", relPath], {
    cwd: repoDir,
    encoding: "utf8",
    windowsHide: true,
  });
  return !result.error && result.status === 0;
}

export function isGitRepo(dir) {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: dir,
    encoding: "utf8",
    windowsHide: true,
  });
  return !result.error && result.status === 0 && result.stdout.trim() === "true";
}

export function readTextSafe(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }
  return readFileSync(filePath, "utf8");
}

export function isDefaultOpenSpecConfig(content) {
  const lines = normalizeLineEndings(content)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const hasCustomSections = lines.some(
    (line) => line.startsWith("rules:") || line.startsWith("operations:")
  );
  return !hasCustomSections;
}
