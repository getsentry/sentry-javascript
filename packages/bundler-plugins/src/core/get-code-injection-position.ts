function isLineTerminator(character: string | undefined): boolean {
  return character === '\n' || character === '\r' || character === '\u2028' || character === '\u2029';
}

function skipTrivia(code: string, start: number): { end: number; hasLineBreak: boolean } {
  let position = start;
  let hasLineBreak = false;

  while (position < code.length) {
    const character = code[position];

    if (/\s/.test(character || '')) {
      hasLineBreak ||= isLineTerminator(character);
      position++;
    } else if (code.startsWith('//', position) || (position === 0 && code.startsWith('#!', position))) {
      let lineEnd = position + 2;
      while (lineEnd < code.length && !isLineTerminator(code[lineEnd])) {
        lineEnd++;
      }
      if (lineEnd === code.length) {
        return { end: code.length, hasLineBreak };
      }
      position = lineEnd + 1;
      hasLineBreak = true;
    } else if (code.startsWith('/*', position)) {
      const commentEnd = code.indexOf('*/', position + 2);
      if (commentEnd === -1) {
        return { end: code.length, hasLineBreak };
      }
      const comment = code.slice(position, commentEnd + 2);
      hasLineBreak ||= /[\n\r\u2028\u2029]/.test(comment);
      position = commentEnd + 2;
    } else {
      break;
    }
  }

  return { end: position, hasLineBreak };
}

function findStringLiteralEnd(code: string, start: number): number | undefined {
  const quote = code[start];
  if (quote !== '"' && quote !== "'") {
    return undefined;
  }

  for (let position = start + 1; position < code.length; position++) {
    const character = code[position];
    if (character === '\\') {
      position += code[position + 1] === '\r' && code[position + 2] === '\n' ? 2 : 1;
    } else if (character === quote) {
      return position + 1;
    } else if (isLineTerminator(character)) {
      return undefined;
    }
  }

  return undefined;
}

function startsWithBinaryOperatorKeyword(remainder: string, keyword: string): boolean {
  return remainder.startsWith(keyword) && !/^[$_\\\u200C\u200D\p{ID_Continue}]/u.test(remainder.slice(keyword.length));
}

function canContinueStringExpression(code: string, position: number): boolean {
  const remainder = code.slice(position);
  if (/^(?:\+\+|--|!(?!=))/.test(remainder)) {
    return false;
  }

  return (
    /^!={1,2}/.test(remainder) ||
    /^[([.`+\-*/%<>=&|^?,:]/.test(remainder) ||
    ['in', 'instanceof'].some(keyword => startsWithBinaryOperatorKeyword(remainder, keyword))
  );
}

export function getCodeInjectionPosition(code: string): number {
  let position = skipTrivia(code, 0).end;
  let prologueEnd = position;

  while (position < code.length) {
    const stringEnd = findStringLiteralEnd(code, position);
    if (stringEnd === undefined) {
      break;
    }

    const trailingTrivia = skipTrivia(code, stringEnd);
    if (code[trailingTrivia.end] === ';') {
      position = skipTrivia(code, trailingTrivia.end + 1).end;
    } else if (
      trailingTrivia.end === code.length ||
      (trailingTrivia.hasLineBreak && !canContinueStringExpression(code, trailingTrivia.end))
    ) {
      position = trailingTrivia.end;
    } else {
      break;
    }

    prologueEnd = position;
  }

  return prologueEnd;
}
