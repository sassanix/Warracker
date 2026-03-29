import authService from '../services/authService.js';
import { getUserPreferencePrefix, setUserPreferencePrefix } from '../store.js';

function resolvePreferencePrefix() {
	let prefix = getUserPreferencePrefix();
	if (prefix) return prefix;
	const user = authService.getCurrentUser();
	prefix = user?.is_admin ? 'admin_' : 'user_';
	setUserPreferencePrefix(prefix);
	return prefix;
}

export function getCurrencySymbol() {
	const prefix = resolvePreferencePrefix();
	let symbol = '$';
	const explicit = localStorage.getItem(`${prefix}currencySymbol`);
	if (explicit) return explicit;
	try {
		const prefs = localStorage.getItem(`${prefix}preferences`);
		if (prefs) {
			const parsed = JSON.parse(prefs);
			if (parsed?.currency_symbol) symbol = parsed.currency_symbol;
		}
	} catch (error) {
		console.warn('[currency] Failed to parse preferences', error);
	}
	return symbol;
}

export function getCurrencyCode() {
	const prefix = resolvePreferencePrefix();
	const explicit = localStorage.getItem(`${prefix}currencyCode`);
	if (explicit) return explicit;
	const symbol = getCurrencySymbol();
	const map = {
		'$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₩': 'KRW',
		'CHF': 'CHF', 'C$': 'CAD', 'A$': 'AUD', 'kr': 'SEK', 'zł': 'PLN', 'Kč': 'CZK',
		'Ft': 'HUF', '₽': 'RUB', 'R$': 'BRL', '₪': 'ILS', '₺': 'TRY', 'NZ$': 'NZD',
	};
	return map[symbol] || 'USD';
}

export function getCurrencySymbolByCode(code) {
	const map = {
		USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', INR: '₹', KRW: '₩',
		CHF: 'CHF', CAD: 'C$', AUD: 'A$', SEK: 'kr', NOK: 'kr', DKK: 'kr',
		PLN: 'zł', CZK: 'Kč', HUF: 'Ft', BGN: 'лв', RON: 'lei', HRK: 'kn',
		RUB: '₽', BRL: 'R$', MXN: '$', ARS: '$', CLP: '$', COP: '$',
		PEN: 'S/', VES: 'Bs', ZAR: 'R', EGP: '£', NGN: '₦', KES: 'KSh',
		GHS: '₵', MAD: 'DH', TND: 'DT', AED: 'AED', SAR: 'SR', QAR: 'QR',
		KWD: 'KD', BHD: 'BD', OMR: 'OR', JOD: 'JD', LBP: 'LL', ILS: '₪',
		TRY: '₺', IRR: '﷼', PKR: '₨', BDT: '৳', LKR: 'Rs', NPR: 'Rs',
		BTN: 'Nu', MMK: 'K', THB: '฿', VND: '₫', LAK: '₭', KHR: '៛',
		MYR: 'RM', SGD: 'S$', IDR: 'Rp', PHP: '₱', TWD: 'NT$', HKD: 'HK$',
		MOP: 'MOP', KPW: '₩', MNT: '₮', KZT: '₸', UZS: 'soʻm', TJS: 'SM',
		KGS: 'с', TMT: 'T', AFN: '؋', AMD: '֏', AZN: '₼', GEL: '₾',
		MDL: 'L', UAH: '₴', BYN: 'Br', RSD: 'дин', MKD: 'ден', ALL: 'L',
		BAM: 'KM', ISK: 'kr', FJD: 'FJ$', PGK: 'K', SBD: 'SI$', TOP: 'T$',
		VUV: 'VT', WST: 'WS$', XPF: '₣', NZD: 'NZ$',
	};
	return map[code] || code;
}

export function getCurrencyPosition() {
	const prefix = resolvePreferencePrefix();
	return localStorage.getItem(`${prefix}currencyPosition`) || 'left';
}

export function formatCurrencyHTML(amount, symbol, position) {
	const formatted = Number.parseFloat(amount || 0).toFixed(2);
	if (position === 'right') {
		return `<span>${formatted}</span><span class="currency-symbol currency-right">${symbol}</span>`;
	}
	return `<span class="currency-symbol">${symbol}</span><span>${formatted}</span>`;
}

