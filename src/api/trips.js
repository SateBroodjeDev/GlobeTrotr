import { apiRequest } from './client.js';
import { ENDPOINTS } from '../utils/constants.js';

export function listTrips(workspaceId) {
  const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  return apiRequest(`${ENDPOINTS.trips}${query}`);
}

export function getTrip(tripId) {
  return apiRequest(`${ENDPOINTS.trips}/${tripId}`);
}

export function createTrip(payload) {
  return apiRequest(ENDPOINTS.trips, { method: 'POST', body: payload });
}

export function updateTrip(tripId, payload) {
  return apiRequest(`${ENDPOINTS.trips}/${tripId}`, { method: 'PATCH', body: payload });
}

export function deleteTrip(tripId) {
  return apiRequest(`${ENDPOINTS.trips}/${tripId}`, { method: 'DELETE' });
}
