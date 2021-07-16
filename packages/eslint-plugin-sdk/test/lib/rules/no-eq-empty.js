/**
 * @fileoverview Rule to disallow using the equality operator with empty array
 * @author Abhijeet Prasad
 */
'use strict';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const rule = require('../../../src/rules/no-eq-empty');
const RuleTester = require('eslint').RuleTester;

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

RuleTester.setDefaultConfig({
  parserOptions: {
    ecmaVersion: 8,
  },
});
const ruleTester = new RuleTester();

const arrayMessage = 'Do not apply the equality operator on an empty array. Use .length or Array.isArray instead.';
const objectMessage = 'Do not apply the equality operator on an empty object.';

ruleTester.run('no-eq-empty', rule, {
  valid: [
    {
      code: 'const hey = [] === []',
    },
    {
      code: 'const hey = [] == []',
    },
    {
      code: 'const hey = {} === {}',
    },
    {
      code: 'const hey = {} == {}',
    },
  ],
  invalid: [
    {
      code: 'empty === []',
      errors: [
        {
          message: arrayMessage,
          type: 'BinaryExpression',
        },
      ],
    },
    {
      code: 'empty == []',
      errors: [
        {
          message: arrayMessage,
          type: 'BinaryExpression',
        },
      ],
    },
    {
      code: 'const hey = function() {}() === []',
      errors: [
        {
          message: arrayMessage,
          type: 'BinaryExpression',
        },
      ],
    },
    {
      code: 'empty === {}',
      errors: [
        {
          message: objectMessage,
          type: 'BinaryExpression',
        },
      ],
    },
    {
      code: 'empty == {}',
      errors: [
        {
          message: objectMessage,
          type: 'BinaryExpression',
        },
      ],
    },
    {
      code: 'const hey = function(){}() === {}',
      errors: [
        {
          message: objectMessage,
          type: 'BinaryExpression',
        },
      ],
    },
  ],
});
