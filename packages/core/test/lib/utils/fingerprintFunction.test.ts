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
      ['quote style', `e=>e.type==="error"`, `e=>e.type==='error'`],
      ['strict equality rewritten', `e=>e.type==="error"`, `e=>e.type=="error"`],
      ['escaped quotes', `e=>"it's"`, `e=>'it\\'s'`],
      ['template without substitutions', 'e=>`drop`', `e=>"drop"`],
      ['number spelling', 'e=>e<0.1', 'e=>e<.1'],
      ['exponent', 'e=>e>1000', 'e=>e>1e3'],
      ['numeric separators', 'e=>e>1_000', 'e=>e>1000'],
      ['void 0', 'e=>undefined', 'e=>void 0'],
      ['!0 and !1', 'e=>[true,false]', 'e=>[!0,!1]'],
      ['shorthand property', '({event})=>({event})', '({event:e})=>({event:e})'],
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
    ])('%s', (_label, a, b) => {
      expect(norm(a)).not.toBe(norm(b));
    });
  });

  describe('tokenizer', () => {
    it('tells a regex from a division', () => {
      expect(norm('e=>e/2/1')).toBe('_ => _ / 2 / 1');
      expect(norm('e=>/2/.test(e)')).toBe('_ => /2/ . "test" ( _ )');
    });

    it('keeps regex character classes containing slashes intact', () => {
      expect(norm('e=>/[/]a/.test(e)')).toBe('_ => /[/]a/ . "test" ( _ )');
    });

    it('handles nested template literals and object literals in substitutions', () => {
      expect(norm('e=>`a${`b${e}`}c${({k:e})}`')).toBe('_ => `a${ `b${ _ `` `c${ ( { "k" : _ } ) ``');
    });

    it('treats a block body as a block, not an object', () => {
      expect(norm('e=>{a:e}')).toBe('_ => { _ : _ }');
    });

    it('survives unterminated input', () => {
      expect(() => norm('e=>"abc')).not.toThrow();
      expect(() => norm('e=>`abc${')).not.toThrow();
      expect(() => norm('e=>/abc')).not.toThrow();
      expect(() => norm('e=>/* abc')).not.toThrow();
      expect(() => norm('}}}}')).not.toThrow();
    });

    it('matches the longest punctuator', () => {
      expect(norm('a>>>=b>>>c>>=d>>e>=f>g')).toBe('_ >>>= _ >>> _ >>= _ >> _ >= _ > _');
      expect(norm('a??=b??c?.d?e:f')).toBe('_ ??= _ ?? _ ?. "d" ? _ : _');
      expect(norm('a**=b**c*=d*e')).toBe('_ **= _ ** _ *= _ * _');
      expect(norm('a&&=b||=c&&d||e&f|g^=h')).toBe('_ &&= _ ||= _ && _ || _ & _ | _ ^= _');
      expect(norm('a=>b!==c===d!=e==f=!g')).toBe('_ => _ != _ == _ != _ == _ = ! _');
      expect(norm('a++ +b-- -c+=d-=e')).toBe('_ ++ + _ -- - _ += _ -= _');
      expect(norm('a++=b')).toBe('_ ++ = _');
      expect(norm('f(...a,..b)')).toBe('_ ( ... _ , . . "b" )');
    });

    it('reads `?.` before a digit as a conditional', () => {
      expect(norm('a?.5:b')).toBe('_ ? 0.5 : _');
    });

    it('keeps an exponent sign in a number, except in hex', () => {
      expect(norm('1e+3+0x1e+1')).toBe('1000 + 30 + 1');
    });

    it('only rewrites `void 0`, `!0` and `!1`, and spells numbers canonically', () => {
      expect(norm('[void 0x0,void 1,!2,!0n]')).toBe('[ void 0 , void 1 , ! 2 , ! 0n ]');
      expect(norm('1_000+0.10+.1+1_0n')).toBe('1000 + 0.1 + 0.1 + 10n');
    });

    it('keeps object keys next to calls and arrays, and in objects nested inside them', () => {
      expect(norm('({a:f(x,y),b:[y,{c}],d})')).toBe('( { "a" : _ ( _ , _ ) , "b" : [ _ , { "c" : _ } ] , "d" : _ } )');
    });

    it('keeps object keys and method names', () => {
      expect(norm('e=>({a:1,b(){},c,...d})')).toBe('_ => ( { "a" : 1 , "b" ( ) { } , "c" : _ , ... _ } )');
    });

    it('keeps `undefined` but no other global', () => {
      expect(norm('e=>Math.now()===undefined')).toBe('_ => _ . "now" ( ) == undefined');
    });

    it('tells a regex from a division after keywords and closing brackets', () => {
      expect(norm('return/a/g')).toBe('return /a/g');
      expect(norm('this/a/g')).toBe('this / _ / _');
      expect(norm('(a)/b/c')).toBe('( _ ) / _ / _');
    });

    it('treats an escaped backtick at the end of an unterminated template like a closing one', () => {
      expect(norm('`a\\`')).toBe('"a\\\\"');
    });
  });

  it('fingerprints functions', () => {
    expect(fingerprintFunction(e => e)).toBe(fingerprintFunction(t => t));
    expect(fingerprintFunction(() => null)).not.toBe(fingerprintFunction(e => e));
  });
});
