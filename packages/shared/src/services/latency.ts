/**
 * 网络延迟测量(自 NetworkDetector 抽出):多目标并行 + HEAD 探测 + 延迟分级。
 */

import type { LatencyResult, LatencyStatus } from '../types/network';
import type { Logger } from '../models/Logger';
import type { LatencyTarget, ResolvedNetworkDetectorOptions } from './detector-options';

/**
 * 测量网络延迟（Ping），多目标并行，全部超时返回最后的超时结果。
 */
export async function measureLatency(
  logger: Logger | null,
  options: ResolvedNetworkDetectorOptions
): Promise<LatencyResult> {
  logger?.debug('开始并行测量网络延迟');

  const results = await Promise.all(
    options.pingTargets.map((target) => testSingleTarget(options, target))
  );
  const success = results.filter((result) => result.status !== 'timeout');
  const best = success.sort((left, right) => left.value - right.value)[0];

  if (best) {
    logger?.debug('网络状态检测完成', {
      延迟: `${best.value}ms`,
      延迟目标: best.source,
      延迟目标数: results.length,
    });
    return best;
  }

  logger?.debug('网络状态检测完成：所有延迟目标超时', {
    延迟目标数: results.length,
  });

  return (
    results[results.length - 1] || {
      value: 9999,
      status: 'timeout',
      target: options.pingTargets[0]?.url || 'unknown',
      source: options.pingTargets[0]?.source || '未配置目标',
      timestamp: Date.now(),
    }
  );
}

/**
 * 测试单个目标的延迟（HEAD 请求，超时按 timeout 结果返回）
 */
async function testSingleTarget(
  options: ResolvedNetworkDetectorOptions,
  target: LatencyTarget
): Promise<LatencyResult> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.latencyTimeoutMs);

    await fetch(target.url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latency = Date.now() - startTime;

    return {
      value: latency,
      status: getLatencyStatus(latency),
      target: target.url,
      source: target.source,
      timestamp: Date.now(),
    };
  } catch {
    return {
      value: 9999,
      status: 'timeout',
      target: target.url,
      source: target.source,
      timestamp: Date.now(),
    };
  }
}

/**
 * 根据延迟值判断延迟等级
 */
export function getLatencyStatus(latency: number): LatencyStatus {
  if (latency < 50) return 'excellent';
  if (latency < 100) return 'good';
  if (latency < 200) return 'fair';
  if (latency < 500) return 'poor';
  return 'very-poor';
}
