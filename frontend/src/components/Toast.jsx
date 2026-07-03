import { useEffect, useState } from 'react';
import './Toast.css';

// Lightweight app-wide notifications, replacing alert(). Usage:
//   import { showToast } from '../components/Toast';
//   showToast('Transfer failed', 'error');
// <Toaster /> is mounted once in App.jsx.

let listeners = [];
let nextId = 1;

// eslint-disable-next-line react-refresh/only-export-components -- showToast is the module's API
export function showToast(message, type = 'error') {
    const toast = { id: nextId++, message, type };
    listeners.forEach((fn) => fn(toast));
}

export function Toaster() {
    const [toasts, setToasts] = useState([]);

    useEffect(() => {
        const add = (toast) => {
            setToasts((prev) => [...prev, toast]);
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== toast.id));
            }, 4500);
        };
        listeners.push(add);
        return () => {
            listeners = listeners.filter((l) => l !== add);
        };
    }, []);

    if (toasts.length === 0) return null;

    return (
        <div className="toaster" role="status" aria-live="polite">
            {toasts.map((t) => (
                <div key={t.id} className={`toast toast-${t.type}`}>
                    {t.message}
                </div>
            ))}
        </div>
    );
}
