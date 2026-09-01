import { createStore } from './createStore.js';

export const uiStore = createStore({
  activeTab: 'dashboard',
  modalOpen: false,
  modalType: null,
  notifications: [],
  loading: false,
  error: null,
  notification: null,
});
