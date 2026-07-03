// Shared formatting helpers. All money and dates render through here so signs,
// null-handling and locale stay consistent across pages.

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
