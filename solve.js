// Fast drop-in for csv-reader 1.0.0 (make.fun): identical answers, faster.
// One function, everything inlined: the scanner jumps between delimiters
// with indexOf and slices fields in bulk instead of walking the text a
// character at a time. Every branch mirrors vendor/csv-reader/index.js
// (csv-reader 1.0.0) exactly:
// - U+FEFF at the very start is dropped;
// - a record ends at LF or CRLF, an empty line is no record;
// - outside quotes a CR not followed by LF is dropped (stray_cr);
// - a quoted field runs to the next non-doubled quote, "" inside is one
//   quote, CRLF / lone CR inside read as LF; text after the closing quote
//   up to the next comma or line break is appended as-is (quote_junk);
// - an unclosed quote is a literal, the text after it re-read as unquoted
//   (unterminated_quote); a quote inside an unquoted field is literal.
// - fields stay strings; columns is the first record when header, else null;
//   rows are padded (short_row, fields: count) or cut (long_row, extra: cut)
//   to the first record's width; errors {code, line, row} in order met.

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let pos = 0;
  let line = 1;
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  let recordLine = 1;
  let recordRow = null;

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos++;
        line++;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the whole record is one line with no quotes and no CRs.
    // Split it on commas in one C++ call instead of scanning field by field.
    // (A line with a quote or a CR falls through to the field scanner below.)
    const lineEnd = text.indexOf('\n', pos);
    const le = lineEnd === -1 ? n : lineEnd;
    const qIdx = text.indexOf('"', pos);
    const rIdx = text.indexOf('\r', pos);
    let fields;
    let isQuoted = false;
    if ((qIdx === -1 || qIdx >= le) && (rIdx === -1 || rIdx >= le)) {
      fields = text.slice(pos, le).split(',');
      pos = lineEnd === -1 ? n : lineEnd + 1;
      line++;
    } else {
      fields = [];
      let ended = 0; // 0 = comma (read another field), 1 = break, 2 = end

    do {
      let value;
      if (text.charCodeAt(pos) === 34) {
        // ---------- quoted field ----------
        isQuoted = true;
        const open = pos;
        const openLine = line;
        let p = pos + 1;
        value = '';
        let closed = false;
        for (;;) {
          const q = text.indexOf('"', p);
          if (q === -1) break; // never closes
          if (text.charCodeAt(q + 1) === 34) {
            // Doubled quote: chunk [p, q) plus one literal quote.
            const s = text.slice(p, q);
            if (s.indexOf('\n') === -1 && s.indexOf('\r') === -1) {
              value += s;
            } else if (s.indexOf('\r') === -1) {
              let c = 0;
              let k = 0;
              for (;;) {
                const j = s.indexOf('\n', k);
                if (j === -1) break;
                c++;
                k = j + 1;
              }
              line += c;
              value += s;
            } else {
              let out = '';
              let k = 0;
              const m = s.length;
              while (k < m) {
                const ch = s.charCodeAt(k);
                if (ch === 13) {
                  out += '\n';
                  line++;
                  k += s.charCodeAt(k + 1) === 10 ? 2 : 1;
                } else {
                  if (ch === 10) line++;
                  out += s[k];
                  k++;
                }
              }
              value += out;
            }
            value += '"';
            p = q + 2;
            continue;
          }
          // Closing quote: chunk [p, q).
          const s = text.slice(p, q);
          if (s.indexOf('\n') === -1 && s.indexOf('\r') === -1) {
            value += s;
          } else if (s.indexOf('\r') === -1) {
            let c = 0;
            let k = 0;
            for (;;) {
              const j = s.indexOf('\n', k);
              if (j === -1) break;
              c++;
              k = j + 1;
            }
            line += c;
            value += s;
          } else {
            let out = '';
            let k = 0;
            const m = s.length;
            while (k < m) {
              const ch = s.charCodeAt(k);
              if (ch === 13) {
                out += '\n';
                line++;
                k += s.charCodeAt(k + 1) === 10 ? 2 : 1;
              } else {
                if (ch === 10) line++;
                out += s[k];
                k++;
              }
            }
            value += out;
          }
          p = q + 1;
          closed = true;
          break;
        }
        if (!closed) {
          // The quote never closes: it is a literal, the text after it is
          // read again as unquoted.
          pos = open + 1;
          line = openLine;
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          value = '"';
          // Fall through to the unquoted reader below, starting at pos.
          // (The unquoted block is shared: it reads from pos and appends
          // to value, counting added characters.)
          // eslint-disable-next-line no-fallthrough
          // --- unquoted continuation (base = '"') ---
          {
            const ci = text.indexOf(',', pos);
            const ni = text.indexOf('\n', pos);
            let end;
            let kind;
            if (ci === -1 && ni === -1) {
              end = n;
              kind = 2;
            } else if (ni === -1 || (ci !== -1 && ci < ni)) {
              end = ci;
              kind = 0;
            } else {
              end = ni;
              kind = 1;
            }
            let spanEnd = end;
            if (kind === 1 && end > pos && text.charCodeAt(end - 1) === 13) spanEnd = end - 1;
            let f = text.slice(pos, spanEnd);
            if (f.indexOf('\r') !== -1) {
              let out = '';
              let k = 0;
              let cnt = 0;
              for (;;) {
                const j = f.indexOf('\r', k);
                if (j === -1) {
                  out += f.slice(k);
                  break;
                }
                cnt++;
                out += f.slice(k, j);
                k = j + 1;
              }
              for (let i = 0; i < cnt; i++) errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
              f = out;
            }
            value += f;
            if (kind === 0) {
              pos = end + 1;
              ended = 0;
            } else if (kind === 1) {
              pos = end + 1;
              line++;
              ended = 1;
            } else {
              pos = n;
              ended = 2;
            }
          }
          fields.push(value);
          continue;
        }
        if (p >= n) {
          pos = n;
          ended = 2;
          fields.push(value);
          continue;
        }
        const c = text.charCodeAt(p);
        if (c === 44) {
          pos = p + 1;
          ended = 0;
          fields.push(value);
          continue;
        }
        if (c === 10) {
          pos = p + 1;
          line++;
          ended = 1;
          fields.push(value);
          continue;
        }
        if (c === 13 && text.charCodeAt(p + 1) === 10) {
          pos = p + 2;
          line++;
          ended = 1;
          fields.push(value);
          continue;
        }
        // What follows the closing quote is appended as it stands, up to
        // the next comma or line break (quote_junk when anything is added).
        pos = p;
        {
          const ci = text.indexOf(',', pos);
          const ni = text.indexOf('\n', pos);
          let end;
          let kind;
          if (ci === -1 && ni === -1) {
            end = n;
            kind = 2;
          } else if (ni === -1 || (ci !== -1 && ci < ni)) {
            end = ci;
            kind = 0;
          } else {
            end = ni;
            kind = 1;
          }
          let spanEnd = end;
          if (kind === 1 && end > pos && text.charCodeAt(end - 1) === 13) spanEnd = end - 1;
          let f = text.slice(pos, spanEnd);
          if (f.indexOf('\r') !== -1) {
            let out = '';
            let k = 0;
            let cnt = 0;
            for (;;) {
              const j = f.indexOf('\r', k);
              if (j === -1) {
                out += f.slice(k);
                break;
              }
              cnt++;
              out += f.slice(k, j);
              k = j + 1;
            }
            for (let i = 0; i < cnt; i++) errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            f = out;
          }
          if (f.length > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
          value += f;
          if (kind === 0) {
            pos = end + 1;
            ended = 0;
          } else if (kind === 1) {
            pos = end + 1;
            line++;
            ended = 1;
          } else {
            pos = n;
            ended = 2;
          }
        }
        fields.push(value);
        continue;
      }
      // ---------- unquoted field ----------
      isQuoted = false;
      {
        const ci = text.indexOf(',', pos);
        const ni = text.indexOf('\n', pos);
        let end;
        let kind;
        if (ci === -1 && ni === -1) {
          end = n;
          kind = 2;
        } else if (ni === -1 || (ci !== -1 && ci < ni)) {
          end = ci;
          kind = 0;
        } else {
          end = ni;
          kind = 1;
        }
        let spanEnd = end;
        if (kind === 1 && end > pos && text.charCodeAt(end - 1) === 13) spanEnd = end - 1;
        let f = text.slice(pos, spanEnd);
        if (f.indexOf('\r') !== -1) {
          let out = '';
          let k = 0;
          let cnt = 0;
          for (;;) {
            const j = f.indexOf('\r', k);
            if (j === -1) {
              out += f.slice(k);
              break;
            }
            cnt++;
            out += f.slice(k, j);
            k = j + 1;
          }
          for (let i = 0; i < cnt; i++) errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
          f = out;
        }
        value = f;
        if (kind === 0) {
          pos = end + 1;
          ended = 0;
        } else if (kind === 1) {
          pos = end + 1;
          line++;
          ended = 1;
        } else {
          pos = n;
          ended = 2;
        }
      }
      fields.push(value);
    } while (ended === 0);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !isQuoted) continue;
    }

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? columns ?? [] : null, rows, errors };
}
