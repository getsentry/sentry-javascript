import { formatComponentName } from '../src/components';

it('properly format component names', () => {
  const vm: any = {
    $options: {},
  };
  vm.$root = vm;
  expect(formatComponentName(vm)).toBe('<Root>');

  vm.$root = null;
  vm.$options.name = 'hello-there';
  expect(formatComponentName(vm)).toBe('<HelloThere>');

  vm.$options.name = null;
  vm.$options._componentTag = 'foo-bar-1';
  expect(formatComponentName(vm)).toBe('<FooBar1>');

  vm.$options._componentTag = null;
  vm.$options.__file = '/foo/bar/baz/SomeThing.vue';
  expect(formatComponentName(vm)).toBe(`<SomeThing> at ${vm.$options.__file}`);
  expect(formatComponentName(vm, false)).toBe('<SomeThing>');

  vm.$options.__file = 'C:\\foo\\bar\\baz\\windows_file.vue';
  expect(formatComponentName(vm)).toBe(`<WindowsFile> at ${vm.$options.__file}`);
  expect(formatComponentName(vm, false)).toBe('<WindowsFile>');
});
