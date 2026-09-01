import { apiRequest } from './client.js';

export async function getBalances(tripId) {
  try {
    return await apiRequest(`/trips/${tripId}/balances`);
  } catch (error) {
    if (error?.status !== 404 && error?.status !== 405) throw error;
    return apiRequest(`/trips/${tripId}/settlements`);
  }
}

export function calculatePlan(tripId) {
  return apiRequest(`/trips/${tripId}/calculate-settlement`, { method: 'POST' });
}

export async function markAsPaid(tripId, settlementId, payload = {}) {
  try {
    return await apiRequest(`/settlements/${settlementId}/mark-paid`, { method: 'POST', body: payload });
  } catch (error) {
    if (error?.status !== 404 && error?.status !== 405) throw error;
    return apiRequest(`/trips/${tripId}/settlements/${settlementId}/pay`, { method: 'POST', body: payload });
  }
}

export async function getHistory(tripId) {
  try {
    return await apiRequest(`/settlements/${tripId}/history`);
  } catch (error) {
    if (error?.status !== 404 && error?.status !== 405) throw error;
    return apiRequest(`/trips/${tripId}/settlements/history`);
  }
}

export const settlementsAPI = {
  getBalances,
  calculatePlan,
  markAsPaid,
  getHistory,
};
