this file is just in case I ever want to publish the code open source, I would put the text below as the readme:

# Local Setup

Requires **Node.js**. If you don't have Node.js installed, install it at [https://nodejs.org/](https://nodejs.org/) (LTS suggested).

With Node.js installed, download the repo as a ZIP, extract all files, open a terminal in the project root (where `build.mjs` lives) and run:

```bash
npm install
node build.mjs serve
```
Then open your browser and visit localhost:8000 to play locally.

If the localhost ever crashes, just run `node build.mjs serve` again in the project root.
