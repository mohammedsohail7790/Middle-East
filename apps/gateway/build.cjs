const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Find tsc in node_modules hierarchy (works in monorepos with hoisted deps)
function findTsc(dir) {
  const candidate = path.join(dir, 'node_modules', '.bin', 'tsc');
  if (fs.existsSync(candidate) || fs.existsSync(candidate + '.cmd') || fs.existsSync(candidate + '.ps1')) return candidate;
  const parent = path.dirname(dir);
  if (parent === dir) return null;
  return findTsc(parent);
}

const tscPath = findTsc(__dirname);
const cmd = tscPath ? `"${tscPath}"` : 'tsc';

try {
  execSync(cmd, { stdio: 'inherit', cwd: __dirname, shell: !tscPath || undefined });
} catch (err) {
  // With noEmitOnError: false, tsc still emits JS even when there are type errors.
  // Check if output was actually produced before failing the build.
  const outDir = path.join(__dirname, 'dist');
  const indexOut = path.join(outDir, 'apps', 'gateway', 'src', 'index.js');
  if (fs.existsSync(indexOut)) {
    console.warn('⚠️  TypeScript reported type errors but output was emitted successfully.');
    process.exit(0);
  }
  // No output produced — genuine build failure
  process.exit(1);
}

// Ship optional boot-time knowledge seed for voice RAG (repo root data/).
const repoDataFile = path.join(__dirname, '..', '..', 'data', 'knowledge_base.txt');
const distDataDir = path.join(__dirname, 'dist', 'data');
const distDataFile = path.join(distDataDir, 'knowledge_base.txt');
if (fs.existsSync(repoDataFile)) {
  fs.mkdirSync(distDataDir, { recursive: true });
  fs.copyFileSync(repoDataFile, distDataFile);
  console.log('Copied knowledge_base.txt → dist/data/');
}
