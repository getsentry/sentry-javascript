import { describe, expect, it } from 'vitest';

import { attribution, junior, setup } from './github-test-utils.mjs';
import {
  clearTeamReviewLabel,
  enforceTeamReviewGate,
  labelJuniorPrForTeamReview,
  TEAM_REVIEW_LABEL,
} from './team-review-gate.mjs';

const labeled = { labels: [{ name: TEAM_REVIEW_LABEL }] };

describe('labelJuniorPrForTeamReview', () => {
  it('labels a Junior PR requested by someone outside the SDK team', async () => {
    const { github, run } = setup(labelJuniorPrForTeamReview, { user: junior, body: attribution('@outsider') });
    await run();
    expect(github.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({ labels: [TEAM_REVIEW_LABEL] }));
  });

  it('labels a Junior PR requested by a contractor', async () => {
    const { github, run } = setup(labelJuniorPrForTeamReview, { user: junior, body: attribution('@timfish') });
    await run();
    expect(github.rest.issues.addLabels).toHaveBeenCalled();
  });

  it('labels a Junior PR when any requester is outside the SDK team', async () => {
    const { github, run } = setup(labelJuniorPrForTeamReview, { user: junior, body: attribution('@a, @outsider') });
    await run();
    expect(github.rest.issues.addLabels).toHaveBeenCalled();
  });

  it('labels a Junior PR without a known requester', async () => {
    const { github, run } = setup(labelJuniorPrForTeamReview, {
      user: junior,
      body: attribution('**Someone Unknown**'),
    });
    await run();
    expect(github.rest.issues.addLabels).toHaveBeenCalled();
  });

  it('does not label a Junior PR requested by SDK team members', async () => {
    const { github, run } = setup(labelJuniorPrForTeamReview, {
      user: junior,
      body: attribution('@A, **Bob Example**'),
    });
    await run();
    expect(github.rest.issues.addLabels).not.toHaveBeenCalled();
  });

  it('does not label PRs opened by people', async () => {
    const { github, run } = setup(labelJuniorPrForTeamReview, {
      user: { login: 'outsider', type: 'User' },
      body: attribution('@outsider'),
    });
    await run();
    expect(github.rest.issues.addLabels).not.toHaveBeenCalled();
  });
});

describe('clearTeamReviewLabel', () => {
  const approvedBy = login => ({ review: { state: 'approved', user: { login } } });

  it('removes the label when an SDK team member approves', async () => {
    const { github, run } = setup(
      clearTeamReviewLabel,
      { ...labeled, user: junior, body: attribution('@outsider') },
      approvedBy('b'),
    );
    await run();
    expect(github.rest.issues.removeLabel).toHaveBeenCalledWith(expect.objectContaining({ name: TEAM_REVIEW_LABEL }));
  });

  it('removes the label when a contractor approves', async () => {
    const { github, run } = setup(
      clearTeamReviewLabel,
      { ...labeled, user: junior, body: attribution('@outsider') },
      approvedBy('TimFish'),
    );
    await run();
    expect(github.rest.issues.removeLabel).toHaveBeenCalled();
  });

  it('keeps the label when someone outside the team approves', async () => {
    const { github, run } = setup(
      clearTeamReviewLabel,
      { ...labeled, user: junior, body: attribution('@outsider') },
      approvedBy('other'),
    );
    await run();
    expect(github.rest.issues.removeLabel).not.toHaveBeenCalled();
  });

  it('keeps the label when a requester approves their own Junior PR', async () => {
    const { github, run } = setup(
      clearTeamReviewLabel,
      { ...labeled, user: junior, body: attribution('@timfish') },
      approvedBy('timfish'),
    );
    await run();
    expect(github.rest.issues.removeLabel).not.toHaveBeenCalled();
  });

  it('ignores reviews that are not approvals', async () => {
    const { github, run } = setup(
      clearTeamReviewLabel,
      { ...labeled, user: junior, body: attribution('@outsider') },
      { review: { state: 'commented', user: { login: 'b' } } },
    );
    await run();
    expect(github.rest.issues.removeLabel).not.toHaveBeenCalled();
  });

  it('does nothing when the PR has no label', async () => {
    const { github, run } = setup(
      clearTeamReviewLabel,
      { user: junior, body: attribution('@outsider') },
      approvedBy('b'),
    );
    await run();
    expect(github.rest.issues.removeLabel).not.toHaveBeenCalled();
  });
});

describe('enforceTeamReviewGate', () => {
  it('fails while the PR has the label', async () => {
    const { core, run } = setup(enforceTeamReviewGate, labeled, { action: 'synchronize', sender: { type: 'User' } });
    await run();
    expect(core.setFailed).toHaveBeenCalled();
  });

  it('passes without the label', async () => {
    const { core, run } = setup(enforceTeamReviewGate, {}, { action: 'synchronize', sender: { type: 'User' } });
    await run();
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('passes once a bot removed the label', async () => {
    const { github, core, run } = setup(
      enforceTeamReviewGate,
      {},
      { action: 'unlabeled', label: { name: TEAM_REVIEW_LABEL }, sender: { login: 'app[bot]', type: 'Bot' } },
    );
    await run();
    expect(github.rest.issues.addLabels).not.toHaveBeenCalled();
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('adds the label back and fails when a person removed it', async () => {
    const { github, core, run } = setup(
      enforceTeamReviewGate,
      {},
      { action: 'unlabeled', label: { name: TEAM_REVIEW_LABEL }, sender: { login: 'b', type: 'User' } },
    );
    await run();
    expect(github.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({ labels: [TEAM_REVIEW_LABEL] }));
    expect(core.setFailed).toHaveBeenCalled();
  });
});
