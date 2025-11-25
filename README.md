# Reminders for myself

A quick reference for working on this project: what to edit, how to build, and how to preview changes using Node.js.

## Source of Truth
- JavaScript entry: `app.js` (imports helpers under `js/`).
- CSS entry: `css/imports.css` (pulls in other style sheets).
- HTML template: `index.html`.
- Static assets copied as-is: `favicon/`, `img/`, `sounds/`.

## Outputs
- Build artifacts land in `dist/`.
- Bundled JS/CSS: `dist/bundle.js` and `dist/styles.css` (with sourcemaps).
- Assets are recopied into `dist/` (images/audio are hashed when copied).

## Development Workflow
1. From the project root (CCC folder), start the watcher:
   ```bash
   npm run watch
   ```
   - Rebuilds JS/CSS and recopies assets into `dist/` whenever I save files.
2. Edit the readable sources: `app.js`, files under `js/`, styles under `css/`, and `index.html`.
3. Preview locally:
   ```bash
   npm run serve
   ```
   - Open http://localhost:8000 after the server starts.
4. Stop the watcher/server with `Ctrl+C` when done.

## Git hook for auto-rebuilds
- First-time setup: point Git at the bundled hook scripts with
  `git config core.hooksPath .githooks`.
- The `pre-commit` hook watches staged files under `js/` or `css/`.
  - If none changed, the hook exits immediately (no rebuild).
  - If they did change, it runs `npm run sync-bundles` and stages the updated
    bundles automatically before the commit proceeds.

## Tips
- Always run commands from the project root (contains `package.json`).
