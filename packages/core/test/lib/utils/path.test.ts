import { describe, expect, test } from 'vitest';
import { basename, dirname } from '../../../src/utils/path';

describe('path', () => {
  describe('basename', () => {
    test('unix', () => {
      expect(basename('/foo/bar/baz/asdf/quux.html')).toEqual('quux.html');
      expect(basename('foo/bar/baz/asdf/quux.html')).toEqual('quux.html');
      expect(basename('../baz/asdf/quux.html')).toEqual('quux.html');
      expect(basename('quux.html')).toEqual('quux.html');
    });
    test('windows', () => {
      expect(basename('c:\\foo\\bar\\baz\\asdf\\quux.html')).toEqual('quux.html');
      expect(basename('\\foo\\bar\\baz\\asdf\\quux.html')).toEqual('quux.html');
      expect(basename('..\\bar\\baz\\asdf\\quux.html')).toEqual('quux.html');
      expect(basename('quux.html')).toEqual('quux.html');
    });
  });

  describe('dirname', () => {
    test('unix', () => {
      expect(dirname('/foo/bar/baz/asdf/quux.html')).toEqual('/foo/bar/baz/asdf');
      expect(dirname('foo/bar/baz/asdf/quux.html')).toEqual('foo/bar/baz/asdf');
      expect(dirname('../baz/asdf/quux.html')).toEqual('../baz/asdf');
      expect(dirname('/quux.html')).toEqual('/');
    });
    test('windows', () => {
      expect(dirname('C:\\foo\\bar\\baz\\asdf\\quux.html')).toEqual('C:\\foo\\bar\\baz\\asdf');
      expect(dirname('\\foo\\bar\\baz\\asdf\\quux.html')).toEqual('\\foo\\bar\\baz\\asdf');
      expect(dirname('..\\bar\\baz\\asdf\\quux.html')).toEqual('..\\bar\\baz\\asdf');
      expect(dirname('quux.html')).toEqual('.');
    });
  });
});