export function setupDynamicCurrencyPosition(input, currencySymbol) {
	if (!input || !currencySymbol) return;
	const updatePosition = () => {
		const wrapper = input.closest('.price-input-wrapper');
		if (!wrapper || !wrapper.classList.contains('currency-right')) return;

		if (wrapper.offsetWidth === 0) {
			setTimeout(updatePosition, 50);
			return;
		}

		const text = input.value || input.placeholder || '0.00';
		const tempSpan = document.createElement('span');
		tempSpan.style.visibility = 'hidden';
		tempSpan.style.position = 'absolute';
		tempSpan.style.font = window.getComputedStyle(input).font;
		tempSpan.textContent = text;
		document.body.appendChild(tempSpan);
		const textWidth = tempSpan.offsetWidth;
		document.body.removeChild(tempSpan);

		const paddingLeft = Number.parseInt(window.getComputedStyle(input).paddingLeft, 10) || 12;
		const gap = 4;
		const wrapperWidth = wrapper.offsetWidth;
		const right = Math.max(8, wrapperWidth - paddingLeft - textWidth - gap - 20);
		currencySymbol.style.right = `${right}px`;
	};

	input.addEventListener('input', updatePosition);
	input.addEventListener('focus', updatePosition);
	input.addEventListener('blur', updatePosition);
	requestAnimationFrame(() => {
		updatePosition();
		setTimeout(updatePosition, 100);
		setTimeout(updatePosition, 300);
	});
}

export function updateFormCurrencyPosition(symbol, position) {
	const apply = (wrapperId, symbolId, inputId) => {
		const wrapper = document.getElementById(wrapperId);
		const symbolEl = document.getElementById(symbolId);
		const input = document.getElementById(inputId);
		if (!wrapper || !symbolEl) return;
		symbolEl.textContent = symbol;
		if (position === 'right') {
			wrapper.classList.add('currency-right');
			if (input) setupDynamicCurrencyPosition(input, symbolEl);
		} else {
			wrapper.classList.remove('currency-right');
			symbolEl.style.right = '';
		}
	};
	apply('addPriceInputWrapper', 'addCurrencySymbol', 'purchasePrice');
	apply('editPriceInputWrapper', 'editCurrencySymbol', 'editPurchasePrice');
}

export function updateCurrencySymbols() {
	const symbol = getCurrencySymbol();
	const position = getCurrencyPosition();
	document.querySelectorAll('.currency-symbol').forEach((el) => {
		el.textContent = symbol;
	});
	updateFormCurrencyPosition(symbol, position);
}

export async function loadCurrencies() {
	try {
		const token = authService.getToken() || localStorage.getItem('auth_token');
		if (!token) throw new Error('Authentication required');
		const response = await fetch('/api/currencies', { headers: { Authorization: `Bearer ${token}` } });
		if (!response.ok) throw new Error('Failed to fetch currencies');
		const currencies = await response.json();
		const preferred = getCurrencyCode();

		const applyOptions = (select) => {
			if (!select) return;
			select.innerHTML = '';
			currencies.forEach((currency) => {
				const option = document.createElement('option');
				option.value = currency.code;
				option.textContent = `${currency.code} - ${currency.name} (${currency.symbol})`;
				select.appendChild(option);
			});
		};

		const addSelect = document.getElementById('currency');
		const editSelect = document.getElementById('editCurrency');
		applyOptions(addSelect);
		applyOptions(editSelect);

		if (addSelect && preferred) {
			setTimeout(() => {
				addSelect.value = preferred;
				addSelect.dispatchEvent(new Event('change', { bubbles: true }));
			}, 10);
		}
	} catch (error) {
		console.error('[currency] Failed to load currencies', error);
		const fallback = (select, label) => {
			if (select) {
				select.innerHTML = `<option value="USD">${label}</option>`;
			}
		};
		fallback(document.getElementById('currency'), 'USD - US Dollar ($)');
		fallback(document.getElementById('editCurrency'), 'USD - US Dollar ($)');
	}
}

export default {
	getCurrencySymbol,
	getCurrencyCode,
	getCurrencySymbolByCode,
	getCurrencyPosition,
	formatCurrencyHTML,
	updateCurrencySymbols,
	updateFormCurrencyPosition,
	setupDynamicCurrencyPosition,
	loadCurrencies,
};

