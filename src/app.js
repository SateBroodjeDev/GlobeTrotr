import { apiRequest } from './api/client.js';
import * as authApi from './api/auth.js';
import * as tripsApi from './api/trips.js';
import * as expensesApi from './api/expenses.js';
import * as workspacesApi from './api/workspaces.js';
import * as daysApi from './api/days.js';
import * as bookingsApi from './api/bookings.js';
import * as settlementsApi from './api/settlements.js';
import * as checklistsApi from './api/checklists.js';
import { authStore } from './store/auth.js';
import { tripStore } from './store/trip.js';
import { uiStore } from './store/ui.js';
import { workspaceStore } from './store/workspace.js';
import { budgetActuals, computeBalances, totalsByCategory } from './utils/calculations.js';
import {
  BOOKING_TYPES,
  CHECKLIST_TEMPLATES,
  ENDPOINTS,
  EXPENSE_CATEGORIES,
  SUPPORTED_CURRENCIES,
} from './utils/constants.js';
import { formatCurrency, formatDateInput, formatTimeAgo } from './utils/formatters.js';
import {
  clearTokens,
  debounce,
  escapeHtml,
  getStoredRefreshToken,
  getStoredToken,
  persistActiveTab,
  persistLastTrip,
  readActiveTab,
  readLastTrip,
  redirectToLogin,
  safeArray,
  safeNumber,
} from './utils/helpers.js';
import { requireValue, validateAmount, validatePin } from './utils/validators.js';

const runtime = {
  appLockPin: window.localStorage.getItem('gt_saas_pin') || null,
  leafletMapInstance: null,
  categoryChartInstance: null,
  budgetChartInstance: null,
  lastRetryAction: null,
};

function refreshIcons() {
  window.lucide?.createIcons?.();
}

function unwrapList(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of [...keys, 'data', 'items', 'results']) {
    const candidate = payload?.[key];
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === 'object') {
      const nested = unwrapList(candidate);
      if (nested.length) return nested;
    }
  }
  return [];
}

function unwrapObject(payload, keys = []) {
  if (payload && !Array.isArray(payload) && typeof payload === 'object') {
    for (const key of keys) {
      const candidate = payload[key];
      if (candidate && !Array.isArray(candidate) && typeof candidate === 'object') return candidate;
    }
    return payload;
  }
  return null;
}

function normaliseMember(member, index = 0) {
  if (typeof member === 'string') {
    return { id: `${member}-${index}`, name: member, email: '', role: 'Viewer' };
  }
  return {
    id: member?.id ?? member?.userId ?? `member-${index}`,
    name: member?.name ?? member?.fullName ?? member?.displayName ?? member?.email ?? `Reiziger ${index + 1}`,
    email: member?.email ?? '',
    role: member?.role ?? member?.workspaceRole ?? member?.memberRole ?? 'Viewer',
  };
}

function normaliseExpense(expense = {}, index = 0) {
  const amount = safeNumber(expense.bedrag ?? expense.amount);
  const exchangeAmount = safeNumber(expense.omgerekendeEUR ?? expense.amountInEur ?? expense.amountEUR, amount);
  return {
    id: expense.id ?? expense.expenseId ?? `expense-${index}`,
    omschrijving: expense.omschrijving ?? expense.description ?? expense.title ?? 'Onbekende uitgave',
    categorie: expense.categorie ?? expense.category ?? 'Overig',
    bedrag: amount,
    valuta: expense.valuta ?? expense.currency ?? 'EUR',
    omgerekendeEUR: exchangeAmount,
    betaaldDoor: expense.betaaldDoor ?? expense.paidBy ?? expense.payer ?? 'Onbekend',
    verdeeldOver: safeArray(expense.verdeeldOver ?? expense.splitBetween ?? expense.beneficiaries),
    createdAt: expense.createdAt ?? expense.created_at ?? null,
  };
}

function normaliseDay(day = {}, index = 0) {
  return {
    id: day.id ?? day.dayId ?? `day-${index}`,
    datum: formatDateInput(day.datum ?? day.date),
    dag: day.dag ?? day.label ?? `Dag ${index + 1}`,
    plaats: day.plaats ?? day.location ?? day.place ?? '',
    activiteit: day.activiteit ?? day.activity ?? day.description ?? '',
    van: day.van ?? day.from ?? '',
    naar: day.naar ?? day.to ?? '',
    type: day.type ?? 'Dag',
    order: safeNumber(day.order ?? index),
  };
}

function normaliseBooking(booking = {}, index = 0) {
  return {
    id: booking.id ?? booking.bookingId ?? `booking-${index}`,
    type: booking.type ?? booking.category ?? 'Boeking',
    leverancier: booking.leverancier ?? booking.provider ?? booking.vendor ?? 'Onbekend',
    datum: formatDateInput(booking.datum ?? booking.date),
    vanNaar: booking.vanNaar ?? booking.route ?? booking.location ?? '',
    bedrag: safeNumber(booking.bedrag ?? booking.amount),
    isGeboekt: Boolean(booking.isGeboekt ?? booking.isBooked ?? booking.confirmed ?? false),
  };
}

function normaliseChecklistItem(item = {}, index = 0) {
  return {
    id: item.id ?? item.itemId ?? `check-${index}`,
    text: item.text ?? item.label ?? item.title ?? '',
    done: Boolean(item.done ?? item.completed ?? item.isDone ?? false),
  };
}

function normaliseTrip(trip = {}, index = 0) {
  const members = safeArray(trip.members ?? trip.travelers ?? trip.reizigers).map(normaliseMember);
  return {
    id: trip.id ?? trip.tripId ?? `trip-${index}`,
    workspaceId: trip.workspaceId ?? trip.workspace?.id ?? null,
    titel: trip.titel ?? trip.title ?? trip.name ?? 'Onbekende reis',
    type: trip.type ?? trip.tripType ?? 'Trip',
    beschrijving: trip.beschrijving ?? trip.description ?? '',
    startDatum: formatDateInput(trip.startDatum ?? trip.startDate),
    eindDatum: formatDateInput(trip.eindDatum ?? trip.endDate),
    reizigers: members.map((member) => member.name),
    members,
    planning: safeArray(trip.planning ?? trip.days).map(normaliseDay).sort((a, b) => a.order - b.order),
    kosten: safeArray(trip.kosten ?? trip.expenses).map(normaliseExpense),
    budget: trip.budget ?? trip.budgets ?? {},
    boekingen: safeArray(trip.boekingen ?? trip.bookings).map(normaliseBooking),
    checklist: safeArray(trip.checklist ?? trip.checklistItems ?? trip.items).map(normaliseChecklistItem),
    reisinfoNotes: trip.reisinfoNotes ?? trip.notes ?? '',
    publicUrl: trip.publicUrl ?? null,
  };
}

function normaliseWorkspace(workspace = {}) {
  return {
    id: workspace.id ?? workspace.workspaceId ?? null,
    name: workspace.name ?? workspace.title ?? 'Workspace',
    domain: workspace.domain ?? workspace.customDomain ?? 'app.globetrottr.com',
    plan: workspace.plan ?? workspace.subscriptionPlan ?? authStore.getState().plan,
    branding: workspace.branding ?? {
      appName: workspace.brandName ?? 'GlobeTrotr',
      domain: workspace.domain ?? workspace.customDomain ?? 'app.globetrottr.com',
    },
  };
}

function normaliseSettlementData(payload, fallback) {
  const objectPayload = unwrapObject(payload, ['data', 'settlement', 'summary']) || {};
  const transfers = safeArray(objectPayload.transfers ?? objectPayload.plan).map((transfer, index) => ({
    id: transfer.id ?? transfer.settlementId ?? `transfer-${index}`,
    van: transfer.van ?? transfer.from ?? transfer.debtor ?? '',
    naar: transfer.naar ?? transfer.to ?? transfer.creditor ?? '',
    bedrag: safeNumber(transfer.bedrag ?? transfer.amount),
    isPaid: Boolean(transfer.isPaid ?? transfer.paid ?? false),
    paidAt: transfer.paidAt ?? transfer.updatedAt ?? null,
  }));
  const history = safeArray(objectPayload.history ?? objectPayload.paymentHistory).map((item, index) => ({
    id: item.id ?? `history-${index}`,
    van: item.van ?? item.from ?? '',
    naar: item.naar ?? item.to ?? '',
    bedrag: safeNumber(item.bedrag ?? item.amount),
    paidAt: item.paidAt ?? item.createdAt ?? null,
  }));

  return {
    balances: objectPayload.balances ?? fallback.balances,
    totalTripCost: safeNumber(objectPayload.totalTripCost, fallback.totalTripCost),
    transfers: transfers.length ? transfers : fallback.transfers,
    history,
  };
}

