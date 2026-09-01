import { createStore } from './createStore.js';

export const authStore = createStore({
  user: null,
  token: null,
  refreshToken: null,
  workspace: null,
  workspaces: [],
  isLoggedIn: false,
  loading: false,
  error: null,
  role: 'Viewer',
  plan: 'Free',
});
