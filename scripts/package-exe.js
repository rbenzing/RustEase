import { build } from 'esbuild';
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

// Read version from package.json
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const version = pkg.version;

const seaPrepCjs  = join(root, 'release', 'rustease-sea-prep.cjs');
const seaBlob     = join(root, 'release', 'rustease-sea.blob');
const seaConfig   = join(root, 'sea-config.json');
const exeOut      = join(root, 'release', 'rustease.exe');
const zipOut      = join(root, 'release', `rustease-v${version}-win-x64.zip`);

// Guard: dist/ must be built before packaging
const distEntry = join(root, 'dist', 'cli', 'cli.js');
if (!existsSync(distEntry)) {
  console.error('❌ dist/cli/cli.js not found. Run `npm run build` (tsc) before packaging.');
  process.exit(1);
}

console.log(`\n📦 Packaging RustEase v${version} as standalone exe...\n`);

try {
  // ── Step A: CJS bundle for SEA ────────────────────────────────────────────
  console.log('Step A: Building CJS bundle for SEA...');

  mkdirSync(join(root, 'release'), { recursive: true });

  const entryPath = join(root, 'dist', 'cli', 'cli.js');
  const entryDir  = join(root, 'dist', 'cli');
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
    format: 'cjs',
    target: 'node18',
    outfile: seaPrepCjs,
    define: {
      __RUSTEASE_VERSION__: JSON.stringify(version),
    },
    external: [],
    minify: false,
    sourcemap: false,
    logLevel: 'info',
  });

  console.log('  ✅ CJS bundle created.\n');

  // ── Step B: Write sea-config.json ─────────────────────────────────────────
  console.log('Step B: Writing sea-config.json...');
  const seaConfigContent = {
    main: 'release/rustease-sea-prep.cjs',
    output: 'release/rustease-sea.blob',
    disableExperimentalSEAWarning: true,
  };
  writeFileSync(seaConfig, JSON.stringify(seaConfigContent, null, 2), 'utf-8');
  console.log('  ✅ sea-config.json written.\n');

  // ── Step C: Generate SEA blob ─────────────────────────────────────────────
  console.log('Step C: Generating SEA blob...');
  execSync('node --experimental-sea-config sea-config.json', { stdio: 'inherit', cwd: root });
  console.log('  ✅ SEA blob generated.\n');

  // ── Step D: Copy node.exe ─────────────────────────────────────────────────
  console.log(`Step D: Copying node.exe from ${process.execPath}...`);
  copyFileSync(process.execPath, exeOut);
  console.log('  ✅ node.exe copied to release/rustease.exe.\n');

  // ── Step E: Inject blob with postject ─────────────────────────────────────
  console.log('Step E: Injecting SEA blob with postject...');
  const postjectCmd = [
    'node node_modules/postject/dist/cli.js',
    `"${exeOut}"`,
    'NODE_SEA_BLOB',
    `"${seaBlob}"`,
    '--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ].join(' ');
  execSync(postjectCmd, { stdio: 'inherit', cwd: root });
  console.log('  ✅ Blob injected.\n');

  // ── Step F: Cleanup ───────────────────────────────────────────────────────
  console.log('Step F: Cleaning up intermediate files...');
  for (const f of [seaPrepCjs, seaBlob, seaConfig]) {
    try { unlinkSync(f); } catch { /* ignore if already gone */ }
  }
  console.log('  ✅ Cleanup done.\n');

  // ── Step G: Create release zip ───────────────────────────────────────────
  console.log('Step G: Creating release zip...');
  // Remove old zip if it exists
  try { unlinkSync(zipOut); } catch { /* ignore */ }
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${exeOut}' -DestinationPath '${zipOut}'"`,
    { stdio: 'inherit', cwd: root },
  );
  const zipStat = statSync(zipOut);
  const zipMB = (zipStat.size / (1024 * 1024)).toFixed(1);
  console.log(`  ✅ Release zip created: release/rustease-v${version}-win-x64.zip (${zipMB} MB)\n`);

  // ── Step H: Report ────────────────────────────────────────────────────────
  const stat = statSync(exeOut);
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
  console.log(`✅ Standalone executable created: release/rustease.exe (${sizeMB} MB)`);
  console.log(`✅ Release zip: release/rustease-v${version}-win-x64.zip (${zipMB} MB)`);

} catch (err) {
  console.error('\n❌ Packaging failed:', err.message ?? err);
  process.exit(1);
}

