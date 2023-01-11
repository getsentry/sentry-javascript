import * as svelteCompiler from 'svelte/compiler';

/* eslint-disable deprecation/deprecation */
import {
  componentTrackingPreprocessor,
  defaultComponentTrackingOptions,
  FIRST_PASS_COMPONENT_TRACKING_PREPROC_ID,
} from '../src/preprocessors';
import type { SentryPreprocessorGroup } from '../src/types';

function expectComponentCodeToBeModified(
  preprocessedComponents: {
    originalCode: string;
    filename: string;
    name: string;
    newCode: string;
    map: any;
  }[],
  options: any,
) {
  const expectedImportStmt = 'import { trackComponent } from "@sentry/svelte";\n';

  preprocessedComponents.forEach(cmp => {
    const expectedFunctionCallOptions = {
      trackInit: options?.trackInit ?? true,
      trackUpdates: options?.trackUpdates ?? true,
      componentName: cmp.name,
    };
    const expectedFunctionCall = `trackComponent(${JSON.stringify(expectedFunctionCallOptions)});\n`;
    expect(cmp.newCode).toBeDefined();
    expect(cmp.map).toBeDefined();
    expect(cmp.newCode).toEqual(`${expectedImportStmt}${expectedFunctionCall}${cmp.originalCode}`);
  });
}

