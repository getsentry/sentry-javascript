# End of Feedback Beta

With the release of 8.0.0, Sentry Feedback is now out of Beta. This means that the usual stability guarantees apply.

Feedback 8.0.0 requires server version 24.4.2 and above.

Because of experimentation and rapid iteration, during the Beta period some bugs and problems came up which have since
been fixed/improved, as well as API's which have been streamlined and changed.

Below you can find a list of relevant feedback changes and issues that have been made from 7.x to 8.0.0.

## Upgrading Feedback from 7.x to 8.0.0

We have streamlined the interface for interacting with the Feedback widget. Below is a list of public functions that
existed in 7.x and a description of how they have changed in v8.

| Method Name                                                   | Replacement                                                    | Notes                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Sentry.getClient<BrowserClient>()?.getIntegration(Feedback)` | `const feedback = Sentry.getFeedback()`                        | Get a type-safe reference to the configured feedbackIntegration instance.                                                                                                                                                         |
| `feedback.getWidget()`                                        | `const widget = feedback.createWidget(); widget.appendToDom()` | The SDK no longer maintains a stack of form instances. If you call `createWidget()` a new widget will be inserted into the DOM and an `ActorComponent` returned allows you control over the lifecycle of the widget.              |
| `feedback.openDialog()`                                       | `widget.open()`                                                | Make the form inside the widget visible.                                                                                                                                                                                          |
| `feedback.closeDialog()`                                      | `widget.close()`                                               | Make the form inside the widget hidden in the page. Success/Error messages will still be rendered and will hide themselves if the form was recently submitted.                                                                    |
| `feedback.removeWidget()`                                     | `widget.removeFromDom()`                                       | Remove the form and widget instance from the page. After calling this `widget.el.parentNode` will be set to null.                                                                                                                 |
| `feedback.attachTo()`                                         | `const unsubscribe = feedback.attachTo(myButtonElem)`          | The `attachTo()` method will create an onClick event listener to your html element that calls `appendToDom()` and `open()`. It returns a callback to remove the event listener.                                                   |
| -                                                             | `const form = await feedback.createForm()`                     | A new method `createForm()`, used internally by `createWidget()` and `attachTo()`, returns a `Promise<ReturnType<FeedbackModalIntegration['createDialog']>>` so you can control showing and hiding of the feedback form directly. |

### API Examples

#### Auto injecting Feedback

The easiest way to get setup is to auto-inject the feedback widget. This will create a floating button which opens the
feedback form.

In your SDK setup:

```javascript
Sentry.init({
  integrations: [
    feedbackIntegration({
      autoInject: true,
    }),
  ],
});
```

`autoInject: true` is the default value.

#### Attaching feedback to your own button

If you don't want to have a floating button to trigger the feedback form, you can attach the form to your own DOM
element instead.

First, get a reference to the feedback integration instance:

```javascript
// Option 1: Keep a reference when you setup the sdk:
const feedbackInstance = feedbackIntegration();
Sentry.init({
  integrations: [feedbackInstance],
});

// Option 2: Get a reference from the SDK client
const feedbackInstance = getFeedback();
```

Next, call `attachTo()`

```javascript
const myButton = document.getElementById('my-button');
const unsubscribe = feedbackInstance.attachTo(myButton);
```

This will insert the form into the DOM and show/hide it when the button is clicked.

Later, if `my-button` is removed from the page be sure to call `unsubscribe()` or `feedbackInstance.remove()` to cleanup
the event listeners.

#### Manually managing show/hide state and adding/remove the form from the DOM.

You can manually add/remove the widget from the page, and control when it's shown/hidden by calling the lifecycle
methods directly.

For example, `attachTo()` is a convenience wrapper over the lifecycle methods. You could re-implement it like this:

```javascript
function attachTo(button: HTMLElement) {
  const handleClick = () => {
    const widget = feedbackInstance.createWidget({
      onFormClose: () => {
        widget.close();
      },
      onFormSubmitted: () => {
        widget.removeFromDom();
      }
    });
    widget.appendToDom();
    widget.open();
  };

  button.addEventListener('click', handleClick);
  return () => {
    button.removeEventListener('click', handleClick)
  }
}
```

Alternatively you can call `createForm()` and control the form directly:

```javascript
const formPromise = feedbackInstance.createForm();

// Automatically insert and open the dialog after 5 seconds
// then close and remove it after another 10 seconds
setTimeout(() => {
  const form = await formPromise;
  form.appendToDom();
  form.open();

  setTimeout(() => {
    form.close();
    form.removeFromDom();
  }, 10_000);
}, 5_000);
```

## Config changes in v8

Added new configuration values

| Field Name         | Type         | Description                                                                                                                                                                                                           |
| ------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enableScreenshot` | `boolean`    | Default: true. Enable this option to allow a user to choose to include a screenshot of the webpage with their feedback submission. The user option is not supported on mobile browsers and will have no effect there. |
| `onFormSubmitted`  | `() => void` | Callback whenever the feedback form is submitted, but before success/failure is returned.                                                                                                                             |

Some new configuration values have been added & changed so you can tweak instructions, or translate labels for your
users.

| Old Name         | New Name                | Default Value                  |
| ---------------- | ----------------------- | ------------------------------ |
| `buttonLabel`    | `triggerLabel`          | `"Report a bug"`               |
| `isRequiredText` | `isRequiredLabel`       | `"(required)"`                 |
| -                | `addScreenshotLabel`    | `"Add a screenshot"`           |
| -                | `removeScreenshotLabel` | `"Remove Screenshot"`          |
| -                | `confirmButtonLabel`    | `"Confirm"`                    |
| -                | `successMessageText`    | `"Thank you for your report!"` |

Some theme/color configuration values have been added & changed to make it easier to style the widget. Refer to the
[Feedback Configuration docs](https://docs.sentry.io/platforms/javascript/user-feedback/configuration/#user-feedback-widget)
to see the supported fields and their default values.
