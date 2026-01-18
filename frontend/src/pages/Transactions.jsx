import { useEffect, useState } from 'react';
import { useTransactionStore } from '../stores/transactionStore.js';
import { useConfigStore } from '../stores/configStore.js';
import { Modal, ConfirmModal } from '../components/Modal.jsx';
import './Transactions.css';

// Format currency with +/- prefix
function formatCurrency(amount) {
    const formatted = Math.abs(amount).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
    });
    return amount >= 0 ? `+${formatted}` : `-${formatted}`;
}

// Format date for display
function formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Format date for input
function formatDateForInput(dateString) {
    if (!dateString) return '';
    return dateString.split('T')[0];
}

// Get today's date in YYYY-MM-DD format
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

// ==================== MAIN COMPONENT ====================

export default function Transactions() {
    const {
        transactions,
        total,
        isLoading,
        isLoadingMore,
        error,
        filters,
        setFilters,
        setPageSize,
        resetFilters,
        resetPagination,
        hasMore,
        fetchTransactions,
        loadMore,
        createTransaction,
        updateTransaction,
        deleteTransaction,
        createAccountTransfer,
        createReconciliation,
        toggleStatus,
        clearError,
    } = useTransactionStore();

    const { accounts, categories, fetchAccounts, fetchCategories } = useConfigStore();

    // UI State
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [pendingTrayOpen, setPendingTrayOpen] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [pageSizeInput, setPageSizeInput] = useState(filters.limit.toString());

    // Load data on mount
    useEffect(() => {
        fetchTransactions();
        fetchAccounts();
        fetchCategories();
    }, []);

    // Reload when filter criteria change (but NOT offset - that's handled by loadMore)
    useEffect(() => {
        // Only refetch if we're NOT loading more (offset change triggers loadMore, not this)
        if (filters.offset === 0) {
            fetchTransactions();
        }
    }, [filters.account_id, filters.category_id, filters.status, filters.startDate, filters.endDate, filters.memo_search, filters.limit]);

    // Separate pending and settled transactions
    const pendingTransactions = transactions.filter(t => t.status === 'pending');
    const settledTransactions = transactions.filter(t => t.status === 'settled');

    // Handle add/edit transaction
    const handleSaveTransaction = async (data) => {
        try {
            // Check if this is a reconciliation entry
            if (data.isReconciliation) {
                await createReconciliation({ date: data.date });
            } else if (editingTransaction) {
                await updateTransaction(editingTransaction.id, data);
            } else {
                await createTransaction(data);
            }
            setShowAddModal(false);
            setEditingTransaction(null);
        } catch (err) {
            // Error already set in store
        }
    };

    // Handle account transfer
    const handleSaveTransfer = async (data) => {
        try {
            await createAccountTransfer(data);
            setShowTransferModal(false);
        } catch (err) {
            // Error already set in store
        }
    };

    // Handle delete
    const handleDelete = async (id) => {
        try {
            await deleteTransaction(id);
            setDeleteConfirm(null);
        } catch (err) {
            // Error already set in store
        }
    };

    // Handle quick status toggle
    // Pending → Settled: Open edit modal so user can set the date
    // Settled → Pending: Instant toggle (clears the date)
    const handleToggleStatus = async (transaction) => {
        if (transaction.status === 'pending') {
            // Open edit modal with status changed to settled and date prefilled
            setEditingTransaction({ ...transaction, status: 'settled', date: getTodayDate() });
            setShowAddModal(true);
        } else {
            // Settled → Pending: instant toggle
            try {
                await toggleStatus(transaction.id);
            } catch (err) {
                // Error already set in store
            }
        }
    };

    return (
        <div className="transactions-page">
            {/* Error Display */}
            {error && (
                <div className="card mb-md text-danger">
                    <div className="flex items-center justify-between">
                        <span>❌ {error}</span>
                        <button className="btn btn-sm" onClick={clearError}>Dismiss</button>
                    </div>
                </div>
            )}

            {/* Main layout with sidebar */}
            <div className="transactions-layout">
                {/* Sidebar Filters */}
                <div className={`filter-sidebar ${sidebarOpen ? 'open' : ''}`}>
                    <div className="sidebar-header">
                        <h3>🔍 Filters</h3>
                        <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>✕</button>
                    </div>
                    <FilterSidebar
                        filters={filters}
                        accounts={accounts}
                        categories={categories}
                        onFilterChange={setFilters}
                    />
                </div>

                {/* Main Content */}
                <div className="transactions-main">
                    {/* Header with actions */}
                    <div className="transactions-header">
                        <div className="header-left">
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                            >
                                🔍 Filter
                            </button>
                            <div className="page-size-control">
                                <label>Show:</label>
                                <input
                                    type="number"
                                    min="10"
                                    max="500"
                                    value={pageSizeInput}
                                    onChange={(e) => setPageSizeInput(e.target.value)}
                                    onBlur={(e) => {
                                        setPageSize(e.target.value);
                                        setPageSizeInput(filters.limit.toString());
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            setPageSize(e.target.value);
                                            setPageSizeInput(filters.limit.toString());
                                            e.target.blur();
                                        }
                                    }}
                                    className="page-size-input"
                                />
                            </div>
                        </div>
                        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                            + Add Transaction
                        </button>
                    </div>

                    {/* Transactions Table */}
                    <div className="transactions-table-container">
                        {isLoading && transactions.length === 0 ? (
                            <div className="transactions-empty">
                                <div className="emoji">⏳</div>
                                <p>Loading transactions...</p>
                            </div>
                        ) : settledTransactions.length === 0 && pendingTransactions.length === 0 ? (
                            <div className="transactions-empty">
                                <div className="emoji">💸</div>
                                <p>No transactions yet</p>
                                <p>Add your first transaction to get started!</p>
                            </div>
                        ) : (
                            <TransactionsTable
                                transactions={[...pendingTransactions, ...settledTransactions]}
                                accounts={accounts}
                                categories={categories}
                                onEdit={(t) => { setEditingTransaction(t); setShowAddModal(true); }}
                                onDelete={(t) => setDeleteConfirm(t)}
                                onToggleStatus={handleToggleStatus}
                            />
                        )}
                    </div>

                    {/* Pagination Footer */}
                    {total > 0 && (
                        <div className="pagination-footer">
                            <span className="pagination-count">
                                Showing {transactions.length} of {total} transactions
                            </span>
                            <div className="pagination-actions">
                                {filters.offset > 0 && (
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => {
                                            resetPagination();
                                            fetchTransactions();
                                        }}
                                    >
                                        ↩ Reset
                                    </button>
                                )}
                                {hasMore() && (
                                    <button
                                        className="btn btn-primary btn-sm load-more-btn"
                                        onClick={loadMore}
                                        disabled={isLoadingMore}
                                    >
                                        {isLoadingMore ? '⏳ Loading...' : '↓ Load More'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Add/Edit Transaction Modal */}
            <Modal
                isOpen={showAddModal}
                onClose={() => { setShowAddModal(false); setEditingTransaction(null); }}
                title={editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
            >
                <TransactionForm
                    transaction={editingTransaction}
                    accounts={accounts}
                    categories={categories}
                    onSave={handleSaveTransaction}
                    onCancel={() => { setShowAddModal(false); setEditingTransaction(null); }}
                />
            </Modal>

            {/* Delete Confirmation */}
            <ConfirmModal
                isOpen={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => handleDelete(deleteConfirm?.id)}
                title="Delete Transaction"
                message={
                    deleteConfirm?.transfer_pair_id
                        ? 'This is an account transfer. Both the inflow and outflow transactions will be deleted.'
                        : 'Are you sure you want to delete this transaction?'
                }
                confirmText="Delete"
                danger
            />
        </div>
    );
}

// ==================== FILTER SIDEBAR ====================

function FilterSidebar({ filters, accounts, categories, onFilterChange }) {
    const hasActiveFilters = filters.startDate || filters.endDate || filters.account_id || filters.category_id || filters.status || filters.memo_search;

    const clearAllFilters = () => {
        onFilterChange({
            startDate: null,
            endDate: null,
            account_id: null,
            category_id: null,
            status: null,
            memo_search: null
        });
    };

    return (
        <div className="filter-sidebar-content">
            <div className="filter-section">
                <label className="filter-label">Memo Search</label>
                <input
                    type="text"
                    className="filter-input"
                    placeholder="Search memos..."
                    value={filters.memo_search || ''}
                    onChange={(e) => onFilterChange({ memo_search: e.target.value || null })}
                />
            </div>

            <div className="filter-section">
                <label className="filter-label">Date Range</label>
                <div className="filter-field">
                    <span className="filter-sublabel">From</span>
                    <input
                        type="date"
                        className="filter-input"
                        value={filters.startDate || ''}
                        onChange={(e) => onFilterChange({ startDate: e.target.value || null })}
                    />
                </div>
                <div className="filter-field">
                    <span className="filter-sublabel">To</span>
                    <input
                        type="date"
                        className="filter-input"
                        value={filters.endDate || ''}
                        onChange={(e) => onFilterChange({ endDate: e.target.value || null })}
                    />
                </div>
            </div>

            <div className="filter-section">
                <label className="filter-label">Account</label>
                <select
                    className="filter-select"
                    value={filters.account_id || ''}
                    onChange={(e) => onFilterChange({ account_id: e.target.value || null })}
                >
                    <option value="">All Accounts</option>
                    {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                </select>
            </div>

            <div className="filter-section">
                <label className="filter-label">Category</label>
                <select
                    className="filter-select"
                    value={filters.category_id || ''}
                    onChange={(e) => onFilterChange({ category_id: e.target.value || null })}
                >
                    <option value="">All Categories</option>
                    {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                </select>
            </div>

            <div className="filter-section">
                <label className="filter-label">Status</label>
                <select
                    className="filter-select"
                    value={filters.status || ''}
                    onChange={(e) => onFilterChange({ status: e.target.value || null })}
                >
                    <option value="">All</option>
                    <option value="settled">Settled</option>
                    <option value="pending">Pending</option>
                </select>
            </div>

            {hasActiveFilters && (
                <button className="btn btn-secondary clear-filters-btn" onClick={clearAllFilters}>
                    ✕ Clear All Filters
                </button>
            )}
        </div>
    );
}

// ==================== TRANSACTIONS TABLE ====================

function TransactionsTable({ transactions, accounts, categories, onEdit, onDelete, onToggleStatus, compact, onSelectionChange }) {
    // Selection state
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [lastSelectedId, setLastSelectedId] = useState(null);

    // Separate pending and settled (in display order)
    const pendingTransactions = transactions
        .filter(t => t.status === 'pending')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const settledTransactions = transactions
        .filter(t => t.status === 'settled')
        .sort((a, b) => {
            const dateCompare = new Date(b.date) - new Date(a.date);
            if (dateCompare !== 0) return dateCompare;
            return new Date(b.created_at) - new Date(a.created_at);
        });

    // Build ordered list of selectable IDs in DISPLAY order (for correct range selection)
    const orderedSelectableIds = [
        ...pendingTransactions.filter(t => t.is_reconciliation_point !== 1).map(t => t.id),
        ...settledTransactions.filter(t => t.is_reconciliation_point !== 1).map(t => t.id)
    ];

    // Toggle single selection (called on row click)
    const handleToggleSelect = (id, event) => {
        const newSelected = new Set(selectedIds);

        // Shift+Click for range selection
        if (event?.shiftKey && lastSelectedId !== null) {
            const startIdx = orderedSelectableIds.indexOf(lastSelectedId);
            const endIdx = orderedSelectableIds.indexOf(id);
            if (startIdx !== -1 && endIdx !== -1) {
                const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
                for (let i = from; i <= to; i++) {
                    newSelected.add(orderedSelectableIds[i]);
                }
            }
        } else {
            // Regular toggle
            if (newSelected.has(id)) {
                newSelected.delete(id);
            } else {
                newSelected.add(id);
            }
        }

        setSelectedIds(newSelected);
        setLastSelectedId(id);
    };

    // Clear selection
    const handleClearSelection = () => {
        setSelectedIds(new Set());
        setLastSelectedId(null);
    };

    // Calculate aggregation values
    const selectedTransactions = transactions.filter(t => selectedIds.has(t.id));
    const sum = selectedTransactions.reduce((acc, t) => acc + t.amount, 0);
    const count = selectedTransactions.length;
    const avg = count > 0 ? sum / count : 0;

    if (transactions.length === 0) {
        return compact ? null : (
            <div className="transactions-empty">
                <p>No transactions to show</p>
            </div>
        );
    }

    return (
        <>
            <table className="transactions-table selectable">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Account</th>
                        <th>Category</th>
                        <th>Memo</th>
                        <th>Status</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {/* Pending transactions first */}
                    {pendingTransactions.map(transaction => (
                        <TransactionRow
                            key={transaction.id}
                            transaction={transaction}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onToggleStatus={onToggleStatus}
                            isSelected={selectedIds.has(transaction.id)}
                            onToggleSelect={handleToggleSelect}
                        />
                    ))}
                    {/* Divider between pending and settled */}
                    {pendingTransactions.length > 0 && settledTransactions.length > 0 && (
                        <tr className="section-divider">
                            <td colSpan="7">
                                <div className="divider-line">
                                    <span className="divider-label">Settled Transactions</span>
                                </div>
                            </td>
                        </tr>
                    )}
                    {/* Settled transactions */}
                    {settledTransactions.map(transaction => (
                        <TransactionRow
                            key={transaction.id}
                            transaction={transaction}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onToggleStatus={onToggleStatus}
                            isSelected={selectedIds.has(transaction.id)}
                            onToggleSelect={handleToggleSelect}
                        />
                    ))}
                </tbody>
            </table>

            {/* Selection Summary Bar */}
            {count > 0 && (
                <SelectionSummaryBar
                    count={count}
                    sum={sum}
                    avg={avg}
                    onClear={handleClearSelection}
                />
            )}
        </>
    );
}

// ==================== TRANSACTION ROW ====================

function TransactionRow({ transaction, onEdit, onDelete, onToggleStatus, isSelected, onToggleSelect }) {
    const isPositive = transaction.amount >= 0;
    const isTransfer = transaction.type === 'account_transfer';
    const isPending = transaction.status === 'pending';
    const isReconciliation = transaction.is_reconciliation_point === 1;

    let rowClass = '';
    if (isPending) rowClass += ' is-pending';
    if (isReconciliation) rowClass += ' is-reconciliation';
    if (isSelected) rowClass += ' selected';

    // Handle row click for selection
    const handleRowClick = (e) => {
        // Don't select if clicking on buttons
        if (e.target.closest('button')) return;
        onToggleSelect(transaction.id, e);
    };

    // For reconciliation rows, display differently (not selectable)
    if (isReconciliation) {
        return (
            <tr className={rowClass}>
                <td>{formatDate(transaction.date)}</td>
                <td colSpan="5" className="reconciliation-label">
                    <span className="reconciliation-badge">⚖️ Reconciliation Point</span>
                </td>
                <td>
                    <div className="action-buttons">
                        <button
                            className="action-btn"
                            onClick={() => onEdit(transaction)}
                            title="Edit Date"
                        >
                            ✏️
                        </button>
                        <button
                            className="action-btn delete"
                            onClick={() => onDelete(transaction)}
                            title="Delete"
                        >
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        );
    }

    return (
        <tr className={rowClass} onClick={handleRowClick}>
            <td>
                {formatDate(transaction.date)}
            </td>
            <td>
                <span className={`amount ${isPositive ? 'positive' : 'negative'}`}>
                    {formatCurrency(transaction.amount)}
                </span>
            </td>
            <td>
                <div className="cell-with-icon">
                    {transaction.account_icon && (
                        <img src={transaction.account_icon} alt="" className="cell-icon" />
                    )}
                    <span>{transaction.account_name}</span>
                </div>
            </td>
            <td>
                {isTransfer ? (
                    <span className="transfer-indicator">↕️ Transfer</span>
                ) : (
                    <div className="cell-with-icon">
                        {transaction.category_icon && (
                            <img src={transaction.category_icon} alt="" className="cell-icon" />
                        )}
                        <span>{transaction.category_name || <span className="text-muted">—</span>}</span>
                    </div>
                )}
            </td>
            <td className="memo-cell" title={transaction.memo || ''}>
                {transaction.memo || <span className="text-muted">—</span>}
            </td>
            <td>
                <button
                    className={`status-toggle ${transaction.status}`}
                    onClick={(e) => { e.stopPropagation(); onToggleStatus(transaction); }}
                    title={isPending ? 'Click to settle' : 'Click to mark pending'}
                >
                    {isPending ? '🅿️' : '✅'}
                </button>
            </td>
            <td>
                <div className="action-buttons">
                    <button
                        className="action-btn"
                        onClick={(e) => { e.stopPropagation(); onEdit(transaction); }}
                        title="Edit"
                    >
                        ✏️
                    </button>
                    <button
                        className="action-btn delete"
                        onClick={(e) => { e.stopPropagation(); onDelete(transaction); }}
                        title="Delete"
                    >
                        🗑️
                    </button>
                </div>
            </td>
        </tr>
    );
}

// ==================== SELECTION SUMMARY BAR ====================

function SelectionSummaryBar({ count, sum, avg, onClear }) {
    const formatAmount = (amount) => {
        const formatted = Math.abs(amount).toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
        });
        return amount >= 0 ? `+${formatted}` : `-${formatted}`;
    };

    const sumIsPositive = sum >= 0;
    const avgIsPositive = avg >= 0;

    return (
        <div className="selection-summary-bar">
            <div className="summary-stats">
                <div className="summary-stat">
                    <span className="stat-label">Selected</span>
                    <span className="stat-value">{count}</span>
                </div>
                <div className="summary-stat">
                    <span className="stat-label">Sum</span>
                    <span className={`stat-value ${sumIsPositive ? 'positive' : 'negative'}`}>
                        {formatAmount(sum)}
                    </span>
                </div>
                <div className="summary-stat">
                    <span className="stat-label">Avg</span>
                    <span className={`stat-value ${avgIsPositive ? 'positive' : 'negative'}`}>
                        {formatAmount(avg)}
                    </span>
                </div>
            </div>
            <button className="summary-close" onClick={onClear} title="Clear selection">
                ✕
            </button>
        </div>
    );
}

// ==================== TRANSACTION FORM ====================

function TransactionForm({ transaction, accounts, categories, onSave, onCancel }) {
    // Determine initial flow direction from existing amount
    const initialIsInflow = transaction?.amount ? transaction.amount >= 0 : false;
    const initialAmount = transaction?.amount ? Math.abs(transaction.amount) : '';

    const [formData, setFormData] = useState({
        status: transaction?.status || 'pending',
        date: transaction?.date ? formatDateForInput(transaction.date) : getTodayDate(),
        amount: initialAmount,
        isInflow: initialIsInflow,
        account_id: transaction?.account_id || '',
        category_id: transaction?.category_id || '',
        memo: transaction?.memo || '',
    });

    const isPending = formData.status === 'pending';
    const isReconciliation = formData.status === 'reconciliation';

    const handleSubmit = (e) => {
        e.preventDefault();

        // For reconciliation, only send date and flag
        if (isReconciliation) {
            onSave({
                date: formData.date,
                isReconciliation: true,
            });
            return;
        }

        const amount = parseFloat(formData.amount);
        onSave({
            date: isPending ? null : formData.date,
            amount: formData.isInflow ? amount : -amount,
            account_id: parseInt(formData.account_id),
            category_id: formData.category_id ? parseInt(formData.category_id) : null,
            memo: formData.memo,
            status: formData.status,
            type: 'regular',
        });
    };

    return (
        <form className="transaction-form" onSubmit={handleSubmit}>
            {/* Status Toggle - First */}
            <div className="form-group">
                <label>Transaction Status</label>
                <div className="status-toggle-group">
                    <button
                        type="button"
                        className={`status-btn ${formData.status === 'settled' ? 'active settled' : ''}`}
                        onClick={() => setFormData({ ...formData, status: 'settled' })}
                    >
                        ✅ Settled
                    </button>
                    <button
                        type="button"
                        className={`status-btn ${isPending ? 'active pending' : ''}`}
                        onClick={() => setFormData({ ...formData, status: 'pending' })}
                    >
                        🅿️ Pending
                    </button>
                    <button
                        type="button"
                        className={`status-btn ${isReconciliation ? 'active reconciliation' : ''}`}
                        onClick={() => setFormData({ ...formData, status: 'reconciliation' })}
                    >
                        ⚖️ Reconciliation
                    </button>
                </div>
                {isPending && (
                    <p className="form-hint">Pending transactions have no date until settled.</p>
                )}
                {isReconciliation && (
                    <p className="form-hint">Mark that you've verified all account balances are correct as of this date.</p>
                )}
            </div>

            {/* Reconciliation: Only show date */}
            {isReconciliation && (
                <div className="form-group">
                    <label>Reconciliation Date</label>
                    <input
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        required
                    />
                </div>
            )}

            {/* Regular transaction fields - hide if reconciliation */}
            {!isReconciliation && (
                <>
                    {/* Date - Only show if not pending */}
                    {!isPending && (
                        <div className="form-row">
                            <div className="form-group">
                                <label>Date</label>
                                <input
                                    type="date"
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Account</label>
                                <select
                                    value={formData.account_id}
                                    onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                                    required
                                >
                                    <option value="">Select Account</option>
                                    {accounts.filter(acc => !acc.is_hidden).map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Account - Show alone if pending */}
                    {isPending && (
                        <div className="form-group">
                            <label>Account</label>
                            <select
                                value={formData.account_id}
                                onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                                required
                            >
                                <option value="">Select Account</option>
                                {accounts.filter(acc => !acc.is_hidden).map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="form-group">
                        <label>Flow Direction</label>
                        <div className="flow-toggle">
                            <button
                                type="button"
                                className={`flow-btn outflow ${!formData.isInflow ? 'active' : ''}`}
                                onClick={() => setFormData({ ...formData, isInflow: false })}
                            >
                                ⬇️ Outflow
                            </button>
                            <button
                                type="button"
                                className={`flow-btn inflow ${formData.isInflow ? 'active' : ''}`}
                                onClick={() => setFormData({ ...formData, isInflow: true })}
                            >
                                ⬆️ Inflow
                            </button>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Amount</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={formData.amount}
                                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                required
                                placeholder="$0.00"
                                className={formData.isInflow ? 'amount-inflow' : 'amount-outflow'}
                            />
                        </div>
                        <div className="form-group">
                            <label>Category</label>
                            <select
                                value={formData.category_id}
                                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                            >
                                <option value="">No Category</option>
                                {categories.filter(cat => !cat.is_hidden && !cat.is_system).map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Memo (optional)</label>
                        <input
                            type="text"
                            value={formData.memo}
                            onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                            placeholder="Add a note..."
                            className="memo-input"
                            maxLength={30}
                        />
                    </div>

                </>
            )}

            <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={onCancel}>
                    Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                    {isReconciliation ? 'Create Reconciliation' : (transaction ? 'Save Changes' : 'Add Transaction')}
                </button>
            </div>
        </form>
    );
}

// ==================== TRANSFER FORM ====================

function TransferForm({ accounts, onSave, onCancel }) {
    const [formData, setFormData] = useState({
        date: getTodayDate(),
        amount: '',
        from_account_id: '',
        to_account_id: '',
        memo: '',
        status: 'settled',
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (formData.from_account_id === formData.to_account_id) {
            alert('Cannot transfer to the same account');
            return;
        }
        onSave({
            ...formData,
            amount: parseFloat(formData.amount),
            from_account_id: parseInt(formData.from_account_id),
            to_account_id: parseInt(formData.to_account_id),
        });
    };

    return (
        <form className="transaction-form" onSubmit={handleSubmit}>
            <div className="form-row">
                <div className="form-group">
                    <label>Date</label>
                    <input
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        required
                    />
                </div>
                <div className="form-group">
                    <label>Amount</label>
                    <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="Amount to transfer"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        required
                    />
                </div>
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label>From Account</label>
                    <select
                        value={formData.from_account_id}
                        onChange={(e) => setFormData({ ...formData, from_account_id: e.target.value })}
                        required
                    >
                        <option value="">Select Account</option>
                        {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label>To Account</label>
                    <select
                        value={formData.to_account_id}
                        onChange={(e) => setFormData({ ...formData, to_account_id: e.target.value })}
                        required
                    >
                        <option value="">Select Account</option>
                        {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="transfer-arrow">↕️</div>

            <div className="form-row single">
                <div className="form-group">
                    <label>Memo</label>
                    <input
                        type="text"
                        placeholder="Optional description"
                        value={formData.memo}
                        onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                        maxLength={30}
                    />
                </div>
            </div>

            <div className="form-row single">
                <div className="form-group">
                    <label>Status</label>
                    <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                        <option value="settled">✅ Settled</option>
                        <option value="pending">🅿️ Pending</option>
                    </select>
                </div>
            </div>

            <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={onCancel}>
                    Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                    Create Transfer
                </button>
            </div>
        </form>
    );
}
