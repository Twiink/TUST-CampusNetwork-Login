import React from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * 主页提示卡：WiFi 未连接 / 未配置 / 无需认证 / 需要认证 / 未关联账户
 * 等分支共用的「图标 + 标题 + 描述 + 底部提示框」结构。
 *
 * - 仅传 hint：底部为块级提示（小字 + 图标）；
 * - 同时传 hint 与 action：底部为横向布局，左侧说明、右侧操作按钮。
 */
export const HomeNoticeCard: React.FC<{
  icon: LucideIcon;
  iconColor: string;
  /** 提示框底色/边框的 RGB 三元组，如 '245, 158, 11' */
  tintRgb: string;
  title: string;
  description: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ icon: Icon, iconColor, tintRgb, title, description, hint, action }) => {
  const hasFooter = Boolean(hint || action);

  return (
    <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <Icon size={64} color={iconColor} style={{ marginBottom: 16 }} />
      <h2 style={{ margin: '0 0 8px 0', color: iconColor }}>{title}</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>{description}</p>
      {hasFooter && (
        <div
          style={{
            backgroundColor: `rgba(${tintRgb}, 0.1)`,
            border: `1px solid rgba(${tintRgb}, 0.3)`,
            borderRadius: 'var(--radius-md)',
            padding: 16,
            textAlign: 'left',
            ...(action
              ? {
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                }
              : {}),
          }}
        >
          {action ? <div style={{ flex: 1 }}>{hint}</div> : hint}
          {action}
        </div>
      )}
    </div>
  );
};

export const HomeToast: React.FC<{
  toast: { message: string; type: 'success' | 'error' } | null;
}> = ({ toast }) => {
  if (!toast) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        backgroundColor: toast.type === 'success' ? '#22c55e' : '#ef4444',
        color: 'white',
        padding: '12px 20px',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        animation: 'slideInRight 0.3s ease-out',
        zIndex: 1000,
      }}
    >
      {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{toast.message}</span>
    </div>
  );
};
