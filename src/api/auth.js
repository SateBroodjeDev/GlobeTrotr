import { apiRequest } from './client.js';
import { ENDPOINTS } from '../utils/constants.js';

function normaliseLoginPayload(emailOrPayload, password) {
  if (typeof emailOrPayload === 'object' && emailOrPayload !== null) return emailOrPayload;
  return { email: emailOrPayload, password };
}

function normaliseRegisterPayload(payloadOrEmail, password, firstName, lastName) {
  if (typeof payloadOrEmail === 'object' && payloadOrEmail !== null) return payloadOrEmail;
  return {
    email: payloadOrEmail,
    password,
    firstName,
    lastName,
    name: [firstName, lastName].filter(Boolean).join(' ').trim() || undefined,
  };
}

export function login(payloadOrEmail, password) {
  const payload = normaliseLoginPayload(payloadOrEmail, password);
  return apiRequest(ENDPOINTS.auth.login, { method: 'POST', body: payload, skipAuthRedirect: true });
}

export function register(payloadOrEmail, password, firstName, lastName) {
  const payload = normaliseRegisterPayload(payloadOrEmail, password, firstName, lastName);
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

export const authAPI = {
  login,
  register,
  logout,
  refreshToken,
  getProfile,
};
