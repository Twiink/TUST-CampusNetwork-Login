import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const requiredJobs = [
  '质量门禁',
  '网络模拟回归',
  'Linux 原生路由内存检查',
  '全平台验收门禁',
  'Android 原生回归与 E2E 构建',
  ...['ubuntu-latest', 'windows-latest', 'macos-latest'].flatMap((os) => [
    `桌面端构建 (${os})`,
    `桌面 E2E (${os})`,
  ]),
  ...[28, 29, 36].map((api) => `Android E2E (API ${api})`),
];
export function verifyRuns(runs, jobs, sha) {
  const candidates = runs
    .filter((run) => run.head_sha === sha && ['push', 'workflow_dispatch'].includes(run.event))
    .sort((a, b) => b.id - a.id)
    .slice(0, 2);
  if (candidates.length !== 2) throw new Error('目标提交需要两次完整 CI');
  for (const run of candidates) {
    if (run.status !== 'completed' || run.conclusion !== 'success' || run.run_attempt !== 1)
      throw new Error(`CI ${run.id} 未首次完整通过`);
    const completed = jobs[run.id] ?? [];
    if (
      completed.some((job) => job.conclusion !== 'success') ||
      requiredJobs.some((name) => !completed.some((job) => job.name === name))
    )
      throw new Error(`CI ${run.id} 缺少完整矩阵或存在失败、跳过`);
  }
  return candidates.map((run) => ({ id: run.id, url: run.html_url, sha: run.head_sha }));
}
export { requiredJobs };
function api(path) {
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));
}
export function checkReleaseGate(repo, sha, version) {
  if (!/^[0-9a-f]{40}$/.test(sha) || !/^\d+\.\d+\.\d+$/.test(version))
    throw new Error('无效目标提交或版本');
  if (api(`repos/${repo}/branches/master`).commit.sha !== sha)
    throw new Error('仅发布 master 当前验收提交');
  const pkg = api(`repos/${repo}/contents/apps/desktop/package.json?ref=${sha}`);
  if (JSON.parse(Buffer.from(pkg.content, 'base64').toString()).version !== version)
    throw new Error('版本必须已在验收提交中');
  const runs = api(
    `repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`
  ).workflow_runs;
  const jobs = {};
  for (const run of runs
    .filter((run) => run.head_sha === sha)
    .sort((a, b) => b.id - a.id)
    .slice(0, 3))
    jobs[run.id] = api(`repos/${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`).jobs;
  if (
    !runs.some(
      (run) =>
        run.event === 'push' &&
        run.head_branch === 'master' &&
        run.status === 'completed' &&
        run.conclusion === 'success' &&
        run.run_attempt === 1
    )
  )
    throw new Error('master 最终提交 CI 尚未通过');
  const evidence = verifyRuns(runs, jobs, sha);
  let tagged;
  try {
    tagged = api(`repos/${repo}/git/ref/tags/v${version}`).object;
  } catch (error) {
    if (!String(error.stderr).includes('404')) throw error;
  }
  if (tagged) {
    const commit = api(`repos/${repo}/commits/v${version}`).sha;
    if (commit !== sha) throw new Error('发布标签与验收提交不一致');
  }
  return { version, sha, ci: evidence };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [repo, sha, version, output] = process.argv.slice(2);
  const evidence = checkReleaseGate(repo, sha, version);
  if (output) writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`发布门禁通过: ${sha}, CI ${evidence.ci.map((run) => run.id).join(', ')}`);
}