function getCurrentTrip() {
  const { currentTrip, currentTripId, trips } = tripStore.getState();
  if (currentTrip && String(currentTrip.id) === String(currentTripId)) return currentTrip;
  return trips.find((trip) => String(trip.id) === String(currentTripId)) || null;
}

function upsertCurrentTrip(trip) {
  const { trips } = tripStore.getState();
  const nextTrips = trips.some((item) => String(item.id) === String(trip.id))
    ? trips.map((item) => (String(item.id) === String(trip.id) ? trip : item))
    : [...trips, trip];
  tripStore.setState({
    trips: nextTrips,
    currentTrip: trip,
    currentTripId: trip.id,
    expenses: trip.kosten,
    days: trip.planning,
    bookings: trip.boekingen,
    checklist: trip.checklist,
  });
  persistLastTrip(trip.id);
}

function isViewerRole() {
  return ['viewer', 'read-only', 'guest'].includes(String(authStore.getState().role || '').toLowerCase());
}

function canManageWorkspace() {
  return ['owner', 'admin'].includes(String(authStore.getState().role || '').toLowerCase());
}

function setLoading(loading, message = 'Gegevens laden...') {
  uiStore.setState({ loading });
  const overlay = document.getElementById('loading-overlay');
  const label = document.getElementById('loading-text');
  if (label) label.textContent = message;
  if (overlay) {
    overlay.classList.toggle('hidden', !loading);
    overlay.classList.toggle('flex', loading);
  }
}

function showGlobalError(message, retryAction = null) {
  runtime.lastRetryAction = retryAction;
  const banner = document.getElementById('global-error-banner');
  const text = document.getElementById('global-error-text');
  const retryButton = document.getElementById('global-error-retry');
  if (text) text.textContent = message;
  if (banner) banner.classList.remove('hidden');
  if (retryButton) retryButton.classList.toggle('hidden', !retryAction);
}

function hideGlobalError() {
  const banner = document.getElementById('global-error-banner');
  if (banner) banner.classList.add('hidden');
}

function setToastTone(tone) {
  const toast = document.getElementById('toast-msg');
  toast.className = 'fixed top-20 right-4 px-4 py-3 rounded-xl shadow-2xl z-50 text-xs flex items-center gap-2 transform translate-x-full transition-transform duration-300';
  if (tone === 'error') {
    toast.classList.add('bg-rose-950', 'border', 'border-rose-500/40', 'text-rose-200');
  } else {
    toast.classList.add('bg-slate-900', 'border', 'border-sky-500/40', 'text-sky-200');
  }
}

function showToast(text, tone = 'info') {
  const toast = document.getElementById('toast-msg');
  const label = document.getElementById('toast-text');
  if (!toast || !label) return;
  setToastTone(tone);
  label.textContent = text;
  toast.classList.remove('translate-x-full');
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.add('translate-x-full');
  }, 3000);
}

function showModalError(message) {
  const feedback = document.getElementById('modal-feedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.classList.remove('hidden');
}

function hideModalError() {
  const feedback = document.getElementById('modal-feedback');
  if (!feedback) return;
  feedback.classList.add('hidden');
  feedback.textContent = '';
}

function openModal(title, bodyHtml, onSave) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  hideModalError();
  const saveButton = document.getElementById('modal-save-btn');
  if (onSave) {
    saveButton.classList.remove('hidden');
    saveButton.disabled = false;
    saveButton.onclick = async () => {
      hideModalError();
      saveButton.disabled = true;
      saveButton.classList.add('opacity-60');
      try {
        await onSave();
      } catch (error) {
        showModalError(error.message || 'Opslaan mislukt.');
      } finally {
        saveButton.disabled = false;
        saveButton.classList.remove('opacity-60');
      }
    };
  } else {
    saveButton.classList.add('hidden');
    saveButton.onclick = null;
  }
  document.getElementById('app-modal').classList.remove('hidden');
  refreshIcons();
}

function closeModal() {
  document.getElementById('app-modal').classList.add('hidden');
  hideModalError();
}

function updateHeader() {
  const authState = authStore.getState();
  const workspaceState = workspaceStore.getState();
  const userName = authState.user?.name ?? authState.user?.fullName ?? authState.user?.email ?? 'Ingelogd';
  const role = authState.role || 'Viewer';
  const plan = workspaceState.currentWorkspace?.plan || authState.plan || 'Free';
  const domain = workspaceState.currentWorkspace?.branding?.domain || workspaceState.currentWorkspace?.domain || 'app.globetrottr.com';
  const brandName = workspaceState.currentWorkspace?.branding?.appName || workspaceState.currentWorkspace?.name || 'GlobeTrotr';

  document.getElementById('current-user-display').textContent = userName;
  document.getElementById('current-role-display').textContent = role;
  document.getElementById('current-plan-display').textContent = `${plan} Plan`;
  document.getElementById('tenant-domain-display').textContent = domain;
  document.getElementById('app-brand-name').textContent = brandName;

  renderRoleBasedUI();
}

function renderRoleBasedUI() {
  const hideEditorActions = isViewerRole();
  document.querySelectorAll('[data-editor-only="true"]').forEach((element) => {
    element.classList.toggle('hidden', hideEditorActions);
  });
  document.querySelectorAll('[data-admin-only="true"]').forEach((element) => {
    element.classList.toggle('hidden', !canManageWorkspace());
  });
}

function updateCountdown(startDateStr) {
  const cdEl = document.getElementById('countdown-text');
  if (!cdEl || !startDateStr) return;
  const start = new Date(startDateStr);
  const diffDays = Math.ceil((start.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays > 0) cdEl.textContent = `Nog ${diffDays} dagen tot vertrek!`;
  else if (diffDays === 0) cdEl.textContent = '🎉 Vandaag vertrek je!';
  else cdEl.textContent = 'Reis is gestart / afgerond';
}

function renderTripSelector() {
  const select = document.getElementById('trip-selector');
  if (!select) return;
  const { trips, currentTripId } = tripStore.getState();
  select.innerHTML = '';
  if (!trips.length) {
    const option = document.createElement('option');
    option.textContent = 'Geen reizen beschikbaar';
    option.value = '';
    select.appendChild(option);
    select.disabled = true;
    document.getElementById('dash-trip-title').textContent = 'Nog geen reizen';
    document.getElementById('dash-trip-desc').textContent = 'Maak een reis aan om je planning te starten.';
    document.getElementById('dash-reizigers-count').textContent = '0 reizigers';
    return;
  }

  select.disabled = false;
  trips.forEach((trip) => {
    const option = document.createElement('option');
    option.value = trip.id;
    option.textContent = trip.titel;
    option.selected = String(trip.id) === String(currentTripId);
    select.appendChild(option);
  });

  const trip = getCurrentTrip();
  if (trip) {
    document.getElementById('dash-trip-title').textContent = trip.titel;
    document.getElementById('dash-trip-desc').textContent = trip.beschrijving || 'Geen beschrijving ingevoerd';
    document.getElementById('dash-reizigers-count').textContent = `${trip.reizigers.length} reizigers`;
    document.getElementById('dash-trip-type-badge').textContent = trip.type || 'Trip';
    updateCountdown(trip.startDatum);
  }
}

function renderDashboard() {
  const trip = getCurrentTrip();
  const canvas = document.getElementById('dashboardCategoryChart');
  if (!trip || !canvas) return;

  const totals = totalsByCategory(trip.kosten);
  const labels = Object.keys(totals);
  const values = Object.values(totals);
  renderGroupieSettlementSummary();
  fetchDestinationWeather();
  if (typeof window.Chart !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (runtime.categoryChartInstance) runtime.categoryChartInstance.destroy();

  runtime.categoryChartInstance = new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels.length ? labels : ['Geen uitgaven'],
      datasets: [{
        data: values.length ? values : [1],
        backgroundColor: ['#0ea5e9', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'],
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: '#cbd5e1', font: { family: 'Plus Jakarta Sans', size: 11 } } } },
    },
  });

}

