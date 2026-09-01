import { apiRequest } from './client.js';

export function listExpenses(tripId) {
  return apiRequest(`/trips/${tripId}/expenses`);
}

export function createExpense(tripId, payload) {
  return apiRequest(`/trips/${tripId}/expenses`, { method: 'POST', body: payload });
}

export function updateExpense(tripId, expenseId, payload) {
  return apiRequest(`/trips/${tripId}/expenses/${expenseId}`, { method: 'PATCH', body: payload });
}

export function deleteExpense(tripId, expenseId) {
  return apiRequest(`/trips/${tripId}/expenses/${expenseId}`, { method: 'DELETE' });
}
