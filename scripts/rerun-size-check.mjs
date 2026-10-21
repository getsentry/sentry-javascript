export default async function rerunSizeCheck({ github, context, core }) {
  const pr = context.payload.pull_request;

  const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
    ...context.repo,
    workflow_id: 'build.yml',
    event: 'pull_request',
    head_sha: pr.head.sha,
    per_page: 100,
  });

  const run = runs
    .filter(run => run.head_repository?.full_name === pr.head.repo.full_name && run.head_branch === pr.head.ref)
    .sort((a, b) => b.id - a.id)[0];

  if (!run) {
    core.info('No CI run found for the current PR commit.');
    return;
  }

  while (true) {
    const { data } = await github.rest.actions.getWorkflowRun({
      ...context.repo,
      run_id: run.id,
    });

    if (data.status === 'completed') break;

    await new Promise(resolve => setTimeout(resolve, 30_000));
  }

  const { data: currentPr } = await github.rest.pulls.get({
    ...context.repo,
    pull_number: pr.number,
  });

  if (currentPr.state !== 'open' || currentPr.head.sha !== pr.head.sha) {
    core.info('The PR has closed or its head changed while waiting.');
    return;
  }

  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
    ...context.repo,
    run_id: run.id,
    filter: 'latest',
    per_page: 100,
  });

  const job = jobs.find(job => job.name === 'Size Check');

  if (!job || job.conclusion === 'skipped') {
    core.info('No executed Size Check job to re-run.');
    return;
  }

  await github.rest.actions.reRunJobForWorkflowRun({
    ...context.repo,
    job_id: job.id,
  });
}
