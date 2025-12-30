/**
 * HTTP 客户端封装
 */

/**
 * HTTP 请求选项
 */
export interface HttpRequestOptions {
  /** 请求方法 */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** 请求头 */
  headers?: Record<string, string>;
  /** 请求体 */
  body?: string | Record<string, unknown>;
  /** 超时时间 (毫秒) */
  timeout?: number;
  /** 是否跟随重定向 */
  followRedirects?: boolean;
}

/**
 * HTTP 响应
 */
export interface HttpResponse<T = unknown> {
  /** 状态码 */
  status: number;
  /** 状态文本 */
  statusText: string;
  /** 响应头 */
  headers: Record<string, string>;
  /** 响应数据 */
  data: T;
  /** 原始响应文本 */
  rawText: string;
  /** 是否成功 (2xx) */
  ok: boolean;
}

/**
 * HTTP 错误
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public status?: number,
    public statusText?: string,
    public response?: HttpResponse
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * 默认超时时间 (毫秒)
 */
const DEFAULT_TIMEOUT = 10000;

/**
 * 发送 HTTP 请求
 * @param url 请求 URL
 * @param options 请求选项
 * @returns HTTP 响应
 */
export async function httpRequest<T = unknown>(
  url: string,
  options: HttpRequestOptions = {}
): Promise<HttpResponse<T>> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = DEFAULT_TIMEOUT,
    followRedirects = true,
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const requestInit: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...headers,
      },
      signal: controller.signal,
      redirect: followRedirects ? 'follow' : 'manual',
    };

    if (body) {
      if (typeof body === 'string') {
        requestInit.body = body;
      } else {
        requestInit.body = JSON.stringify(body);
        (requestInit.headers as Record<string, string>)['Content-Type'] = 'application/json';
      }
    }

    const response = await fetch(url, requestInit);
    const rawText = await response.text();

    // 尝试解析 JSON
    let data: T;
    try {
      data = JSON.parse(rawText) as T;
    } catch {
      data = rawText as T;
    }

    // 提取响应头
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      data,
      rawText,
      ok: response.ok,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new HttpError(`请求超时 (${timeout}ms)`, 0, 'Timeout');
      }
      throw new HttpError(error.message);
    }
    throw new HttpError('未知错误');
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * GET 请求
 */
export async function httpGet<T = unknown>(
  url: string,
  options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
): Promise<HttpResponse<T>> {
  return httpRequest<T>(url, { ...options, method: 'GET' });
}

/**
 * POST 请求
 */
export async function httpPost<T = unknown>(
  url: string,
  body?: string | Record<string, unknown>,
  options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
): Promise<HttpResponse<T>> {
  return httpRequest<T>(url, { ...options, method: 'POST', body });
}

/**
 * 检查 URL 是否可达
 * @param url 要检查的 URL
 * @param timeout 超时时间 (毫秒)
 * @returns 是否可达
 */
export async function isUrlReachable(url: string, timeout = 5000): Promise<boolean> {
  try {
    const response = await httpGet(url, { timeout });
    return response.ok;
  } catch {
    return false;
  }
}
