import { getWarranties, getFilters, wasLastLoadedArchived } from '../store.js';
import { showToast, showLoadingSpinner, hideLoadingSpinner } from './ui.js';
import { loadWarranties, applyFilters } from '../controllers/warrantyListController.js';
import { loadTags } from './tagManager.js';
import { formatDateYYYYMMDD } from '../lib/dates.js';

// CSV-02: neutralize formula injection. A value whose first non-space
// character is =, +, -, @, tab, or carriage return would be evaluated
// as a formula by spreadsheet apps on import. Prefixing a tab keeps
// the value inert, and the importer strips field values, so a
// re-imported export round-trips to the stored value.
export function neutralizeCsvFormula(value) {
  const text = String(value);
  const firstNonSpace = text.replace(/^ +/, '')[0];
  const firstNonWhitespace = text.trimStart()[0];
  if (firstNonSpace === '\t' || firstNonSpace === '\r'
      || firstNonWhitespace === '=' || firstNonWhitespace === '+'
      || firstNonWhitespace === '-' || firstNonWhitespace === '@') {
    return '\t' + text;
  }
  return text;
}

export function filterWarrantiesForExport(warranties, filters = {}, options = {}) {
  const statusFilter = filters.status || 'all';
  const tagFilter = filters.tag || 'all';
  const vendorFilter = filters.vendor || 'all';
  const warrantyTypeFilter = filters.warranty_type || 'all';
  const searchTerm = (filters.search || '').toLowerCase();
  const isArchivedView = Boolean(options.isArchivedView);

  return (Array.isArray(warranties) ? warranties : []).filter((warranty) => {
    const isArchived = Boolean(warranty.is_archived || warranty.__isArchived || isArchivedView);
    if (statusFilter === 'archived') {
      if (!isArchived) return false;
    } else if (statusFilter !== 'all') {
      if (isArchived) return false;
      if (warranty.status !== statusFilter) return false;
    }

    if (tagFilter !== 'all') {
      const tagId = Number.parseInt(tagFilter, 10);
      const hasTag = Array.isArray(warranty.tags)
        && warranty.tags.some((tag) => tag.id === tagId);
      if (!hasTag) return false;
    }

    if (vendorFilter !== 'all') {
      if ((warranty.vendor || '').toLowerCase() !== String(vendorFilter).toLowerCase()) return false;
    }

    if (warrantyTypeFilter !== 'all') {
      if ((warranty.warranty_type || '').toLowerCase() !== String(warrantyTypeFilter).toLowerCase()) return false;
    }

    if (searchTerm) {
      const nameMatch = (warranty.product_name || '').toLowerCase().includes(searchTerm);
      const vendorMatch = (warranty.vendor || '').toLowerCase().includes(searchTerm);
      const tagMatch = Array.isArray(warranty.tags)
        && warranty.tags.some((tag) => (tag.name || '').toLowerCase().includes(searchTerm));
      const notesMatch = (warranty.notes || '').toLowerCase().includes(searchTerm);
      const modelNumberMatch = (warranty.model_number || '').toLowerCase().includes(searchTerm);
      const serialNumberMatch = Array.isArray(warranty.serial_numbers)
        && warranty.serial_numbers.some((sn) => sn && String(sn).toLowerCase().includes(searchTerm));
      if (!nameMatch && !vendorMatch && !tagMatch && !notesMatch && !modelNumberMatch && !serialNumberMatch) {
        return false;
      }
    }

    return true;
  });
}

