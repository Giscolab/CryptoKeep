import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESKTOP_CSP } from '../../desktop/contract.mjs';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STAMP = 'desktop-manifest.json';

function regularPath(base, path) {
  let cursor = base;
  if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error('Symlink refused');
  for (const component of relative(base, path).split(sep)) {
    cursor = join(cursor, component);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error('Symlink refused');
  }
}

function listFiles(base, prefix = '') {
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) throw new Error('Symlink refused');
    const path = prefix + entry.name;
    return entry.isDirectory() ? listFiles(join(base, entry.name), path + '/') : [path];
  });
}

export function stageDesktop({ root = PROJECT_ROOT, output = join(root, 'dist/desktop') } = {}) {
  root = realpathSync(root);
  output = resolve(output);
  const outputRelative = relative(root, output);
  if (outputRelative !== join('dist', 'desktop')) throw new Error('Output must be dist/desktop');
  const assets = JSON.parse(readFileSync(join(root, 'desktop/assets.json'), 'utf8'));
  if (!Array.isArray(assets) || new Set(assets).size !== assets.length) throw new Error('Invalid asset manifest');
  for (const asset of assets) {
    if (typeof asset !== 'string' || !/^(?:index\.html|(?:scripts|public|desktop)\/[A-Za-z0-9_./-]+\.(?:js|mjs|css|png|ico|svg|woff2?|ttf|webmanifest))$/.test(asset)
      || asset.split('/').some((part) => part === '..' || part.startsWith('.'))) throw new Error('Unsafe asset path');
    const source = join(root, asset);
    regularPath(root, source);
    if (!lstatSync(source).isFile()) throw new Error('Asset must be a regular file');
  }
  regularPath(root, output);
  const expected = new Set([...assets, STAMP]);
  if (existsSync(output) && !existsSync(join(output, STAMP))) throw new Error('Unowned staging directory');
  for (const old of listFiles(output)) if (!expected.has(old)) throw new Error('Unexpected staging file; nothing overwritten');
  if (existsSync(output)) {
    const stamp = JSON.parse(readFileSync(join(output, STAMP), 'utf8'));
    if (stamp.format !== 'cryptokeep-desktop-stage-v1' || !stamp.files) throw new Error('Invalid staging ownership');
    for (const old of listFiles(output).filter((path) => path !== STAMP)) {
      const hash = createHash('sha256').update(readFileSync(join(output, old))).digest('hex');
      if (!Object.hasOwn(stamp.files, old) || stamp.files[old] !== hash) throw new Error('Locally edited staging file; nothing overwritten');
    }
  }
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const app = /<script type="module" src="scripts\/app\.js[^" ]*" crossorigin="anonymous">\s*<\/script>/g;
  const report = /<script type="module" src="scripts\/ui\/security-report-init\.js"><\/script>/g;
  if ([...html.matchAll(app)].length !== 1 || [...html.matchAll(report)].length !== 1) throw new Error('Unexpected entry scripts');
  const transformed = html.replace(/<meta http-equiv="Content-Security-Policy" content="[\s\S]*?">/, `<meta http-equiv="Content-Security-Policy" content="${DESKTOP_CSP}">\n<meta name="referrer" content="no-referrer">`)
    .replace(app, '<script type="module" src="desktop/bootstrap.js"></script>').replace(report, '');
  if (!transformed.includes(DESKTOP_CSP)) throw new Error('Missing CSP');
  mkdirSync(output, { recursive: true });
  const hashes = {};
  for (const asset of assets) {
    const destination = join(output, asset);
    regularPath(root, destination);
    mkdirSync(dirname(destination), { recursive: true });
    if (asset === 'index.html') writeFileSync(destination, transformed);
    else copyFileSync(join(root, asset), destination, constants.COPYFILE_FICLONE);
    Object.defineProperty(hashes, asset, { value: createHash('sha256').update(readFileSync(destination)).digest('hex'), enumerable: true });
  }
  writeFileSync(join(output, STAMP), JSON.stringify({ format: 'cryptokeep-desktop-stage-v1', files: hashes }, null, 2) + '\n');
  return { output, count: assets.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = stageDesktop();
  console.log(`Desktop resources prepared: ${report.count} allowlisted assets.`);
}
