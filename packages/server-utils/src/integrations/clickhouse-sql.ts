import type { SqlLexerRules } from '../utils/sql';
import { isIdentifierChar } from '../utils/sql';

const NUMBER_RE = /-?(?:0x[\dA-F_]+|0b[01_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:e[+-]?[\d_]+)?)(?![\w$])/iy;
const FORMAT_RE = /FORMAT(?:\s|\/\*|--|#)/iy;
// After one of these tokens, `format` is a table, column or alias name.
const FORMAT_IDENTIFIER_RE = /(?:\b(?:INTO|TABLE|FROM|JOIN|SELECT|WHERE|AND|OR|BY|AS)|[,.=<>(])\s*$/i;

/**
 * ClickHouse SQL: `"` quotes an identifier as in `standard`, but `\` escapes the next character, `#`
 * starts a line comment, block comments nest, and `$$…$$` heredocs open a literal. Numbers can have
 * `_` separators.
 */
export const CLICKHOUSE_SQL_RULES: SqlLexerRules = {
  hashComments: true,
  nestedComments: true,
  backslashEscapes: true,
  dollarQuote: /\$\w*\$/y,
  matchLiteral(sql, start) {
    if (isIdentifierChar(sql[start - 1]) || sql[start - 1] === '?') {
      return 0;
    }
    NUMBER_RE.lastIndex = start;
    return NUMBER_RE.exec(sql)?.[0].length ?? 0;
  },
  // Everything after the FORMAT clause of an INSERT is inline data. That includes `INSERT ... SELECT`,
  // where the `input()` table function reads that data.
  isInlineData(sql, start, out) {
    if (isIdentifierChar(sql[start - 1])) {
      return false;
    }
    FORMAT_RE.lastIndex = start;
    if (!FORMAT_RE.test(sql)) {
      return false;
    }
    const before = out.join('');
    return /^[\s;]*INSERT\b/i.test(before) && !FORMAT_IDENTIFIER_RE.test(before);
  },
};
