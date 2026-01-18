import { useEffect, useState } from 'react';
import { useConfigStore } from '../stores/configStore.js';
import { Modal, ConfirmModal } from '../components/Modal.jsx';
import * as api from '../api/client.js';
import './Transfers.css';

// Format currency
function formatCurrency(amount) {
    return amount.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
    });
}

// Format date for display
function formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Get today's date in YYYY-MM-DD format
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

export default function Transfers() {
    const { categories, fetchCategories } = useConfigStore();

    // State
    const [transfers, setTransfers] = useState([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingTransfer, setEditingTransfer] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [isAutoPopulating, setIsAutoPopulating] = useState(false);
    const [autoPopulateDate, setAutoPopulateDate] = useState(getTodayDate());
    const [availableToBudget, setAvailableToBudget] = useState(null);

    // Pagination state
    const [pageSize, setPageSize] = useState(50);
    const [offset, setOffset] = useState(0);
    const [pageSizeInput, setPageSizeInput] = useState('50');

    // Computed
    const hasMore = transfers.length < total;

    // Load data
    useEffect(() => {
        fetchCategories();
        loadTransfers();
        loadAvailableToBudget();
    }, []);

    // Load Available to Budget
    const loadAvailableToBudget = async () => {
        try {
            const data = await api.getMoneyPotBalance();
            setAvailableToBudget(data.balance);
        } catch (err) {
            console.error('Failed to fetch Available to Budget:', err);
        }
    };

    // Reload when page size changes
    useEffect(() => {
        loadTransfers();
    }, [pageSize]);

    const loadTransfers = async () => {
        setIsLoading(true);
        setOffset(0);
        try {
            const result = await api.getTransfers({ limit: pageSize, offset: 0 });
            setTransfers(result.transfers);
            setTotal(result.total);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const loadMoreTransfers = async () => {
        if (isLoadingMore || !hasMore) return;

        setIsLoadingMore(true);
        const newOffset = offset + pageSize;
        try {
            const result = await api.getTransfers({ limit: pageSize, offset: newOffset });
            setTransfers(prev => [...prev, ...result.transfers]);
            setTotal(result.total);
            setOffset(newOffset);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handlePageSizeChange = (value) => {
        const validSize = Math.max(10, Math.min(500, parseInt(value) || 50));
        setPageSize(validSize);
        setPageSizeInput(validSize.toString());
    };

    const handleCreate = async (data) => {
        try {
            await api.createTransfer(data);
            setShowAddModal(false);
            loadTransfers();
            loadAvailableToBudget();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleUpdate = async (data) => {
        try {
            await api.updateTransfer(editingTransfer.id, data);
            setEditingTransfer(null);
            loadTransfers();
            loadAvailableToBudget();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.deleteTransfer(id);
            setDeleteConfirm(null);
            loadTransfers();
            loadAvailableToBudget();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleAutoPopulate = async () => {
        setIsAutoPopulating(true);
        try {
            const result = await api.autoPopulateTransfers(autoPopulateDate);
            if (result.created.length > 0) {
                loadTransfers();
                // Refresh Available to Budget in header
                window.dispatchEvent(new CustomEvent('moneywise:refresh-balance'));
            }
            // Show summary
            if (result.created.length === 0) {
                setError('All budgeted categories are already funded for this month.');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsAutoPopulating(false);
        }
    };

    return (
        <div className="transfers-page">
            {/* Available to Budget Display */}
            <div className="available-to-budget-banner">
                <div className="atb-label">Available to Budget</div>
                <div className={`atb-value ${availableToBudget !== null && availableToBudget < 0 ? 'negative' : ''}`}>
                    {availableToBudget !== null ? formatCurrency(availableToBudget) : '—'}
                </div>
            </div>

            {/* Header */}
            <div className="transfers-header">
                <div className="header-left">
                    <div>
                        <h2>🔄 Category Transfers</h2>
                        <p className="header-hint">Allocate and rebalance money between budget categories</p>
                    </div>
                    <div className="page-size-control">
                        <label>Show:</label>
                        <input
                            type="number"
                            min="10"
                            max="500"
                            value={pageSizeInput}
                            onChange={(e) => setPageSizeInput(e.target.value)}
                            onBlur={(e) => handlePageSizeChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handlePageSizeChange(e.target.value);
                                    e.target.blur();
                                }
                            }}
                            className="page-size-input"
                        />
                    </div>
                </div>
                <div className="header-actions">
                    <div className="auto-populate-section">
                        <span className="auto-populate-label">Auto-Populate for:</span>
                        <input
                            type="date"
                            value={autoPopulateDate}
                            onChange={(e) => setAutoPopulateDate(e.target.value)}
                            className="auto-populate-date"
                        />
                        <button
                            className="btn btn-secondary"
                            onClick={handleAutoPopulate}
                            disabled={isAutoPopulating}
                        >
                            {isAutoPopulating ? '⏳...' : '📥 Go'}
                        </button>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                        + New Transfer
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="error-banner">
                    <span>⚠️ {error}</span>
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            {/* Content */}
            <div className="transfers-content">
                {isLoading ? (
                    <div className="transfers-empty">
                        <div className="emoji">⏳</div>
                        <p>Loading transfers...</p>
                    </div>
                ) : transfers.length === 0 ? (
                    <div className="transfers-empty">
                        <div className="emoji">🔄</div>
                        <p>No category transfers yet</p>
                        <p className="hint">Move money between categories when you overspend or want to rebalance</p>
                    </div>
                ) : (
                    <table className="transfers-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>From</th>
                                <th></th>
                                <th>To</th>
                                <th>Amount</th>
                                <th>Memo</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {transfers.map(transfer => (
                                <tr key={transfer.id}>
                                    <td>{formatDate(transfer.date)}</td>
                                    <td>
                                        <div className="cell-with-icon">
                                            {transfer.from_category_icon && (
                                                <img src={transfer.from_category_icon} alt="" className="cell-icon" />
                                            )}
                                            <span>{transfer.from_category_name || 'Available to Budget'}</span>
                                        </div>
                                    </td>
                                    <td className="arrow-cell">→</td>
                                    <td>
                                        <div className="cell-with-icon">
                                            {transfer.to_category_icon && (
                                                <img src={transfer.to_category_icon} alt="" className="cell-icon" />
                                            )}
                                            <span>{transfer.to_category_name || 'Available to Budget'}</span>
                                        </div>
                                    </td>
                                    <td className="amount">{formatCurrency(transfer.amount)}</td>
                                    <td className="memo-cell">{transfer.memo || '—'}</td>
                                    <td>
                                        <div className="action-buttons">
                                            <button
                                                className="action-btn"
                                                onClick={() => setEditingTransfer(transfer)}
                                                title="Edit"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                className="action-btn delete"
                                                onClick={() => setDeleteConfirm(transfer)}
                                                title="Delete"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination Footer */}
            {total > 0 && (
                <div className="pagination-footer">
                    <span className="pagination-count">
                        Showing {transfers.length} of {total} transfers
                    </span>
                    <div className="pagination-actions">
                        {offset > 0 && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => loadTransfers()}
                            >
                                ↩ Reset
                            </button>
                        )}
                        {hasMore && (
                            <button
                                className="btn btn-primary btn-sm load-more-btn"
                                onClick={loadMoreTransfers}
                                disabled={isLoadingMore}
                            >
                                {isLoadingMore ? '⏳ Loading...' : '↓ Load More'}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Add Modal */}
            <Modal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                title="New Category Transfer"
            >
                <TransferForm
                    categories={categories}
                    onSave={handleCreate}
                    onCancel={() => setShowAddModal(false)}
                />
            </Modal>

            {/* Edit Modal */}
            <Modal
                isOpen={!!editingTransfer}
                onClose={() => setEditingTransfer(null)}
                title="Edit Category Transfer"
            >
                <TransferForm
                    categories={categories}
                    transfer={editingTransfer}
                    onSave={handleUpdate}
                    onCancel={() => setEditingTransfer(null)}
                />
            </Modal>

            {/* Delete Confirmation */}
            <ConfirmModal
                isOpen={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                onConfirm={() => handleDelete(deleteConfirm?.id)}
                title="Delete Transfer"
                message="Are you sure you want to delete this category transfer?"
                confirmText="Delete"
                danger
            />
        </div>
    );
}

// Transfer Form Component
// Only allows transfers between user categories (not system categories)
function TransferForm({ categories, onSave, onCancel, transfer }) {
    const [formData, setFormData] = useState({
        date: transfer?.date?.split('T')[0] || getTodayDate(),
        from_category_id: transfer?.from_category_id?.toString() || '',
        to_category_id: transfer?.to_category_id?.toString() || '',
        amount: transfer?.amount?.toString() || '',
        memo: transfer?.memo || '',
    });

    const handleSubmit = (e) => {
        e.preventDefault();

        if (formData.from_category_id === formData.to_category_id) {
            alert('Cannot transfer to the same category');
            return;
        }

        onSave({
            date: formData.date,
            from_category_id: formData.from_category_id ? parseInt(formData.from_category_id) : null,
            to_category_id: formData.to_category_id ? parseInt(formData.to_category_id) : null,
            amount: parseFloat(formData.amount),
            memo: formData.memo || null,
        });
    };

    // From Category: include "Available to Budget" system category
    const fromCategoryOptions = categories.filter(c =>
        (!c.is_system && !c.is_hidden) || c.name === 'Available to Budget'
    );

    // To Category: only user categories (not system)
    const toCategoryOptions = categories.filter(c => !c.is_system && !c.is_hidden);

    return (
        <form className="transfer-form" onSubmit={handleSubmit}>
            <div className="form-group">
                <label>Date</label>
                <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                />
            </div>

            <div className="form-row transfer-row">
                <div className="form-group">
                    <label>From Category</label>
                    <select
                        value={formData.from_category_id}
                        onChange={(e) => setFormData({ ...formData, from_category_id: e.target.value })}
                        required
                    >
                        <option value="">Select category</option>
                        {fromCategoryOptions.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>To Category</label>
                    <select
                        value={formData.to_category_id}
                        onChange={(e) => setFormData({ ...formData, to_category_id: e.target.value })}
                        required
                    >
                        <option value="">Select category</option>
                        {toCategoryOptions.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                    </select>
                </div>
            </div>

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
                />
            </div>

            <div className="form-group">
                <label>Memo (optional)</label>
                <input
                    type="text"
                    value={formData.memo}
                    onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                    placeholder="Why are you moving this money?"
                    maxLength={30}
                />
            </div>

            <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={onCancel}>
                    Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                    {transfer ? 'Save Changes' : 'Create Transfer'}
                </button>
            </div>
        </form>
    );
}
