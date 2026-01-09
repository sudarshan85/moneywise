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
    const [error, setError] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingTransfer, setEditingTransfer] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // Load data
    useEffect(() => {
        fetchCategories();
        loadTransfers();
    }, []);

    const loadTransfers = async () => {
        setIsLoading(true);
        try {
            const result = await api.getTransfers();
            setTransfers(result.transfers);
            setTotal(result.total);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = async (data) => {
        try {
            await api.createTransfer(data);
            setShowAddModal(false);
            loadTransfers();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleUpdate = async (data) => {
        try {
            await api.updateTransfer(editingTransfer.id, data);
            setEditingTransfer(null);
            loadTransfers();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.deleteTransfer(id);
            setDeleteConfirm(null);
            loadTransfers();
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="transfers-page">
            {/* Header */}
            <div className="transfers-header">
                <h2>🔄 Category Transfers</h2>
                <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                    + New Transfer
                </button>
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
                        <p className="hint">Move money between budget categories when you overspend</p>
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

            {/* Total count */}
            {total > 0 && (
                <div className="text-muted text-sm mt-md">
                    {total} transfer{total !== 1 ? 's' : ''}
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
function TransferForm({ categories, onSave, onCancel, transfer }) {
    // Find Available to Budget category to use as default
    const availableToBudgetCategory = categories.find(c => c.name === 'Available to Budget');

    // Get current month name for default memo
    const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const [formData, setFormData] = useState({
        date: transfer?.date?.split('T')[0] || getTodayDate(),
        from_category_id: transfer?.from_category_id?.toString() || availableToBudgetCategory?.id?.toString() || '',
        to_category_id: transfer?.to_category_id?.toString() || '',
        amount: transfer?.amount?.toString() || '',
        memo: transfer?.memo || (transfer ? '' : `Allocation for ${currentMonth}`),
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

    // Filter out system categories except Available to Budget for the dropdowns
    const categoryOptions = categories.filter(c => !c.is_system || c.name === 'Available to Budget');

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
                        {categoryOptions.map(cat => (
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
                        {categoryOptions.map(cat => (
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
