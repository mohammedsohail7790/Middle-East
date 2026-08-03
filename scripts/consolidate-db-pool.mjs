import fs from 'fs';
import path from 'path';

const root = path.resolve('apps/gateway/src/services');

function poolImportPath(file) {
  const rel = path.relative(root, path.dirname(file));
  const depth = rel ? rel.split(path.sep).length : 0;
  return (depth === 0 ? './' : '../'.repeat(depth)) + 'db/pool.js';
}

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, files);
    else if (e.name.endsWith('.ts')) files.push(p);
  }
  return files;
}

let count = 0;
for (const file of walk(root)) {
  if (file.replace(/\\/g, '/').endsWith('db/pool.ts')) continue;
  let src = fs.readFileSync(file, 'utf8');
  if (!/new Pool\(\{/.test(src)) continue;

  const importPath = poolImportPath(file);
  const poolImport = `import { pool } from '${importPath}';\n`;

  src = src.replace(/import \{ Pool \} from 'pg';\r?\n/g, '');
  src = src.replace(/const pool = new Pool\(\{[\s\S]*?\}\);\r?\n\r?\n/g, '');
  src = src.replace(/const pool = new Pool\(\{[\s\S]*?\}\);\r?\n/g, '');
  src = src.replace(
    /private readonly db = new Pool\(\{[\s\S]*?\}\);\r?\n\r?\n/g,
    'private readonly db = pool;\n\n'
  );
  src = src.replace(
    /private readonly db = new Pool\(\{[\s\S]*?\}\);\r?\n/g,
    'private readonly db = pool;\n'
  );

  if (!src.includes(`from '${importPath}'`)) {
    if (file.replace(/\\/g, '/').endsWith('voice/ai.service.ts')) {
      src = src.replace(/(export class AiService \{)/, `${poolImport}\n$1`);
    } else if (/\bpool\.query\b/.test(src) || /private readonly db = pool/.test(src)) {
      src = poolImport + src;
    }
  }

  if (/new Pool\(\{/.test(src)) {
    console.warn('still has Pool:', file);
  }

  fs.writeFileSync(file, src);
  console.log('updated', file);
  count++;
}
console.log('total', count);
