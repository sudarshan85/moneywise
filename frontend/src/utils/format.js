// Shared formatting helpers. All money and dates render through here so signs,
// null-handling and locale stay consistent across pages.

// The system category is stored as 'Available to Budget' (backend looks it up
// by that name), but the UI calls it 'Ready to Assign'.
export function displayCategoryName(name) {
    if (!name) return 'Ready to Assign';
    return name === 'Available to Budget' ? 'Ready to Assign' : name;
}

export function formatCurrency(amount, { sign = false } = {}) {
    if (amount === null || amount === undefined) return '—';
    if (sign) {
        const formatted = Math.abs(amount).toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
        });
        return amount >= 0 ? `+${formatted}` : `-${formatted}`;
    }
    return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// Format a Date as 'YYYY-MM-DD' using LOCAL time. toISOString() would shift
// to UTC and can land on the wrong day near midnight.
export function formatYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Parse 'YYYY-MM-DD' as a LOCAL date. new Date('YYYY-MM-DD') would parse as
// UTC midnight and display the previous day in western timezones.
export function parseLocalDate(dateStr) {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day || 1);
}

export function formatDate(dateStr) {
    const d = parseLocalDate(dateStr);
    if (!d) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatShortDate(dateStr) {
    const d = parseLocalDate(dateStr);
    if (!d) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// 'YYYY-MM' -> 'July 2026'
export function formatMonthLabel(yearMonth) {
    const d = parseLocalDate(`${yearMonth}-01`);
    if (!d) return '—';
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// 'YYYY-MM' -> 'Jul'
export function formatMonthShort(yearMonth) {
    const d = parseLocalDate(`${yearMonth}-01`);
    if (!d) return '—';
    return d.toLocaleDateString('en-US', { month: 'short' });
}