function computeSettlementState() {
  const trip = getCurrentTrip();
  if (!trip) return { balances: {}, totalTripCost: 0, transfers: [] };
  const fallback = computeBalances(trip);
  const { settlements, settlementHistory } = tripStore.getState();
  const transfers = settlements.length ? settlements : fallback.transfers;
  return {
    balances: settlements.length ? (tripStore.getState().balances || fallback.balances) : fallback.balances,
    totalTripCost: fallback.totalTripCost,
    transfers,
    history: settlementHistory,
  };
}

function renderGroupieSettlementSummary() {
  const { transfers } = computeSettlementState();
  const card = document.getElementById('dash-settlement-card');
  if (!card) return;
  const unpaidTransfers = transfers.filter((item) => !item.isPaid);
  if (!unpaidTransfers.length) {
    card.innerHTML = '<p class="text-xs text-emerald-400 font-semibold">✅ Alle kosten zijn momenteel gelijk verdeeld!</p>';
    return;
  }
  card.innerHTML = `<div class="space-y-1.5 text-left text-xs">${unpaidTransfers.map((item) => `
      <div class="flex justify-between items-center bg-slate-950/60 p-2 rounded-lg border border-slate-800">
        <span class="text-slate-300"><strong>${escapeHtml(item.van)}</strong> → <strong>${escapeHtml(item.naar)}</strong></span>
        <span class="font-mono font-bold text-amber-400">${formatCurrency(item.bedrag)}</span>
      </div>`).join('')}</div>`;
}

function renderGroupieTab() {
  const trip = getCurrentTrip();
  const { settlementHistory: history = [] } = tripStore.getState();
  const fallback = computeBalances(trip || {});
  const settlementState = computeSettlementState();
  const balances = settlementState.balances || fallback.balances;
  const transfers = settlementState.transfers || fallback.transfers;
  const unpaidTransfers = transfers.filter((item) => !item.isPaid);

  const transferContainer = document.getElementById('groupie-transfers-container');
  if (transferContainer) {
    transferContainer.innerHTML = unpaidTransfers.length ? unpaidTransfers.map((transfer) => `
      <div class="bg-slate-900/90 p-3.5 rounded-xl border border-amber-500/30 flex justify-between items-center gap-3">
        <div class="flex items-center gap-2 text-xs text-slate-200">
          <i data-lucide="send" class="w-4 h-4 text-amber-400"></i>
          <span><strong>${escapeHtml(transfer.van)}</strong> moet overmaken aan <strong>${escapeHtml(transfer.naar)}</strong></span>
        </div>
        <div class="flex items-center gap-2 flex-wrap justify-end">
          <span class="font-mono text-sm font-bold text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-500/20">${formatCurrency(transfer.bedrag)}</span>
          <button onclick="sharePaymentLink('${escapeHtml(transfer.van)}', '${escapeHtml(transfer.naar)}', ${transfer.bedrag})" title="Betaalverzoek Delen" class="p-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition">
            <i data-lucide="share-2" class="w-3.5 h-3.5"></i>
          </button>
          ${!isViewerRole() ? `<button onclick="markSettlementPaid('${escapeHtml(transfer.id)}')" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold">Markeer betaald</button>` : ''}
        </div>
      </div>`).join('') : '<div class="col-span-2 text-center py-4 text-xs text-slate-400">Geen openstaande verrekeningen op dit moment.</div>';
  }

  const grid = document.getElementById('groupie-persons-grid');
  if (grid && trip) {
    grid.innerHTML = trip.reizigers.map((traveller) => {
      const balance = balances[traveller] || 0;
      const statusClass = balance >= 0 ? 'text-emerald-400 border-emerald-500/30' : 'text-rose-400 border-rose-500/30';
      const statusText = balance >= 0 ? `Krijgt terug: ${formatCurrency(balance)}` : `Moet betalen: ${formatCurrency(Math.abs(balance))}`;
      return `
        <div class="glass-card rounded-2xl p-4 border space-y-3 ${statusClass}">
          <div class="flex justify-between items-center gap-2">
            <h4 class="font-bold text-white text-sm flex items-center gap-2"><i data-lucide="user" class="w-4 h-4 text-sky-400"></i> ${escapeHtml(traveller)}</h4>
            <span class="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border ${statusClass}">${statusText}</span>
          </div>
          <p class="text-[11px] text-slate-400">Status in deze trip: ${balance >= 0 ? 'Voorgeschoten geld' : 'Openstaand saldo'}</p>
        </div>`;
    }).join('');
  }

  const historyContainer = document.getElementById('settlement-history-container');
  if (historyContainer) {
    historyContainer.innerHTML = history.length
      ? history.map((item) => `<div class="flex items-center justify-between text-xs bg-slate-900/80 px-3 py-2 rounded-lg border border-slate-800"><span>${escapeHtml(item.van)} → ${escapeHtml(item.naar)}</span><span class="text-emerald-400 font-semibold">${formatCurrency(item.bedrag)} • ${formatTimeAgo(item.paidAt)}</span></div>`).join('')
      : '<p class="text-xs text-slate-500">Nog geen betaalde settlements.</p>';
  }

  refreshIcons();
}

function renderPlanning() {
  const trip = getCurrentTrip();
  const tbody = document.getElementById('planning-tbody');
  if (!tbody) return;
  if (!trip) {
    tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-slate-500">Geen trip geselecteerd.</td></tr>';
    return;
  }

  const query = (document.getElementById('planning-search')?.value || '').toLowerCase();
  const days = trip.planning.filter((day) =>
    day.plaats.toLowerCase().includes(query) ||
    day.activiteit.toLowerCase().includes(query) ||
    day.dag.toLowerCase().includes(query)
  );

  tbody.innerHTML = days.length ? days.map((day) => `
    <tr class="hover:bg-slate-800/40 transition">
      <td class="p-3 font-mono text-slate-400">${escapeHtml(day.datum)}</td>
      <td class="p-3 font-semibold text-sky-300">${escapeHtml(day.dag)}</td>
      <td class="p-3 font-bold text-white">${escapeHtml(day.plaats)}</td>
      <td class="p-3 text-slate-300">${escapeHtml(day.activiteit)}</td>
      <td class="p-3 text-slate-400">${escapeHtml(day.van || '-')} → ${escapeHtml(day.naar || '-')}</td>
      <td class="p-3">${day.van && day.naar ? `<button onclick="openGoogleMapsRoute('${escapeHtml(day.van)}', '${escapeHtml(day.naar)}')" class="px-2 py-1 bg-sky-950/80 hover:bg-sky-900 text-sky-300 rounded border border-sky-800/80 text-[11px] flex items-center gap-1"><i data-lucide="navigation" class="w-3 h-3"></i> Route</button>` : '-'}</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 border border-slate-700">${escapeHtml(day.type || 'Dag')}</span></td>
      <td class="p-3 text-center">${!isViewerRole() ? `<button onclick="deletePlanningDay('${escapeHtml(day.id)}')" class="p-1 hover:bg-rose-950/50 text-rose-400 rounded"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>` : '-'}</td>
    </tr>`).join('') : '<tr><td colspan="8" class="p-6 text-center text-slate-500">Geen planning gevonden.</td></tr>';
  refreshIcons();
}

async function fetchCoordinates(placeName) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(placeName)}`);
    const data = await response.json();
    if (data?.length) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch {
    return null;
  }
  return null;
}

async function initOrUpdateMap() {
  const mapContainer = document.getElementById('trip-leaflet-map');
  const trip = getCurrentTrip();
  if (!mapContainer || !trip) return;
  if (!window.L?.map) {
    mapContainer.innerHTML = '<div class="h-full flex items-center justify-center text-xs text-slate-500">Kaart tijdelijk niet beschikbaar.</div>';
    return;
  }

  if (!runtime.leafletMapInstance) {
    runtime.leafletMapInstance = window.L.map('trip-leaflet-map').setView([20, 0], 2);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(runtime.leafletMapInstance);
  }

  runtime.leafletMapInstance.eachLayer((layer) => {
    if (layer instanceof window.L.Marker || layer instanceof window.L.Polyline) {
      runtime.leafletMapInstance.removeLayer(layer);
    }
  });

  const latLngs = [];
  for (const day of trip.planning) {
    const coords = await fetchCoordinates(day.plaats);
    if (coords) {
      latLngs.push(coords);
      window.L.marker(coords).addTo(runtime.leafletMapInstance)
        .bindPopup(`<strong>${escapeHtml(day.dag)} (${escapeHtml(day.datum)})</strong><br><b>${escapeHtml(day.plaats)}</b><br><span class="text-xs">${escapeHtml(day.activiteit)}</span>`);
    }
  }

  if (latLngs.length) {
    window.L.polyline(latLngs, { color: '#0ea5e9', weight: 4, opacity: 0.8, dashArray: '6, 8' }).addTo(runtime.leafletMapInstance);
    runtime.leafletMapInstance.fitBounds(window.L.latLngBounds(latLngs), { padding: [50, 50] });
  }
}

function refreshRouteMap() {
  window.setTimeout(() => {
    if (runtime.leafletMapInstance) runtime.leafletMapInstance.invalidateSize();
    initOrUpdateMap();
  }, 250);
}

function renderKosten() {
  const trip = getCurrentTrip();
  const tbody = document.getElementById('kosten-tbody');
  if (!tbody) return;
  if (!trip || !trip.kosten.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-500">Nog geen uitgaven ingevoerd.</td></tr>';
    return;
  }
  tbody.innerHTML = trip.kosten.map((expense) => `
    <tr class="hover:bg-slate-800/40 transition">
      <td class="p-3 font-semibold text-white">${escapeHtml(expense.omschrijving)}</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-sky-300 border border-slate-700">${escapeHtml(expense.categorie)}</span></td>
      <td class="p-3 text-slate-300 font-medium">${escapeHtml(expense.betaaldDoor)}</td>
      <td class="p-3 text-right font-mono text-slate-400">${escapeHtml(expense.valuta)} ${expense.bedrag.toFixed(2)}</td>
      <td class="p-3 text-right font-mono font-bold text-emerald-400">${formatCurrency(expense.omgerekendeEUR)}</td>
      <td class="p-3 text-center text-slate-400">${escapeHtml(expense.verdeeldOver.join(', '))}</td>
      <td class="p-3 text-center">${!isViewerRole() ? `<button onclick="deleteKostenItem('${escapeHtml(expense.id)}')" class="p-1 hover:bg-rose-950/50 text-rose-400 rounded"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>` : '-'}</td>
    </tr>`).join('');
  refreshIcons();
}

function renderBudget() {
  const trip = getCurrentTrip();
  const tbody = document.getElementById('budget-tbody');
  const canvas = document.getElementById('budgetvsActualChart');
  if (!trip || !tbody || !canvas) return;

  const { categories, budget, actuals } = budgetActuals(trip);
  tbody.innerHTML = categories.length ? categories.map((category) => {
    const actual = safeNumber(actuals[category]);
    const budgeted = safeNumber(budget[category]);
    const isOver = actual > budgeted;
    return `<tr class="hover:bg-slate-800/40 transition"><td class="p-2.5 font-semibold text-slate-200">${escapeHtml(category)}</td><td class="p-2.5 text-right font-mono text-slate-400">${formatCurrency(budgeted)}</td><td class="p-2.5 text-right font-mono font-bold ${isOver ? 'text-rose-400' : 'text-emerald-400'}">${formatCurrency(actual)}</td></tr>`;
  }).join('') : '<tr><td colspan="3" class="p-4 text-center text-slate-500">Nog geen budget beschikbaar.</td></tr>';

  if (typeof window.Chart !== 'function') return;
  if (runtime.budgetChartInstance) runtime.budgetChartInstance.destroy();
  runtime.budgetChartInstance = new window.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: categories,
      datasets: [
        { label: 'Geraamd Budget (€)', data: categories.map((category) => safeNumber(budget[category])), backgroundColor: 'rgba(14, 165, 233, 0.6)' },
        { label: 'Werkelijke Kosten (€)', data: categories.map((category) => safeNumber(actuals[category])), backgroundColor: 'rgba(236, 72, 153, 0.7)' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#cbd5e1' } } },
      scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } },
    },
  });
}

