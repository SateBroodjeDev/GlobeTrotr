import { apiRequest } from './client.js';

export function listBookings(tripId) {
  return apiRequest(`/trips/${tripId}/bookings`);
}

export function createBooking(tripId, payload) {
  return apiRequest(`/trips/${tripId}/bookings`, { method: 'POST', body: payload });
}

export function updateBooking(tripId, bookingId, payload) {
  return apiRequest(`/trips/${tripId}/bookings/${bookingId}`, { method: 'PATCH', body: payload });
}

export function deleteBooking(tripId, bookingId) {
  return apiRequest(`/trips/${tripId}/bookings/${bookingId}`, { method: 'DELETE' });
}
