***include the following section for the prod repo***

# Debug Panel Access
To enable the in-game debug panel, open your browser console and run:

`setDebugPanelAccess(true)`

To open the debug panel, simply press C on your keyboard.

This will allow you to view and modify game values for testing.

⚠️ Note:
ANY modification of stats, currencies, upgrade levels, or other save data through the debug panel will permanently mark the save slot as modified. If the slot is marked as modified, its shop button will permanently turn from a fresh green to a poopy brown color, which I like to call the poop-shop of shame.

Normal gameplay is unaffected unless you choose to modify values.

⚠️ Additional warning: Keep in mind that since you can edit basically anything in this debug panel, misuse (e.g., setting certain values way above they could reach normally) may result in game freezes or other side effects.

***include the following section for the source code repo***

# Local Setup

Requires **Node.js**. If you don't have Node.js installed, install it at [https://nodejs.org/](https://nodejs.org/) (LTS suggested).

With Node.js installed, download the repo as a ZIP, extract all files, open a terminal in the project root (where build.mjs lives) and run:

```bash
npm install
node build.mjs serve
```
Then open your browser and visit localhost:8000 to play locally.

If the localhost ever crashes, just run `node build.mjs serve` again in the project root.
