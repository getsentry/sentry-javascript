/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Generate `@sentry/nextjs` types.
 *
 * This file (compiles to) a script which generates a merged set of exports for the nextjs SDK, for the ultimate purpose
 * of generating the SDK's types. The `module` and `browser` entries in `package.json` allow different files to serve as
 * the SDK's entry point depending on environment, but there is no such bifurcation when it comes to types. Leaving the
 * `types` entry out causes TypeScript to search for a declaration file whose name matches each of `module` and
 * `browser` values, respectively, and that allows compilation to happen (yay!) but without either `types` or `main`
 * entries in `package.json`, VSCode is unable to resolve the SDK for code completion, Intellisense, etc. (boo!). The
 * `types` entry can't be an array, but even if it could, that wouldn't handle the case of namespace clashes
 * (`@sentry/node.Integrations` is not the same as `@sentry/react.Integrations`, for instance - which one wins?). So
 * there needs to be a single source of truth, generated by semi-intelligently merging the exports from the two packages
 * (by way of the two different, environment-specific index files), such that types can then be generated from that
 * single file.
 *
 * Known limitations:
 *
 *  - In a small handful of mostly-non-user-relevant spots, there's no easy way to resolve the conflict (for example,
 *    which `flush` and `close` methods should be exported, node's or react's?) and so those types have been omitted
 *    from this file. The correct methods are stil exported in their respective environments - the JS works, in other
 *    words - but they won't appear in the types. The one exception to this is the `init` method, because it's too
 *    important to leave out. For the moment, it's using the node version as the type in both environments. (TODO: Make
 *    a generic version.)
 *
 * - Currently, though this script gets built with the SDK, running `build:watch` will only *run* it once, before the
 *   initial SDK build starts its watch mode. This means that the `types.ts` file only gets generated once per
 *   invocation of `build:watch`, and can get stale if its dependencies change in meaningful (to it) ways. This is a
 *   pain for development but won't affect releases/CI, because in those cases the build only happens once. (TODO: Fix
 *   this somehow.)
 *
 * The file that this script's compiled version generates is `/src/types.ts`.
 */

import * as nodeSDK from '@sentry/node';
import * as reactSDK from '@sentry/react';
import { isPlainObject } from '@sentry/utils';
import * as fs from 'fs';
// import * as path from 'path';

type PlainObject = { [key: string]: any };

const mergedExports: PlainObject = {};
const mergedExportsWithSource: Array<{ name: string; source: string }> = [];

const nodeOnly: any[] = [];
const reactOnly: any[] = [];
const equal: any[] = [];
const nodeMerged: any[] = [];
const reactMerged: any[] = [];
const equalMerged: any[] = [];
const skipped: any[] = [];
const merged: any[] = [];
const clash: any[] = [];

// const check = { nodeOnly, reactOnly, equal, nodeMerged, reactMerged, equalMerged, skipped, merged, clash };

const allNames = new Set([...Object.keys(nodeSDK), ...Object.keys(reactSDK)]);

