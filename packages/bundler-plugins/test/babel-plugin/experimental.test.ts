/**
 * MIT License
 *
 * Copyright (c) 2020 Engineering at FullStory
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */

import { describe, it, expect } from 'vitest';
import { transform } from '@babel/core';
import { experimentalComponentNameAnnotatePlugin as plugin } from '../../src/babel-plugin/index';

const BananasPizzaAppStandardInput = `import React, { Component } from 'react';
import { StyleSheet, Text, TextInput, View, Image, UIManager } from 'react-native';

UIManager.getViewManagerConfig('RCTView').NativeProps.fsClass = "String";

class Bananas extends Component {
  render() {
    let pic = {
      uri: 'https://upload.wikimedia.org/wikipedia/commons/d/de/Bananavarieties.jpg'
    };
    return <Image source={pic} style={{ width: 193, height: 110, marginTop: 10 }} fsClass="test-class" />;
  }
}

class PizzaTranslator extends Component {
  constructor(props) {
    super(props);
    this.state = { text: '' };
  }

  render() {
    return <View style={{ padding: 10 }}>
        <TextInput style={{
        backgroundColor: '#000',
        color: '#eee',
        padding: 8
      }} placeholder="Type here to translate!" // not supported on iOS
      onChangeText={text => this.setState({ text })} value={this.state.text} />
        <Text style={{ padding: 10, fontSize: 42 }}>
          {this.state.text.split(' ').map(word => word && '🍕').join(' ')}
        </Text>
      </View>;
  }
}

export default function App() {
  return <View style={styles.container}>
      <Text style={{ color: '#eee' }}>FullStory ReactNative testing app</Text>
      <Bananas />
      <PizzaTranslator />
    </View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center'
  }
});`;

it('unknown-element snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';

class componentName extends Component {
  render() {
    return <bogus><h1>A</h1></bogus>;
  }
}

export default componentName;
`,
    {
      filename: '/filename-test.js',
      configFile: false,
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    class componentName extends Component {
      render() {
        return /*#__PURE__*/React.createElement("bogus", {
          "data-sentry-component": "componentName"
        }, /*#__PURE__*/React.createElement("h1", null, "A"));
      }
    }
    export default componentName;"
  `);
});

it('component-fragment snapshot matches', () => {
  const result = transform(
    `import React, { Component, Fragment } from 'react';

class componentName extends Component {
  render() {
    return <Fragment>A</Fragment>;
  }
}

export default componentName;
`,
    {
      filename: '/filename-test.js',
      configFile: false,
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component, Fragment } from 'react';
    class componentName extends Component {
      render() {
        return /*#__PURE__*/React.createElement(Fragment, null, "A");
      }
    }
    export default componentName;"
  `);
});

it('component-react-fragment snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';

class componentName extends Component {
  render() {
    return <React.Fragment>A</React.Fragment>;
  }
}

export default componentName;
`,
    {
      filename: '/filename-test.js',
      configFile: false,
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    class componentName extends Component {
      render() {
        return /*#__PURE__*/React.createElement(React.Fragment, null, "A");
      }
    }
    export default componentName;"
  `);
});

it('component-shorthand-fragment snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';

class componentName extends Component {
  render() {
    return <>A</>;
  }
}

export default componentName;
`,
    {
      filename: '/filename-test.js',
      configFile: false,
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    class componentName extends Component {
      render() {
        return /*#__PURE__*/React.createElement(React.Fragment, null, "A");
      }
    }
    export default componentName;"
  `);
});

it('component-annotate-shorthand-fragment snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';

class componentName extends Component {
  render() {
    return <>
      <h1>Hello world</h1>
    </>;
  }
}

export default componentName;
`,
    {
      filename: '/filename-test.js',
      configFile: false,
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    class componentName extends Component {
      render() {
        return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h1", {
          "data-sentry-component": "componentName"
        }, "Hello world"));
      }
    }
    export default componentName;"
  `);
});

it('arrow-noreturn-fragment snapshot matches', () => {
  const result = transform(
    `import React, { Component, Fragment } from 'react';

const componentName = () => (
  <Fragment>
    <h1>Hello world</h1>
  </Fragment>
);

export default componentName;
`,
    {
      filename: '/filename-test.js',
      configFile: false,
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component, Fragment } from 'react';
    const componentName = () => /*#__PURE__*/React.createElement(Fragment, null, /*#__PURE__*/React.createElement("h1", {
      "data-sentry-component": "componentName"
    }, "Hello world"));
    export default componentName;"
  `);
});

it('arrow-noreturn-shorthand-fragment snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';

const componentName = () => (
  <>
    <h1>Hello world</h1>
  </>
);

export default componentName;
`,
    {
      filename: '/filename-test.js',
      configFile: false,
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    const componentName = () => /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h1", {
      "data-sentry-component": "componentName"
    }, "Hello world"));
    export default componentName;"
  `);
});

it('arrow-noreturn-react-fragment snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';

const componentName = () => (
  <React.Fragment>
    <h1>Hello world</h1>
  </React.Fragment>
);

export default componentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    const componentName = () => /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h1", {
      "data-sentry-component": "componentName"
    }, "Hello world"));
    export default componentName;"
  `);
});

it('arrow-noreturn-annotate-trivial-fragment snapshot matches', () => {
  const result = transform(
    `import React, { Component, Fragment } from 'react';

const componentName = () => (
  <Fragment>Hello world</Fragment>
);

export default componentName;
`,
    {
      filename: '/filename-test.js',
      configFile: false,
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component, Fragment } from 'react';
    const componentName = () => /*#__PURE__*/React.createElement(Fragment, null, "Hello world");
    export default componentName;"
  `);
});

