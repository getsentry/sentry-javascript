import { beforeEach, describe, expect, it } from 'vitest';
import { formatComponentName } from '../../src/vendor/components';

describe('formatComponentName', () => {
  describe('when the vm is not defined', () => {
    it('returns the anonymous component name', () => {
      // arrange
      const vm = undefined;

      // act
      const formattedName = formatComponentName(vm);

      // assert
      expect(formattedName).toEqual('<Anonymous>');
    });
  });

  describe('when the vm is defined', () => {
    let vm: any = undefined;

    beforeEach(() => {
      vm = {};
    });

    describe('and when the $options is not defined', () => {
      it('returns the anonymous component name', () => {
        // arrange
        vm.$options = undefined;

        // act
        const formattedName = formatComponentName(vm);

        // assert
        expect(formattedName).toEqual('<Anonymous>');
      });
    });

    describe('when the $options is defined', () => {
      beforeEach(() => {
        vm = { $options: {} };
      });

      describe('when the vm is the $root', () => {
        it('returns the root component name', () => {
          // arrange
          vm.$root = vm;

          // act
          const formattedName = formatComponentName(vm);

          // assert
          expect(formattedName).toEqual('<Root>');
        });
      });

      describe('when the $options have a name', () => {
        it('returns the name', () => {
          // arrange
          vm.$options.name = 'hello-there';

          // act
          const formattedName = formatComponentName(vm);

          // assert
          expect(formattedName).toEqual('<HelloThere>');
        });
      });

      describe('when the options have a _componentTag', () => {
        it('returns the _componentTag', () => {
          // arrange
          vm.$options._componentTag = 'foo-bar-1';

          // act
          const formattedName = formatComponentName(vm);

          // assert
          expect(formattedName).toEqual('<FooBar1>');
        });
      });

      describe('when the options have a __name', () => {
        it('returns the __name', () => {
          // arrange
          vm.$options.__name = 'my-component-name';

          // act
          const formattedName = formatComponentName(vm);

          // assert
          expect(formattedName).toEqual('<MyComponentName>');
        });
      });

      describe('when the options have a __file', () => {
        describe('and we do not wish to include the filename', () => {
          it.each([
            ['unix', '/foo/bar/baz/SomeThing.vue', '<SomeThing>'],
            ['unix', '/foo/bar/baz/SomeThing.ts', '<Anonymous>'],
            ['windows', 'C:\\foo\\bar\\baz\\windows_file.vue', '<WindowsFile>'],
            ['windows', 'C:\\foo\\bar\\baz\\windows_file.ts', '<Anonymous>'],
          ])('returns the filename (%s)', (_, filePath, expected) => {
            // arrange
            vm.$options.__file = filePath;

            // act
            const formattedName = formatComponentName(vm, false);

            // assert
            expect(formattedName).toEqual(expected);
          });
        });

        describe('and we wish to include the filename', () => {
          it.each([
            ['unix', '/foo/bar/baz/SomeThing.vue', '<SomeThing>'],
            ['unix', '/foo/bar/baz/SomeThing.ts', '<Anonymous>'],
            ['windows', 'C:\\foo\\bar\\baz\\windows_file.vue', '<WindowsFile>'],
            ['windows', 'C:\\foo\\bar\\baz\\windows_file.ts', '<Anonymous>'],
          ])('returns the filename (%s)', (_, filePath, expected) => {
            // arrange
            vm.$options.__file = filePath;

            // act
            const formattedName = formatComponentName(vm);

            // assert
            expect(formattedName).toEqual(`${expected} at ${filePath}`);
          });
        });
      });
    });
  });
});
