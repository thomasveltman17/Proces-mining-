// Copies the tracker core into the extension so it stays a single source of
// truth. Run via `npm run build:ext` after changing tracker/flowlens.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(here, 'vendor'), { recursive: true });
fs.copyFileSync(path.join(here, '..', 'tracker', 'flowlens.js'), path.join(here, 'vendor', 'flowlens.js'));
console.log('extension/vendor/flowlens.js refreshed from tracker/flowlens.js');