describe('componentTrackingPreprocessor', () => {
  describe('script hook', () => {
    it('correctly inits the script preprocessor', () => {
      const preProc = componentTrackingPreprocessor();
      expect(preProc.markup).toBeDefined();
      expect(preProc.script).toBeDefined();
      expect(preProc.style).toBeUndefined();
      expect((preProc as SentryPreprocessorGroup).sentryId).toEqual(FIRST_PASS_COMPONENT_TRACKING_PREPROC_ID);
    });

    it.each([
      ['no options', undefined],
      ['default options', defaultComponentTrackingOptions],
      ['custom options (init 0, updates 0)', { trackInit: false, trackUpdates: false }],
      ['custom options (init 0, updates 1)', { trackInit: false, trackUpdates: true }],
      ['custom options (init 1, updates 0)', { trackInit: true, trackUpdates: false }],
      ['custom options (init 1, updates 1)', { trackInit: true, trackUpdates: true }],
    ])('adds the function call to all components if %s are set', (_, options) => {
      const preProc = componentTrackingPreprocessor(options);
      const components = [
        { originalCode: 'console.log(cmp1);', filename: 'components/Cmp1.svelte', name: 'Cmp1' },
        { originalCode: 'console.log(cmp2);', filename: 'components/Cmp2.svelte', name: 'Cmp2' },
        { originalCode: 'console.log(cmp3);', filename: 'components/Cmp3.svelte', name: 'Cmp3' },
      ];

      const preprocessedComponents = components.map(cmp => {
        const res: any =
          preProc.script &&
          preProc.script({
            content: cmp.originalCode,
            filename: cmp.filename,
            attributes: {},
            markup: '',
          });
        return { ...cmp, newCode: res.code, map: res.map };
      });

      expectComponentCodeToBeModified(preprocessedComponents, options);
    });

    it('does not add the function call to any component if `trackComponents` is set to `false`', () => {
      const preProc = componentTrackingPreprocessor({ trackComponents: false });
      const components = [
        { originalCode: 'console.log(cmp1)', filename: 'components/Cmp1.svelte', name: 'Cmp1' },
        { originalCode: 'console.log(cmp2)', filename: 'components/Cmp2.svelte', name: 'Cmp2' },
        { originalCode: 'console.log(cmp3)', filename: 'components/Cmp3.svelte', name: 'Cmp3' },
      ];

      const preprocessedComponents = components.map(cmp => {
        const res: any =
          preProc.script &&
          preProc.script({
            content: cmp.originalCode,
            filename: cmp.filename,
            attributes: {},
            markup: '',
          });
        return { ...cmp, newCode: res.code, map: res.map };
      });

      preprocessedComponents.forEach(cmp => {
        expect(cmp.newCode).toEqual(cmp.originalCode);
      });
    });

    it('adds the function call to specific components if specified in `trackComponents`', () => {
      const preProc = componentTrackingPreprocessor({ trackComponents: ['Cmp1', 'Cmp3'] });
      const components = [
        { originalCode: 'console.log(cmp1)', filename: 'components/Cmp1.svelte', name: 'Cmp1' },
        { originalCode: 'console.log(cmp2)', filename: 'lib/Cmp2.svelte', name: 'Cmp2' },
        { originalCode: 'console.log(cmp3)', filename: 'lib/subdir/sub/Cmp3.svelte', name: 'Cmp3' },
      ];

      const [cmp1, cmp2, cmp3] = components.map(cmp => {
        const res: any =
          preProc.script &&
          preProc.script({
            content: cmp.originalCode,
            filename: cmp.filename,
            attributes: {},
            markup: '',
          });
        return { ...cmp, newCode: res.code, map: res.map };
      });

      expect(cmp2.newCode).toEqual(cmp2.originalCode);

      expectComponentCodeToBeModified([cmp1, cmp3], { trackInit: true, trackUpdates: true });
    });

    it('doesnt inject the function call to the same component more than once', () => {
      const preProc = componentTrackingPreprocessor();
      const components = [
        {
          originalCode: 'console.log(cmp1)',
          filename: 'components/Cmp1.svelte',
          name: 'Cmp1',
        },
        {
          originalCode:
            'import { trackComponent } from "@sentry/svelte";\ntrackComponent({"trackInit":true,"trackUpdates":true,"componentName":"Cmp1"});\nconsole.log(cmp1)',
          filename: 'components/Cmp1.svelte',
          name: 'Cmp1',
        },
        {
          originalCode: 'console.log(cmp2)',
          filename: 'lib/Cmp2.svelte',
          name: 'Cmp2',
        },
      ];

      const [cmp11, cmp12, cmp2] = components.map(cmp => {
        const res: any =
          preProc.script &&
          preProc.script({
            content: cmp.originalCode,
            filename: cmp.filename,
            attributes: {},
            markup: '',
          });
        return { ...cmp, newCode: res.code, map: res.map };
      });

      expectComponentCodeToBeModified([cmp11, cmp2], { trackInit: true, trackUpdates: true });
      expect(cmp12.newCode).toEqual(cmp12.originalCode);
    });

    it('doesnt inject the function call to a module context script block', () => {
      const preProc = componentTrackingPreprocessor();
      const component = {
        originalCode: 'console.log(cmp2)',
        filename: 'lib/Cmp2.svelte',
        name: 'Cmp2',
      };

      const res: any =
        preProc.script &&
        preProc.script({
          content: component.originalCode,
          filename: component.filename,
          attributes: { context: 'module' },
          markup: '',
        });

      const processedComponent = { ...component, newCode: res.code, map: res.map };

      expect(processedComponent.newCode).toEqual(processedComponent.originalCode);
    });
  });

  describe('markup hook', () => {
    it("adds a <script> tag to components that don't have one", () => {
      const preProc = componentTrackingPreprocessor();
      const component = {
        originalCode: "<p>I'm just a plain component</p>\n<style>p{margin-top:10px}</style>",
        filename: 'lib/Cmp2.svelte',
        name: 'Cmp2',
      };

      const res: any =
        preProc.markup &&
        preProc.markup({
          content: component.originalCode,
          filename: component.filename,
        });

      expect(res.code).toEqual(
        "<script>\n</script>\n<p>I'm just a plain component</p>\n<style>p{margin-top:10px}</style>",
      );
    });

    it("doesn't add a <script> tag to a component that already has one", () => {
      const preProc = componentTrackingPreprocessor();
      const component = {
        originalCode:
          "<script>console.log('hi');</script>\n<p>I'm a component with a script</p>\n<style>p{margin-top:10px}</style>",
        filename: 'lib/Cmp2.svelte',
        name: 'Cmp2',
      };

      const res: any =
        preProc.markup &&
        preProc.markup({
          content: component.originalCode,
          filename: component.filename,
        });

      expect(res.code).toEqual(
        "<script>console.log('hi');</script>\n<p>I'm a component with a script</p>\n<style>p{margin-top:10px}</style>",
      );
    });
  });

  // These are more "higher level" tests in which we use the actual preprocessing command of the Svelte compiler
  // This lets us test all preprocessor hooks we use in the correct order
  describe('all hooks combined, using the svelte compiler', () => {
    it('handles components without script tags correctly', async () => {
      const component = {
        originalCode: "<p>I'm just a plain component</p>\n<style>p{margin-top:10px}</style>",
        filename: 'lib/Cmp1.svelte',
      };

      const processedCode = await svelteCompiler.preprocess(component.originalCode, [componentTrackingPreprocessor()], {
        filename: component.filename,
      });

      expect(processedCode.code).toEqual(
        '<script>import { trackComponent } from "@sentry/svelte";\n' +
          'trackComponent({"trackInit":true,"trackUpdates":true,"componentName":"Cmp1"});\n\n' +
          '</script>\n' +
          "<p>I'm just a plain component</p>\n" +
          '<style>p{margin-top:10px}</style>',
      );
    });

    it('handles components with script tags correctly', async () => {
      const component = {
        originalCode:
          "<script>console.log('hi');</script>\n<p>I'm a component with a script</p>\n<style>p{margin-top:10px}</style>",
        filename: 'lib/Cmp2.svelte',
      };

      const processedCode = await svelteCompiler.preprocess(component.originalCode, [componentTrackingPreprocessor()], {
        filename: component.filename,
      });

      expect(processedCode.code).toEqual(
        '<script>import { trackComponent } from "@sentry/svelte";\n' +
          'trackComponent({"trackInit":true,"trackUpdates":true,"componentName":"Cmp2"});\n' +
          "console.log('hi');</script>\n" +
          "<p>I'm a component with a script</p>\n" +
          '<style>p{margin-top:10px}</style>',
      );
    });

    it("falls back to 'unknown' if filename isn't passed to preprocessor", async () => {
      const component = {
        originalCode: "<script>console.log('hi');</script>",
        filename: undefined,
      };

      const processedCode = await svelteCompiler.preprocess(component.originalCode, [componentTrackingPreprocessor()], {
        filename: component.filename,
      });

      expect(processedCode.code).toEqual(
        '<script>import { trackComponent } from "@sentry/svelte";\n' +
          'trackComponent({"trackInit":true,"trackUpdates":true,"componentName":"unknown"});\n' +
          "console.log('hi');</script>",
      );
    });
  });
});
