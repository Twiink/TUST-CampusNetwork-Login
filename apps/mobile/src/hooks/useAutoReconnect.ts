/**
 * 自动重连 Hook
 *
 * 提供断线自动重连功能
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createRetryPolicy } from '@repo/shared';

export interface UseAutoReconnectOptions {
  /** 是否启用自动重连 */
  enabled?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 初始延迟（毫秒） */
  initialDelay?: number;
  /** 最大延迟（毫秒） */
  maxDelay?: number;
  /** 执行重连的函数 */
  onReconnect: () => Promise<boolean>;
  /** 重连成功回调 */
  onSuccess?: () => void;
  /** 重连失败回调 */
  onFailure?: (error?: Error) => void;
  /** 重连尝试回调 */
  onAttempt?: (attempt: number, maxAttempts: number) => void;
}

export interface UseAutoReconnectResult {
  /** 是否正在重连 */
  isReconnecting: boolean;
  /** 当前重试次数 */
  currentAttempt: number;
  /** 最大重试次数 */
  maxAttempts: number;
  /** 手动触发重连 */
  triggerReconnect: () => Promise<boolean>;
  /** 重置重连状态 */
  reset: () => void;
  /** 是否已用尽重试次数 */
  isExhausted: boolean;
}

/**
 * 自动重连 Hook
 */
export function useAutoReconnect(options: UseAutoReconnectOptions): UseAutoReconnectResult {
  const {
    enabled = true,
    maxRetries = 3,
    initialDelay = 2000,
    maxDelay = 30000,
    onReconnect,
    onSuccess,
    onFailure,
    onAttempt,
  } = options;

  const [isReconnecting, setIsReconnecting] = useState(false);
  const [currentAttempt, setCurrentAttempt] = useState(0);
  const [isExhausted, setIsExhausted] = useState(false);

  const retryPolicyRef = useRef(
    createRetryPolicy({
      maxRetries,
      initialDelay,
      maxDelay,
      backoffMultiplier: 2,
    })
  );

  // 更新重试策略配置
  useEffect(() => {
    retryPolicyRef.current = createRetryPolicy({
      maxRetries,
      initialDelay,
      maxDelay,
      backoffMultiplier: 2,
    });
  }, [maxRetries, initialDelay, maxDelay]);

  const reset = useCallback(() => {
    setCurrentAttempt(0);
    setIsExhausted(false);
    setIsReconnecting(false);
    retryPolicyRef.current.reset();
  }, []);

  const triggerReconnect = useCallback(async (): Promise<boolean> => {
    if (!enabled || isReconnecting) {
      return false;
    }

    setIsReconnecting(true);
    setIsExhausted(false);

    let attempt = 0;
    let success = false;

    while (attempt < maxRetries && !success) {
      attempt++;
      setCurrentAttempt(attempt);
      onAttempt?.(attempt, maxRetries);

      try {
        success = await onReconnect();

        if (success) {
          onSuccess?.();
          reset();
          return true;
        }
      } catch (error) {
        console.warn(`Reconnect attempt ${attempt} failed:`, error);
      }

      if (!success && attempt < maxRetries) {
        // 等待一段时间后重试
        const delay = retryPolicyRef.current.getNextDelay();
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (!success) {
      setIsExhausted(true);
      onFailure?.(new Error('重连失败：已达到最大重试次数'));
    }

    setIsReconnecting(false);
    return success;
  }, [enabled, isReconnecting, maxRetries, onReconnect, onSuccess, onFailure, onAttempt, reset]);

  return {
    isReconnecting,
    currentAttempt,
    maxAttempts: maxRetries,
    triggerReconnect,
    reset,
    isExhausted,
  };
}

export default useAutoReconnect;
