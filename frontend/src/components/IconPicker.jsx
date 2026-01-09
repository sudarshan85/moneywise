import { useState, useEffect, useRef } from 'react';
import './IconPicker.css';

export default function IconPicker({ value, onChange, label = 'Icon (optional)' }) {
    const [isOpen, setIsOpen] = useState(false);
    const [icons, setIcons] = useState([]);
    const [loading, setLoading] = useState(true);
    const dropdownRef = useRef(null);

    // Fetch available icons
    useEffect(() => {
        fetch('http://localhost:3001/api/icons')
            .then(res => res.json())
            .then(data => {
                setIcons(data);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to load icons:', err);
                setLoading(false);
            });
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (iconPath) => {
        onChange(iconPath);
        setIsOpen(false);
    };

    const handleClear = (e) => {
        e.stopPropagation();
        onChange(null);
    };

    return (
        <div className="icon-picker" ref={dropdownRef}>
            <label>{label}</label>
            <div
                className={`icon-picker-trigger ${isOpen ? 'open' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                {value ? (
                    <div className="selected-icon">
                        <img src={value} alt="Selected icon" />
                        <button
                            type="button"
                            className="clear-icon"
                            onClick={handleClear}
                            title="Remove icon"
                        >
                            ×
                        </button>
                    </div>
                ) : (
                    <span className="placeholder">Click to select icon...</span>
                )}
                <span className="dropdown-arrow">▼</span>
            </div>

            {isOpen && (
                <div className="icon-picker-dropdown">
                    {loading ? (
                        <div className="loading">Loading icons...</div>
                    ) : icons.length === 0 ? (
                        <div className="no-icons">No icons available</div>
                    ) : (
                        <div className="icon-grid">
                            {icons.map((icon) => (
                                <div
                                    key={icon.name}
                                    className={`icon-option ${value === icon.path ? 'selected' : ''}`}
                                    onClick={() => handleSelect(icon.path)}
                                    title={icon.name}
                                >
                                    <img src={icon.path} alt={icon.name} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