it('arrow snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';

const componentName = () => {
  return <div>
    <h1>Hello world</h1>
  </div>;
};

export default componentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    const componentName = () => {
      return /*#__PURE__*/React.createElement("div", {
        "data-sentry-component": "componentName"
      }, /*#__PURE__*/React.createElement("h1", null, "Hello world"));
    };
    export default componentName;"
  `);
});

it('option-attribute snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';

const componentName = () => {
  return <div>
    <h1>Hello world</h1>
  </div>;
};

export default componentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    const componentName = () => {
      return /*#__PURE__*/React.createElement("div", {
        "data-sentry-component": "componentName"
      }, /*#__PURE__*/React.createElement("h1", null, "Hello world"));
    };
    export default componentName;"
  `);
});

it('component snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';

class componentName extends Component {
  render() {
    return <div>
        <h1>Hello world</h1>
      </div>;
  }
}

export default componentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    class componentName extends Component {
      render() {
        return /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "componentName"
        }, /*#__PURE__*/React.createElement("h1", null, "Hello world"));
      }
    }
    export default componentName;"
  `);
});

it('rawfunction-fragment snapshot matches', () => {
  const result = transform(
    `import React, { Component, Fragment } from 'react';

function SubComponent() {
  return <Fragment>Sub</Fragment>;
}

const componentName = () => {
  return <Fragment>
    <SubComponent />
  </Fragment>;
};

export default componentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component, Fragment } from 'react';
    function SubComponent() {
      return /*#__PURE__*/React.createElement(Fragment, null, "Sub");
    }
    const componentName = () => {
      return /*#__PURE__*/React.createElement(Fragment, null, /*#__PURE__*/React.createElement(SubComponent, null));
    };
    export default componentName;"
  `);
});

it('rawfunction-react-fragment snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';

function SubComponent() {
  return <React.Fragment>Sub</React.Fragment>;
}

const componentName = () => {
  return <React.Fragment>
    <SubComponent />
  </React.Fragment>;
};

export default componentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    function SubComponent() {
      return /*#__PURE__*/React.createElement(React.Fragment, null, "Sub");
    }
    const componentName = () => {
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SubComponent, null));
    };
    export default componentName;"
  `);
});

it('rawfunction-shorthand-fragment snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';

function SubComponent() {
  return <>Sub</>;
}

const componentName = () => {
  return <>
    <SubComponent />
  </>;
};

export default componentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    function SubComponent() {
      return /*#__PURE__*/React.createElement(React.Fragment, null, "Sub");
    }
    const componentName = () => {
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SubComponent, null));
    };
    export default componentName;"
  `);
});

it('arrow-noreturn snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';

const componentName = () => (
  <div>
    <h1>Hello world</h1>
  </div>
);

export default componentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    const componentName = () => /*#__PURE__*/React.createElement("div", {
      "data-sentry-component": "componentName"
    }, /*#__PURE__*/React.createElement("h1", null, "Hello world"));
    export default componentName;"
  `);
});

it('tags snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';
import { StyleSheet, Text, TextInput, View, Image, UIManager } from 'react-native';

UIManager.getViewManagerConfig('RCTView').NativeProps.fsClass = "String";

class Bananas extends Component {
  render() {
    let pic = {
      uri: 'https://upload.wikimedia.org/wikipedia/commons/d/de/Bananavarieties.jpg'
    };
    return <Image source={pic} style={{ width: 193, height: 110, marginTop: 10 }} fsClass="test-class" />;
  }
}

class PizzaTranslator extends Component {
  constructor(props) {
    super(props);
    this.state = { text: '' };
  }

  render() {
    return <View style={{ padding: 10 }}>
        <TextInput style={{
        backgroundColor: '#000',
        color: '#eee',
        padding: 8
      }} placeholder="Type here to translate!" // not supported on iOS
      onChangeText={text => this.setState({ text })} value={this.state.text} />
        <Text style={{ padding: 10, fontSize: 42 }}>
          {this.state.text.split(' ').map(word => word && '🍕').join(' ')}
        </Text>
      </View>;
  }
}

export default function App() {
  return <View style={styles.container}>
      <Text style={{ color: '#eee' }}>FullStory ReactNative testing app</Text>
      <Bananas />
      <PizzaTranslator />
    </View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center'
  }
});
`,
    {
      filename: '/filename-test.js',
      configFile: false,
      presets: ['@babel/preset-react'],
      plugins: [[plugin, { native: true }]],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    import { StyleSheet, Text, TextInput, View, Image, UIManager } from 'react-native';
    UIManager.getViewManagerConfig('RCTView').NativeProps.fsClass = "String";
    class Bananas extends Component {
      render() {
        let pic = {
          uri: 'https://upload.wikimedia.org/wikipedia/commons/d/de/Bananavarieties.jpg'
        };
        return /*#__PURE__*/React.createElement(Image, {
          source: pic,
          style: {
            width: 193,
            height: 110,
            marginTop: 10
          },
          fsClass: "test-class",
          dataSentryComponent: "Bananas"
        });
      }
    }
    class PizzaTranslator extends Component {
      constructor(props) {
        super(props);
        this.state = {
          text: ''
        };
      }
      render() {
        return /*#__PURE__*/React.createElement(View, {
          style: {
            padding: 10
          },
          dataSentryComponent: "PizzaTranslator"
        }, /*#__PURE__*/React.createElement(TextInput, {
          style: {
            backgroundColor: '#000',
            color: '#eee',
            padding: 8
          },
          placeholder: "Type here to translate!" // not supported on iOS
          ,
          onChangeText: text => this.setState({
            text
          }),
          value: this.state.text
        }), /*#__PURE__*/React.createElement(Text, {
          style: {
            padding: 10,
            fontSize: 42
          }
        }, this.state.text.split(' ').map(word => word && '🍕').join(' ')));
      }
    }
    export default function App() {
      return /*#__PURE__*/React.createElement(View, {
        style: styles.container,
        dataSentryComponent: "App"
      }, /*#__PURE__*/React.createElement(Text, {
        style: {
          color: '#eee'
        }
      }, "FullStory ReactNative testing app"), /*#__PURE__*/React.createElement(Bananas, null), /*#__PURE__*/React.createElement(PizzaTranslator, null));
    }
    const styles = StyleSheet.create({
      container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'stretch',
        backgroundColor: '#222',
        alignItems: 'center',
        justifyContent: 'center'
      }
    });"
  `);
});

