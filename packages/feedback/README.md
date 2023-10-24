<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Sentry Integration for Feedback

This SDK is **considered experimental and in an alpha state**. It may experience breaking changes, and may be discontinued at any time. Please reach out on
[GitHub](https://github.com/getsentry/sentry-javascript/issues/new/choose) if you have any feedback/concerns.

## Pre-requisites

`@sentry-internal/feedback` currently can only be used by browsers with [Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM) support.

## Installation

During the alpha phase, the feedback integration will need to be imported from `@sentry-internal/feedback`. This will be
changed for the general release.

```shell
npm add @sentry-internal/feedback
```

## Setup

To set up the integration, add the following to your Sentry initialization. This will inject a feedback button to the bottom right corner of your application. Users can then click it to open up a feedback form where they can submit feedback.

Several options are supported and passable via the integration constructor. See the [configuration section](#configuration) below for more details.

```javascript
import * as Sentry from '@sentry/browser';
// or from a framework specific SDK, e.g.
// import * as Sentry from '@sentry/react';
import Feedback from '@sentry-internal/feedback';

Sentry.init({
  dsn: '__DSN__',
  integrations: [
    new Feedback({
      // Additional SDK configuration goes in here, for example:
      // See below for all available options
    })
  ],
  // ...
});
```

## Configuration

### General Integration Configuration

The following options can be configured as options to the integration, in `new Feedback({})`:

| key       | type    | default | description |
| --------- | ------- | ------- | ----------- |
| `autoInject`       | `boolean` | `true`  | Injects the Feedback widget into the application when the integration is added. This is useful to turn off if you bring your own button, or only want to show the widget on certain views. |
| `colorScheme` | `"system" \| "light" \| "dark"` | `"system"` | The color theme to use. `"system"` will follow your OS colorscheme. |

### User/form Related Configuration
| key       | type    | default | description |
| --------- | ------- | ------- | ----------- |
| `showName`       | `boolean` | `true`  | Displays the name field on the feedback form, however will still capture the name (if available) from Sentry SDK context. |
| `showEmail`       | `boolean` | `true`  | Displays the email field on the feedback form, however will still capture the email (if available) from Sentry SDK context. |
| `isAnonymous`       | `boolean` | `false` | Hides both name and email fields and does not use Sentry SDK's user context. |
| `useSentryUser` | `Record<string, string>` | `{ email: 'email', name: 'username'}` | Map of the `email` and `name` fields to the corresponding Sentry SDK user fields that were called with `Sentry.setUser`. |

By default the Feedback integration will attempt to fill in the name/email fields if you have set a user context via [`Sentry.setUser`](https://docs.sentry.io/platforms/javascript/enriching-events/identify-user/). By default it expects the email and name fields to be `email` and `username`. Below is an example configuration with non-default user fields.

```javascript
Sentry.setUser({
    email: 'foo@example.com',
    fullName: 'Jane Doe',
});


new Feedback({
    useSentryUser({
        email: 'email',
        name: 'fullName',
    }),
})
```

### Text Customization
Most text that you see in the default Feedback widget can be customized.

| key       | default | description |
| --------- | ------- | ----------- |
| `buttonLabel` | `"Feedback"` | The label of the widget button. |
| `submitButtonLabel` | `"Send Feedback"` | The label of the submit button used in the feedback form dialog. |
| `cancelButtonLabel` | `"Cancel"` | The label of the cancel button used in the feedback form dialog. |
| `formTitle` | `"Send Feedback"` | The title at the top of the feedback form dialog. |
| `nameLabel` | `"Full Name"` | The label of the name input field. |
| `namePlaceholder` | `"Full Name"` | The placeholder for the name input field. |
| `emailLabel` | `"Email"` | The label of the email input field. ||
| `emailPlaceholder` | `"Email"` | The placeholder for the email input field. |
| `messageLabel` | `"Description"` | The label for the feedback description input field. |
| `messagePlaceholder` | `"What's the issue? What did you expect?"` | The placeholder for the feedback description input field. |
| `successMessageText` | `"Thank you for your report!"` | The message to be displayed after a succesful feedback submission. |

```javascript
new Feedback({
  buttonLabel: 'Bug Report',
  submitButtonLabel: 'Send Report',
  formTitle: 'Send Bug Report',
});
```

### Theme Customization
Colors can be customized via the Feedback constructor or by defining CSS variables on the widget button. If you use the default widget button, it will have an `id="sentry-feedback`, meaning you can use the `#sentry-feedback` selector to define CSS variables to override.

| key | css variable | light | dark | description |
| --- | --- | --- | --- | --- |
| `background` | `--bg-color` | `#ffffff` | `#29232f` | Background color of the widget actor and dialog. |
| `backgroundHover` | `--bg-hover-color` | `#f6f6f7` | `#352f3b` | The background color of widget actor when in a hover state |
| `foreground` | `--fg-color` | `#2b2233` | `#ebe6ef` | The foreground color, e.g. text color |
| `error` | `--error-color` | `#df3338` | `#f55459` | Color used for error related components (e.g. text color when there was an error submitting feedback) |
| `success` | `--success-color` | `#268d75` | `#2da98c` | Color used for success-related components (e.g. text color when feedback is submitted successfully) |
| `border` | `--border` | `1.5px solid rgba(41, 35, 47, 0.13)` | `1.5px solid rgba(235, 230, 239, 0.15)` | The border style used for the widget actor and dialog |
| `boxShadow` | `--box-shadow | 0px 4px 24px 0px rgba(43, 34, 51, 0.12)` | `0px 4px 24px 0px rgba(43, 34, 51, 0.12)` | The box shadow style used for the widget actor and dialog |

Here is an example of customizing only the background color for the light theme using the Feedback constructor configuration.
```javascript
new Feedback({
    themeLight: {
        background: "#cccccc",
    },
})
```

Or the same example above but using the CSS variables method:

```css
#sentry-feedback {
  --bg-color: #cccccc;
}
```

### Additional UI Customization
Similar to theme customization above, these are additional CSS variables that can be overridden. Note these are not supported in the constructor.

| Variable | Default | Description |
| --- | --- | --- |
| `--bottom` | `1rem` | By default the widget has a position of fixed, and is in the bottom right corner. |
| `--right` | `1rem` | By default the widget has a position of fixed, and is in the bottom right corner. |
| `--top` | `auto` | By default the widget has a position of fixed, and is in the bottom right corner. |
| `--left` | `auto` | By default the widget has a position of fixed, and is in the bottom right corner. |
| `--z-index` | `100000` | The z-index of the widget |
| `--font-family` | `"'Helvetica Neue', Arial, sans-serif"` | Default font-family to use|
| `--font-size` | `14px` | Font size |

### Event Callbacks
Sometimes it’s important to know when someone has started to interact with the feedback form, so you can add custom logging, or start/stop background timers on the page until the user is done.

Pass these callbacks when you initialize the Feedback integration:

```javascript
new Sentry.Feedback({
  onActorClick: () => {},
  onDialogOpen: () => {},
  onDialogClose: () => {},
  onSubmitSuccess: () => {},
  onSubmitError: () => {},
});
```

## Further Customization
There are two more methods in the integration that can help customization.

### Bring Your Own Button

You can skip the default widget button and use your own button. Call `feedback.attachTo()` to have the SDK attach a click listener to your own button. You can additionally supply the same customization options that the constructor accepts (e.g. for text labels and colors).

```javascript
Sentry.Feedback.attachTo(document.querySelector('#your-button'), {
    formTitle: "Report a Bug!"
});
```

### Bring Your Own Widget

You can also bring your own widget and UI and simply pass a feedback object to the `sendFeedback()` function.

```html
<form id="my-feedback-form>
	<input name="name" />
  <input name="email" />
	<textarea name="message" placeholder="What's the issue?" />
</form>

<script>
document.getElementById('my-feedback-form').addEventListener('submit', (event) => {
  const formData = new FormData(event.currentTarget);
  Sentry.Feedback.sendFeedback(formData);
  event.preventDefault();
});
</script>
```
