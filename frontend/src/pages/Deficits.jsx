import { Fragment, useEffect, useMemo, useState } from 'react';
import * as api from '../api/client.js';
import { IconDisplay } from '../components/IconDisplay.jsx';
import { Modal } from '../components/Modal.jsx';
import { TransferForm } from '../components/TransferForm.jsx';
import { MonthNavigator } from '../components/MonthNavigator.jsx';
import { showToast } from '../components/Toast.jsx';
import { useConfigStore } from '../stores/configStore.js';
import {
    formatCurrency,
    formatShortDate,
    formatMonthLabel,
    formatMonthShort,
    displayCategoryName,
    currentYearMonth,
    shiftMonth,
} from '../utils/format.js';
import './Deficits.css';

const HEATMAP_WINDOW = 6;

const OUTCOME_META = {
    fixed: { glyph: '✓', label: 'over, fixed' },
    carried: { glyph: '›', label: 'over, carried forward' },
    open: { glyph: '!', label: 'over, needs fixing' },
};

const STATUS_META = {
    fixed: { label: 'Fixed', badge: 'badge-success' },
    partial: { label: 'Partially fixed', badge: 'badge-pending' },
    unfixed: { label: 'Unfixed', badge: 'badge-danger' },
};

// 'YYYY-MM' -> 'Aug 2026'
function monthShortYear(ym) {
    return `${formatMonthShort(ym)} ${ym.slice(0, 4)}`;
}

// ==================== HEATMAP ====================
function DeficitHeatmap({ history, selectedMonth, onSelect }) {
    const [windowEnd, setWindowEnd] = useState(history.currentMonth);

    const firstMonth = history.months[0];
    const windowStart = shiftMonth(windowEnd, -(HEATMAP_WINDOW - 1));
    const visibleMonths = history.months.filter(m => m >= windowStart && m <= windowEnd);
    const canOlder = firstMonth < windowStart;
    const canNewer = windowEnd < history.currentMonth;

    const rows = history.categories.filter(cat =>
        visibleMonths.some(m => cat.cells[m])
    );

    return (
        <div className="card heatmap-card">
            <div className="heatmap-header">
                <h3 className="card-title">Deficit history</h3>
                {(canOlder || canNewer) && (
                    <div className="hm-pager">
                        <button
                            className="month-nav"
                            onClick={() => setWindowEnd(shiftMonth(windowEnd, -HEATMAP_WINDOW))}
                            disabled={!canOlder}
                            aria-label="Older months"
                        >
                            ‹
                        </button>
                        <button
                            className="month-nav"
                            onClick={() => setWindowEnd(m => {
                                const next = shiftMonth(m, HEATMAP_WINDOW);
                                return next > history.currentMonth ? history.currentMonth : next;
                            })}
                            disabled={!canNewer}
                            aria-label="Newer months"
                        >
                            ›
                        </button>
                    </div>
                )}
            </div>

            <div className="heatmap-scroll">
                <div
                    className="heatmap"
                    style={{ gridTemplateColumns: `minmax(140px, max-content) repeat(${visibleMonths.length}, minmax(36px, 1fr))` }}
                >
                    <div className="hm-corner" />
                    {visibleMonths.map(m => (
                        <button
                            key={m}
                            className={`hm-month ${m === selectedMonth ? 'selected' : ''}`}
                            onClick={() => onSelect(m, null)}
                            title={`Show ${formatMonthLabel(m)}`}
                        >
                            <span>{formatMonthShort(m)}</span>
                            {(m.endsWith('-01') || m === visibleMonths[0]) && (
                                <span className="hm-year">’{m.slice(2, 4)}</span>
                            )}
                        </button>
                    ))}

                    {rows.map(cat => (
                        <Fragment key={cat.id}>
                            <div className="hm-cat">
                                <IconDisplay icon={cat.icon} fallback="📦" className="hm-cat-icon" />
                                <span className="hm-cat-name">{cat.name}</span>
                            </div>
                            {visibleMonths.map(m => {
                                const cell = cat.cells[m];
                                if (!cell) {
                                    return (
                                        <div
                                            key={m}
                                            className={`hm-cell hm-none ${m === selectedMonth ? 'hm-col-selected' : ''}`}
                                            aria-hidden="true"
                                        />
                                    );
                                }
                                const meta = OUTCOME_META[cell.outcome];
                                const label = `${cat.name}, ${formatMonthLabel(m)}: ${meta.label}, peak ${formatCurrency(cell.peakDeficit)}`;
                                return (
                                    <button
                                        key={m}
                                        className={`hm-cell hm-${cell.outcome} ${m === selectedMonth ? 'hm-col-selected' : ''}`}
                                        onClick={() => onSelect(m, cat.id)}
                                        title={label}
                                        aria-label={label}
                                    >
                                        {meta.glyph}
                                    </button>
                                );
                            })}
                        </Fragment>
                    ))}
                </div>
            </div>

            <div className="hm-legend">
                <span className="hm-legend-item"><span className="hm-cell hm-fixed">✓</span> over, fixed</span>
                <span className="hm-legend-item"><span className="hm-cell hm-carried">›</span> carried forward</span>
                <span className="hm-legend-item"><span className="hm-cell hm-open">!</span> open</span>
                <span className="hm-legend-item"><span className="hm-cell hm-none" /> no deficit</span>
            </div>
        </div>
    );
}

