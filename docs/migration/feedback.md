# End of Feedback Beta

Sentry Feedback is now out of Beta. This means that the usual stabilty guarantees apply.

Because of experimentation and rapid iteration, during the Beta period some bugs and problems came up which have since
been fixed/improved, as well as API's which have been streamlined and chanaged.

Below you can find a list of relevant feedback changes and issues that have been made from v7.x to v8.0.0-beta.2

## Upgrading Feedback from 7.x to 8.0.0-beta.2

We have streamlined the interface for interacting with the Feedback widget. Below is a list of public functions that
existed in v7.x and a description of how they have changed in v8.

| Method Name               | Replacement                                                    | Notes                                                                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feedback.getWidget()`    | `const widget = feedback.createWidget(); widget.appendToDom()` | The SDK no longer maintains a stack of form instances. If you call `createWidget()` a new form will be inserted into the DOM and a Promise<FeedbackDialog> returned allowed you control over the lifecycle of the widget. |
| `feedback.attachTo()`     | `const unsubscribe = feedback.attachTo(myButtonElem)`          | The `attachTo()` method in will create an onClick event listener to your html element that calls appendToDom() and open(). It returns a callback to remove the event listener.                                            |
| `feedback.openDialog()`   | `widget.open()`                                                | Make the form inside the widget visible.                                                                                                                                                                                  |
| `feedback.closeDialog()`  | `widget.close()`                                               | Make the form inside the widget hidden in the page. Success/Error messages will still be rendered and will hide themselves if the form was recently submitted.                                                            |
| `feedback.removeWidget()` | `widget.removeFromDom()`                                       | Remove the form and widget instance from the page. After calling this `widget.el.parentNode` will be set to null.                                                                                                         |

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

`autoInject: true,` is the default value.

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
const feedbackInstance = getClient()?.getIntegrationByName('Feedback');
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

You can manually add/remove the form from the page, and control when it's shown/hidden by calling the lifecycle methods
directly.

For example, `attachTo()` is a convenience wrapper over the lifecycle methods. You could re-implement it like this:

```javascript
function attachTo(button: HTMLElement) {
  const handleClick = async () => {
    const widget = await feedbackInstance.getWidget({
      onFormClose: () => {
        widget.close();
      },
      onFormSubmited: () => {
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

## Config changes in v8

Added new configuration values

| Field Name      | Type       | Description                                                                                                                                                                                                            |
| --------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| showScreenshot  | boolean    | Default: false. Enable this option to allow a user to choose to include a screenshot of the webpage with their feedback submission. The user option is not supported on mobile browsers and will have no effect there. |
| onFormSubmitted | () => void | Callback whenever the feedback form is submitted, but before success/failure is returned.                                                                                                                              |
