import { API_BASE_URL, DEFAULT_API_TIMEOUT, ENDPOINTS } from '../utils/constants.js';
import { clearTokens, getStoredRefreshToken, getStoredToken, redirectToLogin, storeTokens } from '../utils/helpers.js';

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  const text = await response.text();
  return text ? { message: text } : null;
}

async function refreshTokenRequest() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;

  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.auth.refresh}`, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) return null;

  const payload = await parseResponse(response);
  const nextToken = payload?.accessToken || payload?.token || payload?.data?.accessToken || payload?.data?.token;
  const nextRefreshToken = payload?.refreshToken || payload?.data?.refreshToken || refreshToken;
  if (nextToken) {
    storeTokens({ token: nextToken, refreshToken: nextRefreshToken });
    if (nextToken) window.localStorage.setItem('accessToken', nextToken);
    if (nextRefreshToken) window.localStorage.setItem('refreshToken', nextRefreshToken);
    return nextToken;
  }

  return null;
}

export async function apiRequest(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    timeout = DEFAULT_API_TIMEOUT,
    skipAuthRedirect = false,
    retry = true,
  } = options;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  const token = getStoredToken();
  const url = `${API_BASE_URL}${path}`;

  console.info('[API request]', method, url);

  try {
    const response = await fetch(url, {
      method,
      mode: 'cors',
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    console.info('[API response]', response.status, url);
    const payload = await parseResponse(response);

    if ((response.status === 401 || response.status === 403) && retry) {
      const refreshedToken = await refreshTokenRequest();
      if (refreshedToken) {
        return apiRequest(path, { ...options, retry: false });
      }
      clearTokens();
      if (!skipAuthRedirect) redirectToLogin();
    }

    if (!response.ok) {
      const error = new Error(payload?.message || `Request failed with status ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('De aanvraag duurde te lang. Probeer het opnieuw.');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
