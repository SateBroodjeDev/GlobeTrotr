import { createStore } from './createStore.js';

export const workspaceStore = createStore({
  currentWorkspace: null,
  members: [],
});