export async function exportWarranties() {
  const warranties = getWarranties();
  if (!warranties.length) {
    showToast((window.i18next && window.i18next.t('messages.no_warranties_to_export') || 'No warranties to export'), 'info');
    return;
  }
  const filters = getFilters();
  const filtered = filterWarrantiesForExport(warranties, filters, {
    isArchivedView: wasLastLoadedArchived(),
  });

  if (!filtered.length) {
    showToast((window.i18next && window.i18next.t('messages.no_warranties_to_export') || 'No warranties to export'), 'info');
    return;
  }

  const headers = [
    'ProductName',
    'PurchaseDate',
    'IsLifetime',
    'WarrantyDurationYears',
    'WarrantyDurationMonths',
    'WarrantyDurationDays',
    'ExpirationDate',
    'Status',
    'PurchasePrice',
    'SerialNumber',
    'ProductURL',
    'Tags',
    'Vendor',
    'Notes',
    'Currency',
    'ModelNumber',
    'WarrantyType',
  ];
  let csv = `${headers.join(',')}\n`;
  filtered.forEach((warranty) => {
    // Tags/serials are JSON-encoded so values containing commas round-trip
    // intact; the importer falls back to comma-splitting for legacy files.
    const serials = Array.isArray(warranty.serial_numbers)
      ? JSON.stringify(warranty.serial_numbers.filter(Boolean))
      : '[]';
    const tags = Array.isArray(warranty.tags)
      ? JSON.stringify(warranty.tags.map((tag) => tag.name))
      : '[]';
    const row = [
      warranty.product_name || '',
      warranty.purchase_date ? formatDateYYYYMMDD(new Date(warranty.purchase_date)) : '',
      warranty.is_lifetime ? 'TRUE' : 'FALSE',
      warranty.warranty_duration_years || 0,
      warranty.warranty_duration_months || 0,
      warranty.warranty_duration_days || 0,
      warranty.expiration_date ? formatDateYYYYMMDD(new Date(warranty.expiration_date)) : '',
      warranty.status || '',
      warranty.purchase_price || '',
      serials,
      warranty.product_url || '',
      tags,
      warranty.vendor || '',
      warranty.notes || '',
      warranty.currency || '',
      warranty.model_number || '',
      warranty.warranty_type || '',
    ];
    csv += `${row.map((field) => `"${neutralizeCsvFormula(String(field)).replace(/"/g, '""')}"`).join(',')}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `warranties_export_${formatDateYYYYMMDD(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast(
    (window.i18next && window.i18next.t('messages.exported_warranties_successfully', { count: filtered.length }) || `Exported ${filtered.length} warranties`),
    'success',
  );
}

export async function handleImport(file) {
  if (!file) {
    showToast((window.i18next && window.i18next.t('messages.no_file_selected') || 'No file selected'), 'warning');
    return;
  }
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showToast((window.i18next && window.i18next.t('messages.invalid_file_type') || 'Invalid file type'), 'error');
    return;
  }
  showLoadingSpinner();
  const formData = new FormData();
  formData.append('csv_file', file);
  try {
    const response = await fetch('/api/warranties/import', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken()}`,
      },
      body: formData,
    });
    const result = await response.json();
    hideLoadingSpinner();
    if (!response.ok) {
      showToast(result.error || ((window.i18next && window.i18next.t('messages.import_failed') || 'Import failed')), 'error');
      if (result.errors) console.warn('[importExport] detailed import errors', result.errors);
      return;
    }
    showToast(
      (window.i18next && window.i18next.t('messages.import_success', { success: result.success_count, failure: result.failure_count }) || `${result.success_count} warranties imported. ${result.failure_count} failed.`),
      'success',
    );
    await loadTags(true);
    await delay(500);
    await loadWarranties(true);
    applyFilters();
  } catch (error) {
    hideLoadingSpinner();
    console.error('[importExport] Import error', error);
    showToast((window.i18next && window.i18next.t('messages.import_failed') || 'Import failed'), 'error');
  } finally {
    const input = document.getElementById('csvFileInput');
    if (input) input.value = '';
  }
}

function authToken() {
  const token = localStorage.getItem('auth_token');
  if (!token) throw new Error('Authentication required');
  return token;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (typeof window !== 'undefined') {
  window.exportWarranties = exportWarranties;
  window.handleImport = handleImport;
}






