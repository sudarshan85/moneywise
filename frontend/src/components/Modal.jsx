import { useState } from 'react';
import './Modal.css';

export function Modal({ isOpen, onClose, title, children }) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{title}</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
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
