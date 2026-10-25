#!/usr/bin/env node
/**
 * 桌面端内存、CPU 与进程树基准。默认使用生产配置的 120s 窗口销毁延迟，
 * 短时验证可用 --hidden-delay 覆盖；隐藏态通过 CDP 调用 window.close() 触发。
 */

import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? Number(args[index + 1]) : fallback;
};

const foregroundSeconds = flag('--foreground-seconds', 5);
const hiddenSeconds = flag('--hidden-seconds', 5);
const hiddenDelayMs = flag('--hidden-delay', 120000);
const outPath = flag('--out', '');
const debugPort = 9223;

async function resolveElectronBinary() {
  const pnpmDir = path.join(root, 'node_modules/.pnpm');
  const entries = await readdir(pnpmDir, { withFileTypes: true });
  const electronDir = entries.find(
    (entry) => entry.isDirectory() && entry.name.startsWith('electron@')
  );
  if (!electronDir) {
    throw new Error('Electron binary not found; run pnpm install first');
  }
  return path.join(pnpmDir, electronDir.name, 'node_modules/electron/dist/electron');
}

async function readProcessStatus(pid) {
  const content = await readFile(`/proc/${pid}/status`, 'utf-8');
  const getValue = (key) => {
    const match = content.match(new RegExp(`^${key}:\\s+(\\d+) kB$`, 'm'));
    return match ? Number(match[1]) * 1024 : 0;
  };
  const stat = await readFile(`/proc/${pid}/stat`, 'utf-8');
  const fields = stat.trim().split(' ');
  // Linux USER_HZ 在主流发行版固定为 100。
  return {
    rss: getValue('VmRSS'),
    cpuSeconds: (Number(fields[13]) + Number(fields[14])) / 100,
  };
}

async function readProcessTree(rootPid) {
  const entries = await readdir('/proc');
  const children = new Map();
  await Promise.all(
    entries
      .filter((entry) => /^\d+$/.test(entry))
      .map(Number)
      .map(async (pid) => {
        try {
          const stat = await readFile(`/proc/${pid}/stat`, 'utf-8');
          const fields = stat.trim().split(' ');
          const ppid = Number(fields[3]);
          if (!children.has(ppid)) children.set(ppid, []);
          children.get(ppid).push(pid);
        } catch {
          // 进程可能在 readdir 和读取之间退出
        }
      })
  );

  const pids = [];
  const queue = [rootPid];
  while (queue.length) {
    const pid = queue.shift();
    pids.push(pid);
    queue.push(...(children.get(pid) ?? []));
  }
  const statuses = await Promise.all(
    pids.map((pid) => readProcessStatus(pid).catch(() => ({ rss: 0, cpuSeconds: 0 })))
  );
  return {
    processCount: pids.length,
    totalRss: statuses.reduce((sum, status) => sum + status.rss, 0),
    totalCpuSeconds: statuses.reduce((sum, status) => sum + status.cpuSeconds, 0),
  };
}

const binary = await resolveElectronBinary();
const app = spawn(
  binary,
  [path.join(root, 'apps/desktop'), `--remote-debugging-port=${debugPort}`],
  {
    env: {
      ...process.env,
      NETMATE_PERF_TEST: '1',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);

let output = '';
app.stderr.on('data', (chunk) => {
  output += chunk;
});
app.stdout.on('data', (chunk) => {
  output += chunk;
});

async function waitForDebugEndpoint() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Electron 启动和 CDP endpoint 就绪存在竞态，短暂重试。
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Electron debug endpoint not ready. Output:\n${output}`);
}

const wait = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));
const waitMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const result = {
  timestamp: new Date().toISOString(),
  foreground: null,
  hidden: null,
  hiddenWindowDestroyed: false,
};

try {
  await wait(foregroundSeconds);
  result.foreground = await readProcessTree(app.pid);
  // 启动时附带 remote-debugging-port，再通过 CDP 调用窗口对象的 hide 方法。
  const pages = await waitForDebugEndpoint();
  const page = pages[0];
  if (!page) {
    throw new Error('No Electron page found for hide benchmark');
  }
  const websocket = new globalThis.WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    websocket.addEventListener('open', resolve, { once: true });
    websocket.addEventListener('error', reject, { once: true });
  });
  await new Promise((resolve, reject) => {
    websocket.addEventListener(
      'message',
      (event) => {
        const payload = JSON.parse(String(event.data));
        if (payload.id === 1) {
          if (payload.error) reject(new Error(payload.error.message));
          else resolve();
          websocket.close();
        }
      },
      { once: true }
    );
    websocket.send(
      JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression: 'window.close()', returnByValue: true },
      })
    );
  });
  await waitMs(hiddenDelayMs);
  await wait(hiddenSeconds);
  result.hidden = await readProcessTree(app.pid);
  result.hiddenWindowDestroyed = result.hidden.processCount < result.foreground.processCount;
} finally {
  app.kill('SIGTERM');
  await new Promise((resolve) => app.once('exit', resolve));
}

console.log(JSON.stringify(result, null, 2));
if (outPath) {
  await mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`);
}