function renderBoekingen() {
  const trip = getCurrentTrip();
  const tbody = document.getElementById('boekingen-tbody');
  if (!tbody) return;
  if (!trip || !trip.boekingen.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-500">Nog geen boekingen toegevoegd.</td></tr>';
    return;
  }
  tbody.innerHTML = trip.boekingen.map((booking) => `
    <tr class="hover:bg-slate-800/40 transition">
      <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-700/60 font-semibold">${escapeHtml(booking.type)}</span></td>
      <td class="p-3 font-bold text-white">${escapeHtml(booking.leverancier)}</td>
      <td class="p-3 font-mono text-slate-400">${escapeHtml(booking.datum)}</td>
      <td class="p-3 text-slate-300">${escapeHtml(booking.vanNaar)}</td>
      <td class="p-3 text-right font-mono font-bold text-sky-300">${formatCurrency(booking.bedrag)}</td>
      <td class="p-3">${!isViewerRole() ? `<button onclick="toggleBoekingStatus('${escapeHtml(booking.id)}')" class="px-2 py-0.5 rounded-full text-[10px] ${booking.isGeboekt ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-amber-950 text-amber-300 border border-amber-800'}">${booking.isGeboekt ? 'Geboekt' : 'In Optie'}</button>` : (booking.isGeboekt ? 'Geboekt' : 'In Optie')}</td>
      <td class="p-3 text-center">${!isViewerRole() ? `<button onclick="deleteBoeking('${escapeHtml(booking.id)}')" class="p-1 hover:bg-rose-950/50 text-rose-400 rounded"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>` : '-'}</td>
    </tr>`).join('');
  refreshIcons();
}

function renderChecklist() {
  const trip = getCurrentTrip();
  const container = document.getElementById('checklist-items-container');
  if (!container) return;
  if (!trip || !trip.checklist.length) {
    container.innerHTML = '<p class="text-center text-slate-500 py-4 text-xs">Geen checklist-items beschikbaar.</p>';
    return;
  }
  container.innerHTML = trip.checklist.map((item) => `
    <div class="flex items-center justify-between p-3 bg-slate-900/80 rounded-xl border border-slate-800 hover:border-slate-700 transition">
      <label class="flex items-center gap-3 cursor-pointer text-xs text-slate-200">
        <input type="checkbox" ${item.done ? 'checked' : ''} onchange="toggleChecklistItem('${escapeHtml(item.id)}')" ${isViewerRole() ? 'disabled' : ''} class="w-4 h-4 rounded bg-slate-950 border-slate-700 text-sky-600 focus:ring-0">
        <span class="${item.done ? 'line-through text-slate-500' : 'font-medium'}">${escapeHtml(item.text)}</span>
      </label>
      ${!isViewerRole() ? `<button onclick="deleteChecklistItem('${escapeHtml(item.id)}')" class="text-slate-500 hover:text-rose-400 p-1"><i data-lucide="x" class="w-4 h-4"></i></button>` : ''}
    </div>`).join('');
  refreshIcons();
}

function renderReisinfo() {
  const trip = getCurrentTrip();
  const notes = document.getElementById('info-notes');
  if (notes) notes.value = trip?.reisinfoNotes || '';
}