allNames.forEach(name => {
  // debugger;
  const nodeExport = (nodeSDK as PlainObject)[name];
  const reactExport = (reactSDK as PlainObject)[name];

  if (nodeExport && !reactExport) {
    mergedExports[name] = nodeExport;
    mergedExportsWithSource.push({ name, source: '@sentry/node' });
    nodeOnly.push(name);
    // debugger;
    return;
  }

  if (reactExport && !nodeExport) {
    mergedExports[name] = reactExport;
    mergedExportsWithSource.push({ name, source: '@sentry/react' });
    reactOnly.push(name);
    // debugger;
    return;
  }

  // If we've gotten this far, it means that both packages export something named `name`. In some cases, that's because
  // they're literally exporting the same thing (a type imported from `@sentry/types`, for example). If so, there's no
  // actual clash, so just copy over node's copy since it's equal to react's copy.
  if (nodeExport === reactExport) {
    mergedExports[name] = nodeExport;
    mergedExportsWithSource.push({ name, source: '@sentry/node' });
    equal.push(name);
    // debugger;
    return;
  }

  // At this point, the only option left is that there actually is a name clash (i.e., each package exports something
  // named `name`, but not the same something). The only place where this can be solved in a sensible manner is in the
  // case of collections, which we can merge the same way we're merging the overall modules. Fortunately, with the
  // exception of `init`, the spots where this happens are technically exported/public but not something 99% of users
  // will touch, so it feels safe for now to leave them out of the types.(TODO: Is there *any* way to inject the correct
  // values for each environment?)

  // In theory there are other collections besides objects and arrays, but thankfully we don't have any in this case.
  if (!Array.isArray(nodeExport) && !isPlainObject(nodeExport)) {
    // can't leave this out, so use the node version for now
    if (name === 'init') {
      mergedExports[name] = nodeExport;
      mergedExportsWithSource.push({ name, source: '@sentry/node' });
      clash.push({ name, node: nodeExport, react: reactExport });
    }
    // debugger;
    // otherwise, bail
    return;
  }

  // If we're dealing with an array, convert to an object for the moment, keyed by element name, so that individual
  // elements are easier to find. (Yes, this assumes that every element *has* a `name` property, but luckily in our case
  // that's true.)
  let nodeCollection: PlainObject, reactCollection: PlainObject;
  if (Array.isArray(nodeExport) && Array.isArray(reactExport)) {
    nodeCollection = {};
    nodeExport.forEach((element: { name: string }) => (nodeCollection[element.name] = element));

    reactCollection = {};
    reactExport.forEach((element: { name: string }) => {
      reactCollection[element.name] = element;
    });
  }
  // Otherwise, just use the object as is
  else {
    nodeCollection = nodeExport;
    reactCollection = reactExport;
  }

  // And now we do it all again, in miniature
  const allCollectionNames = new Set([...Object.keys(nodeCollection), ...Object.keys(reactCollection)]);
  const mergedCollection: PlainObject = {};
  const mergedCollectionWithSource: PlainObject = [];

  allCollectionNames.forEach(elementName => {
    const nodeCollectionElement = nodeCollection[elementName];
    const reactCollectionElement = reactCollection[elementName];

    // grab everything that's only in node...
    if (nodeCollectionElement && !reactCollectionElement) {
      mergedCollection[elementName] = nodeCollectionElement;
      mergedCollectionWithSource.push({ elementName, source: '@sentry/node' });
      nodeMerged.push({ name, elementName });
      // debugger;
      return;
    }

    // ... and everything that's only in react
    if (reactCollectionElement && !nodeCollectionElement) {
      mergedCollection[elementName] = reactCollectionElement;
      mergedCollectionWithSource.push({ elementName, source: '@senty/react' });
      reactMerged.push({ name, elementName });
      // debugger;
      return;
    }

    // now grab all the ones which are actually just pointers to the same thing
    if (
      nodeCollectionElement === reactCollectionElement ||
      // this will be true if we're dealing with instances instead of a classes
      (Object.getPrototypeOf(nodeCollectionElement).constructor?.name === nodeCollectionElement.constructor?.name &&
        // and then this ensures they're the samre class
        Object.getPrototypeOf(nodeCollectionElement) === Object.getPrototypeOf(reactCollectionElement))
    ) {
      mergedCollection[elementName] = nodeCollectionElement;
      mergedCollectionWithSource.push({ elementName, source: '@sentry/node' });
      equalMerged.push({ name, elementName, nodeCollectionElement });
      // debugger;
      return;
    }

    skipped.push({ name, elementName, nodeCollectionElement, reactCollectionElement });

    // at this point, in a general case, we'd recurse, but we're assuming type match and we know we don't have any
    // nested collections, so we're done with this pair of collection elements
  });

  // having merged the two collections, if we started with an array, convert back to one
  if (Array.isArray(nodeExport)) {
    mergedExports[name] = Object.values(mergedCollection);
    mergedExportsWithSource.push({ name, source: 'array' }); // TODO have to build the collection as a string
  }
  // otherwise, just use the merged object
  else {
    mergedExports[name] = mergedCollection;
    mergedExportsWithSource.push({ name, source: 'object' });
  }
  merged.push({ name, value: mergedExports[name] });
});

// console.log(Object.keys(mergedExports));
// console.log(mergedExports);
// console.log(check);
console.log(clash);
// debugger;

// TODO - should we be importing from the two index files instead?
// TODO - export correct SDK name value
// TODO - clear out logs and debuggers

/**
 * THIS IS AN AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
 *
 * More detail can be found in the script that (compiles to the script that) generated this file,
 * `/scripts/generate-types.ts`.
 */

