import { apiRequest } from './client.js';

export function listDays(tripId) {
  return apiRequest(`/trips/${tripId}/days`);
}

export function createDay(tripId, payload) {
  return apiRequest(`/trips/${tripId}/days`, { method: 'POST', body: payload });
}

export function updateDay(tripId, dayId, payload) {
  return apiRequest(`/trips/${tripId}/days/${dayId}`, { method: 'PATCH', body: payload });
}

export function deleteDay(tripId, dayId) {
  return apiRequest(`/trips/${tripId}/days/${dayId}`, { method: 'DELETE' });
}

export function reorderDays(tripId, payload) {
  return apiRequest(`/trips/${tripId}/days/reorder`, { method: 'PUT', body: payload });
}
