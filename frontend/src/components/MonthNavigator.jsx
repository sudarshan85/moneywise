import { formatMonthLabel, shiftMonth, currentYearMonth } from '../utils/format.js';
import './MonthNavigator.css';

// Shared ◀ Month Year ▶ control. `minMonth`/`maxMonth` (YYYY-MM) clamp the
// range; a "Back to today" shortcut appears when off the current month and
// the current month is within range.
export function MonthNavigator({ month, onChange, minMonth, maxMonth }) {
    const thisMonth = currentYearMonth();
    const canGoBack = !minMonth || shiftMonth(month, -1) >= minMonth;
    const canGoForward = !maxMonth || shiftMonth(month, 1) <= maxMonth;
    const showToday = month !== thisMonth && (!maxMonth || thisMonth <= maxMonth) && (!minMonth || thisMonth >= minMonth);

    return (
        <div className="month-picker">
            <button
                className="month-nav"
                onClick={() => onChange(shiftMonth(month, -1))}
                disabled={!canGoBack}
                aria-label="Previous month"
            >
                ‹
            </button>
            <span className="month-label">{formatMonthLabel(month)}</span>
            <button
                className="month-nav"
                onClick={() => onChange(shiftMonth(month, 1))}
                disabled={!canGoForward}
                aria-label="Next month"
            >
                ›
            </button>
            {showToday && (
                <button className="btn btn-secondary btn-sm month-today" onClick={() => onChange(thisMonth)}>
                    Back to today
                </button>
            )}
        </div>
    );
}
