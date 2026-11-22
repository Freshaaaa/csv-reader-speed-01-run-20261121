// The harness runs `node /bot/main.ts` (node22). It reads every case from
// /input/cases.json (a JSON array of {id, input}), answers each one alone
// with run() from solve.js, and writes /output/answers.json: a JSON array
// of the answers, one per case and in the cases' order. Outside a container
// MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for /input and /output.
// Plain JavaScript (no TypeScript-only syntax) so the loader runs it
// directly without type stripping.
//
// Each case is parsed and stringified before the next case is read, so a
// case's answer objects are garbage by the time the next case is parsed
// (holding all six answers at once doubles the live heap and the parse
// time). The output is byte-identical to stringifying the whole array.
//
// The answers are written incrementally (one writeSync per case) instead of
// joining all parts into one big string first: joining copies the whole
// ~12 MB output once more for no reason.

import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// V8's incremental marking off, set before solve.js is imported so all of
// its work runs under it (the house baseline does the same, and RULES.txt
// explicitly allows an entry to tune V8's flags the same way). Measured
// ~2-3% faster on the practice set with the incremental-write driver.
setFlagsFromString('--no-incremental-marking');

/** solve.js, imported by its URL. */
const { run } = await import(new URL('./solve.js', import.meta.url).href);

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8'));
const fd = openSync(join(OUTPUT_DIR, 'answers.json'), 'w');
writeSync(fd, '[');
for (let i = 0; i < cases.length; i++) {
  if (i > 0) writeSync(fd, ',');
  writeSync(fd, JSON.stringify(run(cases[i].input)));
}
writeSync(fd, ']');
closeSync(fd);
