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

## One-off Builds
- Development build (with sourcemaps, no minification):
  ```bash
  npm run build:dev
  ```
- Production build (minified):
  ```bash
  npm run build
  ```
## Run ``npm run build`` before shipping or uploading anything so `dist/` matches what users will download.

## Publishing to GitHub Pages
Use `dist/` for uploads; the built files in the repo root are only for local preview. To update https://g7px2mqa.github.io/G7pX2mQa/:

1. Build a fresh production bundle:
   ```bash
   npm run build
   ```
2. Create (or reuse) a `gh-pages` worktree that mirrors the published branch. A worktree is just another folder that Git manages for a specific branch so you can have the `main` code and the `gh-pages` branch checked out at the same time. Run this from the project root so Git places the worktree next to this folder:
   ```bash
   git worktree add -B gh-pages ../gh-pages origin/gh-pages
   ```
3. Copy the new build output into that worktree and commit. Use whichever command set matches your shell:
   - **PowerShell (Windows Terminal default):**
     ```powershell
     Remove-Item -Recurse -Force ../gh-pages/*
     Copy-Item -Recurse dist/* ../gh-pages/
     Set-Location ../gh-pages
     git add .
     git commit -m "Publish latest build"
     git push origin gh-pages
     Set-Location -
     ```
   - **Bash (macOS/Linux/Git Bash):**
     ```bash
     rm -rf ../gh-pages/*
     cp -r dist/* ../gh-pages/
     cd ../gh-pages
     git add .
     git commit -m "Publish latest build"
     git push origin gh-pages
     cd -
     ```

GitHub Pages will automatically serve whatever is on the `gh-pages` branch root, so repeating the steps above after each set of edits keeps the public site in sync with `npm run build` output.

### Troubleshooting `npm run build`
- Run all commands from the project root (the folder with `package.json`), not from the `gh-pages` worktree.
- Install dependencies first:
  ```bash
  npm install
  ```
- If Windows reports a missing package like `besbuild`, delete `node_modules` and reinstall so `esbuild` is picked up correctly:
  ```powershell
  rd /s /q node_modules
  npm install
  ```

GitHub Pages will automatically serve whatever is on the `gh-pages` branch root, so repeating the steps above after each set of edits keeps the public site in sync with `npm run build` output.

## Tips
- Always run commands from the project root (contains `package.json`).
