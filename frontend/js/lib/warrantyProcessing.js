import {
  getWarranties,
  setWarranties,
  wasLastLoadedArchived,
  didLastLoadIncludeArchived,
  areWarrantiesLoaded,
  getExpiringSoonDays,
} from '../store.js';
import { calculateDurationFromDates } from './dates.js';

export function processWarrantyData(warranty) {
  if (!warranty || typeof warranty !== 'object') return warranty;
  const processed = { ...warranty };
  processed.is_archived = Boolean(warranty.__isArchived || warranty.is_archived);
  processed.product_name = processed.product_name || 'Unnamed Product';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  processed.purchaseDate = parseDate(processed.purchase_date);
  processed.expirationDate = parseDate(processed.expiration_date);

  if (processed.is_lifetime) {
    processed.status = 'active';
    processed.statusText = translate('warranties.lifetime', 'Lifetime');
    processed.daysRemaining = Infinity;
    processed.warranty_duration_years = 0;
    processed.warranty_duration_months = 0;
    processed.warranty_duration_days = 0;
    processed.display_duration_years = 0;
    processed.display_duration_months = 0;
    processed.display_duration_days = 0;
    processed.original_input_method = 'duration';
    return processed;
  }

  if (processed.expirationDate && !Number.isNaN(processed.expirationDate.getTime())) {
    const expirationOnly = new Date(processed.expirationDate);
    expirationOnly.setHours(0, 0, 0, 0);
    const timeDiff = expirationOnly.getTime() - today.getTime();
    const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    processed.daysRemaining = daysRemaining;
    const soonThreshold = getExpiringSoonDays();
    if (daysRemaining < 0) {
      processed.status = 'expired';
      processed.statusText = translate('warranties.expired', 'Expired');
    } else if (daysRemaining < soonThreshold) {
      processed.status = 'expiring';
      processed.statusText = translate(
        'warranties.days_remaining',
        `${daysRemaining} days remaining`,
        { days: daysRemaining, dayText: translate('warranties.day', `day${daysRemaining !== 1 ? 's' : ''}`, { count: daysRemaining }) },
      );
    } else {
      processed.status = 'active';
      processed.statusText = translate(
        'warranties.days_remaining',
        `${daysRemaining} days remaining`,
        { days: daysRemaining, dayText: translate('warranties.day', `day${daysRemaining !== 1 ? 's' : ''}`, { count: daysRemaining }) },
      );
    }

    const originalYears = processed.warranty_duration_years || 0;
    const originalMonths = processed.warranty_duration_months || 0;
    const originalDays = processed.warranty_duration_days || 0;
    const usedExactDate = originalYears === 0 && originalMonths === 0 && originalDays === 0;
    processed.original_input_method = usedExactDate ? 'exact_date' : 'duration';

    if (usedExactDate && processed.purchaseDate) {
      const calculated = calculateDurationFromDates(
        processed.purchaseDate.toISOString().split('T')[0],
        processed.expirationDate.toISOString().split('T')[0],
      );
      if (calculated) {
        processed.display_duration_years = calculated.years;
        processed.display_duration_months = calculated.months;
        processed.display_duration_days = calculated.days;
        processed.warranty_duration_years = 0;
        processed.warranty_duration_months = 0;
        processed.warranty_duration_days = 0;
      }
    } else {
      processed.display_duration_years = originalYears;
      processed.display_duration_months = originalMonths;
      processed.display_duration_days = originalDays;
    }
  } else {
    processed.status = 'unknown';
    processed.statusText = translate('warranties.unknown_status', 'Unknown Status');
    processed.daysRemaining = null;
  }

  return processed;
}

export function processAllWarranties() {
  const warranties = getWarranties();
  if (!Array.isArray(warranties) || !warranties.length) return;
  const processed = warranties.map((warranty) => processWarrantyData(warranty));
  setWarranties(processed, {
    warrantiesLoaded: areWarrantiesLoaded(),
    lastLoadedArchived: wasLastLoadedArchived(),
    lastLoadedIncludesArchived: didLastLoadIncludeArchived(),
  });
}

function parseDate(value) {
  if (!value) return null;
  const parts = String(value).split('-');
  if (parts.length === 3) {
    const year = Number.parseInt(parts[0], 10);
    const month = Number.parseInt(parts[1], 10) - 1;
    const day = Number.parseInt(parts[2], 10);
    const parsed = new Date(Date.UTC(year, month, day));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function translate(key, fallback, options) {
  try {
    if (window.i18next?.t) {
      const result = window.i18next.t(key, options);
      if (result && result !== key) return result;
    }
  } catch (error) {
    console.warn('[warrantyProcessing] translation failed', key, error);
  }
  return fallback;
}

if (typeof window !== 'undefined') {
  window.processWarrantyData = processWarrantyData;
  window.processAllWarranties = processAllWarranties;
}






