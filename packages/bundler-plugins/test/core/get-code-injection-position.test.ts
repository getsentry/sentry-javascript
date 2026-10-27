import { getCodeInjectionPosition } from '../../src/core/get-code-injection-position';
import { describe, expect, it } from 'vitest';

describe('getCodeInjectionPosition', () => {
  it.each([
    [
      'multiple directives and a block comment',
      `/* license */\n"use client";\n'use strict'\nglobalThis.appStarted = true;`,
      `/* license */\n"use client";\n'use strict'\n`,
    ],
    ['a semicolonless directive before a unary IIFE', '"use strict"\n!function () {}();', '"use strict"\n'],
    ['a CRLF line comment', '// license\r\n"use strict";\r\nstartApp();', '// license\r\n"use strict";\r\n'],
    ['a CR-only line comment', '// license\r"use strict"\rstartApp();', '// license\r"use strict"\r'],
    ['a Unicode line separator', '"use strict"\u2028startApp();', '"use strict"\u2028'],
    ['a Unicode paragraph separator', '"use strict"\u2029startApp();', '"use strict"\u2029'],
    ['a hashbang', '#!/usr/bin/env node\n"use strict";\nstartApp();', '#!/usr/bin/env node\n"use strict";\n'],
    ['an escaped string directive', '"use\\x20strict";\nstartApp();', '"use\\x20strict";\n'],
    [
      'an escaped CRLF in a directive string',
      '"not strict\\\r\n";\n"use strict";\nstartApp();',
      '"not strict\\\r\n";\n"use strict";\n',
    ],
    ['an unterminated string', '"use strict', ''],
    ['an unterminated block comment', '/* license', '/* license'],
    ['leading trivia without directives', '/* license */\nstartApp();', '/* license */\n'],
    ['a prefix increment statement', '"use strict"\n++value;', '"use strict"\n'],
    ['a prefix decrement statement', '"use strict"\n--value;', '"use strict"\n'],
    ['an inequality continuation', '"not a directive"\n!= expectedValue;', ''],
    ['an addition continuation', '"not a directive"\n+ otherValue;', ''],
    ['an identifier prefixed with in', '"use strict"\nin$foo: ;', '"use strict"\n'],
    ['a Unicode identifier prefixed with instanceof', '"use strict"\ninstanceofπ: ;', '"use strict"\n'],
    ['an escaped identifier prefixed with in', '"use strict"\nin\\u0066oo: ;', '"use strict"\n'],
  ])('returns the injection position for %s', (_description, code, expectedPrefix) => {
    expect(code.slice(0, getCodeInjectionPosition(code))).toBe(expectedPrefix);
  });
});