// ==================== CASE FILE CARD ====================
function DeficitCard({ caseFile, isExpanded, onToggle, canFix, onFix }) {
    const c = caseFile;
    const status = STATUS_META[c.status];
    const fixesTotal = c.fixes.reduce((s, f) => s + f.amount, 0);
    const carriedInNegative = c.carriedIn < -0.005;

    return (
        <div className={`card deficit-card ${isExpanded ? 'expanded' : ''}`}>
            <div
                className="deficit-card-main"
                onClick={onToggle}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onToggle();
                    }
                }}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                aria-label={`${c.name}, over by ${formatCurrency(c.peakDeficit)}, ${status.label}`}
            >
                <div className="deficit-card-id">
                    <IconDisplay icon={c.icon} fallback="📦" className="deficit-card-icon" />
                    <span className="deficit-card-name">{c.name}</span>
                    <span className={`badge ${status.badge}`}>{status.label}</span>
                </div>
                <div className="deficit-card-amounts">
                    <span className="deficit-over">over by {formatCurrency(c.peakDeficit)}</span>
                    {c.remainingDeficit > 0 && (
                        <span className="deficit-remaining">{formatCurrency(c.remainingDeficit)} still uncovered</span>
                    )}
                </div>
                <div className="deficit-expand-hint">{isExpanded ? '▲' : '▼'}</div>
            </div>

            {isExpanded && (
                <div className="deficit-card-details">
                    <div className="card-stats-list">
                        <div className="stat-row">
                            <span className="stat-label">Carried in</span>
                            <span className={`stat-value ${carriedInNegative ? 'negative' : c.carriedIn === 0 ? 'muted' : ''}`}>
                                {formatCurrency(c.carriedIn, { sign: c.carriedIn !== 0 })}
                            </span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">Budgeted</span>
                            <span className={`stat-value ${c.budgeted === 0 ? 'muted' : ''}`}>{formatCurrency(c.budgeted)}</span>
                        </div>
                        {c.otherFundingIn > 0 && (
                            <div className="stat-row">
                                <span className="stat-label">Other funding in</span>
                                <span className="stat-value">{formatCurrency(c.otherFundingIn)}</span>
                            </div>
                        )}
                        {c.transfersOut > 0 && (
                            <div className="stat-row">
                                <span className="stat-label">Moved out</span>
                                <span className="stat-value">{formatCurrency(-c.transfersOut, { sign: true })}</span>
                            </div>
                        )}
                        <div className="stat-row">
                            <span className="stat-label">Spent</span>
                            <span className={`stat-value ${c.spent > 0 ? 'negative' : 'muted'}`}>
                                {formatCurrency(c.spent > 0 ? -c.spent : 0, { sign: c.spent > 0 })}
                            </span>
                        </div>
                        {c.refunds > 0 && (
                            <div className="stat-row">
                                <span className="stat-label">Refunds</span>
                                <span className="stat-value">{formatCurrency(c.refunds, { sign: true })}</span>
                            </div>
                        )}
                        {c.pendingActivity !== 0 && (
                            <div className="stat-row">
                                <span className="stat-label">Pending</span>
                                <span className="stat-value pending">{formatCurrency(c.pendingActivity, { sign: true })}</span>
                            </div>
                        )}
                        <div className="stat-row">
                            <span className="stat-label">Covered by transfers</span>
                            <span className={`stat-value ${fixesTotal === 0 ? 'muted' : 'positive'}`}>
                                {formatCurrency(fixesTotal, { sign: fixesTotal !== 0 })}
                            </span>
                        </div>
                        <div className="stat-row stat-row-total">
                            <span className="stat-label">End balance</span>
                            <span className={`stat-value ${c.endBalance < 0 ? 'negative' : ''}`}>
                                {formatCurrency(c.endBalance)}
                            </span>
                        </div>
                    </div>

                    {carriedInNegative && !c.tippingTransactionId && (
                        <p className="deficit-note">
                            Deficit carried in from the previous month — no single transaction tipped it this month.
                        </p>
                    )}

                    {c.transactions.length > 0 && (
                        <div className="deficit-section">
                            <h4 className="deficit-section-title">Transactions</h4>
                            <ul className="deficit-list">
                                {c.transactions.map(t => (
                                    <li key={`${t.status}-${t.id}`} className={`deficit-list-row ${t.isTipping ? 'tipping' : ''}`}>
                                        <span className="deficit-list-date">{formatShortDate(t.date)}</span>
                                        <span className="deficit-list-memo">
                                            {t.memo || '—'}
                                            {t.isTipping && <span className="tipping-chip" title="This transaction pushed the envelope negative">⚡ tipped it</span>}
                                            {t.status === 'pending' && <span className="pending-chip">pending</span>}
                                        </span>
                                        <span className={`deficit-list-amount ${t.amount < 0 ? 'negative' : 'positive'}`}>
                                            {formatCurrency(t.amount, { sign: true })}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {c.fixes.length > 0 && (
                        <div className="deficit-section">
                            <h4 className="deficit-section-title">How it was fixed</h4>
                            <ul className="deficit-list">
                                {c.fixes.map(f => (
                                    <li key={f.id} className="deficit-list-row fix-row">
                                        <span className="deficit-list-date">{formatShortDate(f.date)}</span>
                                        <span className="deficit-list-memo">
                                            from {displayCategoryName(f.fromCategoryName)}
                                            {f.memo && f.memo !== '' && <span className="fix-memo"> — {f.memo}</span>}
                                            {f.amountApplied < f.amount && (
                                                <span className="fix-partial"> ({formatCurrency(f.amountApplied)} covered the deficit)</span>
                                            )}
                                        </span>
                                        <span className="deficit-list-amount positive">{formatCurrency(f.amount, { sign: true })}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {canFix && (
                        <div className="deficit-fix-action">
                            <button className="btn btn-primary" onClick={onFix}>
                                🩹 Fix now — cover {formatCurrency(c.remainingDeficit)}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ==================== PAGE ====================
export default function Deficits() {
    const { categories: allCategories, fetchCategories } = useConfigStore();

    const [history, setHistory] = useState(null);
    const [detail, setDetail] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState(currentYearMonth());
    const [expandedId, setExpandedId] = useState(null);
    const [fixTarget, setFixTarget] = useState(null);
    const [dashboardData, setDashboardData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadHistory = async () => {
        const data = await api.getDeficitsHistory();
        setHistory(data);
        return data;
    };

    const loadDetail = async (month) => {
        const data = await api.getDeficitsMonth(month);
        setDetail(data);
        return data;
    };

    useEffect(() => {
        fetchCategories();
        (async () => {
            try {
                setLoading(true);
                await Promise.all([loadHistory(), loadDetail(selectedMonth)]);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const handleMonthChange = async (month, categoryId = null) => {
        setSelectedMonth(month);
        setExpandedId(categoryId);
        try {
            await loadDetail(month);
        } catch (err) {
            setError(err.message);
        }
    };

    // Suggested "Fix now" source: the non-system envelope with the largest
    // positive available balance right now (excluding the deficit category).
    const openFixModal = async (caseFile) => {
        let dash = dashboardData;
        if (!dash) {
            try {
                dash = await api.getDashboardData();
                setDashboardData(dash);
            } catch {
                dash = null;
            }
        }
        const donor = dash?.categories
            ?.filter(cat => cat.id !== caseFile.id && cat.available > 0)
            .sort((a, b) => b.available - a.available)[0];
        setFixTarget({ caseFile, donorId: donor?.id ?? '' });
    };

    const handleFixSave = async (data) => {
        try {
            await api.createTransfer(data);
            setFixTarget(null);
            setDashboardData(null);
            showToast('Deficit fix recorded');
            await Promise.all([loadHistory(), loadDetail(selectedMonth)]);
        } catch (err) {
            setError(err.message);
        }
    };

    const summaryTiles = useMemo(() => {
        if (!detail) return [];
        const s = detail.summary;
        return [
            { label: 'Total overspent', value: formatCurrency(s.totalOverspent), tone: s.totalOverspent > 0 ? 'bad' : '' },
            { label: 'Covered by transfers', value: formatCurrency(s.totalFixed), tone: 'good' },
            { label: 'Still uncovered', value: formatCurrency(s.netCarriedForward), tone: s.netCarriedForward > 0 ? 'bad' : '' },
            { label: 'Categories over', value: String(s.categoriesOver), tone: '' },
        ];
    }, [detail]);

    if (loading) {
        return (
            <div className="deficits-page">
                <div className="empty-state">⏳ Loading deficit analysis…</div>
            </div>
        );
    }

    const hasAnyDeficits = history && history.categories.length > 0;

    return (
        <div className="deficits-page">
            <div className="deficits-header">
                <h2>🩹 Deficit Analysis</h2>
                <MonthNavigator
                    month={selectedMonth}
                    onChange={(m) => handleMonthChange(m)}
                    minMonth={history?.months?.[0]}
                    maxMonth={history?.currentMonth}
                />
            </div>

            {error && (
                <div className="error-banner">
                    <span>⚠️ {error}</span>
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            {!hasAnyDeficits ? (
                <div className="empty-state">
                    🎉 No deficits yet — every envelope has stayed in the green.
                </div>
            ) : (
                <>
                    {detail && (
                        <>
                            <div className="deficit-summary">
                                {summaryTiles.map(tile => (
                                    <div key={tile.label} className={`summary-tile ${tile.tone}`}>
                                        <div className="summary-tile-value">{tile.value}</div>
                                        <div className="summary-tile-label">{tile.label}</div>
                                    </div>
                                ))}
                            </div>

                            {!detail.isCurrentMonth && (
                                <p className="deficits-archive-note">
                                    {formatMonthLabel(detail.month)} in review — read-only archive.
                                </p>
                            )}

                            {detail.categories.length === 0 ? (
                                <div className="empty-state">
                                    ✨ No deficits in {formatMonthLabel(detail.month)} — every envelope stayed in the green.
                                </div>
                            ) : (
                                <div className="deficit-cards">
                                    {detail.categories.map(c => (
                                        <DeficitCard
                                            key={c.id}
                                            caseFile={c}
                                            isExpanded={expandedId === c.id}
                                            onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                                            canFix={detail.isCurrentMonth && c.status !== 'fixed' && c.remainingDeficit > 0}
                                            onFix={() => openFixModal(c)}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    <DeficitHeatmap
                        history={history}
                        selectedMonth={selectedMonth}
                        onSelect={handleMonthChange}
                    />
                </>
            )}

            <Modal
                isOpen={!!fixTarget}
                onClose={() => setFixTarget(null)}
                title={fixTarget ? `Fix ${fixTarget.caseFile.name} deficit` : ''}
            >
                {fixTarget && (
                    <TransferForm
                        categories={allCategories}
                        onSave={handleFixSave}
                        onCancel={() => setFixTarget(null)}
                        initial={{
                            to_category_id: fixTarget.caseFile.id,
                            from_category_id: fixTarget.donorId,
                            amount: fixTarget.caseFile.remainingDeficit.toFixed(2),
                            memo: `Cover ${fixTarget.caseFile.name} deficit (${monthShortYear(selectedMonth)})`,
                        }}
                    />
                )}
            </Modal>
        </div>
    );
}
