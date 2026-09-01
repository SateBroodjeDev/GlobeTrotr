export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

export function validatePassword(password) {
  return String(password || '').trim().length >= 8;
}

export function validateAmount(amount) {
  return Number.isFinite(Number(amount)) && Number(amount) > 0;
}

export function requireValue(value, label) {
  if (String(value || '').trim()) return null;
  return `${label} is verplicht.`;
}

export function validatePin(pin) {
  return !pin || /^\d{4,6}$/.test(String(pin));
}
