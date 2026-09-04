import { describe, expect, it } from 'vitest';
import { parseNameSectionModuleName } from '../src/wasmNameSection';
import {
  compileFixture,
  customSection,
  nameSectionPayload,
  u32leb,
  wasmModuleBytes,
  wasmWithBuildIdAndFunctionNamesOnly,
  wasmWithBuildIdAndModuleName,
  wasmWithBuildIdOnly,
} from './wasmModuleFixtures';

describe('parseNameSectionModuleName()', () => {
  it('reads the module name from fixture bytes', () => {
    expect(parseNameSectionModuleName(Uint8Array.from(nameSectionPayload('demo.wasm')))).toBe('demo.wasm');
  });

  it('reads the name section Chrome would see on a compiled module', () => {
    const module = compileFixture(wasmWithBuildIdAndModuleName([0xaa, 0xbb], 'demo.wasm'));
    const sections = WebAssembly.Module.customSections(module, 'name');

    expect(sections).toHaveLength(1);
    expect(parseNameSectionModuleName(sections[0] as ArrayBuffer)).toBe('demo.wasm');
  });

  it('returns null when the name section is missing', () => {
    const module = compileFixture(wasmWithBuildIdOnly([0xaa]));
    const sections = WebAssembly.Module.customSections(module, 'name');

    expect(sections).toHaveLength(0);
    expect(parseNameSectionModuleName(new Uint8Array())).toBeNull();
  });

  it('returns null when only function names are present', () => {
    const module = compileFixture(wasmWithBuildIdAndFunctionNamesOnly([0xaa]));
    const sections = WebAssembly.Module.customSections(module, 'name');

    expect(sections).toHaveLength(1);
    expect(parseNameSectionModuleName(sections[0] as ArrayBuffer)).toBeNull();
  });

  it('skips later subsections after the module name', () => {
    const moduleName = nameSectionPayload('demo.wasm');
    const functionNames = [1, ...u32leb(1), 0];
    expect(parseNameSectionModuleName(Uint8Array.from([...moduleName, ...functionNames]))).toBe('demo.wasm');
  });

  it('returns null for a truncated subsection', () => {
    expect(parseNameSectionModuleName(Uint8Array.from([0, 10]))).toBeNull();
  });

  it('returns null for an empty module name', () => {
    expect(parseNameSectionModuleName(Uint8Array.from([0, ...u32leb(1), 0]))).toBeNull();
  });

  it('returns null for invalid UTF-8', () => {
    expect(parseNameSectionModuleName(Uint8Array.from([0, ...u32leb(2), 1, 0xff]))).toBeNull();
  });

  it('does not throw on a full wasm binary passed by mistake', () => {
    const bytes = wasmModuleBytes([customSection('build_id', [0xaa])]);
    expect(parseNameSectionModuleName(bytes)).toBeNull();
  });
});
