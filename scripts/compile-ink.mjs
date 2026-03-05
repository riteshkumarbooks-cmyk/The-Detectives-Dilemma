// compile-ink.mjs — Compile .ink source files to JSON for the React Native app
// Run: node scripts/compile-ink.mjs
//
// Input:  assets/stories/*.ink
// Output: assets/stories/*.ink.json  (imported by the app at runtime)

import { Compiler } from 'inkjs/full';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const storiesDir = resolve(__dirname, '../assets/stories');

const inkFiles = readdirSync(storiesDir).filter(f => f.endsWith('.ink'));

if (inkFiles.length === 0) {
  console.log('No .ink files found in assets/stories/');
  process.exit(0);
}

let ok = 0, fail = 0;

for (const file of inkFiles) {
  const inPath  = resolve(storiesDir, file);
  const outPath = resolve(storiesDir, file + '.json');
  try {
    const source   = readFileSync(inPath, 'utf8');
    const compiler = new Compiler(source);
    const story    = compiler.Compile();
    const json     = story.ToJson();
    writeFileSync(outPath, json, 'utf8');
    console.log(`  ✓  ${file} → ${basename(outPath)}`);
    ok++;
  } catch (e) {
    console.error(`  ✗  ${file}: ${e.message}`);
    fail++;
  }
}

console.log(`\n${ok} compiled, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
