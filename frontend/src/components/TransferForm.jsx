import { useState } from 'react';
import { showToast } from './Toast.jsx';
import { displayCategoryName, formatYMD } from '../utils/format.js';
import './TransferForm.css';

// Category transfer form, shared by the Transfers page (create/edit) and the
// Deficits page (pre-filled "Fix now").
// - `transfer` puts the form in edit mode (button label, values from the row).
// - `initial` only seeds defaults for a new transfer; it never flips edit mode.
export function TransferForm({ categories, onSave, onCancel, transfer, initial }) {
    const seed = transfer ?? initial ?? {};
    const [formData, setFormData] = useState({
        date: seed.date?.split('T')[0] || formatYMD(new Date()),
        from_category_id: seed.from_category_id?.toString() || '',
        to_category_id: seed.to_category_id?.toString() || '',
        amount: seed.amount?.toString() || '',
        memo: seed.memo || '',
    });

    const handleSubmit = (e) => {
        e.preventDefault();

        if (formData.from_category_id === formData.to_category_id) {
            showToast('Cannot transfer to the same category');
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

    // From Category: all non-archived categories (including system)
    const fromCategoryOptions = categories.filter(c => !c.is_hidden);

    // To Category: all non-archived categories (including system)
    const toCategoryOptions = categories.filter(c => !c.is_hidden);

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
                            <option key={cat.id} value={cat.id}>{displayCategoryName(cat.name)}</option>
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
                            <option key={cat.id} value={cat.id}>{displayCategoryName(cat.name)}</option>
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
                    maxLength={80}
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
