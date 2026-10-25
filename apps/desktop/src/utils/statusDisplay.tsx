import { Signal } from 'lucide-react';

// 检测是否为深色模式
export const isDarkMode = () => {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
};

// WiFi 信号强度图标和颜色（支持深色模式）
export const getSignalIcon = (strength: number) => {
  const dark = isDarkMode();
  if (strength >= 75)
    return {
      icon: <Signal size={16} />,
      color: dark ? '#34d399' : '#22c55e',
      text: '优秀',
    };
  if (strength >= 50)
    return {
      icon: <Signal size={16} />,
      color: dark ? '#60a5fa' : '#3b82f6',
      text: '良好',
    };
  if (strength >= 25)
    return {
      icon: <Signal size={16} />,
      color: dark ? '#fbbf24' : '#f59e0b',
      text: '一般',
    };
  return {
    icon: <Signal size={16} />,
    color: dark ? '#f87171' : '#ef4444',
    text: '较差',
  };
};

// 延迟等级和颜色（支持深色模式）
export const getLatencyStatus = (latency: number) => {
  const dark = isDarkMode();
  if (latency < 50) return { color: dark ? '#34d399' : '#22c55e', text: '优秀' };
  if (latency < 100) return { color: dark ? '#60a5fa' : '#3b82f6', text: '良好' };
  if (latency < 200) return { color: dark ? '#fbbf24' : '#f59e0b', text: '一般' };
  if (latency < 500) return { color: dark ? '#fb923c' : '#f97316', text: '较差' };
  return { color: dark ? '#f87171' : '#ef4444', text: '很差' };
};

// 连接速度等级和颜色（支持深色模式）
export const getLinkSpeedStatus = (speed: number) => {
  const dark = isDarkMode();
  if (speed >= 500) return { color: dark ? '#34d399' : '#22c55e', text: '优秀' };
  if (speed >= 200) return { color: dark ? '#60a5fa' : '#3b82f6', text: '良好' };
  if (speed >= 100) return { color: dark ? '#fbbf24' : '#f59e0b', text: '一般' };
  if (speed >= 50) return { color: dark ? '#fb923c' : '#f97316', text: '较差' };
  return { color: dark ? '#f87171' : '#ef4444', text: '很差' };
};