it('option-format snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';

const componentName = () => {
  return <div>
    <h1>Hello world</h1>
  </div>;
};

export default componentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    const componentName = () => {
      return /*#__PURE__*/React.createElement("div", {
        "data-sentry-component": "componentName"
      }, /*#__PURE__*/React.createElement("h1", null, "Hello world"));
    };
    export default componentName;"
  `);
});

it('pureComponent-fragment snapshot matches', () => {
  const result = transform(
    `import React, { Fragment } from 'react';

class PureComponentName extends React.PureComponent {
    render() {
        return <Fragment>
            <h1>Hello world</h1>
        </Fragment>;
    }
}

export default PureComponentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Fragment } from 'react';
    class PureComponentName extends React.PureComponent {
      render() {
        return /*#__PURE__*/React.createElement(Fragment, null, /*#__PURE__*/React.createElement("h1", {
          "data-sentry-component": "PureComponentName"
        }, "Hello world"));
      }
    }
    export default PureComponentName;"
  `);
});

it('pureComponent-shorthand-fragment snapshot matches', () => {
  const result = transform(
    `import React from 'react';

class PureComponentName extends React.PureComponent {
    render() {
        return <>
            <h1>Hello world</h1>
        </>;
    }
}

export default PureComponentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React from 'react';
    class PureComponentName extends React.PureComponent {
      render() {
        return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h1", {
          "data-sentry-component": "PureComponentName"
        }, "Hello world"));
      }
    }
    export default PureComponentName;"
  `);
});

it('pureComponent-react-fragment snapshot matches', () => {
  const result = transform(
    `import React from 'react';

class PureComponentName extends React.PureComponent {
    render() {
        return <React.Fragment>
            <h1>Hello world</h1>
        </React.Fragment>;
    }
}

export default PureComponentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React from 'react';
    class PureComponentName extends React.PureComponent {
      render() {
        return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h1", {
          "data-sentry-component": "PureComponentName"
        }, "Hello world"));
      }
    }
    export default PureComponentName;"
  `);
});

it('rawfunction snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';

function SubComponent() {
  return <div>Sub</div>;
}

const componentName = () => {
  return <div>
    <SubComponent />
  </div>;
};

export default componentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    function SubComponent() {
      return /*#__PURE__*/React.createElement("div", {
        "data-sentry-component": "SubComponent"
      }, "Sub");
    }
    const componentName = () => {
      return /*#__PURE__*/React.createElement("div", {
        "data-sentry-component": "componentName"
      }, /*#__PURE__*/React.createElement(SubComponent, null));
    };
    export default componentName;"
  `);
});

it('arrow-fragment snapshot matches', () => {
  const result = transform(
    `import React, { Component, Fragment } from 'react';

const componentName = () => {
  return <Fragment>
    <h1>Hello world</h1>
  </Fragment>;
};

export default componentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component, Fragment } from 'react';
    const componentName = () => {
      return /*#__PURE__*/React.createElement(Fragment, null, /*#__PURE__*/React.createElement("h1", {
        "data-sentry-component": "componentName"
      }, "Hello world"));
    };
    export default componentName;"
  `);
});

it('arrow-shorthand-fragment snapshot matches', () => {
  const result = transform(
    `import React from 'react';

const componentName = () => {
  return <>
    <h1>Hello world</h1>
  </>;
};

export default componentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React from 'react';
    const componentName = () => {
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h1", {
        "data-sentry-component": "componentName"
      }, "Hello world"));
    };
    export default componentName;"
  `);
});

it('arrow-react-fragment snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';

const componentName = () => {
  return <React.Fragment>
    <h1>Hello world</h1>
  </React.Fragment>;
};

export default componentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    const componentName = () => {
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h1", {
        "data-sentry-component": "componentName"
      }, "Hello world"));
    };
    export default componentName;"
  `);
});

it('nonJSX snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';

class TestClass extends Component {
  test() {
    return true;
  }
}

export default TestClass;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    class TestClass extends Component {
      test() {
        return true;
      }
    }
    export default TestClass;"
  `);
});

it('arrow-anonymous-fragment snapshot matches', () => {
  const result = transform(
    `import React, { Component, Fragment } from 'react';

const componentName = () => {
  return (() => <Fragment>
    <h1>Hello world</h1>
  </Fragment>)();
};

export default componentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component, Fragment } from 'react';
    const componentName = () => {
      return (() => /*#__PURE__*/React.createElement(Fragment, null, /*#__PURE__*/React.createElement("h1", null, "Hello world")))();
    };
    export default componentName;"
  `);
});