async function fetchDestinationWeather() {
  const trip = getCurrentTrip();
  if (!trip) return;
  const mainCity = trip.planning?.[0]?.plaats || trip.titel;
  const locationLabel = document.getElementById('weather-location');
  const temperatureLabel = document.getElementById('weather-temp');
  if (locationLabel) locationLabel.textContent = mainCity;

  try {
    const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(mainCity)}&count=1`);
    const geoData = await geoResponse.json();
    if (!geoData?.results?.length) throw new Error('Geen locatie gevonden');
    const { latitude, longitude } = geoData.results[0];
    const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
    const weatherData = await weatherResponse.json();
    if (!weatherData?.current_weather) throw new Error('Geen weerdata');
    if (temperatureLabel) temperatureLabel.textContent = `${Math.round(weatherData.current_weather.temperature)}°C | Wind ${weatherData.current_weather.windspeed} km/h`;
  } catch {
    if (temperatureLabel) temperatureLabel.textContent = 'Weer tijdelijk niet beschikbaar';
  }
}

function calculateCurrency() {
  const amount = safeNumber(document.getElementById('curr-amount')?.value);
  const currency = document.getElementById('curr-type')?.value || 'EUR';
  const result = document.getElementById('curr-result');
  const rate = tripStore.getState().exchangeRates[currency];
  if (!result) return;
  if (!rate) {
    result.textContent = 'Koers niet beschikbaar';
    return;
  }
  result.textContent = formatCurrency(amount / rate);
}

const persistTripNotes = debounce(async (tripId, notes) => {
  await tripsApi.updateTrip(tripId, { notes });
}, 600);

function saveReisinfo() {
  const trip = getCurrentTrip();
  const notesField = document.getElementById('info-notes');
  if (!trip || !notesField) return;
  trip.reisinfoNotes = notesField.value;
  upsertCurrentTrip({ ...trip });
  if (!isViewerRole()) {
    persistTripNotes(trip.id, notesField.value).catch((error) => showToast(error.message, 'error'));
  }
}

function exportTravelPDF() {
  window.print();
}

function exportAllCSV() {
  const trip = getCurrentTrip();
  if (!trip) return;
  let csv = 'Categorie,Omschrijving,Voorgeschoten Door,Bedrag Origineel,Valuta,Bedrag EUR\n';
  trip.kosten.forEach((expense) => {
    csv += `"${expense.categorie}","${expense.omschrijving}","${expense.betaaldDoor}",${expense.bedrag},"${expense.valuta}",${expense.omgerekendeEUR}\n`;
  });
  const link = document.createElement('a');
  link.href = encodeURI(`data:text/csv;charset=utf-8,${csv}`);
  link.download = `uitgaven_${trip.titel.toLowerCase().replace(/\s+/g, '_')}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast('CSV bestand gedownload!');
}

