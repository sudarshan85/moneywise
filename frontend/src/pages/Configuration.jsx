import { useEffect, useState, useRef } from 'react';
import { useConfigStore } from '../stores/configStore.js';
import { Modal, ConfirmModal } from '../components/Modal.jsx';
import IconPicker from '../components/IconPicker.jsx';
import * as api from '../api/client.js';
import './Configuration.css';

// Account types
const ACCOUNT_TYPES = {
    bank: { label: 'Bank Account' },
    credit_card: { label: 'Credit Card' },
    cash: { label: 'Cash' },
    investment: { label: 'Investment' },
    retirement: { label: 'Retirement' },
    loan: { label: 'Loan' },
};

// Default icons
const DEFAULT_ICONS = {
    account: '/icons/briefcase.png',
    category: '/icons/cat.png',
    hide: '/icons/hide.png',
    edit: '/icons/edit.png',
};

// Helper to check if icon is an emoji vs image path
function isEmoji(str) {
    if (!str) return false;
    // Check if string starts with / (path) or contains typical emoji unicode ranges
    return !str.startsWith('/') && !str.startsWith('http');
}

// Render icon - handles both emoji and image paths
function IconDisplay({ icon, fallback, className = 'custom-icon' }) {
    const iconSrc = icon || fallback;
    if (isEmoji(iconSrc)) {
        return <span className={`${className} emoji-icon`}>{iconSrc}</span>;
    }
    return <img src={iconSrc} alt="" className={className} />;
}

