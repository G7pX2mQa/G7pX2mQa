import esbuild from "esbuild";
import fs from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";

const { build, context, serve } = esbuild;

const DIST_DIR = "dist";
const APP_ENTRY = "app.js";
const STYLES_ENTRY = "css/imports.css";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveDist(...segments) {
  return path.join(DIST_DIR, ...segments);
}

const BUSY_DIR_CODES = new Set(["EBUSY", "EPERM", "ENOTEMPTY"]);

async function resetDistDir() {
  const maxAttempts = 5;
  let removed = false;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.rm(DIST_DIR, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 150,
      });
      removed = true;
      break;
    } catch (err) {
      lastError = err;
      if (!BUSY_DIR_CODES.has(err?.code)) throw err;
      if (attempt < maxAttempts) {
        await delay(attempt * 200);
      }
    }
  }

  if (!removed && BUSY_DIR_CODES.has(lastError?.code)) {
    const tempDist = `${DIST_DIR}-${Date.now()}.tmp`;

    try {
      await fs.rename(DIST_DIR, tempDist);
      await fs.rm(tempDist, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
      removed = true;
    } catch (cleanupErr) {
      cleanupErr.cause = lastError;
      throw cleanupErr;
    }
  }

  if (!removed && lastError) throw lastError;

  await fs.mkdir(DIST_DIR, { recursive: true });
}

function minifyHtmlChunk(chunk) {
  if (!chunk || !chunk.includes("<")) return chunk;

  // Remove HTML comments (including legacy single-line ones) before whitespace collapsing.
  const withoutComments = chunk.replace(/<!--([\s\S]*?)-->/g, "");

  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;
  let lastWasSpace = false;
  let out = "";

  for (let i = 0; i < withoutComments.length; i += 1) {
    const ch = withoutComments[i];

    if (escaped) {
      out += ch;
      escaped = false;
      lastWasSpace = false;
      continue;
    }

    if (ch === "\\") {
      out += ch;
      escaped = true;
      lastWasSpace = false;
      continue;
    }

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      out += ch;
      lastWasSpace = false;
      continue;
    }

    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      out += ch;
      lastWasSpace = false;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && /\s/.test(ch)) {
      if (!lastWasSpace) {
        out += " ";
        lastWasSpace = true;
      }
      continue;
    }

    lastWasSpace = false;
    out += ch;
  }

  return out.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
}

function minifyTemplateBody(body) {
  if (!body || !body.includes("<")) return body;

  const parts = [];
  let cursor = 0;

  while (cursor < body.length) {
    const exprIdx = body.indexOf("${", cursor);

    if (exprIdx === -1) {
      parts.push({ type: "text", value: body.slice(cursor) });
      break;
    }

    parts.push({ type: "text", value: body.slice(cursor, exprIdx) });

    let braceDepth = 1;
    let i = exprIdx + 2;

    while (i < body.length && braceDepth > 0) {
      const ch = body[i];

      if (ch === "\\") {
        i += 2;
        continue;
      }

      if (ch === "{") braceDepth += 1;
      else if (ch === "}") braceDepth -= 1;

      i += 1;
    }

    parts.push({ type: "expr", value: body.slice(exprIdx, i) });
    cursor = i;
  }

  return parts
    .map((part) => (part.type === "text" ? minifyHtmlChunk(part.value) : part.value))
    .join("");
}

function htmlTemplateMinifierPlugin({ enabled }) {
  return {
    name: "html-template-minifier",
    setup(build) {
      if (!enabled) return;

      build.onLoad({ filter: /\.js$/ }, async (args) => {
        if (args.path.includes("node_modules")) return;
        const source = await fs.readFile(args.path, "utf8");

        let output = "";
        let cursor = 0;

        while (cursor < source.length) {
          const start = source.indexOf("`", cursor);
          if (start === -1) {
            output += source.slice(cursor);
            break;
          }

          output += source.slice(cursor, start + 1);
          let i = start + 1;
          let body = "";
          let escaped = false;

          while (i < source.length) {
            const ch = source[i];

            if (escaped) {
              body += ch;
              escaped = false;
              i += 1;
              continue;
            }

            if (ch === "\\") {
              body += ch;
              escaped = true;
              i += 1;
              continue;
            }

            if (ch === "`") {
              output += minifyTemplateBody(body) + "`";
              cursor = i + 1;
              break;
            }

            body += ch;
            i += 1;
          }
        }

        return { contents: output, loader: "js" };
      });
    },
  };
}

function collectOutputsByType(metafile) {
  const outputs = metafile?.outputs || {};
  const scripts = new Set();
  const styles = new Set();

  for (const [outfile, meta] of Object.entries(outputs)) {
    if (outfile.endsWith(".js")) {
      scripts.add(path.basename(outfile));
    }
    if (outfile.endsWith(".css")) {
      styles.add(path.basename(outfile));
    }
    if (meta?.cssBundle) {
      styles.add(path.basename(meta.cssBundle));
    }
  }

  return { scripts: Array.from(scripts), styles: Array.from(styles) };
}

function injectAssets(template, { scripts, styles, minify }) {
  let output = template
    .replace(/<link[^>]+href="\.\/styles\.css"[^>]*>\s*/g, "")
    .replace(/<script[^>]+src="\.\/bundle\.js"[^>]*><\/script>\s*/g, "");

  const styleTags = styles
    .map((file) => `  <link rel="stylesheet" href="./${file}">`)
    .join("\n");
  const scriptTags = scripts
    .map((file) => `  <script type="module" src="./${file}"></script>`)
    .join("\n");

  if (styleTags) {
    output = output.replace("</head>", `${styleTags}\n</head>`);
  }

  if (scriptTags) {
    output = output.replace("</body>", `${scriptTags}\n</body>`);
  }

  return minify ? minifyHtmlChunk(output) : output;
}

