import { isESM } from '../../src/utils/isESM';

// Based on https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import
describe('import syntax', function () {
  it('recognizes import syntax', function () {
    expect(isESM("import dogs from 'dogs';")).toBe(true);
    expect(isESM("import * as dogs from 'dogs';")).toBe(true);
    expect(isESM("import { maisey } from 'dogs';")).toBe(true);
    expect(isESM("import { charlie as goofball } from 'dogs';")).toBe(true);
    expect(isESM("import { default as maisey } from 'dogs';")).toBe(true);
    expect(isESM("import { charlie, masiey } from 'dogs';")).toBe(true);
    expect(isESM("import { masiey, charlie as pickle } from 'dogs';")).toBe(true);
    expect(isESM("import charlie, { maisey } from 'dogs';")).toBe(true);
    expect(isESM("import maisey, * as dogs from 'dogs';")).toBe(true);
    expect(isESM("import 'dogs';")).toBe(true);
  });
});

// Based on https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Statements/export
describe('export syntax', function () {
  it('recognizes exported declarations', () => {
    expect(isESM('export var maisey, charlie;')).toBe(true);
    expect(isESM('export let charlie, maisey;')).toBe(true);
    expect(isESM("export var maisey = 'silly', charlie = 'goofy';")).toBe(true);
    expect(isESM("export let charlie = 'goofy', maisey = 'silly';")).toBe(true);
    expect(isESM("export const maisey = 'silly', charlie = 'goofy';")).toBe(true);
    expect(isESM('export function doDogStuff() { /* ... */ }')).toBe(true);
    expect(isESM('export class Dog { /* ... */ }')).toBe(true);
    expect(isESM('export function* generateWayTooManyPhotosOnMyPhone() { /* ... */ }')).toBe(true);
    expect(isESM('export const { maisey, charlie } = dogObject;')).toBe(true);
    expect(isESM('export const { charlie, masiey: maiseyTheDog } = dogObject;')).toBe(true);
    expect(isESM('export const [ maisey, charlie ] = dogArray;')).toBe(true);
  });

  it('recognizes lists of exports', () => {
    expect(isESM('export { maisey, charlie };')).toBe(true);
    expect(isESM('export { charlie as charlieMcCharlerson, masiey as theMaiseyMaiseyDog };')).toBe(true);
    expect(isESM('export { charlie as default  };')).toBe(true);
  });

  it('recognizes default exports', () => {
    expect(isESM("export default 'dogs are great';")).toBe(true);
    expect(isESM('export default function doDogStuff() { /* ... */ }')).toBe(true);
    expect(isESM('export default class Dog { /* ... */ }')).toBe(true);
    expect(isESM('export default function* generateWayTooManyPhotosOnMyPhone() { /* ... */ }')).toBe(true);
    expect(isESM('export default function () { /* ... */ }')).toBe(true);
    expect(isESM('export default class { /* ... */ }')).toBe(true);
    expect(isESM('export default function* () { /* ... */ }')).toBe(true);
  });

  it('recognizes exports directly from another module', () => {
    expect(isESM("export * from 'dogs';")).toBe(true);
    expect(isESM("export * as dogs from 'dogs';")).toBe(true);
    expect(isESM("export { maisey, charlie } from 'dogs';")).toBe(true);
    expect(
      isESM("export { maisey as goodGirl, charlie as omgWouldYouJustPeeAlreadyIWantToGoToBed } from 'dogs';"),
    ).toBe(true);
    expect(isESM("export { default } from 'dogs';")).toBe(true);
    expect(isESM("export { default, maisey } from 'dogs';")).toBe(true);
  });
});

describe('potential false positives', () => {
  it("doesn't get fooled by look-alikes", () => {
    expect(isESM("'this is an import statement'")).toBe(false);
    expect(isESM("'this is an export statement'")).toBe(false);
    expect(isESM('import(dogs)')).toBe(false);
  });
});
