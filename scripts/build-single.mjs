// Bundles the whole app into ONE html file (dist/purrpose.html) that works when double-clicked:
// browsers refuse to load ES modules from file://, so this inlines the JS, CSS, font and icon.
// Usage: npm run build:single
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const www = join(root, 'www');

const bundle = await build({
  entryPoints: [join(www, 'js/app.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  write: false,
});
const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const font = (await readFile(join(www, 'fonts/bricolage-grotesque.woff2'))).toString('base64');
const css = (await readFile(join(www, 'css/app.css'), 'utf8')).replace(
  /url\('\.\.\/fonts\/bricolage-grotesque\.woff2'\)/,
  `url(data:font/woff2;base64,${font})`
);
const icon = (await readFile(join(www, 'icon.svg'))).toString('base64');

let html = await readFile(join(www, 'index.html'), 'utf8');
html = html
  .replace('<link rel="icon" type="image/svg+xml" href="icon.svg">', `<link rel="icon" href="data:image/svg+xml;base64,${icon}">`)
  .replace('<link rel="stylesheet" href="css/app.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="js/app.js"></script>', () => `<script>${js}</script>`);

await mkdir(join(root, 'dist'), { recursive: true });
await writeFile(join(root, 'dist/purrpose.html'), html);
console.log(`dist/purrpose.html written (${Math.round(html.length / 1024)} KB)`);
