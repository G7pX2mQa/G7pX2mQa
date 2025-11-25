# Debug Panel Access
To enable the in-game debug panel, open your browser console and run:

`setDebugPanelAccess(true)`

This will allow you to view and modify game values for testing.

⚠️ Note:
ANY modification of stats, currencies, upgrade levels, or other save data through the debug panel will permanently mark the save slot as modified. If the slot is marked as modified, its shop button will permanently turn from a fresh green to a poopy brown, which I like to call the poop-shop of shame.

Normal gameplay is unaffected unless you choose to modify values.

# Local Setup

Requires **Node.js**. If you don't have Node.js installed, install it at [Node.js](https://nodejs.org/) (LTS suggested).

With Node.js installed, download the repo as a ZIP, extract all files, and open a terminal in the project root (where build.mjs lives) and run:

```bash
npm install
node build.mjs serve
