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

export async function updateTrip(tripId, payload) {
  try {
    return await apiRequest(`${ENDPOINTS.trips}/${tripId}`, { method: 'PUT', body: payload });
  } catch (error) {
    if (error?.status !== 404 && error?.status !== 405) throw error;
    return apiRequest(`${ENDPOINTS.trips}/${tripId}`, { method: 'PATCH', body: payload });
  }
}

export function deleteTrip(tripId) {
  return apiRequest(`${ENDPOINTS.trips}/${tripId}`, { method: 'DELETE' });
}

export const tripsAPI = {
  create: (workspaceId, data = {}) => createTrip({ ...data, workspaceId }),
  getAll: listTrips,
  getById: getTrip,
  update: updateTrip,
  delete: deleteTrip,
};