it('arrow-anonymous-shorthand-fragment snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';

const componentName = () => {
  return (() => <>
    <h1>Hello world</h1>
  </>)();
};

export default componentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    const componentName = () => {
      return (() => /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h1", null, "Hello world")))();
    };
    export default componentName;"
  `);
});

it('arrow-anonymous-react-fragment snapshot matches', () => {
  const result = transform(
    `import React, { Component } from 'react';

const componentName = () => {
  return (() => <React.Fragment>
    <h1>Hello world</h1>
  </React.Fragment>)();
};

export default componentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    const componentName = () => {
      return (() => /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h1", null, "Hello world")))();
    };
    export default componentName;"
  `);
});

it('pure snapshot matches', () => {
  const result = transform(
    `import React from 'react';

class PureComponentName extends React.PureComponent {
    render() {
        return <div>
            <h1>Hello world</h1>
        </div>;
    }
}

export default PureComponentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React from 'react';
    class PureComponentName extends React.PureComponent {
      render() {
        return /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "PureComponentName"
        }, /*#__PURE__*/React.createElement("h1", null, "Hello world"));
      }
    }
    export default PureComponentName;"
  `);
});

it('component-fragment-native snapshot matches', () => {
  const result = transform(
    `import React, { Component, Fragment } from 'react';

class componentName extends Component {
  render() {
    return <Fragment>A</Fragment>;
  }
}

export default componentName;
`,
    {
      presets: ['@babel/preset-react'],
      plugins: [[plugin, { native: true }]],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component, Fragment } from 'react';
    class componentName extends Component {
      render() {
        return /*#__PURE__*/React.createElement(Fragment, null, "A");
      }
    }
    export default componentName;"
  `);
});

