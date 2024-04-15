// This file is used as entry point to generate the integration CDN bundle for the core feedback integration
// For now this includes the modal as well, but not feedback
export { sendFeedback } from './core/sendFeedback';
export { feedbackIntegration } from './core/integration';
export { feedbackModalIntegration } from './modal/integration';
export { getFeedback } from './core/getFeedback';
