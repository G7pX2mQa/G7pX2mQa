const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function run(command) {
  execSync(command, { stdio: "inherit" });
}

function ensureHooksPath(repoRoot) {
  try {
    run("git config core.hooksPath .githooks");
  } catch (err) {
    console.warn("Could not set core.hooksPath:", err?.message ?? err);
  }

  const hooksDir = path.join(repoRoot, ".git", "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });

  const target = path.join(repoRoot, ".githooks", "pre-commit");
  const linkPath = path.join(hooksDir, "pre-commit");

  try {
    const stats = fs.lstatSync(linkPath);
    const isSymlink = stats.isSymbolicLink();
    const pointsToTarget = isSymlink && fs.readlinkSync(linkPath) === target;

    if (!pointsToTarget) {
      fs.rmSync(linkPath, { force: true });
    } else {
      return;
    }
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }

  fs.symlinkSync(target, linkPath);
}

function main() {
  const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" })
    .trim();

  ensureHooksPath(repoRoot);
  console.log("Git hooks installed; pre-commit will sync bundles on js/ or css/ changes.");
}

main();