function exportJSON() {
  const payload = JSON.stringify(tripStore.getState().trips, null, 2);
  const link = document.createElement('a');
  link.href = `data:text/json;charset=utf-8,${encodeURIComponent(payload)}`;
  link.download = `globetrottr_backup_${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast('JSON-export succesvol opgeslagen!');
}

async function importJSON(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  showToast('JSON-import wordt niet ondersteund in de API-versie.', 'error');
  event.target.value = '';
}

async function promptResetTrip() {
  const trip = getCurrentTrip();
  if (!trip || isViewerRole()) return;
  if (!window.confirm(`Weet je zeker dat je "${trip.titel}" wilt verwijderen?`)) return;
  await tripsApi.deleteTrip(trip.id);
  const remainingTrips = tripStore.getState().trips.filter((item) => String(item.id) !== String(trip.id));
  tripStore.setState({ trips: remainingTrips, currentTrip: null, currentTripId: remainingTrips[0]?.id || null });
  if (remainingTrips[0]) {
    await loadTripContext(remainingTrips[0].id, { showLoader: false });
  } else {
    renderAllViews();
  }
  showToast('Reis verwijderd.');
}

function openSaaSPricingModal() {
  const currentPlan = workspaceStore.getState().currentWorkspace?.plan || authStore.getState().plan || 'Free';
  openModal('Abonnementen', `
    <div class="space-y-4 text-xs text-slate-300">
      <p>Huidig abonnement: <strong class="text-white">${escapeHtml(currentPlan)}</strong></p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center"><h4 class="font-bold text-white">Free</h4><div class="text-xl font-mono text-slate-300">€0</div><p class="text-[11px] text-slate-500">Basisfunctionaliteit</p></div>
        <div class="p-4 bg-slate-950 rounded-xl border border-sky-500/40 text-center"><h4 class="font-bold text-white">Paid</h4><div class="text-xl font-mono text-sky-400">€7,50 / mnd</div><p class="text-[11px] text-slate-400">Publieke trip-pagina, onbeperkte trips</p></div>
        <div class="p-4 bg-slate-950 rounded-xl border border-indigo-500/40 text-center"><h4 class="font-bold text-white">White-label</h4><div class="text-xl font-mono text-indigo-400">€29,99 / mnd</div><p class="text-[11px] text-slate-400">Eigen domein en branding</p></div>
      </div>
      <p class="text-slate-500">Planwijzigingen verlopen via de backend billing-flow.</p>
    </div>`, null);
}

function selectPlan() {
  showToast('Planwijziging verloopt via de backend billing-flow.');
}

function openRoleSimulatorModal() {
  const members = workspaceStore.getState().members;
  openModal('Workspace rollen', `
    <div class="space-y-3 text-xs text-slate-300">
      <p>Je bent ingelogd als <strong class="text-white">${escapeHtml(authStore.getState().role || 'Viewer')}</strong>.</p>
      <div class="space-y-2">${members.length ? members.map((member) => `<div class="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between"><span>${escapeHtml(member.name)}</span><span class="text-sky-300">${escapeHtml(member.role)}</span></div>`).join('') : '<p class="text-slate-500">Geen leden gevonden.</p>'}</div>
    </div>`, null);
}

async function openWhiteLabelModal() {
  if (!canManageWorkspace()) {
    showToast('Alleen workspace-beheerders kunnen branding aanpassen.', 'error');
    return;
  }
  const workspace = workspaceStore.getState().currentWorkspace;
  openModal('White-label branding', `
    <div class="space-y-3">
      <div><label class="block text-slate-400 text-xs mb-1">Applicatienaam</label><input type="text" id="brand-name-input" value="${escapeHtml(workspace?.branding?.appName || workspace?.name || 'GlobeTrotr')}" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"></div>
      <div><label class="block text-slate-400 text-xs mb-1">Custom domein</label><input type="text" id="brand-domain-input" value="${escapeHtml(workspace?.branding?.domain || workspace?.domain || '')}" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"></div>
    </div>`, async () => {
    const name = document.getElementById('brand-name-input').value.trim();
    const domain = document.getElementById('brand-domain-input').value.trim();
    if (!name) throw new Error('Een merknaam is verplicht.');
    await workspacesApi.updateBranding(workspace.id, { appName: name, domain });
    workspaceStore.setState({ currentWorkspace: { ...workspace, branding: { ...workspace.branding, appName: name, domain } } });
    updateHeader();
    closeModal();
    showToast('Branding opgeslagen!');
  });
}

function openSecuritySettingsModal() {
  openModal('PIN beveiliging', `
    <div class="space-y-3">
      <p class="text-xs text-slate-300">Stel een 4- tot 6-cijferige PIN-code in om deze webapp lokaal op je apparaat te beveiligen.</p>
      <div><label class="block text-slate-400 text-xs mb-1">Nieuwe PIN-code (of leeg om uit te schakelen)</label><input type="password" id="new-pin-input" maxlength="6" value="${escapeHtml(runtime.appLockPin || '')}" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-center text-xl font-mono text-white"></div>
    </div>`, async () => {
    const pin = document.getElementById('new-pin-input').value.trim();
    if (!validatePin(pin)) throw new Error('Gebruik 4 tot 6 cijfers voor de PIN-code.');
    runtime.appLockPin = pin || null;
    if (runtime.appLockPin) {
      window.localStorage.setItem('gt_saas_pin', runtime.appLockPin);
      showToast('PIN-beveiliging ingeschakeld!');
    } else {
      window.localStorage.removeItem('gt_saas_pin');
      showToast('PIN-beveiliging uitgeschakeld!');
    }
    closeModal();
  });
}

function unlockApp() {
  const input = document.getElementById('pin-input').value;
  if (input === runtime.appLockPin) {
    document.getElementById('pin-lock-screen').classList.add('hidden');
    document.getElementById('pin-error').classList.add('hidden');
    document.getElementById('pin-input').value = '';
  } else {
    document.getElementById('pin-error').classList.remove('hidden');
  }
}

function openSaaSMetricsModal() {
  const trip = getCurrentTrip();
  const settlementState = computeSettlementState();
  openModal('Workspace statistieken', `
    <div class="space-y-4 text-xs">
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center"><span class="text-slate-400 block text-[10px]">Totaal trips</span><span class="text-xl font-mono font-bold text-sky-400">${tripStore.getState().trips.length}</span></div>
        <div class="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-center"><span class="text-slate-400 block text-[10px]">Open settlements</span><span class="text-xl font-mono font-bold text-amber-400">${settlementState.transfers.filter((item) => !item.isPaid).length}</span></div>
      </div>
      <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
        <div class="flex justify-between text-slate-400"><span>Actieve reizigers:</span><strong class="text-emerald-400 font-mono">${trip?.reizigers.length || 0}</strong></div>
        <div class="flex justify-between text-slate-400"><span>Totaal uitgaven:</span><strong class="text-sky-400 font-mono">${formatCurrency(settlementState.totalTripCost || 0)}</strong></div>
      </div>
    </div>`, null);
}

async function openAddTripModal() {
  if (isViewerRole()) {
    showToast('Je hebt geen rechten om trips aan te maken.', 'error');
    return;
  }
  openModal('Nieuwe reis toevoegen', `
    <div class="space-y-3">
      <div><label class="block text-slate-400 text-xs mb-1">Naam van de reis</label><input type="text" id="new-trip-titel" placeholder="bijv. Bali Backpacking 2026" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"></div>
      <div><label class="block text-slate-400 text-xs mb-1">Type reis</label><select id="new-trip-type" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"><option value="Roadtrip">Roadtrip</option><option value="Backpacken">Backpacken</option><option value="Stedentrip">Stedentrip</option><option value="Strand & Resort">Strand & Resort</option><option value="Zakenreis">Zakenreis</option></select></div>
      <div><label class="block text-slate-400 text-xs mb-1">Startdatum</label><input type="date" id="new-trip-start" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"></div>
      <div><label class="block text-slate-400 text-xs mb-1">Reizigers (kommagescheiden)</label><input type="text" id="new-trip-reizigers" placeholder="Jan, Lisa" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"></div>
    </div>`, async () => {
    const titel = document.getElementById('new-trip-titel').value.trim();
    const type = document.getElementById('new-trip-type').value;
    const startDate = document.getElementById('new-trip-start').value;
    const travellers = document.getElementById('new-trip-reizigers').value.split(',').map((name) => name.trim()).filter(Boolean);
    const titleError = requireValue(titel, 'Reisnaam');
    if (titleError) throw new Error(titleError);
    const dateError = requireValue(startDate, 'Startdatum');
    if (dateError) throw new Error(dateError);
    const payload = await tripsApi.createTrip({
      title: titel,
      type,
      startDate,
      members: travellers.map((name) => ({ name })),
      workspaceId: workspaceStore.getState().currentWorkspace?.id,
    });
    const createdTrip = normaliseTrip(unwrapObject(payload, ['trip', 'data']) || { title: titel, type, startDate, members: travellers });
    upsertCurrentTrip(createdTrip);
    closeModal();
    await loadTripContext(createdTrip.id, { showLoader: false });
    showToast(`Reis "${titel}" succesvol aangemaakt!`);
  });
}

async function openAddDayModal() {
  const trip = getCurrentTrip();
  if (!trip || isViewerRole()) return;
  openModal('Planning dag toevoegen', `
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-2"><div><label class="block text-slate-400 text-xs mb-1">Datum</label><input type="date" id="day-datum" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"></div><div><label class="block text-slate-400 text-xs mb-1">Dag label</label><input type="text" id="day-dag" placeholder="Dag 1" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"></div></div>
      <div><label class="block text-slate-400 text-xs mb-1">Plaats</label><input type="text" id="day-plaats" placeholder="bijv. Stockholm, Zweden" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"></div>
      <div><label class="block text-slate-400 text-xs mb-1">Activiteit</label><input type="text" id="day-activiteit" placeholder="Stadswandeling" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"></div>
    </div>`, async () => {
    const payload = {
      date: document.getElementById('day-datum').value,
      label: document.getElementById('day-dag').value.trim(),
      location: document.getElementById('day-plaats').value.trim(),
      activity: document.getElementById('day-activiteit').value.trim(),
      type: 'Dag',
    };
    const placeError = requireValue(payload.location, 'Plaats');
    if (placeError) throw new Error(placeError);
    const response = await daysApi.createDay(trip.id, payload);
    const day = normaliseDay(unwrapObject(response, ['day', 'data']) || payload, trip.planning.length);
    const updatedTrip = { ...trip, planning: [...trip.planning, day] };
    upsertCurrentTrip(updatedTrip);
    closeModal();
    renderPlanning();
    refreshRouteMap();
    showToast('Dag toegevoegd aan planning!');
  });
}

function currencyOptionsMarkup() {
  return SUPPORTED_CURRENCIES.map((currency) => `<option value="${currency.code}">${currency.label}</option>`).join('');
}

async function openAddKostenModal() {
  const trip = getCurrentTrip();
  if (!trip || isViewerRole()) return;
  openModal('Uitgave toevoegen', `
    <div class="space-y-3">
      <div><label class="block text-slate-400 text-xs mb-1">Omschrijving uitgave</label><input type="text" id="kosten-omschrijving" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"></div>
      <div class="grid grid-cols-2 gap-2"><div><label class="block text-slate-400 text-xs mb-1">Bedrag</label><input type="number" step="0.01" id="kosten-bedrag" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"></div><div><label class="block text-slate-400 text-xs mb-1">Valuta</label><select id="kosten-valuta" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white">${currencyOptionsMarkup()}</select></div></div>
      <div class="grid grid-cols-2 gap-2"><div><label class="block text-slate-400 text-xs mb-1">Categorie</label><select id="kosten-categorie" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white">${EXPENSE_CATEGORIES.map((category) => `<option value="${category}">${category}</option>`).join('')}</select></div><div><label class="block text-slate-400 text-xs mb-1">Voorgeschoten door</label><select id="kosten-payer" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white">${trip.reizigers.map((traveller) => `<option value="${traveller}">${traveller}</option>`).join('')}</select></div></div>
    </div>`, async () => {
    const omschrijving = document.getElementById('kosten-omschrijving').value.trim();
    const bedrag = safeNumber(document.getElementById('kosten-bedrag').value);
    const valuta = document.getElementById('kosten-valuta').value;
    const categorie = document.getElementById('kosten-categorie').value;
    const betaaldDoor = document.getElementById('kosten-payer').value;
    const descriptionError = requireValue(omschrijving, 'Omschrijving');
    if (descriptionError) throw new Error(descriptionError);
    if (!validateAmount(bedrag)) throw new Error('Voer een geldig bedrag in.');
    const rate = tripStore.getState().exchangeRates[valuta] || 1;
    const payload = {
      description: omschrijving,
      amount: bedrag,
      currency: valuta,
      amountInEur: bedrag / rate,
      category: categorie,
      paidBy: betaaldDoor,
      splitBetween: trip.reizigers,
    };
    const response = await expensesApi.createExpense(trip.id, payload);
    const expense = normaliseExpense(unwrapObject(response, ['expense', 'data']) || payload, trip.kosten.length);
    const updatedTrip = { ...trip, kosten: [...trip.kosten, expense] };
    upsertCurrentTrip(updatedTrip);
    closeModal();
    renderAllViews();
    showToast('Uitgave succesvol opgeslagen!');
  });
}

async function openAddBoekingModal() {
  const trip = getCurrentTrip();
  if (!trip || isViewerRole()) return;
  openModal('Boeking toevoegen', `
    <div class="space-y-3">
      <div><label class="block text-slate-400 text-xs mb-1">Type boeking</label><select id="boeking-type" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white">${BOOKING_TYPES.map((type) => `<option value="${type}">${type}</option>`).join('')}</select></div>
      <div><label class="block text-slate-400 text-xs mb-1">Leverancier</label><input type="text" id="boeking-leverancier" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"></div>
      <div class="grid grid-cols-2 gap-2"><div><label class="block text-slate-400 text-xs mb-1">Datum</label><input type="date" id="boeking-datum" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"></div><div><label class="block text-slate-400 text-xs mb-1">Kosten (€)</label><input type="number" step="0.01" id="boeking-bedrag" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"></div></div>
      <div><label class="block text-slate-400 text-xs mb-1">Van → Naar / Locatie</label><input type="text" id="boeking-vannaar" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"></div>
    </div>`, async () => {
    const leverancier = document.getElementById('boeking-leverancier').value.trim();
    const amount = safeNumber(document.getElementById('boeking-bedrag').value);
    const supplierError = requireValue(leverancier, 'Leverancier');
    if (supplierError) throw new Error(supplierError);
    if (!validateAmount(amount)) throw new Error('Voer een geldig boekingsbedrag in.');
    const payload = {
      type: document.getElementById('boeking-type').value,
      provider: leverancier,
      date: document.getElementById('boeking-datum').value,
      amount,
      route: document.getElementById('boeking-vannaar').value.trim(),
      isBooked: true,
    };
    const response = await bookingsApi.createBooking(trip.id, payload);
    const booking = normaliseBooking(unwrapObject(response, ['booking', 'data']) || payload, trip.boekingen.length);
    upsertCurrentTrip({ ...trip, boekingen: [...trip.boekingen, booking] });
    closeModal();
    renderBoekingen();
    showToast('Boeking opgeslagen!');
  });
}

async function openAddChecklistItemModal() {
  const trip = getCurrentTrip();
  if (!trip || isViewerRole()) return;
  openModal('Checklist-item toevoegen', `
    <div><label class="block text-slate-400 text-xs mb-1">Paklijst item / taak</label><input type="text" id="checklist-item-text" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"></div>`, async () => {
    const text = document.getElementById('checklist-item-text').value.trim();
    const textError = requireValue(text, 'Checklist-item');
    if (textError) throw new Error(textError);
    const response = await checklistsApi.createChecklistItem(trip.id, { text, completed: false });
    const item = normaliseChecklistItem(unwrapObject(response, ['item', 'data']) || { text, completed: false }, trip.checklist.length);
    upsertCurrentTrip({ ...trip, checklist: [...trip.checklist, item] });
    closeModal();
    renderChecklist();
    showToast('Item toegevoegd aan checklist!');
  });
}