it('pure-native snapshot matches', () => {
  const result = transform(
    `import React from 'react';

class PureComponentName extends React.PureComponent {
    render() {
        return <div>
            <h1>Hello world</h1>
        </div>;
    }
}

export default PureComponentName;
`,
    {
      filename: '/filename-test.js',
      configFile: false,
      presets: ['@babel/preset-react'],
      plugins: [[plugin, { native: true }]],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "import React from 'react';
    class PureComponentName extends React.PureComponent {
      render() {
        return /*#__PURE__*/React.createElement("div", {
          dataSentryComponent: "PureComponentName"
        }, /*#__PURE__*/React.createElement("h1", null, "Hello world"));
      }
    }
    export default PureComponentName;"
  `);
});

it('skips components marked in ignoredComponents', () => {
  const result = transform(BananasPizzaAppStandardInput, {
    filename: '/filename-test.js',
    presets: ['@babel/preset-react'],
    plugins: [[plugin, { native: true, ignoredComponents: ['Bananas'] }]],
  });
  expect(result?.code).toMatchInlineSnapshot(`
    "import React, { Component } from 'react';
    import { StyleSheet, Text, TextInput, View, Image, UIManager } from 'react-native';
    UIManager.getViewManagerConfig('RCTView').NativeProps.fsClass = "String";
    class Bananas extends Component {
      render() {
        let pic = {
          uri: 'https://upload.wikimedia.org/wikipedia/commons/d/de/Bananavarieties.jpg'
        };
        return /*#__PURE__*/React.createElement(Image, {
          source: pic,
          style: {
            width: 193,
            height: 110,
            marginTop: 10
          },
          fsClass: "test-class"
        });
      }
    }
    class PizzaTranslator extends Component {
      constructor(props) {
        super(props);
        this.state = {
          text: ''
        };
      }
      render() {
        return /*#__PURE__*/React.createElement(View, {
          style: {
            padding: 10
          },
          dataSentryComponent: "PizzaTranslator"
        }, /*#__PURE__*/React.createElement(TextInput, {
          style: {
            backgroundColor: '#000',
            color: '#eee',
            padding: 8
          },
          placeholder: "Type here to translate!" // not supported on iOS
          ,
          onChangeText: text => this.setState({
            text
          }),
          value: this.state.text
        }), /*#__PURE__*/React.createElement(Text, {
          style: {
            padding: 10,
            fontSize: 42
          }
        }, this.state.text.split(' ').map(word => word && '🍕').join(' ')));
      }
    }
    export default function App() {
      return /*#__PURE__*/React.createElement(View, {
        style: styles.container,
        dataSentryComponent: "App"
      }, /*#__PURE__*/React.createElement(Text, {
        style: {
          color: '#eee'
        }
      }, "FullStory ReactNative testing app"), /*#__PURE__*/React.createElement(Bananas, null), /*#__PURE__*/React.createElement(PizzaTranslator, null));
    }
    const styles = StyleSheet.create({
      container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'stretch',
        backgroundColor: '#222',
        alignItems: 'center',
        justifyContent: 'center'
      }
    });"
  `);
});

it('handles ternary operation returned by function body', () => {
  const result = transform(
    `const maybeTrue = Math.random() > 0.5;
export default function componentName() {
  return (maybeTrue ? '' : (<SubComponent />))
}`,
    {
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );
  expect(result?.code).toMatchInlineSnapshot(`
    "const maybeTrue = Math.random() > 0.5;
    export default function componentName() {
      return maybeTrue ? '' : /*#__PURE__*/React.createElement(SubComponent, null);
    }"
  `);
});

it('ignores components with member expressions when in ignoredComponents', () => {
  const result = transform(
    `import React from 'react';
import { Tab } from '@headlessui/react';

export default function TestComponent() {
  return (
    <div>
      <Tab.Group>
        <Tab.List>
          <Tab>Tab 1</Tab>
          <Tab>Tab 2</Tab>
        </Tab.List>
        <Tab.Panels>
          <Tab.Panel>Content 1</Tab.Panel>
          <Tab.Panel>Content 2</Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}`,
    {
      filename: '/filename-test.js',
      configFile: false,
      presets: ['@babel/preset-react'],
      plugins: [[plugin, { ignoredComponents: ['Tab.Group', 'Tab.List', 'Tab.Panels', 'Tab.Panel'] }]],
    },
  );

  // The component should be transformed but Tab.* components should not have annotations
  expect(result?.code).toContain('React.createElement(Tab.Group');
  expect(result?.code).not.toContain('"data-sentry-element": "Tab.Group"');
  expect(result?.code).toContain('React.createElement(Tab.List');
  expect(result?.code).not.toContain('"data-sentry-element": "Tab.List"');
  expect(result?.code).toMatchInlineSnapshot(`
    "import React from 'react';
    import { Tab } from '@headlessui/react';
    export default function TestComponent() {
      return /*#__PURE__*/React.createElement("div", {
        "data-sentry-component": "TestComponent"
      }, /*#__PURE__*/React.createElement(Tab.Group, null, /*#__PURE__*/React.createElement(Tab.List, null, /*#__PURE__*/React.createElement(Tab, null, "Tab 1"), /*#__PURE__*/React.createElement(Tab, null, "Tab 2")), /*#__PURE__*/React.createElement(Tab.Panels, null, /*#__PURE__*/React.createElement(Tab.Panel, null, "Content 1"), /*#__PURE__*/React.createElement(Tab.Panel, null, "Content 2"))));
    }"
  `);
});

it('handles nested member expressions in component names', () => {
  const result = transform(
    `import React from 'react';
import { Components } from 'my-ui-library';

export default function TestComponent() {
  return (
    <div>
      <Components.UI.Button>Click me</Components.UI.Button>
      <Components.UI.Card.Header>Title</Components.UI.Card.Header>
    </div>
  );
}`,
    {
      filename: '/filename-test.js',
      configFile: false,
      presets: ['@babel/preset-react'],
      plugins: [[plugin, { ignoredComponents: ['Components.UI.Button'] }]],
    },
  );

  // Components.UI.Button should be ignored but Components.UI.Card.Header should be annotated
  expect(result?.code).toContain('React.createElement(Components.UI.Button');
  expect(result?.code).not.toContain('"data-sentry-element": "Components.UI.Button"');
  expect(result?.code).toContain('React.createElement(Components.UI.Card.Header');
  expect(result?.code).toMatchInlineSnapshot(`
    "import React from 'react';
    import { Components } from 'my-ui-library';
    export default function TestComponent() {
      return /*#__PURE__*/React.createElement("div", {
        "data-sentry-component": "TestComponent"
      }, /*#__PURE__*/React.createElement(Components.UI.Button, null, "Click me"), /*#__PURE__*/React.createElement(Components.UI.Card.Header, null, "Title"));
    }"
  `);
});

it('Only injects in root html elements', () => {
  const result = transform(
    `import { Fragment as F } from 'react';

export default function TestComponent() {
  return (
    <F>
      <div>
        <h1>Title</h1>
        <p>Content</p>
      </div>
    </F>
  );
}`,
    {
      filename: '/filename-test.js',
      configFile: false,
      presets: ['@babel/preset-react'],
      plugins: [plugin],
    },
  );

  expect(result?.code).toMatchInlineSnapshot(`
    "import { Fragment as F } from 'react';
    export default function TestComponent() {
      return /*#__PURE__*/React.createElement(F, null, /*#__PURE__*/React.createElement("div", {
        "data-sentry-component": "TestComponent"
      }, /*#__PURE__*/React.createElement("h1", null, "Title"), /*#__PURE__*/React.createElement("p", null, "Content")));
    }"
  `);
});

describe('Fragment Detection', () => {
  it('ignores React.Fragment with member expression handling', () => {
    const result = transform(
      `import React from 'react';

  export default function TestComponent() {
    return (
      <React.Fragment>
        <div>Content</div>
      </React.Fragment>
    );
  }`,
      {
        filename: '/filename-test.js',
        configFile: false,
        presets: ['@babel/preset-react'],
        plugins: [plugin],
      },
    );

    expect(result?.code).toContain('React.createElement(React.Fragment');
    expect(result?.code).not.toContain('"data-sentry-element": "React.Fragment"');
    expect(result?.code).toMatchInlineSnapshot(`
      "import React from 'react';
      export default function TestComponent() {
        return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "TestComponent"
        }, "Content"));
      }"
    `);
  });

  it('ignores JSX fragments (<>)', () => {
    const result = transform(
      `export default function TestComponent() {
  return (
    <>
      <div>Content in JSX fragment</div>
      <span>More content</span>
    </>
  );
}`,
      {
        filename: '/filename-test.js',
        configFile: false,
        presets: ['@babel/preset-react'],
        plugins: [plugin],
      },
    );

    expect(result?.code).toContain('React.createElement(React.Fragment');
    expect(result?.code).not.toContain('"data-sentry-element": "Fragment"');
    expect(result?.code).toMatchInlineSnapshot(`
      "export default function TestComponent() {
        return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "TestComponent"
        }, "Content in JSX fragment"), /*#__PURE__*/React.createElement("span", {
          "data-sentry-component": "TestComponent"
        }, "More content"));
      }"
    `);
  });

  it('ignores Fragment imported with alias', () => {
    const result = transform(
      `import { Fragment as F } from 'react';

export default function TestComponent() {
  return (
    <F>
      <div>Content in aliased fragment</div>
    </F>
  );
}`,
      {
        filename: '/filename-test.js',
        configFile: false,
        presets: ['@babel/preset-react'],
        plugins: [plugin],
      },
    );

    expect(result?.code).toContain('React.createElement(F');
    expect(result?.code).not.toContain('"data-sentry-element": "F"');
    expect(result?.code).toMatchInlineSnapshot(`
      "import { Fragment as F } from 'react';
      export default function TestComponent() {
        return /*#__PURE__*/React.createElement(F, null, /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "TestComponent"
        }, "Content in aliased fragment"));
      }"
    `);
  });

  it('ignores Fragment assigned to variable', () => {
    const result = transform(
      `import { Fragment } from 'react';

