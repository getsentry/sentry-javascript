import type { JsonToken } from './constants';
import {
  ARR,
  ARR_COMMA,
  ARR_VAL,
  ARR_VAL_COMPLETED,
  ARR_VAL_STR,
  OBJ,
  OBJ_COLON,
  OBJ_COMMA,
  OBJ_KEY,
  OBJ_KEY_STR,
  OBJ_VAL,
  OBJ_VAL_COMPLETED,
  OBJ_VAL_STR,
} from './constants';

/**
 * Evaluate an (incomplete) JSON string.
 */
export function evaluateJson(json: string): JsonToken[] {
  const stack: JsonToken[] = [];

  for (let pos = 0; pos < json.length; pos++) {
    _evaluateJsonPos(stack, json, pos);
  }

  return stack;
}

function _evaluateJsonPos(stack: JsonToken[], json: string, pos: number): void {
  const curStep = stack[stack.length - 1];

  const char = json[pos];

  const whitespaceRegex = /\s/;

  if (whitespaceRegex.test(char)) {
    return;
  }

  if (char === '"' && !_isEscaped(json, pos)) {
    _handleQuote(stack, curStep);
    return;
  }

  switch (char) {
    case '{':
      _handleObj(stack, curStep);
      break;
    case '[':
      _handleArr(stack, curStep);
      break;
    case ':':
      _handleColon(stack, curStep);
      break;
    case ',':
      _handleComma(stack, curStep);
      break;
    case '}':
      _handleObjClose(stack, curStep);
      break;
    case ']':
      _handleArrClose(stack, curStep);
      break;
  }
}

function _handleQuote(stack: JsonToken[], curStep: JsonToken): void {
  // End of obj value
  if (curStep === OBJ_VAL_STR) {
    stack.pop();
    stack.push(OBJ_VAL_COMPLETED);
    return;
  }

  // End of arr value
  if (curStep === ARR_VAL_STR) {
    stack.pop();
    stack.push(ARR_VAL_COMPLETED);
    return;
  }

  // Start of obj value
  if (curStep === OBJ_VAL) {
    stack.pop();
    stack.push(OBJ_VAL_STR);
    return;
  }

  // Start of arr value
  if (curStep === ARR_COMMA) {
    stack.pop();
    stack.push(ARR_VAL_STR);
    return;
  }

  // Start of arr value
  if (curStep === ARR_VAL) {
    stack.push(ARR_VAL_STR);
    return;
  }

  // Start of obj key
  if (curStep === OBJ) {
    stack.push(OBJ_KEY_STR);
    return;
  }
  if (curStep == OBJ_COMMA) {
    stack.pop();
    stack.push(OBJ_KEY_STR);
    return;
  }

  // End of obj key
  if (curStep === OBJ_KEY_STR) {
    stack.pop();
    stack.push(OBJ_KEY);
    return;
  }
}

function _handleObj(stack: JsonToken[], curStep: JsonToken): void {
  // Initial object
  if (!curStep) {
    stack.push(OBJ);
    return;
  }

  // New object as obj value
  if (curStep === OBJ_VAL) {
    stack.push(OBJ);
    return;
  }

  // New object as array element
  if (curStep === ARR_VAL) {
    stack.push(OBJ);
  }

  // New object as first array element
  if (curStep === ARR) {
    stack.push(OBJ);
    return;
  }
}

function _handleArr(stack: JsonToken[], curStep: JsonToken): void {
  // Initial array
  if (!curStep) {
    stack.push(ARR);
    stack.push(ARR_VAL);
    return;
  }

  // New array as obj value
  if (curStep === OBJ_VAL) {
    stack.push(ARR);
    stack.push(ARR_VAL);
    return;
  }

  // New array as array element
  if (curStep === ARR_VAL) {
    stack.push(ARR);
    stack.push(ARR_VAL);
  }

  // New array as first array element
  if (curStep === ARR) {
    stack.push(ARR);
    stack.push(ARR_VAL);
    return;
  }
}

function _handleColon(stack: JsonToken[], curStep: JsonToken): void {
  if (curStep === OBJ_KEY) {
    stack.pop();
    stack.push(OBJ_COLON);
    stack.push(OBJ_VAL);
  }
}

function _handleComma(stack: JsonToken[], curStep: JsonToken): void {
  // Comma after obj value
  if (curStep === OBJ_VAL) {
    stack.pop();
    stack.push(OBJ_COMMA);
    return;
  }
  if (curStep === OBJ_VAL_COMPLETED) {
    stack.pop();
    stack.pop();
    stack.push(OBJ_COMMA);
    return;
  }

  // Comma after arr value
  if (curStep === ARR_VAL) {
    stack.pop();
    stack.push(ARR_COMMA);
    stack.push(ARR_VAL);
    return;
  }

  if (curStep === ARR_VAL_COMPLETED) {
    stack.pop();
    stack.pop();
    stack.push(ARR_COMMA);
    stack.push(ARR_VAL);
    return;
  }
}

function _handleObjClose(stack: JsonToken[], curStep: JsonToken): void {
  // Empty object {}
  if (curStep === OBJ) {
    stack.pop();
    return;
  }
  // End of object - pops OBJ_VAL_COMPLETED, OBJ_VAL, OBJ
  if (curStep === OBJ_VAL_COMPLETED) {
    stack.pop();
    stack.pop();
    stack.pop();
    return;
  }
  // Pops OBJ_VAL, OBJ
  if (curStep === OBJ_VAL) {
    stack.pop();
    stack.pop();
    return;
  }
}

function _handleArrClose(stack: JsonToken[], curStep: JsonToken): void {
  // End of array - pops ARR_VAL_COMPLETED, ARR_VAL, ARR
  if (curStep === ARR_VAL_COMPLETED) {
    stack.pop();
    stack.pop();
    stack.pop();

    // If we had ARR_COMMA in between, we have one more step to pop
    if (stack[stack.length - 1] === ARR) {
      stack.pop();
    }
    return;
  }
  // Pops ARR_VAL, ARR
  if (curStep === ARR_VAL) {
    stack.pop();
    stack.pop();

    // If we had ARR_COMMA in between, we have one more step to pop
    if (stack[stack.length - 1] === ARR) {
      stack.pop();
    }
    return;
  }
}

function _isEscaped(str: string, pos: number): boolean {
  const previousChar = str[pos - 1];

  return previousChar === '\\' && !_isEscaped(str, pos - 1);
}
