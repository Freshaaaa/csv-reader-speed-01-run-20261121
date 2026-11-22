# csv-reader-speed-01 — fast drop-in for csv-reader 1.0.0

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/Freshaaaa/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/Freshaaaa/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)

A WASM SIMD JSON-to-JSON transducer (`csv_wasm.wasm`, 45 KB, built from
Rust) that answers exactly what
[csv-reader 1.0.0](https://www.npmjs.com/package/csv-reader) answers —
`{columns, rows, errors}` for `{text, header}` — but ~1.7x faster than
the previous JS entry on the practice set (median wall 0.32s vs 0.53s,
fresh process, interleaved, 7 runs; ~2x net of Node startup). `main.ts`
reads every case from `/input/cases.json`, hands the whole JSON document
to the transducer, and writes `/output/answers.json`.

## How it is fast

- Single-pass SIMD (v128) scan over the JSON-escaped input: delimiters,
  quotes and line breaks are found 16 bytes at a time, not one character
  at a time.
- Slice-based fields: fields are copied by slice, never rebuilt character
  by character; quoted fields are normalised only when they actually
  contain a line break.
- Streaming output: the JSON answer is written as the transducer goes,
  no intermediate objects, no `JSON.parse` / `JSON.stringify` of the
  whole document in JS.
- The JS driver is a thin shell: read input, instantiate WASM, write
  output. V8 incremental marking is off (`--no-incremental-marking`,
  the same flag the house baseline sets).

## Semantics (mirrors csv-reader 1.0.0 exactly)

- U+FEFF at the very start is dropped; a record ends at LF or CRLF; an
  empty line is no record.
- Outside quotes a CR not followed by LF is dropped (`stray_cr`).
- A quoted field runs to the next non-doubled quote, `""` inside is one
  quote, CRLF / lone CR inside read as LF; text after the closing quote up
  to the next comma or line break is appended as-is (`quote_junk`).
- An unclosed quote is a literal and the text after it is re-read as
  unquoted (`unterminated_quote`); a quote inside an unquoted field is
  literal.
- Fields stay strings, never trimmed or converted. `columns` is the first
  record when `header`, else `null`; rows are padded (`short_row`, with
  `fields: count`) or cut (`long_row`, with `extra: cut fields`) to the
  first record's width. Errors are `{code, line, row}` in the order met.

## Validation

`grade-local` (process driver, `--worktree`): **passed=1, 6/6 cases**,
L1 regrade reproduced byte for byte, run twice. Output matches
`practice/reference/expected.json` exactly; 2 runs byte-identical
(sha256 bb5b6cc5c523edf0b18a20cd1f577b0d461b3ae021fd3ab2c9b4e4a5f01002ed).

## Bounty

[Read broken CSV files faster — csv-reader-speed-01-run-20261121](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
($100 pot, 1st–10th $10 each, closes 23 Nov 2026 09:42 WIB).