const MyFragment = Fragment;

export default function TestComponent() {
  return (
    <MyFragment>
      <div>Content in variable fragment</div>
    </MyFragment>
  );
}`,
      {
        filename: '/filename-test.js',
        configFile: false,
        presets: ['@babel/preset-react'],
        plugins: [plugin],
      },
    );

    expect(result?.code).toContain('React.createElement(MyFragment');
    expect(result?.code).not.toContain('"data-sentry-element": "MyFragment"');
    expect(result?.code).toMatchInlineSnapshot(`
      "import { Fragment } from 'react';
      const MyFragment = Fragment;
      export default function TestComponent() {
        return /*#__PURE__*/React.createElement(MyFragment, null, /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "TestComponent"
        }, "Content in variable fragment"));
      }"
    `);
  });

  it('ignores Fragment with React namespace alias', () => {
    const result = transform(
      `import * as MyReact from 'react';

export default function TestComponent() {
  return (
    <MyReact.Fragment>
      <div>Content in namespaced fragment</div>
    </MyReact.Fragment>
  );
}`,
      {
        filename: '/filename-test.js',
        configFile: false,
        presets: ['@babel/preset-react'],
        plugins: [plugin],
      },
    );

    expect(result?.code).toContain('React.createElement(MyReact.Fragment');
    expect(result?.code).not.toContain('"data-sentry-element": "MyReact.Fragment"');
    expect(result?.code).toMatchInlineSnapshot(`
      "import * as MyReact from 'react';
      export default function TestComponent() {
        return /*#__PURE__*/React.createElement(MyReact.Fragment, null, /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "TestComponent"
        }, "Content in namespaced fragment"));
      }"
    `);
  });

  it('ignores React default import with Fragment', () => {
    const result = transform(
      `import MyReact from 'react';

export default function TestComponent() {
  return (
    <MyReact.Fragment>
      <div>Content in default import fragment</div>
    </MyReact.Fragment>
  );
}`,
      {
        filename: '/filename-test.js',
        configFile: false,
        presets: ['@babel/preset-react'],
        plugins: [plugin],
      },
    );

    expect(result?.code).toContain('React.createElement(MyReact.Fragment');
    expect(result?.code).not.toContain('"data-sentry-element": "MyReact.Fragment"');
    expect(result?.code).toMatchInlineSnapshot(`
      "import MyReact from 'react';
      export default function TestComponent() {
        return /*#__PURE__*/React.createElement(MyReact.Fragment, null, /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "TestComponent"
        }, "Content in default import fragment"));
      }"
    `);
  });

  it('ignores multiple fragment patterns in same file', () => {
    const result = transform(
      `import React, { Fragment } from 'react';

  const MyFragment = Fragment;

  export default function TestComponent() {
    return (
      <div>
        <>
          <div>JSX Fragment content</div>
        </>
        
        <Fragment>
          <span>Direct Fragment content</span>
        </Fragment>
        
        <MyFragment>
          <p>Variable Fragment content</p>
        </MyFragment>
        
        <React.Fragment>
          <h1>React.Fragment content</h1>
        </React.Fragment>
      </div>
    );
  }`,
      {
        filename: '/filename-test.js',
        configFile: false,
        presets: ['@babel/preset-react'],
        plugins: [plugin],
      },
    );

    expect(result?.code).not.toContain('"data-sentry-element": "Fragment"');
    expect(result?.code).not.toContain('"data-sentry-element": "MyFragment"');
    expect(result?.code).not.toContain('"data-sentry-element": "React.Fragment"');
    expect(result?.code).toMatchInlineSnapshot(`
      "import React, { Fragment } from 'react';
      const MyFragment = Fragment;
      export default function TestComponent() {
        return /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "TestComponent"
        }, /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, "JSX Fragment content")), /*#__PURE__*/React.createElement(Fragment, null, /*#__PURE__*/React.createElement("span", null, "Direct Fragment content")), /*#__PURE__*/React.createElement(MyFragment, null, /*#__PURE__*/React.createElement("p", null, "Variable Fragment content")), /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h1", null, "React.Fragment content")));
      }"
    `);
  });

  it('handles complex variable assignment chains', () => {
    const result = transform(
      `import { Fragment } from 'react';

  const MyFragment = Fragment;
  const AnotherFragment = MyFragment;

  export default function TestComponent() {
    return (
      <AnotherFragment>
        <div>Content in chained fragment</div>
      </AnotherFragment>
    );
  }`,
      {
        filename: '/filename-test.js',
        configFile: false,
        presets: ['@babel/preset-react'],
        plugins: [plugin],
      },
    );

    expect(result?.code).not.toContain('"data-sentry-element": "MyFragment"');
    expect(result?.code).not.toContain('"data-sentry-element": "AnotherFragment"');
    expect(result?.code).toMatchInlineSnapshot(`
      "import { Fragment } from 'react';
      const MyFragment = Fragment;
      const AnotherFragment = MyFragment;
      export default function TestComponent() {
        return /*#__PURE__*/React.createElement(AnotherFragment, null, /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "TestComponent"
        }, "Content in chained fragment"));
      }"
    `);
  });

  it('works with annotate-fragments option disabled', () => {
    const result = transform(
      `import { Fragment as F } from 'react';

