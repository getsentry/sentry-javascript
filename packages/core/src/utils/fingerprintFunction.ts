import { fnv1a32 } from './hash';

/**
 * Keywords minifiers never rename and that change what a function does, plus `undefined`, which they spell `void 0`.
 * Contextual words (`async`, `of`, `get`, `set`, `static`) are left out on purpose: minifiers may use them as names.
 * So are words an options callback is very unlikely to contain (`class`, `extends`, `super`, `yield`, `import`, `do`,
 * `export`, `debugger`, `with`), to keep the list short. They are treated as ordinary names.
 */
const KEYWORDS = new Set(
  'break catch const continue default delete else finally for function if instanceof let new switch throw try var while await return typeof void in case this null true false undefined'.split(
    ' ',
  ),
);

/**
 * After these tokens a `{` opens an object literal rather than a block.
 */
const OBJECT_CONTEXT = new Set(
  '( [ , = : ? ?? || && ! ... return typeof void in case const let var throw await'.split(' '),
);

/**
 * After these keywords, as after any name or literal, a `/` is a division rather than the start of a regex literal.
 */
const VALUE_KEYWORDS = new Set('this null true false undefined'.split(' '));

/**
 * Matches the longest punctuator at `lastIndex`, or else any one character. `a?.5:b` is a conditional, not optional
 * chaining. A match is at most four characters long, so it cannot backtrack over the input.
 */
const PUNCTUATOR = /\.\.\.|=>|\?\.(?!\d)|\?\?=?|[=!]==?|\+\+|--|>>>=?|([*&|<>])\1?=?|[-+/%^]=|[^]/y;

/**
 * The last two are a no-break space and a byte order mark.
 */
const WHITESPACE = ' \n\t\r\u00a0\ufeff';

/**
 * Fingerprints a function's behavior rather than its text: identifiers a minifier renames, whitespace, comments,
 * quote styles, number spellings and common minifier rewrites don't change the result.
 *
 * Inlined helpers, reordered operands, closures over different values and engine-specific source text still do.
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
 * Splits source into tokens in their minification-independent form, in one linear pass. Unterminated strings, comments
 * and regexes run to the end of the input.
 */
