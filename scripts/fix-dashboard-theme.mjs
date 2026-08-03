import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../apps/dashboard/src/app/dashboard');

const replacements = [
  [/bg-white\/\[0\.02\]/g, 'bg-gray-50'],
  [/bg-white\/\[0\.03\]/g, 'bg-gray-100'],
  [/bg-white\/\[0\.04\]/g, 'bg-gray-50'],
  [/bg-white\/\[0\.06\]/g, 'bg-gray-100'],
  [/divide-white\/\[0\.04\]/g, 'divide-gray-100'],
  [/border-white\/\[0\.04\]/g, 'border-gray-100'],
  [/hover:bg-white\/\[0\.02\]/g, 'hover:bg-gray-50'],
  [/hover:bg-white\/\[0\.03\]/g, 'hover:bg-gray-50'],
  [/hover:bg-white\/\[0\.06\]/g, 'hover:bg-gray-100'],
  [/text-violet-300/g, 'text-accent-dark'],
  [/bg-accent\/20 text-accent-dark/g, 'bg-accent-light text-accent-dark font-semibold'],
  [/text-emerald-400/g, 'text-emerald-600'],
  [/text-red-400/g, 'text-red-600'],
  [/text-amber-400/g, 'text-amber-700'],
  [/bg-emerald-500\/10/g, 'bg-emerald-50'],
  [/bg-red-500\/10/g, 'bg-red-50'],
  [/bg-amber-500\/10/g, 'bg-amber-50'],
  [/border-red-500\/20/g, 'border-red-200'],
  [/border-white\/\[0\.06\]/g, 'border-gray-200'],
];

function walk(d) {
  for (const name of fs.readdirSync(d)) {
    const p = path.join(d, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.tsx')) {
      let c = fs.readFileSync(p, 'utf8');
      let changed = false;
      for (const [re, rep] of replacements) {
        if (re.test(c)) {
          c = c.replace(re, rep);
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(p, c);
        console.log('updated', p);
      }
    }
  }
}

walk(dir);
