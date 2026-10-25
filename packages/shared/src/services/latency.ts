/**
 * 网络延迟测量(自 NetworkDetector 抽出):多目标按序回退 + 单目标 HEAD 探测 + 延迟分级。
 */

import type { LatencyResult, LatencyStatus } from '../types/network';
import type { Logger } from '../models/Logger';
import type { LatencyTarget, ResolvedNetworkDetectorOptions } from './detector-options';

/**
 * 测量网络延迟（Ping），目标按序回退，全部超时返回最后的超时结果。
 */
export async function measureLatency(
  logger: Logger | null,
  options: ResolvedNetworkDetectorOptions
): Promise<LatencyResult> {
  logger?.debug('开始测量网络延迟');

  let lastTimeoutResult: LatencyResult | null = null;

  for (const [index, target] of options.pingTargets.entries()) {
    const result = await testSingleTarget(logger, options, target);

    if (result.status !== 'timeout') {
      logger?.success(index === 0 ? '延迟测试成功' : '延迟测试成功（备用）', {
        目标: result.source,
        延迟: `${result.value}ms`,
        状态: result.status,
      });
      return result;
    }

    lastTimeoutResult = result;

    if (index < options.pingTargets.length - 1) {
      logger?.warn(`${target.source} 延迟测试超时，尝试备用服务`);
    }
  }

  logger?.error('延迟测试失败：所有目标均超时');

  return (
    lastTimeoutResult || {
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
  logger: Logger | null,
  options: ResolvedNetworkDetectorOptions,
  target: LatencyTarget
): Promise<LatencyResult> {
  const startTime = Date.now();
  logger?.debug(`测试延迟目标: ${target.source} (${target.url})`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.latencyTimeoutMs);

    await fetch(target.url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latency = Date.now() - startTime;

    logger?.debug(`${target.source} 延迟测试完成: ${latency}ms`);

    return {
      value: latency,
      status: getLatencyStatus(latency),
      target: target.url,
      source: target.source,
      timestamp: Date.now(),
    };
  } catch (error) {
    logger?.debug(`${target.source} 延迟测试超时`, {
      错误: error instanceof Error ? error.message : String(error),
    });

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
