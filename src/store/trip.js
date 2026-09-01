import { createStore } from './createStore.js';

export const tripStore = createStore({
  currentTrip: null,
  currentTripId: null,
  trips: [],
  expenses: [],
  days: [],
  bookings: [],
  checklist: [],
  settlements: [],
  settlementHistory: [],
  exchangeRates: { EUR: 1 },
});
