import { useEffect, useRef } from 'react';
import './Modal.css';

export function Modal({ isOpen, onClose, title, children }) {
    const contentRef = useRef(null);
    const previousFocus = useRef(null);

    // Escape closes; focus moves into the dialog on open and back on close
    useEffect(() => {
        if (!isOpen) return;
        previousFocus.current = document.activeElement;
        contentRef.current?.focus();

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            previousFocus.current?.focus?.();
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-content"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                ref={contentRef}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2>{title}</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close dialog">×</button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
            </div>
        </div>
    );
}

export function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText = 'Delete', danger = true }) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <p className="confirm-message">{message}</p>
            <div className="modal-actions">
                <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button
                    className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
                    onClick={() => { onConfirm(); onClose(); }}
                >
                    {confirmText}
                </button>
            </div>
        </Modal>
    );
}
