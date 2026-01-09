import { useState, useEffect, useRef } from 'react';
import './ActionMenu.css';

export default function ActionMenu({ children }) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);

    // Close menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    const handleToggle = (e) => {
        e.stopPropagation(); // Prevent card click
        setIsOpen(!isOpen);
    };

    const handleItemClick = (callback) => (e) => {
        e.stopPropagation();
        setIsOpen(false);
        callback();
    };

    return (
        <div className="action-menu" ref={menuRef}>
            <button 
                className="action-menu-trigger" 
                onClick={handleToggle}
                title="More actions"
            >
                ⋮
            </button>
            {isOpen && (
                <div className="action-menu-dropdown">
                    {children.map((child, index) => (
                        <button
                            key={index}
                            className="action-menu-item"
                            onClick={handleItemClick(child.props.onClick)}
                        >
                            {child.props.icon && (
                                <img src={child.props.icon} alt="" className="action-menu-icon" />
                            )}
                            {child.props.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// Helper component for menu items (used as children of ActionMenu)
export function ActionMenuItem({ icon, label, onClick }) {
    return null; // Rendered by parent
}