function openChecklistTemplateModal() {
  if (isViewerRole()) {
    showToast('Je hebt geen rechten om templates toe te passen.', 'error');
    return;
  }
  openModal('Checklist template kiezen', `
    <div class="space-y-3">
      <p class="text-xs text-slate-300">Selecteer een kant-en-klaar sjabloon:</p>
      ${Object.entries({ winter: '❄️ Winter & Ski', zomer: '🏖️ Zomer & Strand', city: '🏙️ Stedentrip' }).map(([key, label]) => `<button onclick="applyChecklistTemplate('${key}')" class="w-full text-left p-3 bg-slate-950 hover:bg-slate-800 rounded-xl border border-slate-800 flex items-center justify-between"><span class="text-xs text-white font-semibold">${label}</span><i data-lucide="chevron-right" class="w-4 h-4 text-sky-400"></i></button>`).join('')}
    </div>`, null);
}

async function applyChecklistTemplate(type) {
  const trip = getCurrentTrip();
  const items = CHECKLIST_TEMPLATES[type] || [];
  const existing = new Set(trip.checklist.map((item) => item.text));
  const missing = items.filter((item) => !existing.has(item));
  await Promise.all(missing.map((text) => checklistsApi.createChecklistItem(trip.id, { text, completed: false })));
  await loadTripContext(trip.id, { showLoader: false });
  closeModal();
  showToast('Template-items toegevoegd!');
}

async function openManageReizigersModal() {
  const trip = getCurrentTrip();
  if (!trip || isViewerRole()) {
    showToast('Je hebt geen rechten om reizigers te beheren.', 'error');
    return;
  }
  openModal('Reizigers beheren', `
    <div class="space-y-3"><p class="text-xs text-slate-300">Voer de namen in van de reizigers (kommagescheiden):</p><input type="text" id="reizigers-input" value="${escapeHtml(trip.reizigers.join(', '))}" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"></div>`, async () => {
    const names = document.getElementById('reizigers-input').value.split(',').map((name) => name.trim()).filter(Boolean);
    if (!names.length) throw new Error('Voer minimaal één reiziger in.');
    await tripsApi.updateTrip(trip.id, { members: names.map((name) => ({ name })) });
    upsertCurrentTrip({ ...trip, reizigers: names, members: names.map(normaliseMember) });
    closeModal();
    renderAllViews();
    showToast('Reizigerslijst bijgewerkt!');
  });
}

function openGoogleMapsRoute(van, naar) {
  window.open(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(van)}&destination=${encodeURIComponent(naar)}`, '_blank');
}

async function deletePlanningDay(id) {
  const trip = getCurrentTrip();
  if (!trip || isViewerRole()) return;
  await daysApi.deleteDay(trip.id, id);
  upsertCurrentTrip({ ...trip, planning: trip.planning.filter((day) => String(day.id) !== String(id)) });
  renderPlanning();
  refreshRouteMap();
}

async function deleteKostenItem(id) {
  const trip = getCurrentTrip();
  if (!trip || isViewerRole()) return;
  await expensesApi.deleteExpense(trip.id, id);
  upsertCurrentTrip({ ...trip, kosten: trip.kosten.filter((expense) => String(expense.id) !== String(id)) });
  renderAllViews();
}

async function toggleBoekingStatus(id) {
  const trip = getCurrentTrip();
  if (!trip || isViewerRole()) return;
  const booking = trip.boekingen.find((item) => String(item.id) === String(id));
  if (!booking) return;
  const response = await bookingsApi.updateBooking(trip.id, id, { isBooked: !booking.isGeboekt });
  const updatedBooking = normaliseBooking(unwrapObject(response, ['booking', 'data']) || { ...booking, isBooked: !booking.isGeboekt });
  upsertCurrentTrip({ ...trip, boekingen: trip.boekingen.map((item) => (String(item.id) === String(id) ? updatedBooking : item)) });
  renderBoekingen();
}

async function deleteBoeking(id) {
  const trip = getCurrentTrip();
  if (!trip || isViewerRole()) return;
  await bookingsApi.deleteBooking(trip.id, id);
  upsertCurrentTrip({ ...trip, boekingen: trip.boekingen.filter((item) => String(item.id) !== String(id)) });
  renderBoekingen();
  showToast('Boeking verwijderd.');
}

async function toggleChecklistItem(id) {
  const trip = getCurrentTrip();
  if (!trip || isViewerRole()) return;
  const item = trip.checklist.find((entry) => String(entry.id) === String(id));
  if (!item) return;
  const response = await checklistsApi.updateChecklistItem(trip.id, id, { completed: !item.done });
  const updatedItem = normaliseChecklistItem(unwrapObject(response, ['item', 'data']) || { ...item, completed: !item.done });
  upsertCurrentTrip({ ...trip, checklist: trip.checklist.map((entry) => (String(entry.id) === String(id) ? updatedItem : entry)) });
  renderChecklist();
}

async function deleteChecklistItem(id) {
  const trip = getCurrentTrip();
  if (!trip || isViewerRole()) return;
  await checklistsApi.deleteChecklistItem(trip.id, id);
  upsertCurrentTrip({ ...trip, checklist: trip.checklist.filter((item) => String(item.id) !== String(id)) });
  renderChecklist();
}

function sharePaymentLink(van, naar, bedrag) {
  const trip = getCurrentTrip();
  const text = `Hoi ${van}, zou je ${formatCurrency(bedrag)} willen overmaken aan ${naar} voor de kosten van onze trip \"${trip?.titel || 'GlobeTrotr'}\"? Bedankt!`;
  if (navigator.share) navigator.share({ title: 'Betaalverzoek GlobeTrotr', text });
  else navigator.clipboard.writeText(text).then(() => showToast('Betaalverzoek gekopieerd naar klembord!'));
}

async function markSettlementPaid(settlementId) {
  const trip = getCurrentTrip();
  if (!trip || isViewerRole()) return;
  const settlement = tripStore.getState().settlements.find((item) => String(item.id) === String(settlementId));
  if (!settlement) {
    showToast('Geen settlement gevonden om bij te werken.', 'error');
    return;
  }
  await settlementsApi.markAsPaid(trip.id, settlementId, { paid: true });
  tripStore.setState({
    settlements: tripStore.getState().settlements.map((item) => (String(item.id) === String(settlementId) ? { ...item, isPaid: true, paidAt: new Date().toISOString() } : item)),
    settlementHistory: [...tripStore.getState().settlementHistory, { ...settlement, paidAt: new Date().toISOString() }],
  });
  renderGroupieTab();
  renderGroupieSettlementSummary();
  showToast('Settlement gemarkeerd als betaald!');
}

