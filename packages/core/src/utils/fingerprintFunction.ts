import { fnv1a32 } from './hash';

/**
 * Keywords minifiers never rename and that change what a function does.
 * Contextual words (`async`, `of`, `get`, `set`, `static`) are left out on purpose: minifiers may use them as names.
 */
const KEYWORDS = new Set(
  'break catch const continue default delete else finally for function if instanceof let new switch throw try var while await return typeof void in case this null true false undefined'.split(
    ' ',
  ),
);

/**
 * One alternative per kind of token: whitespace and comments, quoted string, backtick, spread, increment, a name (with
 * an optional leading `.` or `?.` and a lookahead for a following `:`), regex literal, number, and any other character.
 */
const TOKEN =
  /(?:\s|\/\/.*|\/\*[^]*?(?:\*\/|$))+|"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`|\.\.\.|\+\+|--|(\??\.#?|#)?([A-Za-z_$][\w$]*)(?=(\s*:)?)|\/(?:[^/\\\n[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+\/\w*|\d[\w.]*|[^]/g;

/**
 * The rest of a template part, up to the closing backtick or the next `${`.
 */
const TEMPLATE = /(?:[^`\\$]|\\.|\$(?!\{))*(?:`|\$\{|$)/y;

/**
 * Tokens after which a `/` is a division rather than the start of a regex literal.
 */
const ENDS_VALUE = /(?:[\w$"'`)\]]|\+\+|--)$/;

/**
 * Fingerprints a function with every name a minifier can rename blanked out, so that a bundler renaming identifiers
 * doesn't change the result.
 *
 * This is a regex-driven scan rather than a parser, kept small for bundle size. It only aims to be stable across
 * builds made with the same minifier: inlined helpers, reordered operands, different quote or number spellings, and
 * shorthand keys written out in full still change the result. Method names and shorthand keys are blanked like any
 * other name, and a label at the start of a block is kept like an object key.
 */
export function fingerprintFunction(fn: (...args: never[]) => unknown): string {
  let source: string;
  try {
    source = Function.prototype.toString.call(fn);
  } catch {
    return 'unknown';
  }

  return fnv1a32(tokenize(source).join(' '));
}

/**
 * Splits source into tokens, replacing every name that is not a keyword, a property or an object key with `_`.
 */
export function tokenize(src: string): string[] {
  const tokens: string[] = [];
  // `true` for each open `${`, `false` for each open `{`.
  const braces: boolean[] = [];
  let prev = '';
  let match;
  TOKEN.lastIndex = 0;

  while ((match = TOKEN.exec(src))) {
    let token = match[0];
    const ch = token[0] as string;

    if (ch <= ' ' || (ch === '/' && (token[1] === '/' || token[1] === '*'))) {
      continue;
    }

    if (ch === '`' || (ch === '}' && braces.pop())) {
      TEMPLATE.lastIndex = TOKEN.lastIndex;
      TEMPLATE.test(src);
      token = src.slice(match.index, (TOKEN.lastIndex = TEMPLATE.lastIndex));
      if (token.endsWith('${')) {
        braces.push(true);
      }
    } else if (ch === '{') {
      braces.push(false);
    } else if (match[2]) {
      // Property names and object keys survive minification, every other name is anonymous.
      if (!match[1] && !KEYWORDS.has(token) && !(match[3] && (prev === '{' || prev === ','))) {
        token = '_';
      }
    } else if (ch === '/' && token[1] && ENDS_VALUE.test(prev) && (!KEYWORDS.has(prev) || prev === 'this')) {
      // A division, not a regex literal: emit the slash alone and rescan what follows.
      token = ch;
      TOKEN.lastIndex = match.index + 1;
    }

    tokens.push((prev = token));
  }

  return tokens;
}
