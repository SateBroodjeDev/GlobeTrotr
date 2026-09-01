import { apiRequest } from './client.js';

export function listExpenses(tripId) {
  return apiRequest(`/trips/${tripId}/expenses`);
}

export async function createExpense(tripId, payload) {
  try {
    return await apiRequest('/expenses', { method: 'POST', body: { ...payload, tripId } });
  } catch (error) {
    if (error?.status !== 404 && error?.status !== 405) throw error;
    return apiRequest(`/trips/${tripId}/expenses`, { method: 'POST', body: payload });
  }
}

export async function updateExpense(tripId, expenseId, payload) {
  try {
    return await apiRequest(`/expenses/${expenseId}`, { method: 'PUT', body: payload });
  } catch (error) {
    if (error?.status !== 404 && error?.status !== 405) throw error;
    return apiRequest(`/trips/${tripId}/expenses/${expenseId}`, { method: 'PATCH', body: payload });
  }
}

export async function deleteExpense(tripId, expenseId) {
  try {
    return await apiRequest(`/expenses/${expenseId}`, { method: 'DELETE' });
  } catch (error) {
    if (error?.status !== 404 && error?.status !== 405) throw error;
    return apiRequest(`/trips/${tripId}/expenses/${expenseId}`, { method: 'DELETE' });
  }
}

export function getExpenseSummary(tripId) {
  return apiRequest(`/trips/${tripId}/expenses/summary`);
}

export const expensesAPI = {
  create: createExpense,
  getByTrip: listExpenses,
  getSummary: getExpenseSummary,
  update: updateExpense,
  delete: deleteExpense,
};
