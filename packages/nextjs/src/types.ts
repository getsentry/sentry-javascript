/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as nodeSDK from '@sentry/node';
import * as reactSDK from '@sentry/react';
import { isPlainObject } from '@sentry/utils';

type PlainObject = { [key: string]: any };

const mergedExports: PlainObject = {};

const nodeOnly: any[] = [];
const reactOnly: any[] = [];
const equal: any[] = [];
const nodeMerged: any[] = [];
const reactMerged: any[] = [];
const equalMerged: any[] = [];
const skipped: any[] = [];
const merged: any[] = [];
const clash: any[] = [];

const check = { nodeOnly, reactOnly, equal, nodeMerged, reactMerged, equalMerged, skipped, merged, clash };

const allNames = new Set([...Object.keys(nodeSDK), ...Object.keys(reactSDK)]);

allNames.forEach(name => {
  // debugger;
  // @ts-ignor we're only comparing and copying so we don't care about types
  const nodeExport = (nodeSDK as PlainObject)[name];
  // @ts-ignor same as above
  const reactExport = (reactSDK as PlainObject)[name];
  // @ts-ignor Dear TypeScript, I don't actually care that the things I'm comparing are implicitly any. In fact, I
  // don't care about their types at all, since they're goint to get garbage collected the moment the comparison is
  // done. I JUST WANT TO KNOW IF THEY'RE EQUAL.

  if (nodeExport && !reactExport) {
    mergedExports[name] = nodeExport;
    nodeOnly.push(name);
    // debugger;
    return;
  }

  if (reactExport && !nodeExport) {
    mergedExports[name] = reactExport;
    reactOnly.push(name);
    // debugger;
    return;
  }

  // If we've gotten this far, it means that both packages export something named `name`. In some cases, that's because
  // they're literally exporting the same thing (a type imported from `@sentry/types`, for example). If so, there's no
  // actual clash, so just copy over node's copy since it's equal to react's copy.
  if (nodeExport === reactExport) {
    mergedExports[name] = nodeExport;
    equal.push(name);
    // debugger;
    return;
  }

  // At this point, the only option left is that there actually is a name clash (i.e., each package exports something
  // named `name`, but not the same something). Since we're only doing this for the types, as long as the two somethings
  // have the same type, we're good. Unfortunately, that's not something we can check programmatically. That said, since
  // both packages are mesnt to be compstible with `@sentry/core`, `@sentry/hub` and the like, it's a pretty safe bet to
  // assume the types are the same.

  // So we're done, right? Almost. The one exception to the above is collections (like `Integrations`) because we want
  // the type to reflect the members of the collection (as options for auto-completion, for example). So now we do a
  // mini version of what we've just done.

  // First, make sure we actually do have a collecton. (In theory there are other collections besides these, but
  // fortunately we don't have any in this case.)
  if (!Array.isArray(nodeExport) && !isPlainObject(nodeExport)) {
    // name clash but not a collection - assume the types match and move on
    mergedExports[name] = nodeExport; // TODO
    clash.push({ name, node: nodeExport, react: reactExport });
    // debugger;
    return;
  }

  // in theory this could be a set or a Map... but in our case thankfully they're only objets and arrays, which makes
  // the code easier
  // const nodeCollection = nodeExport
  // const reactCollection = reactExport
  // const isArray = Array.isArray(nodeExport)
  // const collector = isArray? []: {};
  // const allCollectionNames = new Set(Object.keys(nodeExport).concat(Object.keys(reactExport)));
  // let collector, allElementNames, addToCollection, nodeCollection, reactCollection
  let nodeCollection: PlainObject, reactCollection: PlainObject;
  // getFromCollection

  // If we're dealing with an array, convert to an object for the moment, keyed by element name. (Yes,
  // this is assuming that every element *has* a `name` property, but in our case, that's true.)
  if (Array.isArray(nodeExport) && Array.isArray(reactExport)) {
    // collector = []
    // @ts-ignor We still don't care about types here (ironic, right, in a file called `types.ts`?). We know they match
    // and that's all we need.

    nodeCollection = {};
    nodeExport.forEach((element: { name: string }) => (nodeCollection[element.name] = element));

    reactCollection = {};
    reactExport.forEach((element: { name: string }) => {
      reactCollection[element.name] = element;
    });
    // const nodeElementNames = nodeExport.map(element => element.name)
    // const reactElementNames = reactExport.map(element => element.name)
    // allElementNames = new Set([...nodeElementNames, ...reactElementNames])
    // addToCollection = <T>(array: T[], element: T) => array.push(element)
  } else {
    // collector = {}
    // addToCollection = <T>(object: { [key: string]: T }, element:T, name: string) => object[name] = element
    nodeCollection = nodeExport;
    reactCollection = reactExport;
  }

  const mergedCollectionExport: PlainObject = {};
  const allCollectionNames = new Set([...Object.keys(nodeCollection), ...Object.keys(reactCollection)]);

  allCollectionNames.forEach(elementName => {
    const nodeCollectionElement = nodeCollection[elementName];
    const reactCollectionElement = reactCollection[elementName];
    if (nodeCollectionElement?.name === 'InboundFilters') {
      debugger;
    }

    // grab everything that's only in node...
    if (nodeCollectionElement && !reactCollectionElement) {
      mergedCollectionExport[elementName] = nodeCollectionElement;
      nodeMerged.push({ name, elementName });
      // debugger;
      return;
    }

    // ... and everything that's only in react
    if (reactCollectionElement && !nodeCollectionElement) {
      mergedCollectionExport[elementName] = reactCollectionElement;
      reactMerged.push({ name, elementName });
      // debugger;
      return;
    }

    // now grab all the ones which are actually just pointers to the same thing
    if (
      nodeCollectionElement === reactCollectionElement ||
      // this will be true if we're dealing with an instance instead of a class
      Object.getPrototypeOf(nodeCollectionElement).constructor?.name === nodeCollectionElement.constructor?.name
    ) {
      mergedCollectionExport[elementName] = nodeCollectionElement;
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
    mergedExports[name] = Object.values(mergedCollectionExport);
  }
  // otherwise, just use the merged object
  else {
    mergedExports[name] = mergedCollectionExport;
  }
  merged.push({ name, value: mergedExports[name] });
});

// console.log(Object.keys(mergedExports));
console.log(mergedExports);
console.log(check);
debugger;

// module.exports = { ...mergedExports, hi: 'hi' };
// mergedExports.forEach(export => {

// })

export const hi = 'hi';
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

console.log(nodeSDK.Integrations);
console.log(reactSDK.Integrations);
// console.log(nodeSDK.SDK_NAME);
// console.log(reactSDK.SDK_NAME);
console.log(nodeSDK.Transports);
console.log(reactSDK.Transports);
// console.log(nodeSDK.close);
// console.log(reactSDK.close);
console.log(nodeSDK.defaultIntegrations);
console.log(reactSDK.defaultIntegrations);
// console.log(nodeSDK.flush);
// console.log(reactSDK.flush);
// console.log(nodeSDK.init);
// console.log(reactSDK.init);
// console.log(nodeSDK.lastEventId);
// console.log(reactSDK.lastEventId);

// const nodeIntegrationNames = Object.keys(nodeSDK.)
console.log(nodeSDK.Hub === reactSDK.Hub);
// const nodeOnlyIntegrations = Object.keys(nodeSDK.Integrations).filter(type => !reactSDK.Integrations.includes(type));
// const allIntegrations =
debugger;

// export * from '@sentry/react';
// export * from '@sentry/node';
