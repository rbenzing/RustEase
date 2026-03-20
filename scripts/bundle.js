import { build } from 'esbuild';
import { readFileSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

// Read version from package.json
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const version = pkg.version;

// Ensure release directory exists
mkdirSync(join(root, 'release'), { recursive: true });

console.log(`Bundling RustEase v${version}...`);

// Strip shebang from entry point before bundling.
// TypeScript preserves the shebang in dist/cli/cli.js, and esbuild also
// preserves it in the bundle output, causing a duplicate shebang error.
// We strip it here and re-add it via the banner alongside the createRequire
// shim that allows commander's CJS internals to work inside an ESM bundle.
// Using esbuild's stdin option preserves the original resolveDir so that
// relative imports in the compiled CLI are resolved correctly.
const entryPath = join(root, 'dist', 'cli', 'cli.js');
const entryDir = join(root, 'dist', 'cli');
let entryContent = readFileSync(entryPath, 'utf-8');
if (entryContent.startsWith('#!')) {
  entryContent = entryContent.slice(entryContent.indexOf('\n') + 1);
}

await build({
  stdin: {
    contents: entryContent,
    resolveDir: entryDir,
    sourcefile: 'cli.js',
    loader: 'js',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: join(root, 'release', 'rustease.mjs'),
  banner: {
    js: [
      '#!/usr/bin/env node',
      'import { createRequire } from "module";',
      'const require = createRequire(import.meta.url);',
    ].join('\n'),
  },
  define: {
    __RUSTEASE_VERSION__: JSON.stringify(version),
  },
  external: [],
  minify: false,  // Keep readable for debugging
  sourcemap: false,
  logLevel: 'info',
});

const stat = statSync(join(root, 'release', 'rustease.mjs'));
const sizeKB = (stat.size / 1024).toFixed(1);
console.log(`✅ Bundle created: release/rustease.mjs (${sizeKB} KB)`);

