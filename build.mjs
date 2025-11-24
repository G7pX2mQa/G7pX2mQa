import { build, context, serve } from "esbuild";
import fs from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";

const DIST_DIR = "dist";

function resolveDist(...segments) {
  return path.join(DIST_DIR, ...segments);
}

async function buildJs({ minify, sourcemap }) {
  await build({
    entryPoints: ["js/main.js"],
    bundle: true,
    outdir: DIST_DIR,
    minify,
    sourcemap,
  });
}

async function buildCss({ minify, sourcemap }) {
  await build({
    entryPoints: ["css/imports.css"],
    bundle: true,
    outfile: resolveDist("styles.css"),
    minify,
    sourcemap,
    loader: { ".css": "css" },
  });
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
  await Promise.all([
    buildJs({ minify, sourcemap }),
    buildCss({ minify, sourcemap }),
    copyStatic(),
  ]);
}

async function watchAll() {
  const { minify, sourcemap } = modeOptions("dev");

  const jsContext = await context({
    entryPoints: ["js/main.js"],
    bundle: true,
    outdir: DIST_DIR,
    minify,
    sourcemap,
  });

  const cssContext = await context({
    entryPoints: ["css/imports.css"],
    bundle: true,
    outfile: resolveDist("styles.css"),
    minify,
    sourcemap,
    loader: { ".css": "css" },
  });

  await Promise.all([jsContext.watch(), cssContext.watch()]);
  await copyStatic();

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
    await Promise.all([jsContext.dispose(), cssContext.dispose()]);
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