import { createStore } from './createStore.js';

export const tripStore = createStore({
  currentTrip: null,
  currentTripId: null,
  trips: [],
  expenses: [],
  days: [],
  bookings: [],
  checklist: [],
  balances: {},
  settlements: [],
  settlementHistory: [],
  settlement: null,
  loading: false,
  error: null,
  exchangeRates: { EUR: 1 },
});
