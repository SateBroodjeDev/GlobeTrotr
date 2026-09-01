import { createStore } from './createStore.js';

export const authStore = createStore({
  user: null,
  token: null,
  refreshToken: null,
  isLoggedIn: false,
  role: 'Viewer',
  plan: 'Free',
});
