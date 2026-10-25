#!/usr/bin/env node
/**
 * 性能基准脚本:量化 shared 核心热路径开销,用于优化前后对比。
 * 用法: node shell/perf-bench.mjs [--out json路径]
 * 依赖 packages/shared 的构建产物 (dist/),运行前先 pnpm build:shared。
 */

import { performance } from 'node:perf_hooks';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shared = await import(path.join(root, 'packages/shared/dist/index.mjs'));

const results = { timestamp: new Date().toISOString(), node: process.version, metrics: {} };

function record(name, value, unit) {
  results.metrics[name] = { value, unit };
  console.log(`  ${name}: ${value}${unit}`);
}

// ---------------------------------------------------------------------------
// 1. Logger 吞吐:向 500 容量 Logger 连续写入 20000 条,统计总耗时与单条开销
// ---------------------------------------------------------------------------
{
  const logger = new shared.Logger(500, 7);
  logger.stopAutoCleanup();
  const N = 20000;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) logger.info(`基准日志 #${i}`, { index: i, payload: 'x'.repeat(64) });
  const elapsed = performance.now() - t0;
  logger.stopAutoCleanup();
  record('logger.addLog 20k 条总耗时', Math.round(elapsed), 'ms');
  record('logger.addLog 单条均摊', (elapsed / N).toFixed(3), 'ms');
}

// 带监听器 + 持久化适配器的开销(模拟桌面运行态:每条日志触发监听器 + 全量持久化)
{
  const logger = new shared.Logger(500, 7);
  logger.stopAutoCleanup();
  let persisted = 0;
  logger.addListener(() => {});
  logger.setPersistAdapter({
    save: async (logs) => {
      persisted += logs.length;
    },
    load: async () => [],
    clear: async () => {},
  });
  const N = 5000;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) logger.info(`带持久化日志 #${i}`);
  const elapsed = performance.now() - t0; // 只计写入路径，防抖等待不计入吞吐
  await new Promise((r) => setTimeout(r, 550)); // 等待 500ms 防抖批量落盘完成
  logger.stopAutoCleanup();
  record('logger.addLog(监听器+批量持久化调度) 5k 条总耗时', Math.round(elapsed), 'ms');
  record('logger 批量持久化累计写入条目(对比旧 O(n) 放大)', persisted, '条');
}

// ---------------------------------------------------------------------------
// 2. Logger 查询:getLogs(keyword) 在 500 条满容量上的耗时
// ---------------------------------------------------------------------------
{
  const logger = new shared.Logger(500, 7);
  logger.stopAutoCleanup();
  for (let i = 0; i < 500; i++) logger.info(`查询基准 #${i}`, { data: { nested: { deep: i } } });
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) logger.getLogs({ keyword: '查询基准 #42' });
  record('logger.getLogs(keyword) 200 次总耗时', Math.round(performance.now() - t0), 'ms');
  logger.stopAutoCleanup();
}

// ---------------------------------------------------------------------------
// 3. NetworkDetector tick 耗时:mock fetch 固定延迟,模拟在线/离线两种场景
// ---------------------------------------------------------------------------
const realFetch = globalThis.fetch;
async function benchDetector(label, { fetchDelayMs, succeed, adapterDelayMs }) {
  globalThis.fetch = async () => {
    await new Promise((r) => setTimeout(r, fetchDelayMs));
    if (succeed) return new Response(null, { status: 204 });
    return new Response(null, { status: 200 });
  };
  const adapter = {
    async getWifiDetails() {
      await new Promise((r) => setTimeout(r, adapterDelayMs));
      return {
        connected: true,
        ssid: 'BENCH',
        signalStrength: 80,
        linkSpeed: 866,
        frequency: 5000,
        ipv4: '1.2.3.4',
      };
    },
  };
  const logger = new shared.Logger(500, 7);
  logger.stopAutoCleanup();
  const detector = new shared.NetworkDetector(adapter, logger);
  const t0 = performance.now();
  await detector.getNetworkStatus();
  const elapsed = Math.round(performance.now() - t0);
  logger.stopAutoCleanup();
  record(`detector.getNetworkStatus ${label}`, elapsed, 'ms');
}
await benchDetector('在线(首个URL返回204,延迟120ms/请求)', {
  fetchDelayMs: 120,
  succeed: true,
  adapterDelayMs: 50,
});
await benchDetector('离线(所有探测全部失败)', {
  fetchDelayMs: 120,
  succeed: false,
  adapterDelayMs: 50,
});
globalThis.fetch = realFetch;

// ---------------------------------------------------------------------------
// 4. WifiManager 读路径:排序缓存对比(当前每次读取 copy+sort)
// ---------------------------------------------------------------------------
{
  const storage = new shared.MemoryStorageAdapter();
  await storage.set('app_config', { settings: {} });
  const configManager = new shared.ConfigManager(storage);
  await configManager.load();
  const wifiManager = new shared.WifiManager(configManager);
  await configManager.update({
    wifiList: Array.from({ length: 50 }, (_, i) => ({
      id: `wifi-${i}`,
      ssid: `SSID-${i}`,
      priority: 99 - i,
      autoConnect: true,
      requiresAuth: false,
    })),
  });
  const t0 = performance.now();
  const N = 100000;
  for (let i = 0; i < N; i++) wifiManager.getWifiBySsid(`SSID-${i % 50}`);
  const elapsed = performance.now() - t0;
  record('wifiManager.getWifiBySsid 100k 次总耗时', Math.round(elapsed), 'ms');
}

// ---------------------------------------------------------------------------
// 5. 产物体积
// ---------------------------------------------------------------------------
for (const [name, p] of [
  ['shared dist/index.mjs', 'packages/shared/dist/index.mjs'],
  ['desktop dist-electron/main.js', 'apps/desktop/dist-electron/main.js'],
  ['desktop renderer bundle', 'apps/desktop/dist/assets'],
]) {
  try {
    const st = statSync(path.join(root, p));
    record(`产物 ${name}`, Math.round(st.size / 1024), 'KB');
  } catch {
    // dist/assets 是目录,单独统计
    try {
      const { readdirSync } = await import('node:fs');
      const dir = path.join(root, p);
      const total = readdirSync(dir)
        .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
        .reduce((acc, f) => acc + statSync(path.join(dir, f)).size, 0);
      record(`产物 ${name}`, Math.round(total / 1024), 'KB');
    } catch {
      console.log(`  产物 ${name}: 跳过(不存在)`);
    }
  }
}

// ---------------------------------------------------------------------------
// 输出 JSON 供前后对比
// ---------------------------------------------------------------------------
const outFlag = process.argv.indexOf('--out');
if (outFlag > 0 && process.argv[outFlag + 1]) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.argv[outFlag + 1], JSON.stringify(results, null, 2));
  console.log(`\n结果已写入 ${process.argv[outFlag + 1]}`);
}
