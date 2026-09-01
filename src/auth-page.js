import * as authApi from './api/auth.js';
import { authStore } from './store/auth.js';
import { clearTokens, getStoredRefreshToken, getStoredToken, redirectToDashboard, storeTokens } from './utils/helpers.js';
import { validateEmail, validatePassword, requireValue } from './utils/validators.js';

function getResponseUser(payload) {
  return payload?.user || payload?.data?.user || payload?.profile || null;
}

function getResponseToken(payload) {
  return payload?.accessToken || payload?.token || payload?.data?.accessToken || payload?.data?.token || null;
}

function getResponseRefreshToken(payload) {
  return payload?.refreshToken || payload?.data?.refreshToken || null;
}

function setFormState(button, loading) {
  button.disabled = loading;
  button.classList.toggle('opacity-60', loading);
  button.textContent = loading ? 'Even geduld...' : button.dataset.defaultLabel;
}

function showError(message) {
  const error = document.getElementById('auth-error');
  error.textContent = message;
  error.classList.remove('hidden');
}

function hideError() {
  document.getElementById('auth-error').classList.add('hidden');
}

async function handleLogin(form) {
  const email = form.email.value.trim();
  const password = form.password.value;

  const emailError = requireValue(email, 'E-mailadres') || (!validateEmail(email) ? 'Voer een geldig e-mailadres in.' : null);
  if (emailError) throw new Error(emailError);
  const passwordError = requireValue(password, 'Wachtwoord');
  if (passwordError) throw new Error(passwordError);

  const payload = await authApi.login({ email, password });
  const accessToken = getResponseToken(payload);
  const refreshToken = getResponseRefreshToken(payload);
  if (!accessToken) throw new Error('De login-response bevat geen token.');

  storeTokens({ token: accessToken, refreshToken });
  authStore.setState({
    user: getResponseUser(payload),
    token: accessToken,
    refreshToken: refreshToken || getStoredRefreshToken(),
    isLoggedIn: true,
    role: payload?.user?.role || payload?.role || 'Viewer',
    plan: payload?.user?.plan || payload?.plan || 'Free',
  });
  redirectToDashboard();
}

async function handleRegister(form) {
  const firstName = form.firstName?.value?.trim() || '';
  const lastName = form.lastName?.value?.trim() || '';
  const name = form.name?.value?.trim() || `${firstName} ${lastName}`.trim();
  const email = form.email.value.trim();
  const password = form.password.value;

  const firstNameError = requireValue(firstName || name, 'Voornaam');
  if (firstNameError) throw new Error(firstNameError);
  if (form.lastName && !lastName) throw new Error('Achternaam is verplicht.');
  const emailError = requireValue(email, 'E-mailadres') || (!validateEmail(email) ? 'Voer een geldig e-mailadres in.' : null);
  if (emailError) throw new Error(emailError);
  if (!validatePassword(password)) throw new Error('Gebruik minimaal 8 tekens voor je wachtwoord.');

  const payload = await authApi.register({ name, firstName: firstName || undefined, lastName: lastName || undefined, email, password });
  const accessToken = getResponseToken(payload);
  const refreshToken = getResponseRefreshToken(payload);
  if (accessToken) {
    storeTokens({ token: accessToken, refreshToken });
    authStore.setState({
      user: getResponseUser(payload),
      token: accessToken,
      refreshToken: refreshToken || getStoredRefreshToken(),
      isLoggedIn: true,
      role: payload?.user?.role || payload?.role || 'Owner',
      plan: payload?.user?.plan || payload?.plan || 'Free',
    });
    redirectToDashboard();
    return;
  }

  await handleLogin({ email: { value: email }, password: { value: password } });
}

async function bindAuthPage() {
  if (getStoredToken()) {
    redirectToDashboard();
    return;
  }

  clearTokens();
  const form = document.getElementById('auth-form');
  const submitButton = document.getElementById('auth-submit');
  submitButton.dataset.defaultLabel = submitButton.textContent;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError();
    setFormState(submitButton, true);

    try {
      if (document.body.dataset.authMode === 'register') {
        await handleRegister(form);
      } else {
        await handleLogin(form);
      }
    } catch (error) {
      showError(error.message || 'Er ging iets mis tijdens authenticatie.');
    } finally {
      setFormState(submitButton, false);
    }
  });
}

window.addEventListener('DOMContentLoaded', bindAuthPage);
