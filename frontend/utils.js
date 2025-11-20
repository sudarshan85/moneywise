/**
 * Utility functions for MoneyWise frontend
 */

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - Type: 'success', 'error', or 'info' (default: 'success')
 * @param {number} duration - How long to show the notification in ms (default: 3000)
 */
export function showToast(message, type = 'success', duration = 3000) {
    // Create toast container if it doesn't exist
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.innerHTML = `
        <div class="toast-notification-message">${message}</div>
        <button class="toast-notification-close">&times;</button>
    `;

    // Add close button functionality
    toast.querySelector('.toast-notification-close').addEventListener('click', () => {
        removeToast(toast);
    });

    // Add to container
    container.appendChild(toast);

    // Auto-remove after duration
    setTimeout(() => {
        removeToast(toast);
    }, duration);

    return toast;
}

/**
 * Remove a toast notification with animation
 * @param {HTMLElement} toast - The toast element to remove
 */
function removeToast(toast) {
    toast.classList.add('exit');
    setTimeout(() => {
        toast.remove();
    }, 300);
}
