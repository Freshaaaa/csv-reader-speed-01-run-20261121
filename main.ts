// main.ts (WASM transducer). Harness menjalankan `node /bot/main.ts` (node22).
// Membaca /input/cases.json, menjalankan transducer WASM, menulis
// /output/answers.json. Plain JavaScript (tanpa sintaks khusus TypeScript).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// V8 incremental marking off (house baseline melakukan hal yang sama).
setFlagsFromString('--no-incremental-marking');

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const wasmBytes = readFileSync(new URL('./csv_wasm.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exp = instance.exports;
const input = readFileSync(join(INPUT_DIR, 'cases.json'));
const inPtr = exp.alloc_input(input.length);
let mem = new Uint8Array(exp.memory.buffer);
mem.set(input, inPtr);
const outLen = exp.run(inPtr, input.length);
const outPtr = exp.out_ptr();
mem = new Uint8Array(exp.memory.buffer);
writeFileSync(
  join(OUTPUT_DIR, 'answers.json'),
  Buffer.from(mem.subarray(outPtr, outPtr + outLen)),
);