// TODO - include the above where "..." is
const outputLines = [
  '/**',
  '* THIS IS AN AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.',
  '*',
  '* More detail can be found in the script that (compiles to the script that) generated this file,',
  '* `/scripts/generate-types.ts`.',
  '*/',
  '\n',
];

mergedExportsWithSource.forEach(element => {
  const { name, source } = element;

  if (source === '@sentry/node' || source === '@sentry/react') {
    outputLines.push(`export { ${name} } from "${source}";`);
    return;
  }

  if (source === 'array') {
    // TODO
  }

  if (source === 'object') {
    // TODO
  }
});

console.log('Generating types.ts');

const output = outputLines.join('\n');
// console.log(output);

fs.writeFileSync('./src/types.ts', output);
console.log('Done writing file');
// const mergedExportsNames = Object.keys(mergedExports)
// const exportLines: string[] = mergedExportsNames.map(name => {
//   const exportLine = `export const ${name} = `
// })

// const output = `
//     ${mergedExports
//       .map((plugin) => {
//         const pluginId = getPluginId(plugin.pkgName)
//         pluginIds.push(pluginId)
//         pluginConfigs.push(plugin.config || {})
// debugger
// return `import ${pluginId} from '${plugin.directory}/src/${middleware}'`
//       })
//       .join('\n')}

//     export default function (ctx) {
// debugger
// return Promise.all([${pluginIds
//         .map((id, idx) => `${id}(ctx, ${JSON.stringify(pluginConfigs[idx])})`)
//         .join(',')}])
//     }
//   `

// function splitVennDiagram(arrA: unknown[], arrB: unknown[]): unknown[][] {
//   const onlyA = arrA.filter(element => !arrB.includes(element));
//   const onlyB = arrB.filter(element => !arrA.includes(element));
//   const intersection = arrA.filter(element => arrB.includes(element));
// debugger
// return [onlyA, onlyB, intersection];
// }

// // const nodeOnlyExports = nodeExportNames.filter(type => !reactExportNames.includes(type));
// // const reactOnlyExports = reactExportNames.filter(type => !nodeExportNames.includes(type));
// // const intersection = nodeExportNames.filter(type => reactExportNames.includes(type));

// const [nodeOnlyExportNames, reactOnlyExportNames, intersectionExportNames] = splitVennDiagram(
//   Object.keys(nodeSDK),
//   Object.keys(reactSDK),
// );

// // const equalIntersectionExportNames =

// console.log(nodeOnlyExportNames);
// console.log(reactOnlyExportNames);
// console.log(intersectionExportNames);

// const nodeOnlyExports: Partial<typeof nodeSDK> = {};
// const reactOnlyExports: Partial<typeof reactSDK> = {};
// nodeOnlyExportNames.forEach(name => {
//   // @ts-ignor You can too use a string to get a method from a module, TS
//   nodeOnlyExports[name] = nodeSDK[name];
// });
// reactOnlyExportNames.forEach(name => {
//   // @ts-ignor You can too use a string to get a method from a module, TS
//   reactOnlyExports[name] = reactSDK[name];
// });
// // intersectionExportNames.forEach(name => {
// //   // @ts-ignor You can too use a string to get a method from a module, TS
// //   intersectionExports[name] = reactSDK[name];
// // });

// console.log(nodeSDK.Integrations);
// console.log(reactSDK.Integrations);
// console.log(nodeSDK.SDK_NAME);
// console.log(reactSDK.SDK_NAME);
// console.log(nodeSDK.Transports);
// console.log(reactSDK.Transports);
// console.log(nodeSDK.close);
// console.log(reactSDK.close);
// console.log(nodeSDK.defaultIntegrations);
// console.log(reactSDK.defaultIntegrations);
// console.log(nodeSDK.flush);
// console.log(reactSDK.flush);
// console.log(nodeSDK.init);
// console.log(reactSDK.init);
// console.log(nodeSDK.lastEventId);
// console.log(reactSDK.lastEventId);

// const nodeIntegrationNames = Object.keys(nodeSDK.)
// console.log(nodeSDK.Hub === reactSDK.Hub);
// const nodeOnlyIntegrations = Object.keys(nodeSDK.Integrations).filter(type => !reactSDK.Integrations.includes(type));
// const allIntegrations =
// debugger;

// export * from '@sentry/react';
// export * from '@sentry/node';
