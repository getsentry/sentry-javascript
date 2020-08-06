function removeNullUnionType(value) {
  let newValue = value;
  if (value.type === 'UnionTypeAnnotation') {
    if (value.types.length === 2) {
      newValue = value.types[0];
    } else {
      newValue.types = value.types.filter(node => {
        return node.type !== 'NullLiteralTypeAnnotation';
      });
    }
  }

  return newValue;
}

module.exports = function() {
  return {
    name: 'json-schema',
    visitor: {
      /**
       * Get rid of null union types if the object property is already optional
       * `arch?: string | null` -> `arch?: string`
       */
      ObjectTypeProperty(path) {
        if (path.node.optional) {
          path.node.value = removeNullUnionType(path.node.value);
        }
      },

      /**
       * Get rid of array null union types if the object property is already optional
       * `arch?: (string | null)[]` -> `arch?: string[]`
       */
      ArrayTypeAnnotation(path) {
        if (path.parent.optional) {
          path.node.elementType = removeNullUnionType(path.node.elementType);
        }
      },

      /**
       * Turn something like:
       *
       * ```ts
       * breadcrumbs?: {
       *  values: (Breadcrumb | null)[];
       *  [k: string]: unknown;
       * } | null;
       * ```
       *
       * into
       *
       * breadcrumbs?: Breadcrumb;
       *
       * Works with both Array (foo | null)[] and simple unions
       */
      ObjectTypeAnnotation(path) {
        if (path.node.properties[0] && path.node.properties[0].key.name === 'values' && path.parentPath.node.optional) {
          path.parent.value = path.node.properties[0].value;
          path.parent.value = removeNullUnionType(path.parent.value);
          if (path.parent.value.elementType) {
            path.parent.value.elementType = removeNullUnionType(path.parent.value.elementType);
          }
        }
      },
    },
  };
};
