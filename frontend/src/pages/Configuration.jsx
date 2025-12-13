import { useEffect, useState } from 'react';
import { useConfigStore } from '../stores/configStore.js';
import { Modal, ConfirmModal } from '../components/Modal.jsx';
import * as api from '../api/client.js';
import './Configuration.css';

// Type display helpers
const ACCOUNT_TYPES = {
    bank: { label: '🏦 Bank Account', emoji: '🏦' },
    credit_card: { label: '💳 Credit Card', emoji: '💳' },
};

const CATEGORY_TYPES = {
    reportable: { label: '✧ Reportable', emoji: '✧', color: '#22c55e' },
    non_reportable: { label: '※ Non-reportable', emoji: '※', color: '#f59e0b' },
    credit_card: { label: '◘ Credit Card', emoji: '◘', color: '#6366f1' },
};

export default function Configuration() {
    const {
        accounts, categories, categoryGroups, showHidden,
        fetchAll, toggleShowHidden,
        createAccount, updateAccount, deleteAccount,
        createCategoryGroup, updateCategoryGroup, deleteCategoryGroup,
        createCategory, updateCategory, deleteCategory,
        error, clearError,
    } = useConfigStore();

    const [activeTab, setActiveTab] = useState('accounts');

    // Modal states
    const [accountModal, setAccountModal] = useState({ open: false, account: null });
    const [groupModal, setGroupModal] = useState({ open: false, group: null });
    const [categoryModal, setCategoryModal] = useState({ open: false, category: null });
    const [deleteModal, setDeleteModal] = useState({ open: false, type: null, item: null });
    const [historyModal, setHistoryModal] = useState({ open: false, category: null, history: [] });

    useEffect(() => {
        fetchAll();
    }, [showHidden]);

    // Auto-clear error after 5s
    useEffect(() => {
        if (error) {
            const timer = setTimeout(clearError, 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    // ==================== ACCOUNT HANDLERS ====================

    const handleSaveAccount = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            name: formData.get('name'),
            type: formData.get('type'),
        };

        try {
            if (accountModal.account) {
                await updateAccount(accountModal.account.id, data);
            } else {
                await createAccount(data);
            }
            setAccountModal({ open: false, account: null });
        } catch (err) {
            // Error handled by store
        }
    };

    const handleToggleAccountHidden = async (account) => {
        await updateAccount(account.id, { is_hidden: !account.is_hidden });
    };

    const handleDeleteAccount = async () => {
        try {
            await deleteAccount(deleteModal.item.id);
            setDeleteModal({ open: false, type: null, item: null });
        } catch (err) {
            setDeleteModal({ open: false, type: null, item: null });
        }
    };

    // ==================== CATEGORY GROUP HANDLERS ====================

    const handleSaveGroup = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = { name: formData.get('name') };

        try {
            if (groupModal.group) {
                await updateCategoryGroup(groupModal.group.id, data);
            } else {
                await createCategoryGroup(data);
            }
            setGroupModal({ open: false, group: null });
        } catch (err) {
            // Error handled by store
        }
    };

    const handleDeleteGroup = async () => {
        try {
            await deleteCategoryGroup(deleteModal.item.id);
            setDeleteModal({ open: false, type: null, item: null });
        } catch (err) {
            setDeleteModal({ open: false, type: null, item: null });
        }
    };

    // ==================== CATEGORY HANDLERS ====================

    const handleSaveCategory = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            name: formData.get('name'),
            type: formData.get('type'),
            group_id: formData.get('group_id') || null,
            monthly_amount: parseFloat(formData.get('monthly_amount')) || 0,
        };

        try {
            if (categoryModal.category) {
                await updateCategory(categoryModal.category.id, data);
            } else {
                await createCategory(data);
            }
            setCategoryModal({ open: false, category: null });
        } catch (err) {
            // Error handled by store
        }
    };

    const handleToggleCategoryHidden = async (category) => {
        await updateCategory(category.id, { is_hidden: !category.is_hidden });
    };

    const handleDeleteCategory = async () => {
        try {
            await deleteCategory(deleteModal.item.id);
            setDeleteModal({ open: false, type: null, item: null });
        } catch (err) {
            setDeleteModal({ open: false, type: null, item: null });
        }
    };

    const handleShowHistory = async (category) => {
        try {
            const history = await api.getCategoryHistory(category.id);
            setHistoryModal({ open: true, category, history });
        } catch (err) {
            console.error('Failed to fetch history:', err);
        }
    };

    // Group categories by group_id
    const groupedCategories = categories.reduce((acc, cat) => {
        const groupId = cat.group_id || 'ungrouped';
        if (!acc[groupId]) acc[groupId] = [];
        acc[groupId].push(cat);
        return acc;
    }, {});

    return (
        <div className="configuration-page">
            <div className="config-header">
                <h1>⚙️ Configuration</h1>
                <label className="show-hidden-toggle">
                    <input
                        type="checkbox"
                        checked={showHidden}
                        onChange={toggleShowHidden}
                    />
                    <span>Show hidden items</span>
                </label>
            </div>

            {error && (
                <div className="error-banner">
                    <span>⚠️ {error}</span>
                    <button onClick={clearError}>×</button>
                </div>
            )}

            <div className="config-tabs">
                <button
                    className={`tab ${activeTab === 'accounts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('accounts')}
                >
                    🏦 Accounts
                </button>
                <button
                    className={`tab ${activeTab === 'categories' ? 'active' : ''}`}
                    onClick={() => setActiveTab('categories')}
                >
                    📁 Categories
                </button>
            </div>

            <div className="config-content">
                {activeTab === 'accounts' && (
                    <div className="accounts-section">
                        <div className="section-header">
                            <h2>Accounts</h2>
                            <button
                                className="btn btn-primary"
                                onClick={() => setAccountModal({ open: true, account: null })}
                            >
                                + Add Account
                            </button>
                        </div>

                        <div className="items-grid">
                            {accounts.length === 0 ? (
                                <div className="empty-state">
                                    <span className="empty-icon">🏦</span>
                                    <p>No accounts yet. Add your first account!</p>
                                </div>
                            ) : (
                                accounts.map((account) => (
                                    <div
                                        key={account.id}
                                        className={`item-card ${account.is_hidden ? 'hidden-item' : ''}`}
                                    >
                                        <div className="item-icon">
                                            {ACCOUNT_TYPES[account.type].emoji}
                                        </div>
                                        <div className="item-info">
                                            <h3>{account.name}</h3>
                                            <span className="item-type">
                                                {ACCOUNT_TYPES[account.type].label}
                                            </span>
                                        </div>
                                        <div className="item-actions">
                                            <button
                                                className="btn btn-ghost"
                                                onClick={() => setAccountModal({ open: true, account })}
                                                title="Edit"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                className="btn btn-ghost"
                                                onClick={() => handleToggleAccountHidden(account)}
                                                title={account.is_hidden ? 'Show' : 'Hide'}
                                            >
                                                {account.is_hidden ? '👁️' : '🙈'}
                                            </button>
                                            <button
                                                className="btn btn-ghost"
                                                onClick={() => setDeleteModal({ open: true, type: 'account', item: account })}
                                                title="Delete"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'categories' && (
                    <div className="categories-section">
                        {/* Category Groups */}
                        <div className="section-header">
                            <h2>✦ Category Groups</h2>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={() => setGroupModal({ open: true, group: null })}
                            >
                                + Add Group
                            </button>
                        </div>

                        <div className="groups-list">
                            {categoryGroups.length === 0 ? (
                                <p className="no-groups">No groups yet. Categories can be standalone or grouped.</p>
                            ) : (
                                categoryGroups.map((group) => (
                                    <div key={group.id} className="group-chip">
                                        <span>✦ {group.name}</span>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => setGroupModal({ open: true, group })}
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => setDeleteModal({ open: true, type: 'group', item: group })}
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Categories */}
                        <div className="section-header" style={{ marginTop: '2rem' }}>
                            <h2>✧ Categories</h2>
                            <button
                                className="btn btn-primary"
                                onClick={() => setCategoryModal({ open: true, category: null })}
                            >
                                + Add Category
                            </button>
                        </div>

                        {/* Ungrouped categories first */}
                        {groupedCategories['ungrouped'] && (
                            <div className="category-group">
                                <h3 className="group-title">📂 Ungrouped</h3>
                                <div className="items-grid">
                                    {groupedCategories['ungrouped'].map((category) => (
                                        <CategoryCard
                                            key={category.id}
                                            category={category}
                                            onEdit={() => setCategoryModal({ open: true, category })}
                                            onToggleHidden={() => handleToggleCategoryHidden(category)}
                                            onDelete={() => setDeleteModal({ open: true, type: 'category', item: category })}
                                            onShowHistory={() => handleShowHistory(category)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Grouped categories */}
                        {categoryGroups.map((group) => (
                            groupedCategories[group.id] && (
                                <div key={group.id} className="category-group">
                                    <h3 className="group-title">✦ {group.name}</h3>
                                    <div className="items-grid">
                                        {groupedCategories[group.id].map((category) => (
                                            <CategoryCard
                                                key={category.id}
                                                category={category}
                                                onEdit={() => setCategoryModal({ open: true, category })}
                                                onToggleHidden={() => handleToggleCategoryHidden(category)}
                                                onDelete={() => setDeleteModal({ open: true, type: 'category', item: category })}
                                                onShowHistory={() => handleShowHistory(category)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )
                        ))}

                        {categories.length === 0 && (
                            <div className="empty-state">
                                <span className="empty-icon">📁</span>
                                <p>No categories yet. Add your first category!</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Account Modal */}
            <Modal
                isOpen={accountModal.open}
                onClose={() => setAccountModal({ open: false, account: null })}
                title={accountModal.account ? '✏️ Edit Account' : '🏦 New Account'}
            >
                <form onSubmit={handleSaveAccount}>
                    <div className="form-group">
                        <label>Account Name</label>
                        <input
                            name="name"
                            type="text"
                            placeholder="e.g., Checking, Savings, Visa..."
                            defaultValue={accountModal.account?.name || ''}
                            required
                            autoFocus
                        />
                    </div>
                    <div className="form-group">
                        <label>Account Type</label>
                        <select
                            name="type"
                            defaultValue={accountModal.account?.type || 'bank'}
                        >
                            <option value="bank">🏦 Bank Account</option>
                            <option value="credit_card">💳 Credit Card</option>
                        </select>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setAccountModal({ open: false, account: null })}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            {accountModal.account ? 'Save Changes' : 'Create Account'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Group Modal */}
            <Modal
                isOpen={groupModal.open}
                onClose={() => setGroupModal({ open: false, group: null })}
                title={groupModal.group ? '✏️ Edit Group' : '✦ New Category Group'}
            >
                <form onSubmit={handleSaveGroup}>
                    <div className="form-group">
                        <label>Group Name</label>
                        <input
                            name="name"
                            type="text"
                            placeholder="e.g., Monthly Bills, Savings Goals..."
                            defaultValue={groupModal.group?.name || ''}
                            required
                            autoFocus
                        />
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setGroupModal({ open: false, group: null })}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            {groupModal.group ? 'Save Changes' : 'Create Group'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Category Modal */}
            <Modal
                isOpen={categoryModal.open}
                onClose={() => setCategoryModal({ open: false, category: null })}
                title={categoryModal.category ? '✏️ Edit Category' : '✧ New Category'}
            >
                <form onSubmit={handleSaveCategory}>
                    <div className="form-group">
                        <label>Category Name</label>
                        <input
                            name="name"
                            type="text"
                            placeholder="e.g., Groceries, Rent, Entertainment..."
                            defaultValue={categoryModal.category?.name || ''}
                            required
                            autoFocus
                        />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Type</label>
                            <select
                                name="type"
                                defaultValue={categoryModal.category?.type || 'reportable'}
                            >
                                <option value="reportable">✧ Reportable</option>
                                <option value="non_reportable">※ Non-reportable</option>
                                <option value="credit_card">◘ Credit Card</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Group</label>
                            <select
                                name="group_id"
                                defaultValue={categoryModal.category?.group_id || ''}
                            >
                                <option value="">No Group</option>
                                {categoryGroups.map((group) => (
                                    <option key={group.id} value={group.id}>
                                        ✦ {group.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Monthly Budget Amount</label>
                        <input
                            name="monthly_amount"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            defaultValue={categoryModal.category?.monthly_amount || ''}
                        />
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setCategoryModal({ open: false, category: null })}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            {categoryModal.category ? 'Save Changes' : 'Create Category'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={deleteModal.open}
                onClose={() => setDeleteModal({ open: false, type: null, item: null })}
                onConfirm={() => {
                    if (deleteModal.type === 'account') handleDeleteAccount();
                    else if (deleteModal.type === 'group') handleDeleteGroup();
                    else if (deleteModal.type === 'category') handleDeleteCategory();
                }}
                title={`Delete ${deleteModal.type}?`}
                message={`Are you sure you want to delete "${deleteModal.item?.name}"? This cannot be undone.`}
            />

            {/* History Modal */}
            <Modal
                isOpen={historyModal.open}
                onClose={() => setHistoryModal({ open: false, category: null, history: [] })}
                title={`📜 Rename History: ${historyModal.category?.name}`}
            >
                {historyModal.history.length === 0 ? (
                    <p className="no-history">No rename history for this category.</p>
                ) : (
                    <div className="history-list">
                        {historyModal.history.map((item, index) => (
                            <div key={index} className="history-item">
                                <span className="history-change">
                                    <span className="old-name">{item.old_name}</span>
                                    <span className="arrow">→</span>
                                    <span className="new-name">{item.new_name}</span>
                                </span>
                                <span className="history-date">
                                    {new Date(item.changed_at).toLocaleDateString()}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={() => setHistoryModal({ open: false, category: null, history: [] })}>
                        Close
                    </button>
                </div>
            </Modal>
        </div>
    );
}

// Category Card Component
function CategoryCard({ category, onEdit, onToggleHidden, onDelete, onShowHistory }) {
    const typeInfo = CATEGORY_TYPES[category.type];

    return (
        <div className={`item-card ${category.is_hidden ? 'hidden-item' : ''}`}>
            <div
                className="item-icon category-icon"
                style={{ color: typeInfo.color }}
            >
                {typeInfo.emoji}
            </div>
            <div className="item-info">
                <h3>{category.name}</h3>
                <span className="item-type" style={{ color: typeInfo.color }}>
                    {typeInfo.label}
                </span>
                {category.monthly_amount > 0 && (
                    <span className="monthly-amount">
                        💰 ${category.monthly_amount.toFixed(2)}/mo
                    </span>
                )}
            </div>
            <div className="item-actions">
                <button
                    className="btn btn-ghost"
                    onClick={onShowHistory}
                    title="Rename History"
                >
                    📜
                </button>
                <button
                    className="btn btn-ghost"
                    onClick={onEdit}
                    title="Edit"
                >
                    ✏️
                </button>
                <button
                    className="btn btn-ghost"
                    onClick={onToggleHidden}
                    title={category.is_hidden ? 'Show' : 'Hide'}
                >
                    {category.is_hidden ? '👁️' : '🙈'}
                </button>
                <button
                    className="btn btn-ghost"
                    onClick={onDelete}
                    title="Delete"
                >
                    🗑️
                </button>
            </div>
        </div>
    );
}
