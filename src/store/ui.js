import { createStore } from './createStore.js';

export const uiStore = createStore({
  activeTab: 'dashboard',
  loading: false,
  error: null,
  notification: null,
});
