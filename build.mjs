import esbuild from "esbuild";
import fs from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";

const { build, context, serve } = esbuild;

const DIST_DIR = "dist";

function resolveDist(...segments) {
  return path.join(DIST_DIR, ...segments);
}

async function resetDistDir() {
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(DIST_DIR, { recursive: true });
}

const ENTRY_POINTS = {
  bundle: "js/main.js",
  styles: "css/imports.css",
};

function buildOptions({ minify, sourcemap }) {
  return {
    entryPoints: ENTRY_POINTS,
    entryNames: "[name]",
    bundle: true,
    outdir: DIST_DIR,
    minify,
    sourcemap,
    loader: { ".css": "css" },
    external: ["img/*", "sounds/*", "favicon/*"],
  };
}

async function buildAssets({ minify, sourcemap }) {
  await build(buildOptions({ minify, sourcemap }));
}

async function copyOutputsToRoot() {
  const assets = ["bundle.js", "bundle.js.map", "styles.css", "styles.css.map"];
  await Promise.all(
    assets.map(async (asset) => {
      try {
        await fs.access(resolveDist(asset));
        await fs.cp(resolveDist(asset), asset, { force: true });
      } catch (err) {
        if (err.code !== "ENOENT") {
          throw err;
        }
      }
    })
  );
}

async function copyStatic() {
  await fs.mkdir(DIST_DIR, { recursive: true });

  const tasks = [
    fs.cp("index.html", resolveDist("index.html"), { force: true }),
    fs.cp("favicon", resolveDist("favicon"), { recursive: true, force: true }),
    fs.cp("img", resolveDist("img"), { recursive: true, force: true }),
    fs.cp("sounds", resolveDist("sounds"), { recursive: true, force: true }),
  ];

  await Promise.all(tasks);
}

function modeOptions(mode) {
  if (mode === "prod") {
    return { minify: true, sourcemap: false };
  }
  return { minify: false, sourcemap: true };
}

async function buildAll({ mode = "dev" } = {}) {
  const { minify, sourcemap } = modeOptions(mode);
  await resetDistDir();
  await Promise.all([buildAssets({ minify, sourcemap }), copyStatic()]);
  await copyOutputsToRoot();
}

async function watchAll() {
  const { minify, sourcemap } = modeOptions("dev");
  await resetDistDir();
  const buildContext = await context(buildOptions({ minify, sourcemap }));

  const onRebuild = async (error) => {
    if (error) {
      console.error(error);
      return;
    }
    await copyOutputsToRoot();
  };

  await buildContext.watch({ onRebuild });
  await copyStatic();
  await copyOutputsToRoot();

  const staticTargets = [
    { path: "index.html", recursive: false },
    { path: "favicon", recursive: true },
    { path: "img", recursive: true },
    { path: "sounds", recursive: true },
  ];

  const watchers = staticTargets.map(({ path: target, recursive }) =>
    watch(target, { recursive }, async () => {
      await copyStatic();
    })
  );

  process.on("SIGINT", async () => {
    await Promise.all([buildContext.dispose()]);
    watchers.forEach((w) => w.close());
    process.exit(0);
  });
}

async function serveAll({ mode = "dev" } = {}) {
  await buildAll({ mode });
  const server = await serve({ servedir: DIST_DIR, port: 8000 });
  process.on("SIGINT", () => {
    server.stop();
    process.exit(0);
  });
  // Keep process alive
  console.log(`Serving ${DIST_DIR} at http://${server.host || "localhost"}:${server.port}`);
}

function parseMode(args) {
  return args.includes("--prod") ? "prod" : "dev";
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const mode = parseMode(rest);

  if (command === "build") {
    await buildAll({ mode });
    return;
  }

  if (command === "watch") {
    await watchAll();
    return;
  }

  if (command === "serve") {
    await serveAll({ mode });
    return;
  }

  console.log("Usage: node build.mjs [build|watch|serve] [--prod|--dev]");
}

await main();
