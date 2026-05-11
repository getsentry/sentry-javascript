import { describe, it, expect } from "vitest";
import { transform, BabelFileResult } from "@babel/core";
import plugin from "../src/index";

function transformWith(code: string, opts: Record<string, unknown> = {}): BabelFileResult | null {
  return transform(code, {
    filename: "/filename-test.js",
    configFile: false,
    presets: ["@babel/preset-react"],
    plugins: [[plugin, { autoInjectSentryLabel: true, ...opts }]],
  });
}

function transformWithout(
  code: string,
  opts: Record<string, unknown> = {}
): BabelFileResult | null {
  return transform(code, {
    filename: "/filename-test.js",
    configFile: false,
    presets: ["@babel/preset-react"],
    plugins: [[plugin, opts]],
  });
}

describe("autoInjectSentryLabel", () => {
  describe("opt-in behavior", () => {
    it("does not inject sentry-label when autoInjectSentryLabel is not set", () => {
      const result = transformWithout(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>Hello</Text>
            </View>
          );
        }
      `);
      expect(result?.code).not.toContain("sentry-label");
    });

    it("does not inject sentry-label when autoInjectSentryLabel is false", () => {
      const result = transformWithout(
        `
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>Hello</Text>
            </View>
          );
        }
      `,
        { autoInjectSentryLabel: false }
      );
      expect(result?.code).not.toContain("sentry-label");
    });

    it("injects sentry-label when autoInjectSentryLabel is true", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>Hello</Text>
            </View>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Hello"');
    });
  });

  describe("basic static text extraction", () => {
    it("extracts text from a Text child", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, TouchableOpacity } from 'react-native';

        export default function SaveButton() {
          return (
            <TouchableOpacity onPress={save}>
              <Text>Save workout</Text>
            </TouchableOpacity>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Save workout"');
    });

    it("extracts text from a nested Text within a View", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View, TouchableOpacity } from 'react-native';

        export default function Card() {
          return (
            <TouchableOpacity>
              <View>
                <Text>Details</Text>
              </View>
            </TouchableOpacity>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Details"');
    });

    it("works with arrow function components", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        const MyButton = () => (
          <View>
            <Text>Press me</Text>
          </View>
        );
      `);
      expect(result?.code).toContain('"sentry-label": "Press me"');
    });

    it("works with class components", () => {
      const result = transformWith(`
        import React, { Component } from 'react';
        import { Text, View } from 'react-native';

        class MyButton extends Component {
          render() {
            return (
              <View>
                <Text>Click here</Text>
              </View>
            );
          }
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Click here"');
    });
  });

  describe("multiple text children", () => {
    it("joins text from multiple Text children with space", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function AddToCart() {
          return (
            <View>
              <Text>Add</Text>
              <Text>to cart</Text>
            </View>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Add to cart"');
    });

    it("joins text from multiple nested Text children", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View, TouchableOpacity } from 'react-native';

        export default function Header() {
          return (
            <TouchableOpacity>
              <View>
                <Text>Welcome</Text>
                <Text>back</Text>
              </View>
            </TouchableOpacity>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Welcome back"');
    });
  });

  describe("skip conditions", () => {
    it("skips when sentry-label already exists", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View sentry-label="Custom label">
              <Text>Auto text</Text>
            </View>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Custom label"');
      expect(result?.code).not.toContain('"sentry-label": "Auto text"');
    });

    it("skips dynamic expression children", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>{variable}</Text>
            </View>
          );
        }
      `);
      expect(result?.code).not.toContain("sentry-label");
    });

    it("skips when Text child has a function call expression", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>{t('key')}</Text>
            </View>
          );
        }
      `);
      expect(result?.code).not.toContain("sentry-label");
    });

    it("skips when Text child has a template literal", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>{\`hello \${name}\`}</Text>
            </View>
          );
        }
      `);
      expect(result?.code).not.toContain("sentry-label");
    });

    it("skips when text is empty or whitespace only", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>   </Text>
            </View>
          );
        }
      `);
      expect(result?.code).not.toContain("sentry-label");
    });

    it("skips when no Text children exist", () => {
      const result = transformWith(`
        import React from 'react';
        import { View, Image } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Image source={pic} />
            </View>
          );
        }
      `);
      expect(result?.code).not.toContain("sentry-label");
    });

    it("skips when expression container is at root level", () => {
      const result = transformWith(`
        import React from 'react';
        import { View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              {someContent}
            </View>
          );
        }
      `);
      expect(result?.code).not.toContain("sentry-label");
    });
  });

  describe("truncation", () => {
    it("truncates text longer than 64 characters with ...", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>This is an extremely long text that definitely exceeds the sixty-four character limit</Text>
            </View>
          );
        }
      `);
      const match = result?.code?.match(/"sentry-label": "([^"]+)"/);
      expect(match).toBeTruthy();
      const label = match?.[1] ?? "";
      expect(label.length).toBe(64);
      expect(label.endsWith("...")).toBe(true);
      expect(label).toBe("This is an extremely long text that definitely exceeds the si...");
    });

    it("does not truncate text at exactly 64 characters", () => {
      // 64 chars exactly
      const text64 = "A".repeat(64);
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>${text64}</Text>
            </View>
          );
        }
      `);
      expect(result?.code).toContain(`"sentry-label": "${text64}"`);
    });
  });

  describe("depth limit", () => {
    it("extracts text at depth 1 (direct child)", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>Direct child</Text>
            </View>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Direct child"');
    });

    it("extracts text at depth 2 (nested in one wrapper)", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <View>
                <Text>Nested once</Text>
              </View>
            </View>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Nested once"');
    });

    it("extracts text at depth 3 (nested in two wrappers)", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <View>
                <View>
                  <Text>Nested twice</Text>
                </View>
              </View>
            </View>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Nested twice"');
    });

    it("does not extract text beyond depth limit", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <View>
                <View>
                  <View>
                    <Text>Too deep</Text>
                  </View>
                </View>
              </View>
            </View>
          );
        }
      `);
      expect(result?.code).not.toContain("sentry-label");
    });

    it("does not count fragments toward depth limit", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <View>
                <View>
                  <>
                    <Text>Still found</Text>
                  </>
                </View>
              </View>
            </View>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Still found"');
    });
  });

  describe("text component names", () => {
    it("recognizes lowercase text component", () => {
      const result = transformWith(`
        import React from 'react';

        export default function MyComponent() {
          return (
            <view>
              <text>Hello</text>
            </view>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Hello"');
    });

    it("supports custom text component names via option", () => {
      const result = transformWith(
        `
        import React from 'react';

        export default function MyComponent() {
          return (
            <View>
              <Label>Custom text</Label>
            </View>
          );
        }
      `,
        { autoInjectSentryLabel: { textComponentNames: ["Label", "Text"] } }
      );
      expect(result?.code).toContain('"sentry-label": "Custom text"');
    });

    it("does not extract from non-text components by default", () => {
      const result = transformWith(`
        import React from 'react';
        import { View, Button } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Button>Not extracted</Button>
            </View>
          );
        }
      `);
      expect(result?.code).not.toContain("sentry-label");
    });
  });

  describe("nested text components (RN inline styling)", () => {
    it("extracts text from nested Text inside Text", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>Hello <Text style={bold}>world</Text></Text>
            </View>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Hello world"');
    });

    it("extracts text from deeply nested inline Text", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>Press <Text style={bold}>Save <Text style={italic}>now</Text></Text> to continue</Text>
            </View>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Press Save now to continue"');
    });

    it("bails out when nested Text contains dynamic content", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>Hello <Text>{name}</Text></Text>
            </View>
          );
        }
      `);
      expect(result?.code).not.toContain("sentry-label");
    });

    it("skips non-text elements inside Text without bailing out", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>Hello <Icon name="star" /> world</Text>
            </View>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Hello world"');
    });

    it("extracts text from fragment children inside Text", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>Hello <>World</> more</Text>
            </View>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Hello World more"');
    });

    it("handles Text wrapping only a non-text element", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text><Bold>hello</Bold></Text>
            </View>
          );
        }
      `);
      expect(result?.code).not.toContain("sentry-label");
    });
  });

  describe("web compatibility", () => {
    it("uses hyphenated sentry-label attribute", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>Hello</Text>
            </View>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label"');
      expect(result?.code).not.toContain("sentryLabel");
    });

    it("uses sentry-label in native mode too", () => {
      const result = transformWith(
        `
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>Hello</Text>
            </View>
          );
        }
      `,
        { native: true }
      );
      expect(result?.code).toContain('"sentry-label": "Hello"');
    });
  });

  describe("fragment handling", () => {
    it("injects on first element child when root is a fragment", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, TouchableOpacity } from 'react-native';

        export default function MyComponent() {
          return (
            <>
              <TouchableOpacity>
                <Text>Hello</Text>
              </TouchableOpacity>
            </>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Hello"');
    });

    it("extracts text only from the target element, not sibling fragment children", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <>
              <View><Text>A</Text></View>
              <View><Text>B</Text></View>
            </>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "A"');
      expect(result?.code).not.toContain('"sentry-label": "A B"');
    });

    it("skips root fragment when it has no element children", () => {
      const result = transformWith(`
        import React from 'react';

        export default function MyComponent() {
          return (
            <>
              Just text
            </>
          );
        }
      `);
      expect(result?.code).not.toContain("sentry-label");
    });

    it("skips root fragment when first child already has sentry-label", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <>
              <View sentry-label="Manual">
                <Text>Auto text</Text>
              </View>
            </>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Manual"');
      expect(result?.code).not.toContain('"sentry-label": "Auto text"');
    });

    it("traverses through fragment children to find text", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <>
                <Text>Fragment text</Text>
              </>
            </View>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Fragment text"');
    });
  });

  describe("edge cases", () => {
    it("trims whitespace from extracted text", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>  Hello world  </Text>
            </View>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Hello world"');
    });

    it("normalizes double spaces when joining text from multiple components", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>Hello </Text>
              <Text> world</Text>
            </View>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Hello world"');
      expect(result?.code).not.toContain("Hello  world");
    });

    it("collapses internal whitespace", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>Hello    world</Text>
            </View>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Hello world"');
    });

    it("still adds other sentry attributes alongside sentry-label", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>Hello</Text>
            </View>
          );
        }
      `);
      expect(result?.code).toContain("data-sentry-component");
      expect(result?.code).toContain("data-sentry-source-file");
      expect(result?.code).toContain('"sentry-label": "Hello"');
    });

    it("handles mixed static and dynamic children — skips all when dynamic present", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>Static</Text>
              {dynamicContent}
            </View>
          );
        }
      `);
      expect(result?.code).not.toContain("sentry-label");
    });

    it("respects ignoredComponents — does not inject sentry-label", () => {
      const result = transformWith(
        `
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function IgnoredComp() {
          return (
            <View>
              <Text>Should not label</Text>
            </View>
          );
        }
      `,
        { ignoredComponents: ["IgnoredComp"] }
      );
      expect(result?.code).not.toContain("sentry-label");
    });

    it("respects ignoredComponents matching the element name", () => {
      const result = transformWith(
        `
        import React from 'react';
        import { Text } from 'react-native';
        import { CustomCard } from './components';

        export default function MyComponent() {
          return (
            <CustomCard>
              <Text>Card text</Text>
            </CustomCard>
          );
        }
      `,
        { ignoredComponents: ["CustomCard"] }
      );
      expect(result?.code).not.toContain("sentry-label");
    });

    it("extracts text from JSXText inside a fragment child of root", () => {
      const result = transformWith(`
        import React from 'react';

        export default function MyComponent() {
          return <button><>Click me</></button>;
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Click me"');
    });

    it("bails out when non-text element inside Text contains dynamic content", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <Text>Hello <Bold>{name}</Bold> world</Text>
            </View>
          );
        }
      `);
      expect(result?.code).not.toContain("sentry-label");
    });

    it("handles direct JSXText on the root element", () => {
      const result = transformWith(`
        import React from 'react';

        export default function MyComponent() {
          return <button>Click me</button>;
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Click me"');
    });

    it("bails out entirely when dynamic content is nested inside a non-text wrapper", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return (
            <View>
              <View>
                <Text>{dynamic}</Text>
              </View>
              <Text>Static</Text>
            </View>
          );
        }
      `);
      expect(result?.code).not.toContain("sentry-label");
    });

    it("does not match member-expression text components against simple name", () => {
      const result = transformWith(`
        import React from 'react';
        import { View } from 'react-native';
        import MyLib from 'my-lib';

        export default function MyComponent() {
          return (
            <View>
              <MyLib.Text>Not matched</MyLib.Text>
            </View>
          );
        }
      `);
      expect(result?.code).not.toContain("sentry-label");
    });

    it("matches member-expression text components when configured", () => {
      const result = transformWith(
        `
        import React from 'react';
        import { View } from 'react-native';
        import MyLib from 'my-lib';

        export default function MyComponent() {
          return (
            <View>
              <MyLib.Text>Matched</MyLib.Text>
            </View>
          );
        }
      `,
        { autoInjectSentryLabel: { textComponentNames: ["Text", "MyLib.Text"] } }
      );
      expect(result?.code).toContain('"sentry-label": "Matched"');
    });
  });

  describe("multiple components in one file", () => {
    it("injects independent labels on each component", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        function SaveButton() {
          return (
            <View>
              <Text>Save</Text>
            </View>
          );
        }

        function CancelButton() {
          return (
            <View>
              <Text>Cancel</Text>
            </View>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Save"');
      expect(result?.code).toContain('"sentry-label": "Cancel"');
    });

    it("only injects on components that have text, not on others", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View, Image } from 'react-native';

        function IconButton() {
          return (
            <View>
              <Image source={icon} />
            </View>
          );
        }

        function TextButton() {
          return (
            <View>
              <Text>Click</Text>
            </View>
          );
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Click"');
      const matches = result?.code?.match(/"sentry-label"/g);
      expect(matches?.length).toBe(1);
    });
  });

  describe("ternary returns", () => {
    it("injects labels on both branches of a ternary", () => {
      const result = transformWith(`
        import React from 'react';
        import { Text, View } from 'react-native';

        export default function MyComponent() {
          return condition
            ? <View><Text>Yes</Text></View>
            : <View><Text>No</Text></View>;
        }
      `);
      expect(result?.code).toContain('"sentry-label": "Yes"');
      expect(result?.code).toContain('"sentry-label": "No"');
    });
  });
});
