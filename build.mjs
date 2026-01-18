import esbuild from "esbuild";
import fs from "node:fs/promises";
import { watch } from "node:fs";
import http from "node:http";
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

function minifyHtmlChunk(chunk, trim = true) {
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

  out = out.replace(/>\s+</g, "><").replace(/\s+/g, " ");
  return trim ? out.trim() : out;
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
    .map((part) => (part.type === "text" ? minifyHtmlChunk(part.value, false) : part.value))
    .join("")
    .trim();
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

function escapeTemplateNewlines(content) {
  const State = {
    CODE: 0,
    SINGLE: 1,
    DOUBLE: 2,
    TEMPLATE: 3,
    TEMPLATE_EXPR_CODE: 4,
    TEMPLATE_EXPR_SINGLE: 5,
    TEMPLATE_EXPR_DOUBLE: 6,
    TEMPLATE_EXPR_TEMPLATE: 7,
    COMMENT_SINGLE: 8,
    COMMENT_MULTI: 9,
    TEMPLATE_EXPR_COMMENT_SINGLE: 10,
    TEMPLATE_EXPR_COMMENT_MULTI: 11,
    REGEX: 12,
    TEMPLATE_EXPR_REGEX: 14,
    TEMPLATE_EXPR_REGEX_CLASS: 15
  };

  let state = State.CODE;
  let braceDepth = 0;
  let escaped = false;
  let output = "";
  
  // Track last significant char to distinguish regex from division.
  // We care if it looks like a value (identifier, number, closing bracket) or an operator/keyword.
  // Division usually follows: Identifier, ), ], }, Number.
  // Regex usually follows: (, ,, =, :, [, !, &, |, ?, {, }, ;, and keywords (return, throw, etc).
  // This is a heuristic.
  let lastNonSpaceChar = '';
  
  // Keywords that can precede a regex literal.
  // Note: 'in', 'instanceof' are operators, so division is unlikely after them? "foo" in /a/? No.
  // But keywords like 'if', 'while', 'for' are followed by '(', so we track '('.
  // 'return', 'throw', 'case', 'yield', 'await', 'typeof', 'void', 'delete', 'else'
  // are the main ones where `/` follows immediately.
  // However, identifying keywords without a tokenizer is hard.
  // We will fallback to a simpler heuristic:
  // If last char is `)`, `]`, `}`, or an alphanumeric char (identifier/number), it's DIVISION.
  // Otherwise (operator, punctuation), it's REGEX.
  // Exceptions: `return`, `typeof` etc end in alphanumeric but expect regex.
  // If we miss those, we treat `return /foo/` as division `return / foo /`?
  // `return` is a statement. `return / 2` is invalid syntax usually unless return value is divided?
  // `return 5 / 2`.
  // `return/foo/` -> Valid regex.
  // So we really need to know if the alphanumeric word was a keyword.
  // We can track the last "word" seen.
  
  let lastWord = "";
  let isCollectingWord = false;

  const REGEX_PRECEDING_KEYWORDS = new Set([
    "return", "throw", "case", "else", "typeof", "void", "delete", "await", "yield", "do"
  ]);

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];

    const emitEscapedNewline = () => {
      output += "\\n";
      if (ch === "\r" && next === "\n") {
        i += 1;
      }
    };
    
    // Helpers to update state for division detection
    const updateLastChar = (c) => {
        if (!/\s/.test(c)) {
            lastNonSpaceChar = c;
        }
        
        if (/[a-zA-Z0-9_$]/.test(c)) {
            if (!isCollectingWord) {
                lastWord = "";
                isCollectingWord = true;
            }
            lastWord += c;
        } else {
            isCollectingWord = false;
        }
    };

    switch (state) {
      case State.CODE: {
        if (ch === "/" && next === "/") { state = State.COMMENT_SINGLE; output += ch; break; }
        if (ch === "/" && next === "*") { state = State.COMMENT_MULTI; output += ch; break; }
        
        if (ch === "/") {
            // Regex or Division?
            let isDivision = false;
            
            if (lastNonSpaceChar) {
                if (/[)\]}'"`]/.test(lastNonSpaceChar)) {
                    isDivision = true;
                } else if (/[a-zA-Z0-9_$]/.test(lastNonSpaceChar)) {
                    // Ends in identifier or number.
                    // Check if it's a special keyword.
                    if (REGEX_PRECEDING_KEYWORDS.has(lastWord)) {
                        isDivision = false;
                    } else {
                        isDivision = true;
                    }
                }
            }
            
            if (!isDivision) {
                state = State.REGEX;
            }
            // else remain in CODE (division)
        }

        if (ch === "'") { state = State.SINGLE; output += ch; updateLastChar(ch); break; }
        if (ch === '"') { state = State.DOUBLE; output += ch; updateLastChar(ch); break; }
        if (ch === "`") { state = State.TEMPLATE; output += ch; updateLastChar(ch); break; }
        
        output += ch;
        updateLastChar(ch);
        break;
      }
      
      case State.REGEX: {
          if (escaped) { escaped = false; output += ch; break; }
          if (ch === "\\") { escaped = true; output += ch; break; }
          if (ch === "[") { state = 13; output += ch; break; } // Enter REGEX_CLASS
          if (ch === "/") {
              state = State.CODE;
              output += ch;
              updateLastChar(ch);
              break;
          }
          output += ch;
          break;
      }

      case State.SINGLE: {
        if (escaped) { escaped = false; output += ch; break; }
        if (ch === "\\") { escaped = true; output += ch; break; }
        output += ch;
        if (ch === "'") { state = State.CODE; updateLastChar(ch); }
        break;
      }
      case State.DOUBLE: {
        if (escaped) { escaped = false; output += ch; break; }
        if (ch === "\\") { escaped = true; output += ch; break; }
        output += ch;
        if (ch === '"') { state = State.CODE; updateLastChar(ch); }
        break;
      }
      case State.COMMENT_SINGLE: {
        if (ch === "\n" || ch === "\r") { state = State.CODE; output += ch; /* newline is not a token value really */ break; }
        output += ch;
        break;
      }
      case State.COMMENT_MULTI: {
        if (ch === "*" && next === "/") {
          state = State.CODE;
          output += "*/";
          i += 1;
          break;
        }
        output += ch;
        break;
      }
      case State.TEMPLATE: {
        if (escaped) { escaped = false; output += ch; break; }
        if (ch === "\\") { escaped = true; output += ch; break; }
        if (ch === "`") { state = State.CODE; output += ch; updateLastChar(ch); break; }
        if (ch === "$" && next === "{") { 
            state = State.TEMPLATE_EXPR_CODE; 
            braceDepth = 1; 
            output += "${"; 
            i += 1; 
            lastNonSpaceChar = '{';
            lastWord = '';
            isCollectingWord = false;
            break; 
        }
        if (ch === "\n" || ch === "\r") { emitEscapedNewline(); break; }
        output += ch;
        break;
      }
      case State.TEMPLATE_EXPR_CODE: {
        if (ch === "/" && next === "/") { state = State.TEMPLATE_EXPR_COMMENT_SINGLE; output += ch; break; }
        if (ch === "/" && next === "*") { state = State.TEMPLATE_EXPR_COMMENT_MULTI; output += ch; break; }
        
        if (ch === "/") {
            let isDivision = false;
            if (lastNonSpaceChar) {
                if (/[)\]}'"`]/.test(lastNonSpaceChar)) {
                    isDivision = true;
                } else if (/[a-zA-Z0-9_$]/.test(lastNonSpaceChar)) {
                    if (REGEX_PRECEDING_KEYWORDS.has(lastWord)) {
                        isDivision = false;
                    } else {
                        isDivision = true;
                    }
                }
            }
            if (!isDivision) {
                state = State.TEMPLATE_EXPR_REGEX;
            }
        }
        
        if (escaped) { escaped = false; output += ch; break; }
        if (ch === "\\") { escaped = true; output += ch; break; }
        if (ch === "'") { state = State.TEMPLATE_EXPR_SINGLE; output += ch; break; }
        if (ch === '"') { state = State.TEMPLATE_EXPR_DOUBLE; output += ch; break; }
        if (ch === "`") { state = State.TEMPLATE_EXPR_TEMPLATE; output += ch; break; }
        if (ch === "{") { braceDepth += 1; output += ch; updateLastChar(ch); break; }
        if (ch === "}") {
          braceDepth -= 1;
          output += ch;
          updateLastChar(ch);
          if (braceDepth <= 0) state = State.TEMPLATE;
          break;
        }
        output += ch;
        updateLastChar(ch);
        break;
      }
      case State.TEMPLATE_EXPR_SINGLE: {
        if (escaped) { escaped = false; output += ch; break; }
        if (ch === "\\") { escaped = true; output += ch; break; }
        output += ch;
        if (ch === "'") state = State.TEMPLATE_EXPR_CODE;
        break;
      }
      case State.TEMPLATE_EXPR_DOUBLE: {
        if (escaped) { escaped = false; output += ch; break; }
        if (ch === "\\") { escaped = true; output += ch; break; }
        output += ch;
        if (ch === '"') state = State.TEMPLATE_EXPR_CODE;
        break;
      }
      case State.TEMPLATE_EXPR_COMMENT_SINGLE: {
        if (ch === "\n" || ch === "\r") { state = State.TEMPLATE_EXPR_CODE; output += ch; break; }
        output += ch;
        break;
      }
      case State.TEMPLATE_EXPR_COMMENT_MULTI: {
        if (ch === "*" && next === "/") {
          state = State.TEMPLATE_EXPR_CODE;
          output += "*/";
          i += 1;
          break;
        }
        output += ch;
        break;
      }
      case State.TEMPLATE_EXPR_TEMPLATE: {
        if (escaped) { escaped = false; output += ch; break; }
        if (ch === "\\") { escaped = true; output += ch; break; }
        if (ch === "`") { 
            state = State.TEMPLATE_EXPR_CODE; 
            output += ch; 
            // When returning to code from template, the backtick IS the last char
            updateLastChar(ch); 
            break; 
        }
        if (ch === "$" && next === "{") { 
            state = State.TEMPLATE_EXPR_CODE; 
            braceDepth += 1; 
            output += "${"; 
            i += 1; 
            lastNonSpaceChar = '{';
            lastWord = '';
            isCollectingWord = false;
            break; 
        }
        if (ch === "\n" || ch === "\r") { emitEscapedNewline(); break; }
        output += ch;
        break;
      }
      // New state for REGEX_CLASS handling (13)
      case 13: { // REGEX_CLASS
          if (escaped) { escaped = false; output += ch; break; }
          if (ch === "\\") { escaped = true; output += ch; break; }
          if (ch === "]") { state = State.REGEX; output += ch; break; }
          output += ch;
          break;
      }
      
      case State.TEMPLATE_EXPR_REGEX: {
          if (escaped) { escaped = false; output += ch; break; }
          if (ch === "\\") { escaped = true; output += ch; break; }
          if (ch === "[") { state = State.TEMPLATE_EXPR_REGEX_CLASS; output += ch; break; } 
          if (ch === "/") {
              state = State.TEMPLATE_EXPR_CODE;
              output += ch;
              updateLastChar(ch);
              break;
          }
          output += ch;
          break;
      }
      
      case State.TEMPLATE_EXPR_REGEX_CLASS: {
          if (escaped) { escaped = false; output += ch; break; }
          if (ch === "\\") { escaped = true; output += ch; break; }
          if (ch === "]") { state = State.TEMPLATE_EXPR_REGEX; output += ch; break; }
          output += ch;
          break;
      }
      
      default: {
        output += ch;
      }
    }
    
  }

  return output;
}
