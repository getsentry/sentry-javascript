import { describe, expect, it } from 'vitest';
import { fingerprintFunction, tokenize } from '../../../src/utils/fingerprintFunction';

const norm = (src: string): string => tokenize(src).join(' ');

describe('fingerprintFunction', () => {
  describe('stays the same when only minification changes', () => {
    it.each([
      ['renamed locals and imports', 'e=>n(e)?null:e', 't=>r(t)?null:t'],
      ['spread of a renamed local', 'e=>({...e.tags})', 't=>({...t.tags})'],
      ['whitespace', 'e => e', 'e=>e'],
      ['comments', 'e=>e // keep all\n', 'e=>/* keep */e'],
      ['renamed ternary branches', '(a,b)=>a?b:a', '(x,y)=>x?y:x'],
      ['renamed destructuring targets', '({event:e})=>e', '({event:t})=>t'],
      ['renamed names in template substitutions', "e=>`'${n(e)}' and '${e}'`", "t=>`'${r(t)}' and '${t}'`"],
      ['renamed names after a regex containing quotes', `e=>/["']/.test(e)?n("x"):r`, `t=>/["']/.test(t)?a("x"):o`],
      ['renamed operands of a division', 'e=>e/n/r', 't=>t/a/o'],
      ['renamed call arguments inside an object', 'e=>({a:f(x,y,z)})', 't=>({a:g(p,q,r)})'],
      ['renamed array items inside an object', 'e=>({a:[x,y,z]})', 't=>({a:[p,q,r]})'],
      ['renamed arrow parameters inside an object', 'e=>({a:(x,y,z)=>x})', 't=>({a:(p,q,r)=>p})'],
    ])('%s', (_label, a, b) => {
      expect(norm(a)).toBe(norm(b));
    });
  });

  describe('changes when behavior changes', () => {
    it.each([
      ['always null vs passthrough', '()=>null', 'e=>e'],
      ['return null vs return event', 'function(e){return null}', 'function(e){return e}'],
      ['return undefined vs return event', 'function(e){return undefined}', 'function(e){return e}'],
      ['property', 'e=>e.exception?e:null', 'e=>e.message?e:null'],
      ['optional chaining property', 'e=>e?.exception?e:null', 'e=>e?.message?e:null'],
      ['string literal', `e=>e.type==="transaction"?null:e`, `e=>e.type==="error"?null:e`],
      ['bracket key', `e=>e["exception"]?e:null`, `e=>e["message"]?e:null`],
      ['template literal', 'e=>`${e.level}:drop`', 'e=>`${e.level}:keep`'],
      ['regex literal', 'e=>/foo/.test(e.message)?null:e', 'e=>/bar/.test(e.message)?null:e'],
      ['regex flags', 'e=>/foo/i.test(e)', 'e=>/foo/g.test(e)'],
      ['number', 'e=>Math.random()<0.1?e:null', 'e=>Math.random()<1?e:null'],
      ['branches swapped', 'e=>n(e)?null:e', 'e=>n(e)?e:null'],
      ['throw vs return', 'e=>{throw e}', 'e=>{return e}'],
      ['object key', 'e=>({level:e})', 'e=>({type:e})'],
      ['private field', 'e=>e.#a', 'e=>e.#b'],
      ['destructured key', 'e=>{const{exception:t}=e;return t}', 'e=>{const{message:t}=e;return t}'],
      ['thrown object key', 'e=>{throw{level:e}}', 'e=>{throw{type:e}}'],
      ['regex after a block', 'e=>{if(e){return e}/a/.test(e)}', 'e=>{if(e){return e}/b/.test(e)}'],
    ])('%s', (_label, a, b) => {
      expect(norm(a)).not.toBe(norm(b));
    });
  });

  describe('tokenizer', () => {
    it('tells a regex from a division', () => {
      expect(norm('e=>e/2/1')).toBe('_ = > _ / 2 / 1');
      expect(norm('e=>/2/.test(e)')).toBe('_ = > /2/ .test ( _ )');
    });

    it('keeps regex character classes containing slashes intact', () => {
      expect(norm('e=>/[/]a/.test(e)')).toBe('_ = > /[/]a/ .test ( _ )');
    });

    it('handles nested template literals and object literals in substitutions', () => {
      expect(norm('e=>`a${`b${e}`}c${({k:e})}`')).toBe('_ = > `a${ `b${ _ }` }c${ ( { k : _ } ) }`');
    });

    it('reads a regex inside a template substitution and a division after a template', () => {
      expect(norm('e=>`${/a/.test(e)}`')).toBe('_ = > `${ /a/ .test ( _ ) }`');
      expect(norm('e=>`${e}`/2/e')).toBe('_ = > `${ _ }` / 2 / _');
    });

    it('cannot tell a label at the start of a block from an object key', () => {
      expect(norm('e=>{a:e}')).toBe('_ = > { a : _ }');
    });

    it('survives unterminated input', () => {
      expect(() => norm('e=>"abc')).not.toThrow();
      expect(() => norm('e=>`abc${')).not.toThrow();
      expect(() => norm('e=>/abc')).not.toThrow();
      expect(() => norm('e=>/* abc')).not.toThrow();
      expect(() => norm('}}}}')).not.toThrow();
      expect(() => norm('`a\\`')).not.toThrow();
    });

    it('keeps spread and increments whole', () => {
      expect(norm('a++ +b-- -c')).toBe('_ ++ + _ -- - _');
      expect(norm('f(...a,..b)')).toBe('_ ( ... _ , . .b )');
    });

    it('keeps object keys next to calls and arrays, and in objects nested inside them', () => {
      expect(norm('({a:f(x,y),b:[y,{c:z}]})')).toBe('( { a : _ ( _ , _ ) , b : [ _ , { c : _ } ] } )');
    });

    it('does not mistake a ternary branch for an object key', () => {
      expect(norm('f(x,a?b:c)')).toBe('_ ( _ , _ ? _ : _ )');
    });

    it('keeps object keys but not shorthand keys or method names', () => {
      expect(norm('e=>({a:1,b(){},c,...d})')).toBe('_ = > ( { a : 1 , _ ( ) { } , _ , ... _ } )');
    });

    it('keeps `undefined` but no other global', () => {
      expect(norm('e=>Math.now()===undefined')).toBe('_ = > _ .now ( ) = = = undefined');
    });

    it('tells a regex from a division after keywords, operators and closing brackets', () => {
      expect(norm('return/a/g')).toBe('return /a/g');
      expect(norm('this/a/g')).toBe('this / _ / _');
      expect(norm('(a)/b/c')).toBe('( _ ) / _ / _');
      expect(norm('e=>e++/2+n(e)')).toBe('_ = > _ ++ / 2 + _ ( _ )');
      expect(norm('e=>e--/2')).toBe('_ = > _ -- / 2');
      expect(norm('({}/2)')).toBe('( { } / 2 )');
      expect(norm('if(a){}/a/g')).toBe('if ( _ ) { } /a/g');
      expect(norm('e=>e?/a/.test(e):e')).toBe('_ = > _ ? /a/ .test ( _ ) : _');
    });
  });

  it('fingerprints functions', () => {
    expect(fingerprintFunction(e => e)).toBe(fingerprintFunction(t => t));
    expect(fingerprintFunction(() => null)).not.toBe(fingerprintFunction(e => e));
  });
});