export default function Configuration() {
    const {
        accounts, categories, settings, showHidden,
        fetchAll, toggleShowHidden,
        createAccount, updateAccount, deleteAccount,
        createCategory, updateCategory, deleteCategory,
        error, clearError,
    } = useConfigStore();

    const [activeTab, setActiveTab] = useState('accounts');

    // Modal states
    const [accountModal, setAccountModal] = useState({ open: false, account: null, icon: null });
    const [categoryModal, setCategoryModal] = useState({ open: false, category: null, icon: null });
    const [deleteModal, setDeleteModal] = useState({ open: false, type: null, item: null });
    const [historyModal, setHistoryModal] = useState({ open: false, category: null, history: [] });
    const [monthlyIncome, setMonthlyIncome] = useState('');
    const [isEditingIncome, setIsEditingIncome] = useState(false);

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

    // Load monthly income from settings
    useEffect(() => {
        if (settings?.monthly_income) {
            setMonthlyIncome(settings.monthly_income);
        }
    }, [settings]);

    // Reset icon when modal opens
    useEffect(() => {
        if (accountModal.open) {
            setAccountModal(prev => ({ ...prev, icon: prev.account?.icon || null }));
        }
    }, [accountModal.open]);

    useEffect(() => {
        if (categoryModal.open) {
            setCategoryModal(prev => ({ ...prev, icon: prev.category?.icon || null }));
        }
    }, [categoryModal.open]);

    // ==================== ACCOUNT HANDLERS ====================

    const handleSaveAccount = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            name: formData.get('name'),
            type: formData.get('type'),
            icon: accountModal.icon,
            in_moneypot: formData.get('in_moneypot') === 'on',
        };

        try {
            if (accountModal.account) {
                await updateAccount(accountModal.account.id, data);
            } else {
                await createAccount(data);
            }
            setAccountModal({ open: false, account: null, icon: null });
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

    // ==================== CATEGORY HANDLERS ====================

    const handleSaveCategory = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            name: formData.get('name'),
            icon: categoryModal.icon,
            monthly_amount: parseFloat(formData.get('monthly_amount')) || 0,
        };

        try {
            if (categoryModal.category) {
                await updateCategory(categoryModal.category.id, data);
            } else {
                await createCategory(data);
            }
            setCategoryModal({ open: false, category: null, icon: null });
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

    // Separate system and user categories
    const systemCategories = categories.filter(c => c.is_system);

    // Sort user categories: those with monthly_amount > 0 first, then alphabetically
    const userCategories = categories
        .filter(c => !c.is_system)
        .sort((a, b) => {
            // First, prioritize categories with monthly amounts
            if (a.monthly_amount > 0 && b.monthly_amount === 0) return -1;
            if (a.monthly_amount === 0 && b.monthly_amount > 0) return 1;
            // Then sort alphabetically
            return a.name.localeCompare(b.name);
        });

    // Sort accounts alphabetically
    const sortedAccounts = [...accounts].sort((a, b) => a.name.localeCompare(b.name));

    return (
        <div className="configuration-page">
            <div className="config-header">
                <h1>⚙️ Configuration</h1>
                <div className="header-right">
                    <div className="monthly-income-field">
                        <label>Monthly Income:</label>
                        {isEditingIncome ? (
                            <input
                                type="number"
                                value={monthlyIncome}
                                onChange={(e) => setMonthlyIncome(e.target.value)}
                                onBlur={async () => {
                                    await api.updateSettings({ monthly_income: monthlyIncome });
                                    setIsEditingIncome(false);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.target.blur();
                                    }
                                }}
                                autoFocus
                                className="income-input"
                            />
                        ) : (
                            <span
                                className="income-value"
                                onClick={() => setIsEditingIncome(true)}
                                title="Click to edit"
                            >
                                ${parseFloat(monthlyIncome || 0).toLocaleString()}
                            </span>
                        )}
                    </div>
                    <label className="show-hidden-toggle">
                        <input
                            type="checkbox"
                            checked={showHidden}
                            onChange={toggleShowHidden}
                        />
                        <span>Show hidden items</span>
                    </label>
                </div>
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
                    <img src={DEFAULT_ICONS.account} alt="" className="tab-icon" />
                    Accounts
                </button>
                <button
                    className={`tab ${activeTab === 'categories' ? 'active' : ''}`}
                    onClick={() => setActiveTab('categories')}
                >
                    <img src={DEFAULT_ICONS.category} alt="" className="tab-icon" />
                    Categories
                </button>
                <button
                    className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
                    onClick={() => setActiveTab('settings')}
                >
                    ⚙️ Settings
                </button>
            </div>

            <div className="config-content">
                {activeTab === 'accounts' && (
                    <div className="accounts-section">
                        <div className="section-header">
                            <h2>
                                Accounts <span className="count-badge">({sortedAccounts.length})</span>
                            </h2>
                            <button
                                className="btn btn-primary"
                                onClick={() => setAccountModal({ open: true, account: null, icon: null })}
                            >
                                + Add Account
                            </button>
                        </div>

                        <div className="items-grid">
                            {sortedAccounts.length === 0 ? (
                                <div className="empty-state">
                                    <img src={DEFAULT_ICONS.account} alt="" className="empty-icon-img" />
                                    <p>No accounts yet. Add your first account!</p>
                                </div>
                            ) : (
                                sortedAccounts.map((account) => (
                                    <AccountCard
                                        key={account.id}
                                        account={account}
                                        onEdit={() => setAccountModal({ open: true, account, icon: account.icon })}
                                        onToggleHidden={() => handleToggleAccountHidden(account)}
                                        onDelete={() => setDeleteModal({ open: true, type: 'account', item: account })}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'categories' && (
                    <div className="categories-section">
                        {/* System Categories */}
                        <div className="section-header">
                            <h2>🔒 System Categories</h2>
                        </div>
                        <div className="items-grid">
                            {systemCategories.map((category) => (
                                <div key={category.id} className="item-card system-item">
                                    <div className="item-icon">
                                        <img src={category.icon || '/icons/tag.png'} alt="" className="custom-icon" />
                                    </div>
                                    <div className="item-info">
                                        <h3>{category.name}</h3>
                                        <span className="system-badge">System</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* User Categories */}
                        <div className="section-header" style={{ marginTop: '2rem' }}>
                            <h2>
                                <img src={DEFAULT_ICONS.category} alt="" className="section-icon" />
                                Categories <span className="count-badge">({userCategories.length})</span>
                            </h2>
                            <button
                                className="btn btn-primary"
                                onClick={() => setCategoryModal({ open: true, category: null, icon: null })}
                            >
                                + Add Category
                            </button>
                        </div>

                        <div className="items-grid">
                            {userCategories.length === 0 ? (
                                <div className="empty-state">
                                    <img src={DEFAULT_ICONS.category} alt="" className="empty-icon-img" />
                                    <p>No categories yet. Add your first category!</p>
                                </div>
                            ) : (
                                userCategories.map((category) => (
                                    <CategoryCard
                                        key={category.id}
                                        category={category}
                                        onEdit={() => setCategoryModal({ open: true, category, icon: category.icon })}
                                        onToggleHidden={() => handleToggleCategoryHidden(category)}
                                        onDelete={() => setDeleteModal({ open: true, type: 'category', item: category })}
                                        onShowHistory={() => handleShowHistory(category)}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="settings-section">
                        <div className="section-header">
                            <h2>⚙️ Settings</h2>
                        </div>

                        <div className="settings-grid">
                            {/* Display Settings */}
                            <div className="setting-group">
                                <h3>📊 Display Settings</h3>

                                <div className="setting-item">
                                    <label>Default Page Size (Transactions)</label>
                                    <div className="setting-input-row">
                                        <input
                                            type="number"
                                            min="10"
                                            max="500"
                                            value={settings.default_transactions_page_size || 50}
                                            onChange={async (e) => {
                                                const value = Math.max(10, Math.min(500, parseInt(e.target.value) || 50));
                                                await api.updateSettings({ default_transactions_page_size: value.toString() });
                                                fetchAll();
                                            }}
                                            className="setting-number-input"
                                        />
                                        <span className="setting-unit">records</span>
                                    </div>
                                    <p className="setting-hint">Number of transactions to load initially (10-500)</p>
                                </div>

                                <div className="setting-item">
                                    <label>Default Page Size (Transfers)</label>
                                    <div className="setting-input-row">
                                        <input
                                            type="number"
                                            min="10"
                                            max="500"
                                            value={settings.default_transfers_page_size || 50}
                                            onChange={async (e) => {
                                                const value = Math.max(10, Math.min(500, parseInt(e.target.value) || 50));
                                                await api.updateSettings({ default_transfers_page_size: value.toString() });
                                                fetchAll();
                                            }}
                                            className="setting-number-input"
                                        />
                                        <span className="setting-unit">records</span>
                                    </div>
                                    <p className="setting-hint">Number of transfers to load initially (10-500)</p>
                                </div>
                            </div>

                            {/* System Information */}
                            <div className="setting-group">
                                <h3>💾 System Information</h3>

                                <div className="setting-item">
                                    <label>Database Path</label>
                                    <div className="setting-value">
                                        <code>{settings.database_path || 'Loading...'}</code>
                                    </div>
                                    <p className="setting-hint">Database location (read-only)</p>
                                </div>
                            </div>

                            {/* Data Backup */}
                            <div className="setting-group">
                                <h3>📦 Data Backup</h3>
                                <p className="setting-hint">Export your accounts and categories to a JSON file for backup, or import from a previous backup.</p>
                                <div className="backup-actions">
                                    <button
                                        className="btn btn-primary"
                                        onClick={async () => {
                                            try {
                                                const data = await api.exportBackup();
                                                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `moneywise-backup-${new Date().toISOString().split('T')[0]}.json`;
                                                a.click();
                                                URL.revokeObjectURL(url);
                                            } catch (err) {
                                                alert('Export failed: ' + err.message);
                                            }
                                        }}
                                    >
                                        ⬇️ Export Data
                                    </button>
                                    <label className="btn btn-secondary import-btn">
                                        ⬆️ Import Data
                                        <input
                                            type="file"
                                            accept=".json"
                                            style={{ display: 'none' }}
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                try {
                                                    const text = await file.text();
                                                    const data = JSON.parse(text);
                                                    const result = await api.importBackup(data);
                                                    alert(result.message);
                                                    fetchAll();
                                                } catch (err) {
                                                    alert('Import failed: ' + err.message);
                                                }
                                                e.target.value = '';
                                            }}
                                        />
                                    </label>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={async () => {
                                            try {
                                                const result = await api.manualBackup();
                                                if (result.success) {
                                                    alert(`✅ Backup saved!\n\nPath: ${result.path}\n\nStats: ${result.stats.accounts} accounts, ${result.stats.categories} categories, ${result.stats.transactions} transactions`);
                                                } else {
                                                    alert('Backup failed: ' + result.error);
                                                }
                                            } catch (err) {
                                                alert('Backup failed: ' + err.message);
                                            }
                                        }}
                                    >
                                        💾 Backup to Disk
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Account Modal */}
            <Modal
                isOpen={accountModal.open}
                onClose={() => setAccountModal({ open: false, account: null, icon: null })}
                title={accountModal.account ? 'Edit Account' : 'New Account'}
            >
                <form onSubmit={handleSaveAccount}>
                    <IconPicker
                        value={accountModal.icon}
                        onChange={(icon) => setAccountModal(prev => ({ ...prev, icon }))}
                        label="Icon (optional)"
                    />
                    <div className="form-group">
                        <label>Account Name</label>
                        <input
                            name="name"
                            type="text"
                            placeholder="Enter account name"
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
                            {Object.entries(ACCOUNT_TYPES).map(([key, { label }]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setAccountModal({ open: false, account: null, icon: null })}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            {accountModal.account ? 'Save Changes' : 'Create Account'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Category Modal */}
            <Modal
                isOpen={categoryModal.open}
                onClose={() => setCategoryModal({ open: false, category: null, icon: null })}
                title={categoryModal.category ? 'Edit Category' : 'New Category'}
            >
                <form onSubmit={handleSaveCategory}>
                    <IconPicker
                        value={categoryModal.icon}
                        onChange={(icon) => setCategoryModal(prev => ({ ...prev, icon }))}
                        label="Icon (optional)"
                    />
                    <div className="form-group">
                        <label>Category Name</label>
                        <input
                            name="name"
                            type="text"
                            placeholder="Enter category name"
                            defaultValue={categoryModal.category?.name || ''}
                            required
                            autoFocus
                        />
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
                        <button type="button" className="btn btn-secondary" onClick={() => setCategoryModal({ open: false, category: null, icon: null })}>
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
                    else if (deleteModal.type === 'category') handleDeleteCategory();
                }}
                title={`Delete ${deleteModal.type}?`}
                message={`Are you sure you want to delete "${deleteModal.item?.name}"? This cannot be undone.`}
            />

            {/* History Modal */}
            <Modal
                isOpen={historyModal.open}
                onClose={() => setHistoryModal({ open: false, category: null, history: [] })}
                title={`Rename History: ${historyModal.category?.name}`}
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

// ==================== CARD COMPONENTS ====================

function AccountCard({ account, onEdit, onToggleHidden, onDelete }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setMenuOpen(false);
            }
        }
        if (menuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [menuOpen]);

    return (
        <div
            className={`item-card clickable ${account.is_hidden ? 'hidden-item' : ''}`}
            onClick={onEdit}
        >
            <div className="item-icon">
                <img
                    src={account.icon || '/icons/briefcase.png'}
                    alt=""
                    className="custom-icon"
                />
            </div>
            <div className="item-info">
                <h3>{account.name}</h3>
                <span className="item-type">
                    {ACCOUNT_TYPES[account.type]?.label || account.type}
                </span>
            </div>
            <div className="item-menu" ref={menuRef}>
                <button
                    className="menu-trigger"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                    title="More actions"
                >
                    ⋮
                </button>
                {menuOpen && (
                    <div className="menu-dropdown">
                        <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onToggleHidden(); }}>
                            <img src="/icons/hide.png" alt="" />
                            {account.is_hidden ? 'Show' : 'Hide'}
                        </button>
                        <button className="danger" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}>
                            🗑️ Delete
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function CategoryCard({ category, onEdit, onToggleHidden, onDelete, onShowHistory }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setMenuOpen(false);
            }
        }
        if (menuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [menuOpen]);

    return (
        <div
            className={`item-card clickable ${category.is_hidden ? 'hidden-item' : ''}`}
            onClick={onEdit}
        >
            <div className="item-icon">
                <IconDisplay icon={category.icon} fallback="/icons/cat.png" />
            </div>
            <div className="item-info">
                <h3>{category.name}</h3>
                {category.monthly_amount > 0 && (
                    <span className="monthly-amount">
                        ${category.monthly_amount.toFixed(2)}/mo
                    </span>
                )}
            </div>
            <div className="item-menu" ref={menuRef}>
                <button
                    className="menu-trigger"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                    title="More actions"
                >
                    ⋮
                </button>
                {menuOpen && (
                    <div className="menu-dropdown">
                        <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onToggleHidden(); }}>
                            <img src="/icons/hide.png" alt="" />
                            {category.is_hidden ? 'Show' : 'Hide'}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onShowHistory(); }}>
                            📜 Rename History
                        </button>
                        <button className="danger" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}>
                            🗑️ Delete
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