function htmlOutputPlugin({ template, minify }) {
  const templatePath = path.resolve(template);

  return {
    name: "html-output",
    setup(build) {
      build.onEnd(async (result) => {
        if (result.errors.length) return;

        const { scripts, styles } = collectOutputsByType(result.metafile);
        const templateContents = await fs.readFile(templatePath, "utf8");
        const html = injectAssets(templateContents, { scripts, styles, minify });
        const outdir = build.initialOptions.outdir || DIST_DIR;
        const outPath = path.join(outdir, "index.html");

        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, html, "utf8");
      });
    },
  };
}

function buildOptions({ minify, sourcemap }) {
  return {
    entryPoints: { bundle: APP_ENTRY, styles: STYLES_ENTRY },
    entryNames: "[name]",
    bundle: true,
    outdir: DIST_DIR,
    write: true,
    minify,
    sourcemap,
    metafile: true,
    loader: {
      ".css": "css",
      ".html": "text",
      ".png": "file",
      ".jpg": "file",
      ".jpeg": "file",
      ".webp": "file",
      ".svg": "file",
      ".ico": "file",
      ".mp3": "file",
      ".wav": "file",
    },
    assetNames: "assets/[name]-[hash]",
    external: ["img/*", "sounds/*", "favicon/*"],
    logOverride: { "ignored-bare-import": "silent" },
    plugins: [
      htmlTemplateMinifierPlugin({ enabled: minify }),
      htmlOutputPlugin({ template: "index.html", minify }),
    ],
  };
}

async function buildAssets({ minify, sourcemap }) {
  await build(buildOptions({ minify, sourcemap }));
}
async function copyStaticAssets() {
  await fs.mkdir(DIST_DIR, { recursive: true });

  const tasks = [
    fs.cp("favicon", resolveDist("favicon"), { recursive: true, force: true }),
    fs.cp("img", resolveDist("img"), { recursive: true, force: true }),
    fs.cp("sounds", resolveDist("sounds"), { recursive: true, force: true }),
  ];

  await Promise.all(tasks);
}

function modeOptions(mode) {
  if (mode === "prod") {
    return { minify: true, sourcemap: "external" };
  }
  return { minify: false, sourcemap: true };
}

async function buildAll({ mode = "dev" } = {}) {
  const { minify, sourcemap } = modeOptions(mode);
  await resetDistDir();
  await Promise.all([buildAssets({ minify, sourcemap }), copyStaticAssets()]);
}

async function watchAll() {
  const { minify, sourcemap } = modeOptions("dev");
  await resetDistDir();
  const buildContext = await context(buildOptions({ minify, sourcemap }));
  await buildContext.watch();
  await copyStaticAssets();

  const watchers = [];

  const staticTargets = [
    { path: "favicon", recursive: true, task: copyStaticAssets },
    { path: "img", recursive: true, task: copyStaticAssets },
    { path: "sounds", recursive: true, task: copyStaticAssets },
  ];

  const sourceTargets = [
    { path: "index.html", recursive: false, task: () => buildContext.rebuild() },
  ];

  const addWatcher = ({ path: target, recursive, task }) => {
    if (!target) return;
    watchers.push(
      watch(target, { recursive }, async () => {
        await task();
      })
    );
  };

  [...staticTargets, ...sourceTargets].forEach(addWatcher);

  process.on("SIGINT", async () => {
    await Promise.all([buildContext.dispose()]);
    watchers.forEach((w) => w.close());
    process.exit(0);
  });
}

async function serveAll({ mode = "dev" } = {}) {
  const { minify, sourcemap } = modeOptions(mode);
  await resetDistDir();
  const buildContext = await context(buildOptions({ minify, sourcemap }));
  await buildContext.watch();
  await copyStaticAssets();

  const watchers = [];

  const staticTargets = [
    { path: "favicon", recursive: true, task: copyStaticAssets },
    { path: "img", recursive: true, task: copyStaticAssets },
    { path: "sounds", recursive: true, task: copyStaticAssets },
  ];

  const sourceTargets = [
    { path: "index.html", recursive: false, task: () => buildContext.rebuild() },
  ];

  const addWatcher = ({ path: target, recursive, task }) => {
    if (!target) return;
    watchers.push(
      watch(target, { recursive }, async () => {
        await task();
      })
    );
  };

  [...staticTargets, ...sourceTargets].forEach(addWatcher);

  const internalServer = await buildContext.serve({ servedir: DIST_DIR, port: 8001, host: "127.0.0.1" });

  const proxy = http.createServer((req, res) => {
    const forward = http.request(
      {
        hostname: internalServer.host,
        port: internalServer.port,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 500, {
          ...proxyRes.headers,
          // Force dev requests to bypass caches so edits always load fresh assets.
          "cache-control": "no-store, must-revalidate",
        });
        proxyRes.pipe(res, { end: true });
      }
    );

    forward.on("error", (err) => {
      console.error("Proxy error", err);
      res.statusCode = 502;
      res.end("Proxy error");
    });

    if (req.readableEnded) {
      forward.end();
    } else {
      req.pipe(forward, { end: true });
    }
  });

  proxy.listen(8000, "0.0.0.0", () => {
    console.log(`Serving ${DIST_DIR} at http://localhost:8000 (no-cache proxy)`);
  });

  const shutdown = async () => {
    await Promise.all([buildContext.dispose()]);
    internalServer.stop();
    proxy.close();
    watchers.forEach((w) => w.close());
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
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