export default function TestComponent() {
  return (
    <F>
      <div>Content</div>
    </F>
  );
}`,
      {
        filename: '/filename-test.js',
        configFile: false,
        presets: ['@babel/preset-react'],
        plugins: [plugin],
      },
    );

    expect(result?.code).not.toContain('"data-sentry-element": "F"');
    expect(result?.code).toMatchInlineSnapshot(`
      "import { Fragment as F } from 'react';
      export default function TestComponent() {
        return /*#__PURE__*/React.createElement(F, null, /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "TestComponent"
        }, "Content"));
      }"
    `);
  });

  it('works with annotate-fragments option enabled', () => {
    const result = transform(
      `import { Fragment as F } from 'react';

export default function TestComponent() {
  return (
    <F>
      <div>Content</div>
    </F>
  );
}`,
      {
        filename: '/filename-test.js',
        configFile: false,
        presets: ['@babel/preset-react'],
        plugins: [plugin],
      },
    );

    expect(result?.code).not.toContain('"data-sentry-element": "F"');
    expect(result?.code).toMatchInlineSnapshot(`
      "import { Fragment as F } from 'react';
      export default function TestComponent() {
        return /*#__PURE__*/React.createElement(F, null, /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "TestComponent"
        }, "Content"));
      }"
    `);
  });

  it('ignores Fragment from React destructuring', () => {
    const result = transform(
      `import React from 'react';

const { Fragment } = React;

export default function TestComponent() {
  return (
    <Fragment>
      <div>Content in destructured fragment</div>
    </Fragment>
  );
}`,
      {
        filename: '/filename-test.js',
        configFile: false,
        presets: ['@babel/preset-react'],
        plugins: [plugin],
      },
    );

    expect(result?.code).not.toContain('"data-sentry-element": "Fragment"');
    expect(result?.code).toMatchInlineSnapshot(`
      "import React from 'react';
      const {
        Fragment
      } = React;
      export default function TestComponent() {
        return /*#__PURE__*/React.createElement(Fragment, null, /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "TestComponent"
        }, "Content in destructured fragment"));
      }"
    `);
  });

  it('ignores Fragment with destructuring alias', () => {
    const result = transform(
      `import React from 'react';

const { Fragment: MyFragment } = React;

export default function TestComponent() {
  return (
    <MyFragment>
      <div>Content in aliased destructured fragment</div>
    </MyFragment>
  );
}`,
      {
        filename: '/filename-test.js',
        configFile: false,
        presets: ['@babel/preset-react'],
        plugins: [plugin],
      },
    );

    expect(result?.code).not.toContain('"data-sentry-element": "MyFragment"');
    expect(result?.code).toMatchInlineSnapshot(`
      "import React from 'react';
      const {
        Fragment: MyFragment
      } = React;
      export default function TestComponent() {
        return /*#__PURE__*/React.createElement(MyFragment, null, /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "TestComponent"
        }, "Content in aliased destructured fragment"));
      }"
    `);
  });

  it('ignores Fragment from mixed destructuring', () => {
    const result = transform(
      `import React from 'react';

const { Fragment, createElement, useState } = React;

export default function TestComponent() {
  return (
    <Fragment>
      <div>Content with other destructured items</div>
    </Fragment>
  );
}`,
      {
        filename: '/filename-test.js',
        configFile: false,
        presets: ['@babel/preset-react'],
        plugins: [plugin],
      },
    );

    expect(result?.code).not.toContain('"data-sentry-element": "Fragment"');
    expect(result?.code).toMatchInlineSnapshot(`
      "import React from 'react';
      const {
        Fragment,
        createElement,
        useState
      } = React;
      export default function TestComponent() {
        return /*#__PURE__*/React.createElement(Fragment, null, /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "TestComponent"
        }, "Content with other destructured items"));
      }"
    `);
  });

  it('handles destructuring from aliased React imports', () => {
    const result = transform(
      `import MyReact from 'react';

const { Fragment } = MyReact;

export default function TestComponent() {
  return (
    <Fragment>
      <div>Content from aliased React destructuring</div>
    </Fragment>
  );
}`,
      {
        filename: '/filename-test.js',
        configFile: false,
        presets: ['@babel/preset-react'],
        plugins: [plugin],
      },
    );

    expect(result?.code).not.toContain('"data-sentry-element": "Fragment"');
    expect(result?.code).toMatchInlineSnapshot(`
      "import MyReact from 'react';
      const {
        Fragment
      } = MyReact;
      export default function TestComponent() {
        return /*#__PURE__*/React.createElement(Fragment, null, /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "TestComponent"
        }, "Content from aliased React destructuring"));
      }"
    `);
  });

  it('handles destructuring from namespace imports', () => {
    const result = transform(
      `import * as ReactLib from 'react';

const { Fragment: F } = ReactLib;

export default function TestComponent() {
  return (
    <F>
      <div>Content from namespace destructuring</div>
    </F>
  );
}`,
      {
        filename: '/filename-test.js',
        configFile: false,
        presets: ['@babel/preset-react'],
        plugins: [plugin],
      },
    );

    expect(result?.code).not.toContain('"data-sentry-element": "F"');
    expect(result?.code).toMatchInlineSnapshot(`
      "import * as ReactLib from 'react';
      const {
        Fragment: F
      } = ReactLib;
      export default function TestComponent() {
        return /*#__PURE__*/React.createElement(F, null, /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "TestComponent"
        }, "Content from namespace destructuring"));
      }"
    `);
  });

  it('handles multiple destructuring patterns in one file', () => {
    const result = transform(
      `import React from 'react';
import * as MyReact from 'react';

const { Fragment } = React;
const { Fragment: AliasedFrag } = MyReact;

