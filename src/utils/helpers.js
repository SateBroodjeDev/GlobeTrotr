import {
  ACTIVE_TAB_KEY,
  AUTH_TOKEN_KEY,
  DASHBOARD_PATH,
  LAST_TRIP_KEY,
  LOGIN_PATH,
  REFRESH_TOKEN_KEY,
  REGISTER_PATH,
} from './constants.js';

export function getStoredToken() {
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getStoredRefreshToken() {
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function storeTokens({ token, refreshToken }) {
  if (token) window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  if (refreshToken) window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}

const SAFE_REDIRECT_FILES = new Set([
  DASHBOARD_PATH.replace('./', ''),
  LOGIN_PATH.replace('./', ''),
  REGISTER_PATH.replace('./', ''),
]);

export function sanitizeRedirectTarget(value) {
  if (!value) return DASHBOARD_PATH;

  try {
    const url = new URL(value, window.location.href);
    const fileName = url.pathname.split('/').pop();
    if (url.origin !== window.location.origin || !SAFE_REDIRECT_FILES.has(fileName)) {
      return DASHBOARD_PATH;
    }
    return `./${fileName}${url.hash}`;
  } catch {
    return DASHBOARD_PATH;
  }
}

export function getRedirectTarget() {
  const params = new URLSearchParams(window.location.search);
  return sanitizeRedirectTarget(params.get('redirect'));
}

export function redirectToLogin() {
  const currentPath = window.location.pathname.split('/').pop() || DASHBOARD_PATH;
  const target = currentPath === 'index.html' ? DASHBOARD_PATH : currentPath;
  const redirect = encodeURIComponent(target + window.location.hash);
  window.location.href = `${LOGIN_PATH}?redirect=${redirect}`;
}

export function redirectToDashboard() {
  const target = getRedirectTarget();
  window.location.href = target;
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function persistActiveTab(tab) {
  window.localStorage.setItem(ACTIVE_TAB_KEY, tab);
}

export function readActiveTab() {
  return window.localStorage.getItem(ACTIVE_TAB_KEY) || 'dashboard';
}

export function persistLastTrip(id) {
  if (id) window.localStorage.setItem(LAST_TRIP_KEY, String(id));
}

export function readLastTrip() {
  return window.localStorage.getItem(LAST_TRIP_KEY);
}

export function debounce(fn, delay = 300) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), delay);
  };
}

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
