import FeedbackButton from './examples/feedbackButton';
import ToggleFeedbackButton from './examples/toggleFeedbackButton';
import AttachToFeedbackButton from './examples/attachToFeedbackButton';
import CreateFeedbackFormButton from './examples/createFeedbackFormButton';
import MyFeedbackForm from './examples/myFeedbackForm';
import CrashReportButton from './examples/crashReportButton';
import ThumbsUpDownButtons from './examples/thumbsUpDownButtons';
import TranslatedFeedbackForm from './examples/translatedFeedbackForm';
import ThemeSwitcher from './examples/themeSwitcher';

export default function FeedbackPage() {
  return (
    <div>
      <h1 data-testid="page-title">Feedback Test Area</h1>
      <p>This is a test Next.JS website that implements the Sentry Feedback SDK.</p>
      <ul>
        <li>
          <fieldset data-testid="feedback-button-section">
            <legend>Feedback Button</legend>
            <FeedbackButton />
          </fieldset>
        </li>
        <li>
          <fieldset data-testid="toggle-feedback-section">
            <legend>Toggle Feedback Button</legend>
            <ToggleFeedbackButton />
          </fieldset>
        </li>
        <li>
          <fieldset data-testid="attach-to-feedback-section">
            <legend>Attach To Feedback Button</legend>
            <AttachToFeedbackButton />
          </fieldset>
        </li>
        <li>
          <fieldset data-testid="create-feedback-form-section">
            <legend>Create Feedback Form Button</legend>
            <CreateFeedbackFormButton />
          </fieldset>
        </li>
        <li>
          <fieldset data-testid="my-feedback-form-section">
            <legend>My Feedback Form</legend>
            <MyFeedbackForm />
          </fieldset>
        </li>
        <li>
          <fieldset data-testid="crash-report-section">
            <legend>Crash Report Button</legend>
            <CrashReportButton />
          </fieldset>
        </li>
        <li>
          <fieldset data-testid="thumbs-up-down-section">
            <legend>Thumbs Up/Down Buttons</legend>
            <ThumbsUpDownButtons />
          </fieldset>
        </li>
        <li>
          <fieldset data-testid="translated-feedback-section">
            <legend>Translated Feedback Form</legend>
            <TranslatedFeedbackForm />
          </fieldset>
        </li>
        <li>
          <fieldset data-testid="theme-switcher-section">
            <legend>Theme Switcher</legend>
            <ThemeSwitcher />
          </fieldset>
        </li>
      </ul>
    </div>
  );
}
