import { apiRequest } from './client.js';

export function getBalances(tripId) {
  return apiRequest(`/trips/${tripId}/settlements`);
}

export function markAsPaid(tripId, settlementId, payload = {}) {
  return apiRequest(`/trips/${tripId}/settlements/${settlementId}/pay`, { method: 'POST', body: payload });
}
