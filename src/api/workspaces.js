import { apiRequest } from './client.js';
import { ENDPOINTS } from '../utils/constants.js';

export function listWorkspaces() {
  return apiRequest(ENDPOINTS.workspaces);
}

export function getMembers(workspaceId) {
  return apiRequest(`${ENDPOINTS.workspaces}/${workspaceId}/members`);
}

export function addMember(workspaceId, payload) {
  return apiRequest(`${ENDPOINTS.workspaces}/${workspaceId}/members`, { method: 'POST', body: payload });
}

export function updateMember(workspaceId, memberId, payload) {
  return apiRequest(`${ENDPOINTS.workspaces}/${workspaceId}/members/${memberId}`, { method: 'PATCH', body: payload });
}

export function removeMember(workspaceId, memberId) {
  return apiRequest(`${ENDPOINTS.workspaces}/${workspaceId}/members/${memberId}`, { method: 'DELETE' });
}

export function updateBranding(workspaceId, payload) {
  return apiRequest(`${ENDPOINTS.workspaces}/${workspaceId}/branding`, { method: 'PATCH', body: payload });
}
