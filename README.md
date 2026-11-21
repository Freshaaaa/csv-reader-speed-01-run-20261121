# csv-reader-speed-01 — fast drop-in for csv-reader 1.0.0

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/Freshaaaa/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/Freshaaaa/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)

A dependency-free ES module (`solve.js`) that answers exactly what
[csv-reader 1.0.0](https://www.npmjs.com/package/csv-reader) answers —
`{columns, rows, errors}` for `{text, header}` — but ~2.4x faster on the
practice set (~0.68s vs ~1.63s CPU for the baseline on this box, 6 cases,
~11 MB). `main.ts` reads every case from `/input/cases.json`, answers each
with `run()`, and writes `/output/answers.json`.

## How it is fast

- The scanner jumps between delimiters with `indexOf` and slices fields in
  bulk instead of walking the text a character at a time.
- Fast path: a record that is one line with no quotes and no CRs is split
  on commas in a single C++ `split` call.
- Quoted chunks are sliced once and normalised only when they actually
  contain a line break; stray CRs are stripped from the short slice, never
  by an unbounded scan (CRs are sparse, so scanning for them is slow).
- No regex in the hot path, no per-character loop, minimal allocations.
- `main.ts` parses and stringifies one case at a time, so a case's answer
  objects are garbage before the next case is parsed (holding all six
  answers at once doubles the live heap and the parse time).
- No V8 flag tuning: `--no-incremental-marking` (which the baseline sets)
  made this parser ~60% slower, so it is left at the default.

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
L1 regrade reproduced byte for byte, run twice.

## Bounty

[Read broken CSV files faster — csv-reader-speed-01-run-20261121](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
($100 pot, 1st–10th $10 each, closes 23 Nov 2026 09:42 WIB).
