// Local-time date helpers. Transaction dates are the user's wall-clock day;
// never derive them via toISOString(), which shifts to UTC and can land on the
// wrong day near midnight (or the wrong month near month boundaries).

export function formatLocalDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function localToday() {
    return formatLocalDate(new Date());
}

export function currentYearMonth() {
    return localToday().slice(0, 7);
}

// First and last day (YYYY-MM-DD) of a YYYY-MM month
export function monthRange(yearMonth) {
    const [year, month] = yearMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return {
        start: `${yearMonth}-01`,
        end: `${yearMonth}-${String(lastDay).padStart(2, '0')}`,
    };
}
