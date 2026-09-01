import { apiRequest } from './client.js';
import { ENDPOINTS } from '../utils/constants.js';

export function createWorkspace(payload) {
  return apiRequest(ENDPOINTS.workspaces, { method: 'POST', body: payload });
}

export function listWorkspaces() {
  return apiRequest(ENDPOINTS.workspaces);
}

export function getWorkspace(workspaceId) {
  return apiRequest(`${ENDPOINTS.workspaces}/${workspaceId}`);
}

export async function updateWorkspace(workspaceId, payload) {
  try {
    return await apiRequest(`${ENDPOINTS.workspaces}/${workspaceId}`, { method: 'PUT', body: payload });
  } catch (error) {
    if (error?.status !== 404 && error?.status !== 405) throw error;
    return apiRequest(`${ENDPOINTS.workspaces}/${workspaceId}`, { method: 'PATCH', body: payload });
  }
}

export function deleteWorkspace(workspaceId) {
  return apiRequest(`${ENDPOINTS.workspaces}/${workspaceId}`, { method: 'DELETE' });
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

export const workspacesAPI = {
  create: createWorkspace,
  getAll: listWorkspaces,
  getById: getWorkspace,
  update: updateWorkspace,
  delete: deleteWorkspace,
  inviteMember: (workspaceId, email, role) => addMember(workspaceId, { email, role }),
  getMembers,
  updateMemberRole: (workspaceId, userId, role) => updateMember(workspaceId, userId, { role }),
  removeMember: removeMember,
};
