import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyRuns, requiredJobs } from './release-gate.mjs';
const sha = 'a'.repeat(40);
const runs = [1, 2].map((id) => ({
  id,
  head_sha: sha,
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  run_attempt: 1,
}));
const jobs = Object.fromEntries(
  runs.map((run) => [run.id, requiredJobs.map((name) => ({ name, conclusion: 'success' }))])
);
test('发布要求同一提交两次完整且首次通过的矩阵', () => {
  assert.equal(verifyRuns(runs, jobs, sha).length, 2);
  for (const change of [
    { conclusion: 'failure' },
    { status: 'in_progress' },
    { run_attempt: 2 },
    { head_sha: 'b'.repeat(40) },
  ])
    assert.throws(() => verifyRuns([runs[0], { ...runs[1], ...change }], jobs, sha));
  assert.throws(() => verifyRuns(runs, { ...jobs, 2: jobs[2].slice(1) }, sha));
  assert.throws(() =>
    verifyRuns(runs, { ...jobs, 2: [...jobs[2], { name: 'extra', conclusion: 'skipped' }] }, sha)
  );
  assert.throws(() =>
    verifyRuns([...runs, { ...runs[1], id: 3, conclusion: 'failure' }], jobs, sha)
  );
});