function switchTab(tabId) {
  uiStore.setState({ activeTab: tabId });
  persistActiveTab(tabId);
  document.querySelectorAll('.tab-content').forEach((element) => element.classList.remove('active'));
  document.getElementById(`tab-${tabId}`)?.classList.add('active');
  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.classList.remove('bg-sky-600', 'text-white');
    button.classList.add('text-slate-400');
  });
  document.querySelectorAll('[id^="mob-tab-"]').forEach((button) => button.classList.remove('text-sky-400'));
  document.getElementById(`tab-btn-${tabId}`)?.classList.add('bg-sky-600', 'text-white');
  document.getElementById(`tab-btn-${tabId}`)?.classList.remove('text-slate-400');
  document.getElementById(`mob-tab-${tabId}`)?.classList.add('text-sky-400');
  if (tabId === 'map') refreshRouteMap();
}

async function loadExchangeRates() {
  try {
    const payload = await apiRequest(ENDPOINTS.exchangeRates, { skipAuthRedirect: true });
    const rates = payload?.rates || payload?.data?.rates || payload || { EUR: 1 };
    tripStore.setState({ exchangeRates: { EUR: 1, ...rates } });
  } catch {
    tripStore.setState({ exchangeRates: { EUR: 1 } });
  }
  calculateCurrency();
}

async function loadProfile() {
  const payload = await authApi.getProfile();
  const user = payload?.user || payload?.data?.user || payload?.profile || payload?.data || {};
  authStore.setState({
    user,
    token: getStoredToken(),
    refreshToken: getStoredRefreshToken(),
    isLoggedIn: true,
    role: user.role || payload?.role || 'Viewer',
    plan: user.plan || payload?.plan || 'Free',
  });
}

async function loadWorkspace() {
  let workspace = null;
  let members = [];
  try {
    const payload = await workspacesApi.listWorkspaces();
    const workspaces = unwrapList(payload, ['workspaces']);
    workspace = normaliseWorkspace(workspaces[0] || authStore.getState().user?.workspace || {});
    if (workspace?.id) {
      const membersPayload = await workspacesApi.getMembers(workspace.id);
      members = unwrapList(membersPayload, ['members']).map(normaliseMember);
    }
  } catch {
    workspace = normaliseWorkspace(authStore.getState().user?.workspace || {});
  }
  workspaceStore.setState({ currentWorkspace: workspace, members });
  updateHeader();
}

async function loadTrips() {
  const workspaceId = workspaceStore.getState().currentWorkspace?.id;
  const payload = await tripsApi.listTrips(workspaceId);
  const trips = unwrapList(payload, ['trips']).map(normaliseTrip);
  const lastTripId = readLastTrip();
  const currentTripId = trips.find((trip) => String(trip.id) === String(lastTripId))?.id || trips[0]?.id || null;
  tripStore.setState({ trips, currentTripId, currentTrip: trips.find((trip) => String(trip.id) === String(currentTripId)) || null });
}

async function loadTripContext(tripId, { showLoader = true } = {}) {
  if (!tripId) {
    renderAllViews();
    return;
  }
  hideGlobalError();
  if (showLoader) setLoading(true, 'Reisgegevens laden...');
  try {
    const [tripResult, expensesResult, daysResult, bookingsResult, settlementsResult, checklistResult] = await Promise.allSettled([
      tripsApi.getTrip(tripId),
      expensesApi.listExpenses(tripId),
      daysApi.listDays(tripId),
      bookingsApi.listBookings(tripId),
      settlementsApi.getBalances(tripId),
      checklistsApi.listChecklistItems(tripId),
    ]);

    const tripSummary = tripStore.getState().trips.find((item) => String(item.id) === String(tripId));
    const trip = normaliseTrip(
      tripResult.status === 'fulfilled'
        ? unwrapObject(tripResult.value, ['trip', 'data']) || tripSummary
        : tripSummary,
    );

    const costs = expensesResult.status === 'fulfilled' ? unwrapList(expensesResult.value, ['expenses']).map(normaliseExpense) : trip.kosten;
    const days = daysResult.status === 'fulfilled' ? unwrapList(daysResult.value, ['days']).map(normaliseDay).sort((a, b) => a.order - b.order) : trip.planning;
    const bookings = bookingsResult.status === 'fulfilled' ? unwrapList(bookingsResult.value, ['bookings']).map(normaliseBooking) : trip.boekingen;
    const checklist = checklistResult.status === 'fulfilled' ? unwrapList(checklistResult.value, ['items', 'checklist']).map(normaliseChecklistItem) : trip.checklist;
    const mergedTrip = { ...trip, kosten: costs, planning: days, boekingen: bookings, checklist };
    const fallbackSettlements = computeBalances(mergedTrip);
    const settlementPayload = settlementsResult.status === 'fulfilled'
      ? normaliseSettlementData(settlementsResult.value, fallbackSettlements)
      : { ...fallbackSettlements, history: [] };

    tripStore.setState({
      balances: settlementPayload.balances,
      settlements: settlementPayload.transfers,
      settlementHistory: settlementPayload.history,
    });
    upsertCurrentTrip(mergedTrip);
    renderAllViews();
  } catch (error) {
    showGlobalError(error.message || 'Tripgegevens konden niet worden geladen.', () => loadTripContext(tripId));
    throw error;
  } finally {
    if (showLoader) setLoading(false);
  }
}

function renderAllViews() {
  renderTripSelector();
  renderDashboard();
  renderPlanning();
  renderKosten();
  renderGroupieTab();
  renderBudget();
  renderBoekingen();
  renderChecklist();
  renderReisinfo();
  calculateCurrency();
  refreshIcons();
}

async function logoutUser() {
  await authApi.logout();
  clearTokens();
  redirectToLogin();
}

async function bootstrapApp() {
  if (!getStoredToken()) {
    redirectToLogin();
    return;
  }

  setLoading(true, 'Je workspace laden...');
  try {
    await loadProfile();
    await Promise.all([loadExchangeRates(), loadWorkspace()]);
    await loadTrips();
    const initialTripId = tripStore.getState().currentTripId;
    if (initialTripId) await loadTripContext(initialTripId, { showLoader: false });
    else renderAllViews();
    switchTab(readActiveTab());
    updateHeader();
    if (runtime.appLockPin) document.getElementById('pin-lock-screen').classList.remove('hidden');
  } catch (error) {
    showGlobalError(error.message || 'De applicatie kon niet worden geladen.', bootstrapApp);
    showToast(error.message || 'Fout tijdens laden van de app.', 'error');
  } finally {
    setLoading(false);
  }
}

function registerGlobalFunctions() {
  Object.assign(window, {
    applyChecklistTemplate,
    calculateCurrency,
    closeModal,
    deleteBoeking,
    deleteChecklistItem,
    deleteKostenItem,
    deletePlanningDay,
    exportAllCSV,
    exportJSON,
    exportTravelPDF,
    importJSON,
    logoutUser,
    markSettlementPaid,
    openAddBoekingModal,
    openAddChecklistItemModal,
    openAddDayModal,
    openAddKostenModal,
    openAddTripModal,
    openChecklistTemplateModal,
    openGoogleMapsRoute,
    openManageReizigersModal,
    openRoleSimulatorModal,
    openSaaSMetricsModal,
    openSaaSPricingModal,
    openSecuritySettingsModal,
    openWhiteLabelModal,
    promptResetTrip,
    refreshRouteMap,
    renderPlanning,
    saveReisinfo,
    selectPlan,
    sharePaymentLink,
    switchTab,
    switchTrip: async (tripId) => {
      tripStore.setState({ currentTripId: tripId });
      persistLastTrip(tripId);
      await loadTripContext(tripId, { showLoader: false });
      showToast(`Reis gewijzigd naar \"${getCurrentTrip()?.titel || ''}\"`);
    },
    toggleBoekingStatus,
    toggleChecklistItem,
    unlockApp,
  });
}

window.addEventListener('DOMContentLoaded', () => {
  registerGlobalFunctions();
  document.getElementById('global-error-retry')?.addEventListener('click', () => {
    if (runtime.lastRetryAction) runtime.lastRetryAction();
  });
  bootstrapApp();
});
