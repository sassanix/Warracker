import { getWarranties, getFilters } from '../store.js';
import { showToast, showLoadingSpinner, hideLoadingSpinner } from './ui.js';
import { loadWarranties, applyFilters } from '../controllers/warrantyListController.js';
import { loadTags } from './tagManager.js';
import { formatDateYYYYMMDD } from '../lib/dates.js';

export async function exportWarranties() {
  const warranties = getWarranties();
  if (!warranties.length) {
    showToast(window.i18next ? window.i18next.t('messages.no_warranties_to_export') : 'No warranties to export', 'info');
    return;
  }
  const filters = getFilters();
  let filtered = [...warranties];
  if (filters.search) {
    const term = filters.search.toLowerCase();
    filtered = filtered.filter((warranty) => {
      const nameMatch = (warranty.product_name || '').toLowerCase().includes(term);
      const vendorMatch = (warranty.vendor || '').toLowerCase().includes(term);
      const tagMatch = Array.isArray(warranty.tags)
        && warranty.tags.some((tag) => (tag.name || '').toLowerCase().includes(term));
      return nameMatch || vendorMatch || tagMatch;
    });
  }
  if (filters.status !== 'all') {
    filtered = filtered.filter((warranty) => warranty.status === filters.status);
  }
  if (filters.tag !== 'all') {
    const tagId = Number.parseInt(filters.tag, 10);
    filtered = filtered.filter((warranty) => Array.isArray(warranty.tags)
      && warranty.tags.some((tag) => tag.id === tagId));
  }
  if (filters.vendor !== 'all') {
    filtered = filtered.filter((warranty) => (warranty.vendor || '').toLowerCase() === (filters.vendor || '').toLowerCase());
  }
  if (filters.warranty_type !== 'all') {
    filtered = filtered.filter((warranty) => (warranty.warranty_type || '').toLowerCase() === (filters.warranty_type || '').toLowerCase());
  }

  if (!filtered.length) {
    showToast(window.i18next ? window.i18next.t('messages.no_warranties_to_export') : 'No warranties to export', 'info');
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
  ];
  let csv = `${headers.join(',')}\n`;
  filtered.forEach((warranty) => {
    const serials = Array.isArray(warranty.serial_numbers)
      ? warranty.serial_numbers.filter(Boolean).join(' ')
      : '';
    const tags = Array.isArray(warranty.tags)
      ? warranty.tags.map((tag) => tag.name).join(' ')
      : '';
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
    ];
    csv += `${row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(',')}\n`;
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
    window.i18next
      ? window.i18next.t('messages.exported_warranties_successfully', { count: filtered.length })
      : `Exported ${filtered.length} warranties`,
    'success',
  );
}

export async function handleImport(file) {
  if (!file) {
    showToast(window.i18next ? window.i18next.t('messages.no_file_selected') : 'No file selected', 'warning');
    return;
  }
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showToast(window.i18next ? window.i18next.t('messages.invalid_file_type') : 'Invalid file type', 'error');
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
      showToast(result.error || (window.i18next ? window.i18next.t('messages.import_failed') : 'Import failed'), 'error');
      if (result.errors) console.warn('[importExport] detailed import errors', result.errors);
      return;
    }
    showToast(
      window.i18next
        ? window.i18next.t('messages.import_success', { success: result.success_count, failure: result.failure_count })
        : `${result.success_count} warranties imported. ${result.failure_count} failed.`,
      'success',
    );
    await loadTags(true);
    await delay(500);
    await loadWarranties(true);
    applyFilters();
  } catch (error) {
    hideLoadingSpinner();
    console.error('[importExport] Import error', error);
    showToast(window.i18next ? window.i18next.t('messages.import_failed') : 'Import failed', 'error');
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






