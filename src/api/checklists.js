import { apiRequest } from './client.js';

export function listChecklistItems(tripId) {
  return apiRequest(`/trips/${tripId}/checklist-items`);
}

export function createChecklistItem(tripId, payload) {
  return apiRequest(`/trips/${tripId}/checklist-items`, { method: 'POST', body: payload });
}

export function updateChecklistItem(tripId, itemId, payload) {
  return apiRequest(`/trips/${tripId}/checklist-items/${itemId}`, { method: 'PATCH', body: payload });
}

export function deleteChecklistItem(tripId, itemId) {
  return apiRequest(`/trips/${tripId}/checklist-items/${itemId}`, { method: 'DELETE' });
}