export default function TestComponent() {
  return (
    <div>
      <Fragment>
        <span>Regular destructured</span>
      </Fragment>
      
      <AliasedFrag>
        <p>Aliased destructured</p>
      </AliasedFrag>
    </div>
  );
}`,
      {
        filename: '/filename-test.js',
        configFile: false,
        presets: ['@babel/preset-react'],
        plugins: [plugin],
      },
    );

    expect(result?.code).not.toContain('"data-sentry-element": "Fragment"');
    expect(result?.code).not.toContain('"data-sentry-element": "AliasedFrag"');
    expect(result?.code).toMatchInlineSnapshot(`
      "import React from 'react';
      import * as MyReact from 'react';
      const {
        Fragment
      } = React;
      const {
        Fragment: AliasedFrag
      } = MyReact;
      export default function TestComponent() {
        return /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "TestComponent"
        }, /*#__PURE__*/React.createElement(Fragment, null, /*#__PURE__*/React.createElement("span", null, "Regular destructured")), /*#__PURE__*/React.createElement(AliasedFrag, null, /*#__PURE__*/React.createElement("p", null, "Aliased destructured")));
      }"
    `);
  });

  it('combines all fragment patterns correctly', () => {
    const result = transform(
      `import React, { Fragment as ImportedF } from 'react';
  import * as MyReact from 'react';

  const { Fragment: DestructuredF } = React;
  const { Fragment } = MyReact;
  const AssignedF = Fragment;  // ← This uses the destructured Fragment from MyReact

  export default function TestComponent() {
    return (
      <div className="container">
        {/* JSX Fragment */}
        <>
          <span>JSX Fragment content</span>
        </>
        
        {/* Imported alias */}
        <ImportedF>
          <span>Imported alias content</span>
        </ImportedF>
        
        {/* Destructured */}
        <DestructuredF>
          <span>Destructured content</span>
        </DestructuredF>
        
        {/* Destructured from namespace */}
        <Fragment>
          <span>Namespace destructured content</span>
        </Fragment>
        
        {/* Variable assigned */}
        <AssignedF>
          <span>Variable assigned content</span>
        </AssignedF>
        
        {/* React.Fragment */}
        <React.Fragment>
          <span>React.Fragment content</span>
        </React.Fragment>
        
        {/* Namespace Fragment */}
        <MyReact.Fragment>
          <span>Namespace Fragment content</span>
        </MyReact.Fragment>
      </div>
    );
  }`,
      {
        filename: '/filename-test.js',
        configFile: false,
        presets: ['@babel/preset-react'],
        plugins: [plugin],
      },
    );

    expect(result?.code).not.toContain('"data-sentry-element": "ImportedF"');
    expect(result?.code).not.toContain('"data-sentry-element": "DestructuredF"');
    expect(result?.code).not.toContain('"data-sentry-element": "Fragment"');
    expect(result?.code).not.toContain('"data-sentry-element": "AssignedF"');
    expect(result?.code).not.toContain('"data-sentry-element": "React.Fragment"');
    expect(result?.code).not.toContain('"data-sentry-element": "MyReact.Fragment"');
    expect(result?.code).toMatchInlineSnapshot(`
      "import React, { Fragment as ImportedF } from 'react';
      import * as MyReact from 'react';
      const {
        Fragment: DestructuredF
      } = React;
      const {
        Fragment
      } = MyReact;
      const AssignedF = Fragment; // ← This uses the destructured Fragment from MyReact

      export default function TestComponent() {
        return /*#__PURE__*/React.createElement("div", {
          className: "container",
          "data-sentry-component": "TestComponent"
        }, /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", null, "JSX Fragment content")), /*#__PURE__*/React.createElement(ImportedF, null, /*#__PURE__*/React.createElement("span", null, "Imported alias content")), /*#__PURE__*/React.createElement(DestructuredF, null, /*#__PURE__*/React.createElement("span", null, "Destructured content")), /*#__PURE__*/React.createElement(Fragment, null, /*#__PURE__*/React.createElement("span", null, "Namespace destructured content")), /*#__PURE__*/React.createElement(AssignedF, null, /*#__PURE__*/React.createElement("span", null, "Variable assigned content")), /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", null, "React.Fragment content")), /*#__PURE__*/React.createElement(MyReact.Fragment, null, /*#__PURE__*/React.createElement("span", null, "Namespace Fragment content")));
      }"
    `);
  });

  it('handles Fragment aliased correctly when used by other non-Fragment components in a different scope', () => {
    const result = transform(
      `import { Fragment as OriginalF } from 'react';
import { OtherComponent } from 'some-library';

function TestComponent() {
  const F = OriginalF;

  // Use Fragment alias - should be ignored
  return (
    <F>
      <div>This should NOT have data-sentry-element (Fragment)</div>
    </F>
  );
}

function AnotherComponent() {
  // Different component with same alias name in different function scope
  const F = OtherComponent;
  
  return (
    <F>
      <div>This SHOULD have data-sentry-element (not Fragment)</div>
    </F>
  );
}
`,
      {
        filename: '/variable-assignment-test.js',
        configFile: false,
        presets: ['@babel/preset-react'],
        plugins: [plugin],
      },
    );

    expect(result?.code).not.toContain('"data-sentry-element": "F"');
    expect(result?.code).toMatchInlineSnapshot(`
      "import { Fragment as OriginalF } from 'react';
      import { OtherComponent } from 'some-library';
      function TestComponent() {
        const F = OriginalF;

        // Use Fragment alias - should be ignored
        return /*#__PURE__*/React.createElement(F, null, /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "TestComponent"
        }, "This should NOT have data-sentry-element (Fragment)"));
      }
      function AnotherComponent() {
        // Different component with same alias name in different function scope
        const F = OtherComponent;
        return /*#__PURE__*/React.createElement(F, null, /*#__PURE__*/React.createElement("div", {
          "data-sentry-component": "AnotherComponent"
        }, "This SHOULD have data-sentry-element (not Fragment)"));
      }"
    `);
  });
});
