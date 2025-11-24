const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const targets = [
  { type: 'file', location: 'index.html' },
  { type: 'dir', location: 'favicon' },
  { type: 'dir', location: 'img' },
  { type: 'dir', location: 'sounds' }
];

const activeWatchers = new Map();
let copyInProgress = false;

function copyStatic() {
  if (copyInProgress) return;

  copyInProgress = true;
  const copyProcess = exec('npm run copy:static --silent');

  copyProcess.stdout.on('data', (data) => process.stdout.write(data));
  copyProcess.stderr.on('data', (data) => process.stderr.write(data));
  copyProcess.on('exit', () => {
    copyInProgress = false;
  });
}

function watchFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  fs.watch(filePath, () => {
    copyStatic();
  });
}

function registerDirectoryWatch(dirPath) {
  if (activeWatchers.has(dirPath) || !fs.existsSync(dirPath)) return;

  const watcher = fs.watch(dirPath, (eventType, filename) => {
    if (filename) {
      const updatedPath = path.join(dirPath, filename.toString());
      if (eventType === 'rename' && fs.existsSync(updatedPath)) {
        const stats = fs.statSync(updatedPath);
        if (stats.isDirectory()) {
          registerDirectoryWatch(updatedPath);
        }
      }
    }

    copyStatic();
  });

  activeWatchers.set(dirPath, watcher);

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  entries
    .filter((entry) => entry.isDirectory())
    .forEach((entry) => registerDirectoryWatch(path.join(dirPath, entry.name)));
}

function initialize() {
  copyStatic();

  targets.forEach((target) => {
    const targetPath = path.join(process.cwd(), target.location);
    if (target.type === 'file') {
      watchFile(targetPath);
    } else if (target.type === 'dir') {
      registerDirectoryWatch(targetPath);
    }
  });
}

process.on('SIGINT', () => {
  for (const watcher of activeWatchers.values()) {
    watcher.close();
  }
  process.exit(0);
});

initialize();