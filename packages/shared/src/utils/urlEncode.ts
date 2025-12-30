/**
 * URL 编码工具
 * 处理 IPv6 等特殊字符的编码
 */

/**
 * URL 编码函数
 * 类似于 shell 脚本中的 urlencode 实现
 * @param str 要编码的字符串
 * @returns 编码后的字符串
 */
export function urlencode(str: string): string {
  if (!str) return '';

  // 使用 encodeURIComponent 并手动处理一些特殊情况
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

/**
 * URL 解码函数
 * @param str 要解码的字符串
 * @returns 解码后的字符串
 */
export function urldecode(str: string): string {
  if (!str) return '';

  try {
    return decodeURIComponent(str.replace(/\+/g, ' '));
  } catch {
    return str;
  }
}

/**
 * 构建查询字符串
 * @param params 参数对象
 * @returns 查询字符串 (不包含 ?)
 */
export function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${urlencode(key)}=${urlencode(String(value))}`)
    .join('&');
}

/**
 * 解析查询字符串
 * @param queryString 查询字符串
 * @returns 参数对象
 */
export function parseQueryString(queryString: string): Record<string, string> {
  const params: Record<string, string> = {};

  if (!queryString) return params;

  // 移除开头的 ?
  const query = queryString.startsWith('?') ? queryString.slice(1) : queryString;

  query.split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key) {
      params[urldecode(key)] = value ? urldecode(value) : '';
    }
  });

  return params;
}
