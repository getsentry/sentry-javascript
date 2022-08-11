import { getExportIdentifierNames, hasDefaultExport, makeAST } from '../../src/config/loaders/ast';

test.each([
  // examples taken from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/export
  // Exporting declarations
  ['export let name1, name2; export var name3, name4;', false],
  ['export const name1 = 1, name2 = 2;', false],
  ['export var name1 = 1, name2 = 2;', false],
  ['export let name1 = 1, name2 = 2;', false],
  ['export function functionName() {}', false],
  ['export class ClassName {}', false],
  ['export function* generatorFunctionName() {}', false],
  ['export const { name1, bar: name2, someValue: { someNestedValue: name3 }, ...name4 } = {};', false],
  ['export const [ name1, name2, ...name3 ] = [1, 2, 3, 4];', false],
  ['export const { foo: { bar: [{ baz: [name1, ...name2], ...name3 }, name4, name5]} } = {};', false],
  ['export const [{ a: { ...name1 }, b: [,name2] }, name3] = [];', false],
  // Export list
  ['var name1, name2, name3; export { name1, name2, name3 };', false],
  ['var variable1, variable2, name3; export { variable1 as name1, variable2 as name2, name3 };', false],
  ['var name1, name2, name3; export { name1 as default, name1, name2 };', true],
  // Default exports
  ['export default 1;', true],
  ['export default function functionName() {}', true],
  ['export default class ClassName {}', true],
  ['export default function* generatorFunctionName() {}', true],
  ['export default function () {}', true],
  ['export default class {}', true],
  ['export default function* () {}', true],
  ['const someObj = { a: { b: 1 }}; export default a.b', true],
  // Aggregating modules
  ['export * from "module-name";', false],
  ['export * as name1 from "module-name";', false],
  ['export { name1, name2 } from "module-name";', false],
  ['export { import1 as name1, import2 as name2, name3 } from "module-name";', false],
  ['export { default } from "module-name";', true],
  ['export { default, name1 } from "module-name";', true],
])('hasDefaultExport(%s) should return %p', (program, expectedResult) => {
  const ast = makeAST(program);
  expect(hasDefaultExport(ast)).toBe(expectedResult);
});

test.each([
  // examples taken from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/export
  // Exporting declarations
  ['export let name1, name2; export var name3, name4;', ['name1', 'name2', 'name3', 'name4']],
  ['export const name1 = 1, name2 = 2;', ['name1', 'name2']],
  ['export var name1 = 1, name2 = 2;', ['name1', 'name2']],
  ['export let name1 = 1, name2 = 2;', ['name1', 'name2']],
  ['export function functionName() {}', ['functionName']],
  ['export class ClassName {}', ['ClassName']],
  ['export function* generatorFunctionName() {}', ['generatorFunctionName']],
  [
    'export const { name1, bar: name2, someValue: { someNestedValue: name3 }, ...name4 } = {};',
    ['name1', 'name2', 'name3', 'name4'],
  ],
  ['export const [ name1, name2, ...name3 ] = [1, 2, 3, 4];', ['name1', 'name2', 'name3']],
  [
    'export const { foo: { bar: [{ baz: [name1, ...name2], ...name3 }, name4, name5]} } = {};',
    ['name1', 'name2', 'name3', 'name4', 'name5'],
  ],
  ['export const [{ a: { ...name1 }, b: [,name2] }, name3] = [];', ['name1', 'name2', 'name3']],
  // Export list
  [
    `
    var name1, name2, name3;
    export { name1, name2, name3 };`,
    ['name1', 'name2', 'name3'],
  ],
  [
    `
      var variable1, variable2, name3;
      export { variable1 as name1, variable2 as name2, name3 };`,
    ['name1', 'name2', 'name3'],
  ],
  [
    `
    var name1, name2, name3;
    export { name1 as default, name1, name2 };`,
    ['name1', 'name2'],
  ],
  // Default exports
  ['export default 1;', []],
  ['export default function functionName() {}', []],
  ['export default class ClassName {}', []],
  ['export default function* generatorFunctionName() {}', []],
  ['export default function () {}', []],
  ['export default class {}', []],
  ['export default function* () {}', []],
  ['const someObj = { a: { b: 1 }}; export default a.b', []],
  // Aggregating modules
  ['export * from "module-name";', []],
  ['export * as name1 from "module-name";', ['name1']],
  ['export { name1, name2 } from "module-name";', ['name1', 'name2']],
  ['export { import1 as name1, import2 as name2, name3 } from "module-name";', ['name1', 'name2', 'name3']],
  ['export { default } from "module-name";', []],
  ['export { default, name1 } from "module-name";', ['name1']],
])('getExportIdentifiers(%s) should return %p', (program, expectedIdentifiers) => {
  const ast = makeAST(program);
  expect(getExportIdentifierNames(ast)).toStrictEqual(expectedIdentifiers);
});
