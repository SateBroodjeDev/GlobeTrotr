export function formatCurrency(amount, currency = 'EUR') {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

export function formatDate(dateString) {
  if (!dateString) return '-';
  const value = new Date(dateString);
  if (Number.isNaN(value.getTime())) return dateString;
  return new Intl.DateTimeFormat('nl-NL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(value);
}

export function formatDateInput(dateString) {
  if (!dateString) return '';
  return String(dateString).slice(0, 10);
}

export function formatTimeAgo(dateString) {
  if (!dateString) return 'zojuist';
  const value = new Date(dateString);
  const diffMs = Date.now() - value.getTime();
  if (Number.isNaN(diffMs)) return 'zojuist';
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return 'zojuist';
  if (diffMinutes < 60) return `${diffMinutes} min geleden`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} uur geleden`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} dagen geleden`;
}
