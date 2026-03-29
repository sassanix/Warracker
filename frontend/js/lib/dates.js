const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function safeI18n(key, fallback, options) {
	try {
		if (window?.i18next?.t) {
			const result = window.i18next.t(key, options);
			if (result && result !== key) return result;
		}
	} catch (error) {
		console.warn('[dates] i18n failure', key, error);
	}
	return fallback;
}

export function formatDate(value) {
	if (!value) return safeI18n('dates.unknown', 'Unknown');
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return safeI18n('dates.unknown', 'Unknown');
	const month = MONTH_NAMES[date.getUTCMonth()];
	const day = String(date.getUTCDate()).padStart(2, '0');
	const year = date.getUTCFullYear();
	return `${month} ${day}, ${year}`;
}

export function formatDateYYYYMMDD(date) {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'N/A';
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function calculateProductAge(purchaseDate) {
	if (!purchaseDate) return safeI18n('warranties.unknown_age', 'Unknown');
	const purchase = new Date(purchaseDate);
	const now = new Date();
	if (Number.isNaN(purchase.getTime()) || purchase > now) return safeI18n('warranties.unknown_age', 'Unknown');

	let years = now.getFullYear() - purchase.getFullYear();
	let months = now.getMonth() - purchase.getMonth();
	let days = now.getDate() - purchase.getDate();

	if (days < 0) {
		months -= 1;
		const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
		days += lastMonth.getDate();
	}

	if (months < 0) {
		years -= 1;
		months += 12;
	}

	const parts = [];
	if (years > 0) {
		const text = safeI18n('warranties.year', `year${years !== 1 ? 's' : ''}`, { count: years });
		parts.push(`${years} ${text}`);
	}
	if (months > 0) {
		const text = safeI18n('warranties.month', `month${months !== 1 ? 's' : ''}`, { count: months });
		parts.push(`${months} ${text}`);
	}
	if (days > 0 && years === 0) {
		const text = safeI18n('warranties.day', `day${days !== 1 ? 's' : ''}`, { count: days });
		parts.push(`${days} ${text}`);
	}

	if (!parts.length) return safeI18n('dates.today', 'Today');
	return parts.join(', ');
}

export function calculateProductAgeInDays(purchaseDate) {
	if (!purchaseDate) return 0;
	const purchase = new Date(purchaseDate);
	const now = new Date();
	if (Number.isNaN(purchase.getTime()) || purchase > now) return 0;
	const diff = now.getTime() - purchase.getTime();
	return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function calculateDurationFromDates(startDate, endDate) {
	try {
		if (!startDate || !endDate) return null;
		const start = new Date(startDate);
		const end = new Date(endDate);
		if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

		let years = end.getFullYear() - start.getFullYear();
		let months = end.getMonth() - start.getMonth();
		let days = end.getDate() - start.getDate();

		if (days < 0) {
			months -= 1;
			const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
			days += prevMonth.getDate();
		}

		if (months < 0) {
			years -= 1;
			months += 12;
		}

		return { years, months, days };
	} catch (error) {
		console.error('[dates] Failed to calculate duration', error);
		return null;
	}
}

export default {
	formatDate,
	formatDateYYYYMMDD,
	calculateProductAge,
	calculateProductAgeInDays,
	calculateDurationFromDates,
};

