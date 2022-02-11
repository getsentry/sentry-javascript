import { computeStackTrace } from '../../../src/tracekit';

describe('Tracekit - React Native Tests', () => {
  it('should parse exceptions for react-native-v8', () => {
    const REACT_NATIVE_V8_EXCEPTION = {
      message: 'Manually triggered crash to test Sentry reporting',
      name: 'Error',
      stack: `Error: Manually triggered crash to test Sentry reporting
          at Object.onPress(index.android.bundle:2342:3773)
          at s.touchableHandlePress(index.android.bundle:214:2048)
          at s._performSideEffectsForTransition(index.android.bundle:198:9608)
          at s._receiveSignal(index.android.bundle:198:8309)
          at s.touchableHandleResponderRelease(index.android.bundle:198:5615)
          at Object.y(index.android.bundle:93:571)
          at P(index.android.bundle:93:714)`,
    };
    const stacktrace = computeStackTrace(REACT_NATIVE_V8_EXCEPTION);

    expect(stacktrace).toEqual({
      message: 'Manually triggered crash to test Sentry reporting',
      name: 'Error',
      stack: [
        { url: 'index.android.bundle', func: 'Object.onPress', line: 2342, column: 3773 },
        { url: 'index.android.bundle', func: 's.touchableHandlePress', line: 214, column: 2048 },
        { url: 'index.android.bundle', func: 's._performSideEffectsForTransition', line: 198, column: 9608 },
        { url: 'index.android.bundle', func: 's._receiveSignal', line: 198, column: 8309 },
        { url: 'index.android.bundle', func: 's.touchableHandleResponderRelease', line: 198, column: 5615 },
        { url: 'index.android.bundle', func: 'Object.y', line: 93, column: 571 },
        { url: 'index.android.bundle', func: 'P', line: 93, column: 714 },
      ],
    });
  });

  it('should parse exceptions for react-native Expo bundles', () => {
    const REACT_NATIVE_EXPO_EXCEPTION = {
      message: 'Test Error Expo',
      name: 'Error',
      stack: `onPress@/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3:595:658
          value@/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3:221:7656
          onResponderRelease@/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3:221:5666
          p@/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3:96:385
          forEach@[native code]`,
    };
    const stacktrace = computeStackTrace(REACT_NATIVE_EXPO_EXCEPTION);

    expect(stacktrace).toEqual({
      message: 'Test Error Expo',
      name: 'Error',
      stack: [
        {
          url: '/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3',
          func: 'onPress',
          line: 595,
          column: 658,
        },
        {
          url: '/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3',
          func: 'value',
          line: 221,
          column: 7656,
        },
        {
          url: '/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3',
          func: 'onResponderRelease',
          line: 221,
          column: 5666,
        },
        {
          url: '/data/user/0/com.sentrytest/files/.expo-internal/bundle-613EDD44F3305B9D75D4679663900F2BCDDDC326F247CA3202A3A4219FD412D3',
          func: 'p',
          line: 96,
          column: 385,
        },
        { url: '[native code]', func: 'forEach', line: null, column: null },
      ],
    });
  });

  it('should parse React Native errors on Android', () => {
    const ANDROID_REACT_NATIVE = {
      message: 'Error: test',
      name: 'Error',
      stack:
        'Error: test\n' +
        'at render(/home/username/sample-workspace/sampleapp.collect.react/src/components/GpsMonitorScene.js:78:24)\n' +
        'at _renderValidatedComponentWithoutOwnerOrContext(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js:1050:29)\n' +
        'at _renderValidatedComponent(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js:1075:15)\n' +
        'at renderedElement(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js:484:29)\n' +
        'at _currentElement(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js:346:40)\n' +
        'at child(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactReconciler.js:68:25)\n' +
        'at children(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactMultiChild.js:264:10)\n' +
        'at this(/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/native/ReactNativeBaseComponent.js:74:41)\n',
    };

    const stackFrames = computeStackTrace(ANDROID_REACT_NATIVE);

    expect(stackFrames).toEqual({
      message: 'Error: test',
      name: 'Error',
      stack: [
        {
          url: '/home/username/sample-workspace/sampleapp.collect.react/src/components/GpsMonitorScene.js',
          func: 'render',
          line: 78,
          column: 24,
        },
        {
          url: '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js',
          func: '_renderValidatedComponentWithoutOwnerOrContext',
          line: 1050,
          column: 29,
        },
        {
          url: '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js',
          func: '_renderValidatedComponent',
          line: 1075,
          column: 15,
        },
        {
          url: '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js',
          func: 'renderedElement',
          line: 484,
          column: 29,
        },
        {
          url: '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactCompositeComponent.js',
          func: '_currentElement',
          line: 346,
          column: 40,
        },
        {
          url: '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactReconciler.js',
          func: 'child',
          line: 68,
          column: 25,
        },
        {
          url: '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/shared/stack/reconciler/ReactMultiChild.js',
          func: 'children',
          line: 264,
          column: 10,
        },
        {
          url: '/home/username/sample-workspace/sampleapp.collect.react/node_modules/react-native/Libraries/Renderer/src/renderers/native/ReactNativeBaseComponent.js',
          func: 'this',
          line: 74,
          column: 41,
        },
      ],
    });
  });

  it('should parse React Native errors on Android Production', () => {
    const ANDROID_REACT_NATIVE_PROD = {
      message: 'Error: test',
      name: 'Error',
      stack:
        'value@index.android.bundle:12:1917\n' +
        'onPress@index.android.bundle:12:2336\n' +
        'touchableHandlePress@index.android.bundle:258:1497\n' +
        '[native code]\n' +
        '_performSideEffectsForTransition@index.android.bundle:252:8508\n' +
        '[native code]\n' +
        '_receiveSignal@index.android.bundle:252:7291\n' +
        '[native code]\n' +
        'touchableHandleResponderRelease@index.android.bundle:252:4735\n' +
        '[native code]\n' +
        'u@index.android.bundle:79:142\n' +
        'invokeGuardedCallback@index.android.bundle:79:459\n' +
        'invokeGuardedCallbackAndCatchFirstError@index.android.bundle:79:580\n' +
        'c@index.android.bundle:95:365\n' +
        'a@index.android.bundle:95:567\n' +
        'v@index.android.bundle:146:501\n' +
        'g@index.android.bundle:146:604\n' +
        'forEach@[native code]\n' +
        'i@index.android.bundle:149:80\n' +
        'processEventQueue@index.android.bundle:146:1432\n' +
        's@index.android.bundle:157:88\n' +
        'handleTopLevel@index.android.bundle:157:174\n' +
        'index.android.bundle:156:572\n' +
        'a@index.android.bundle:93:276\n' +
        'c@index.android.bundle:93:60\n' +
        'perform@index.android.bundle:177:596\n' +
        'batchedUpdates@index.android.bundle:188:464\n' +
        'i@index.android.bundle:176:358\n' +
        'i@index.android.bundle:93:90\n' +
        'u@index.android.bundle:93:150\n' +
        '_receiveRootNodeIDEvent@index.android.bundle:156:544\n' +
        'receiveTouches@index.android.bundle:156:918\n' +
        'value@index.android.bundle:29:3016\n' +
        'index.android.bundle:29:955\n' +
        'value@index.android.bundle:29:2417\n' +
        'value@index.android.bundle:29:927\n' +
        '[native code]',
    };

    const stackFrames = computeStackTrace(ANDROID_REACT_NATIVE_PROD);

    expect(stackFrames).toEqual({
      message: 'Error: test',
      name: 'Error',
      stack: [
        { url: 'index.android.bundle', func: 'value', line: 12, column: 1917 },
        { url: 'index.android.bundle', func: 'onPress', line: 12, column: 2336 },
        { url: 'index.android.bundle', func: 'touchableHandlePress', line: 258, column: 1497 },
        { url: '[native code]', func: '?', line: null, column: null },
        { url: 'index.android.bundle', func: '_performSideEffectsForTransition', line: 252, column: 8508 },
        { url: '[native code]', func: '?', line: null, column: null },
        { url: 'index.android.bundle', func: '_receiveSignal', line: 252, column: 7291 },
        { url: '[native code]', func: '?', line: null, column: null },
        { url: 'index.android.bundle', func: 'touchableHandleResponderRelease', line: 252, column: 4735 },
        { url: '[native code]', func: '?', line: null, column: null },
        { url: 'index.android.bundle', func: 'u', line: 79, column: 142 },
        { url: 'index.android.bundle', func: 'invokeGuardedCallback', line: 79, column: 459 },
        { url: 'index.android.bundle', func: 'invokeGuardedCallbackAndCatchFirstError', line: 79, column: 580 },
        { url: 'index.android.bundle', func: 'c', line: 95, column: 365 },
        { url: 'index.android.bundle', func: 'a', line: 95, column: 567 },
        { url: 'index.android.bundle', func: 'v', line: 146, column: 501 },
        { url: 'index.android.bundle', func: 'g', line: 146, column: 604 },
        { url: '[native code]', func: 'forEach', line: null, column: null },
        { url: 'index.android.bundle', func: 'i', line: 149, column: 80 },
        { url: 'index.android.bundle', func: 'processEventQueue', line: 146, column: 1432 },
        { url: 'index.android.bundle', func: 's', line: 157, column: 88 },
        { url: 'index.android.bundle', func: 'handleTopLevel', line: 157, column: 174 },
        { url: 'index.android.bundle', func: '?', line: 156, column: 572 },
        { url: 'index.android.bundle', func: 'a', line: 93, column: 276 },
        { url: 'index.android.bundle', func: 'c', line: 93, column: 60 },
        { url: 'index.android.bundle', func: 'perform', line: 177, column: 596 },
        { url: 'index.android.bundle', func: 'batchedUpdates', line: 188, column: 464 },
        { url: 'index.android.bundle', func: 'i', line: 176, column: 358 },
        { url: 'index.android.bundle', func: 'i', line: 93, column: 90 },
        { url: 'index.android.bundle', func: 'u', line: 93, column: 150 },
        { url: 'index.android.bundle', func: '_receiveRootNodeIDEvent', line: 156, column: 544 },
        { url: 'index.android.bundle', func: 'receiveTouches', line: 156, column: 918 },
        { url: 'index.android.bundle', func: 'value', line: 29, column: 3016 },
        { url: 'index.android.bundle', func: '?', line: 29, column: 955 },
        { url: 'index.android.bundle', func: 'value', line: 29, column: 2417 },
        { url: 'index.android.bundle', func: 'value', line: 29, column: 927 },
        { url: '[native code]', func: '?', line: null, column: null },
      ],
    });
  });

  it('should parse React Native errors on Android Hermes', () => {
    const ANDROID_REACT_NATIVE_HERMES = {
      message: 'Error: lets throw!',
      name: 'Error',
      stack:
        'at onPress (address at index.android.bundle:1:452701)\n' +
        'at anonymous (address at index.android.bundle:1:224280)\n' +
        'at _performSideEffectsForTransition (address at index.android.bundle:1:230843)\n' +
        'at _receiveSignal (native)\n' +
        'at touchableHandleResponderRelease (native)\n' +
        'at onResponderRelease (native)\n' +
        'at apply (native)\n' +
        'at b (address at index.android.bundle:1:74037)\n' +
        'at apply (native)\n' +
        'at k (address at index.android.bundle:1:74094)\n' +
        'at apply (native)\n' +
        'at C (address at index.android.bundle:1:74126)\n' +
        'at N (address at index.android.bundle:1:74267)\n' +
        'at A (address at index.android.bundle:1:74709)\n' +
        'at forEach (native)\n' +
        'at z (address at index.android.bundle:1:74642)\n' +
        'at anonymous (address at index.android.bundle:1:77747)\n' +
        'at _e (address at index.android.bundle:1:127755)\n' +
        'at Ne (address at index.android.bundle:1:77238)\n' +
        'at Ue (address at index.android.bundle:1:77571)\n' +
        'at receiveTouches (address at index.android.bundle:1:122512)\n' +
        'at apply (native)\n' +
        'at value (address at index.android.bundle:1:33176)\n' +
        'at anonymous (address at index.android.bundle:1:31603)\n' +
        'at value (address at index.android.bundle:1:32776)\n' +
        'at value (address at index.android.bundle:1:31561)',
    };
    const stackFrames = computeStackTrace(ANDROID_REACT_NATIVE_HERMES);

    expect(stackFrames).toEqual({
      message: 'Error: lets throw!',
      name: 'Error',
      stack: [
        { url: 'index.android.bundle', func: 'onPress', line: 1, column: 452701 },
        { url: 'index.android.bundle', func: 'anonymous', line: 1, column: 224280 },
        { url: 'index.android.bundle', func: '_performSideEffectsForTransition', line: 1, column: 230843 },
        { url: 'native', func: '_receiveSignal', line: null, column: null },
        { url: 'native', func: 'touchableHandleResponderRelease', line: null, column: null },
        { url: 'native', func: 'onResponderRelease', line: null, column: null },
        { url: 'native', func: 'apply', line: null, column: null },
        { url: 'index.android.bundle', func: 'b', line: 1, column: 74037 },
        { url: 'native', func: 'apply', line: null, column: null },
        { url: 'index.android.bundle', func: 'k', line: 1, column: 74094 },
        { url: 'native', func: 'apply', line: null, column: null },
        { url: 'index.android.bundle', func: 'C', line: 1, column: 74126 },
        { url: 'index.android.bundle', func: 'N', line: 1, column: 74267 },
        { url: 'index.android.bundle', func: 'A', line: 1, column: 74709 },
        { url: 'native', func: 'forEach', line: null, column: null },
        { url: 'index.android.bundle', func: 'z', line: 1, column: 74642 },
        { url: 'index.android.bundle', func: 'anonymous', line: 1, column: 77747 },
        { url: 'index.android.bundle', func: '_e', line: 1, column: 127755 },
        { url: 'index.android.bundle', func: 'Ne', line: 1, column: 77238 },
        { url: 'index.android.bundle', func: 'Ue', line: 1, column: 77571 },
        { url: 'index.android.bundle', func: 'receiveTouches', line: 1, column: 122512 },
        { url: 'native', func: 'apply', line: null, column: null },
        { url: 'index.android.bundle', func: 'value', line: 1, column: 33176 },
        { url: 'index.android.bundle', func: 'anonymous', line: 1, column: 31603 },
        { url: 'index.android.bundle', func: 'value', line: 1, column: 32776 },
        { url: 'index.android.bundle', func: 'value', line: 1, column: 31561 },
      ],
    });
  });
});
