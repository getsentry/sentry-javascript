import FeedbackButton from './examples/feedbackButton';
import ToggleFeedbackButton from './examples/toggleFeedbackButton';
import AttachToFeedbackButton from './examples/attachToFeedbackButton';
import CreateFeedbackFormButton from './examples/createFeedbackFormButton';
import MyFeedbackForm from './examples/myFeedbackForm';
import CrashReportButton from './examples/crashReportButton';
import ThumbsUpDownButtons from './examples/thumbsUpDownButtons';
import TranslatedFeedbackForm from './examples/translatedFeedbackForm';

export default function Home() {
  return (
    <div className="m-auto max-w-screen-lg">
      <h1 className="text-2xl mt-4" data-testid="page-title">
        Feedback Test Area
      </h1>
      <p>This is a test Next.JS website that implements the Sentry Feedback SDK.</p>
      <ul className="raw flex flex-col gap-2">
        <li>
          <fieldset className="border-1 border-gray-300 rounded-md p-2" data-testid="feedback-button-section">
            <legend>Feedback Button</legend>
            <FeedbackButton />
          </fieldset>
        </li>
        <li>
          <fieldset className="border-1 border-gray-300 rounded-md p-2" data-testid="toggle-feedback-section">
            <legend>Toggle Feedback Button</legend>
            <ToggleFeedbackButton />
          </fieldset>
        </li>
        <li>
          <fieldset className="border-1 border-gray-300 rounded-md p-2" data-testid="attach-to-feedback-section">
            <legend>Attach To Feedback Button</legend>
            <AttachToFeedbackButton />
          </fieldset>
        </li>
        <li>
          <fieldset className="border-1 border-gray-300 rounded-md p-2" data-testid="create-feedback-form-section">
            <legend>Create Feedback Form Button</legend>
            <CreateFeedbackFormButton />
          </fieldset>
        </li>
        <li>
          <fieldset className="border-1 border-gray-300 rounded-md p-2" data-testid="my-feedback-form-section">
            <legend>My Feedback Form</legend>
            <MyFeedbackForm />
          </fieldset>
        </li>
        <li>
          <fieldset className="border-1 border-gray-300 rounded-md p-2" data-testid="crash-report-section">
            <legend>Crash Report Button</legend>
            <CrashReportButton />
          </fieldset>
        </li>
        <li>
          <fieldset className="border-1 border-gray-300 rounded-md p-2" data-testid="thumbs-up-down-section">
            <legend>Thumbs Up/Down Buttons</legend>
            <ThumbsUpDownButtons />
          </fieldset>
        </li>
        <li>
          <fieldset className="border-1 border-gray-300 rounded-md p-2" data-testid="translated-feedback-section">
            <legend>Translated Feedback Form</legend>
            <TranslatedFeedbackForm />
          </fieldset>
        </li>
      </ul>
    </div>
  );
}
