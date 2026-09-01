export const AUTH_TOKEN_KEY = 'gt_auth_token';
export const REFRESH_TOKEN_KEY = 'gt_refresh_token';
export const ACTIVE_TAB_KEY = 'gt_active_tab';
export const LAST_TRIP_KEY = 'gt_last_trip_id';
export const PLANNING_ORDER_KEY = 'gt_trip_day_order';
export const DEFAULT_API_TIMEOUT = 10000;

const normaliseBaseUrl = (value) => (value || '').replace(/\/$/, '');

export const DASHBOARD_PATH = './dashboard.html';
export const LOGIN_PATH = './login.html';
export const REGISTER_PATH = './register.html';

export const API_BASE_URL = (() => {
  const override = normaliseBaseUrl(window.__GLOBETROTR_API_BASE_URL__ || window.localStorage.getItem('gt_api_base_url'));
  if (override) return override;

  if (window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return 'http://localhost:3000/api';
  }

  return `${window.location.origin.replace(/\/$/, '')}/api`;
})();

export const ENDPOINTS = {
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    logout: '/auth/logout',
    refresh: '/auth/refresh',
    me: '/auth/me',
  },
  exchangeRates: '/config/exchange-rates',
  workspaces: '/workspaces',
  trips: '/trips',
};

export const EXPENSE_CATEGORIES = [
  'Eten & Drinken',
  'Vervoer',
  'Verblijf',
  'Excursies',
  'Vliegtickets',
  'Overig',
];

export const BOOKING_TYPES = ['Vlucht', 'Hotel', 'Autohuur', 'Trein', 'Excursie'];

export const SUPPORTED_CURRENCIES = [
  { code: 'EUR', label: 'EUR (€)' },
  { code: 'USD', label: 'USD ($)' },
  { code: 'SEK', label: 'SEK (kr)' },
  { code: 'NOK', label: 'NOK (kr)' },
  { code: 'GBP', label: 'GBP (£)' },
  { code: 'JPY', label: 'JPY (¥)' },
  { code: 'AUD', label: 'AUD ($)' },
  { code: 'CAD', label: 'CAD ($)' },
  { code: 'CHF', label: 'CHF (CHF)' },
  { code: 'THB', label: 'THB (฿)' },
  { code: 'IDR', label: 'IDR (Rp)' },
];

export const CHECKLIST_TEMPLATES = {
  winter: [
    'Thermokleding inpakken',
    'Handschoenen en muts meenemen',
    'Sneeuwschoenen of spikes checken',
    'Zonnebrand voor sneeuwweer meenemen',
  ],
  zomer: [
    'Zwemkleding inpakken',
    'Muggenspray kopen',
    'Zonnebrand meenemen',
    'Strandhanddoek klaarleggen',
  ],
  city: [
    'OV-passen of city cards regelen',
    'Museumtickets reserveren',
    'Powerbank opladen',
    'Comfortabele wandelschoenen meenemen',
  ],
};
