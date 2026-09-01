import { apiRequest } from './client.js';
import { ENDPOINTS } from '../utils/constants.js';

export function login(payload) {
  return apiRequest(ENDPOINTS.auth.login, { method: 'POST', body: payload, skipAuthRedirect: true });
}

export function register(payload) {
  return apiRequest(ENDPOINTS.auth.register, { method: 'POST', body: payload, skipAuthRedirect: true });
}

export function logout() {
  return apiRequest(ENDPOINTS.auth.logout, { method: 'POST', skipAuthRedirect: true }).catch(() => null);
}

export function refreshToken(payload) {
  return apiRequest(ENDPOINTS.auth.refresh, { method: 'POST', body: payload, skipAuthRedirect: true });
}

export function getProfile() {
  return apiRequest(ENDPOINTS.auth.me);
}
