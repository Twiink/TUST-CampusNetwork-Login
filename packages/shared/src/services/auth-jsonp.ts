/**
 * JSONP 响应解析(自 AuthService 抽出)。
 */

/**
 * 提取 JSONP 响应的括号内 JSON 载荷（不依赖 callback 名）。
 * 与参考实现一致：取第一个 '(' 到最后一个 ')' 之间的内容。
 */
export function extractJsonpPayload(body: string): string | null {
  const start = body.indexOf('(');
  const end = body.lastIndexOf(')');
  if (start < 0 || end <= start) {
    return null;
  }
  return body.slice(start + 1, end).trim() || null;
}