// oxlint-disable-next-line complexity
export function tokenize(src: string): string[] {
  const tokens: string[] = [];
  // What each open bracket belongs to: `true` for an object literal, `false` for a block, `(` or `[`, `null` for a
  // template `${`. Only names directly inside an object literal can be its keys.
  const braces: Array<boolean | null> = [];
  const length = src.length;
  let i = 0;
  // Whether a `/` here would be a division rather than the start of a regex literal.
  let afterValue: boolean | undefined;
  // The name of the previous token when it is an identifier that starts an object literal entry.
  let key: string | undefined;

  const push = (token: string, endsValue?: boolean): void => {
    tokens.push(token);
    afterValue = endsValue;
    key = '';
  };

  while (i < length) {
    const start = i;
    const ch = src[i] as string;
    const next = src[i + 1] as string;
    const previous = tokens[tokens.length - 1];

    if (WHITESPACE.includes(ch)) {
      i++;
      continue;
    }

    if (ch === '/' && (next === '/' || next === '*')) {
      const end = src.indexOf(next === '/' ? '\n' : '*/', i + 2);
      i = end < 0 ? length : end + (next === '/' ? 1 : 2);
      continue;
    }

    if (ch === '"' || ch === "'") {
      let value = '';
      for (i++; i < length && src[i] !== ch; i++) {
        value +=
          src[i] !== '\\'
            ? src[i]
            : // An escaped quote means the same thing whichever quote style the minifier picked.
              src[++i] === '"' || src[i] === "'"
              ? src[i]
              : src.slice(i - 1, i + 1);
      }
      i++;
      push(JSON.stringify(value), true);
      continue;
    }

    const closes = ch === '}' ? braces.pop() : undefined;
    // A template part runs from the opening backtick, or from the `}` that ends a substitution, up to the closing
    // backtick or the next `${`.
    if (ch === '`' || closes === null) {
      let text = '';
      i++;
      while (i < length) {
        const c = src[i++] as string;
        text += c;
        if (c === '\\') {
          text += src.slice(i, ++i);
        } else if (c === '`') {
          break;
        } else if (c === '$' && src[i] === '{') {
          text += src[i++];
          braces.push(null);
          break;
        }
      }
      const isClosed = text.endsWith('`');
      // A template without substitutions is a plain string to a minifier.
      push(ch === '`' && isClosed ? JSON.stringify(text.slice(0, -1)) : `\`${text}`, isClosed);
      continue;
    }

    if (isDigit(ch) || (ch === '.' && isDigit(next))) {
      // Hex digits include `e`, so `0x1e+1` is an addition, not an exponent.
      const isHex = ch === '0' && (next === 'x' || next === 'X');
      let c;
      while (
        ++i < length &&
        (isIdentifierChar((c = src[i] as string)) ||
          c === '.' ||
          (!isHex && (c === '+' || c === '-') && (src[i - 1] === 'e' || src[i - 1] === 'E')))
      );
      let number = src.slice(start, i);
      if (previous === 'void' && number === '0') {
        // `void 0` is how minifiers spell `undefined`.
        tokens.pop();
        number = 'undefined';
      } else if (previous === '!' && (number === '0' || number === '1')) {
        // `!0` and `!1` are how minifiers spell `true` and `false`.
        tokens.pop();
        number = number === '0' ? 'true' : 'false';
      }
      push(canonicalNumber(number), true);
      continue;
    }

    if (isIdentifierStart(ch)) {
      while (++i < length && isIdentifierChar(src[i] as string));
      const word = src.slice(start, i);
      if (KEYWORDS.has(word)) {
        push(word, VALUE_KEYWORDS.has(word));
      } else if (previous === '.' || previous === '?.' || previous === '#') {
        // `a.b`, `a?.b` and `#b`: property names survive minification.
        push(JSON.stringify(word), true);
      } else {
        // Without scope analysis a global can't be told from a local, so every other name is anonymous.
        push('_', true);
        if (braces[braces.length - 1] && (previous === '{' || previous === ',')) {
          key = word;
        }
      }
      continue;
    }

    if (ch === '/' && !afterValue) {
      let inClass = false;
      let c;
      for (i++; i < length && (c = src[i]) !== '\n' && (c !== '/' || inClass); i++) {
        if (c === '\\') {
          i++;
        } else {
          inClass = c === '[' || (c !== ']' && inClass);
        }
      }
      // The closing slash, then the flags.
      while (++i < length && isIdentifierChar(src[i] as string));
      push(src.slice(start, i), true);
      continue;
    }

    if (ch === '{') {
      // Only a template part can end in `${`: strings are quoted and regexes end at a slash or a newline.
      braces.push(!previous || OBJECT_CONTEXT.has(previous) || previous.endsWith('${'));
    } else if (ch === '(' || ch === '[') {
      braces.push(false);
    } else if (ch === ')' || ch === ']') {
      braces.pop();
    }

    PUNCTUATOR.lastIndex = i;
    PUNCTUATOR.test(src);
    i = PUNCTUATOR.lastIndex;
    // Minifiers turn `===` and `!==` into `==` and `!=` where both sides are known to share a type. Those two are the
    // only three-character punctuators with `=` in the middle.
    const punctuator = src.slice(start, next === '=' && i - start > 2 ? i - 1 : i);

    if (key && ':(,}='.includes(punctuator)) {
      // Object keys survive minification too.
      tokens[tokens.length - 1] = JSON.stringify(key);
      // Shorthand `{event}` becomes `{event:e}` once the binding is renamed, and `{level=1}` becomes `{level:e=1}`.
      if (',}='.includes(punctuator)) {
        tokens.push(':', previous as string);
      }
    }

    // A regex can follow a block's `}` but not an object's, nor postfix `++` or `--`.
    push(punctuator, ')]'.includes(ch) || closes === true || punctuator == '++' || punctuator == '--');
  }

  return tokens;
}

/**
 * Spells a number the same way however the source wrote it, since minifiers rewrite `0.10` to `.1` and `1000` to `1e3`.
 */
function canonicalNumber(raw: string): string {
  const digits = raw.replace(/_/g, '');
  if (digits.endsWith('n')) {
    return digits;
  }
  const value = Number(digits);

  return Number.isNaN(value) ? raw : String(value);
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isIdentifierStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$' || ch > '\x7f';
}

function isIdentifierChar(ch: string): boolean {
  return isIdentifierStart(ch) || isDigit(ch);
}
