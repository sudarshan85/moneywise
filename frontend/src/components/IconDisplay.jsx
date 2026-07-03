// Icons are stored as either an emoji string ("🍔") or a PNG path ("/icons/burger.png")

function isEmoji(str) {
    if (!str) return false;
    return !str.startsWith('/') && !str.startsWith('http');
}

export function IconDisplay({ icon, fallback, className = 'icon' }) {
    const iconSrc = icon || fallback;
    if (!iconSrc) return null;
    if (isEmoji(iconSrc)) {
        return <span className={`${className} emoji-icon`}>{iconSrc}</span>;
    }
    return <img src={iconSrc} alt="" className={className} />;
}
