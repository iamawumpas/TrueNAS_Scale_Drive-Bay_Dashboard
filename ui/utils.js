// ui/utils.js - Shared UI helper utilities
export function setCssVar(root, name, value) {
    if (!root || !name) return;
    try { root.style.setProperty(name, value); } catch (e) { /* ignore */ }
}

export function applyConfigMap(root, mapping) {
    if (!root || !mapping) return;
    Object.entries(mapping).forEach(([k, v]) => {
        try { root.style.setProperty(k, v); } catch (e) { }
    });
}

export function getStyleWeight(styles) {
    if (!styles || !Array.isArray(styles)) return '700';
    return styles.includes('bold') ? 'bold' : 'normal';
}

export function getStyleFont(styles) {
    if (!styles || !Array.isArray(styles)) return 'normal';
    return styles.includes('italic') ? 'italic' : 'normal';
}

export function getStyleTransform(styles) {
    if (!styles || !Array.isArray(styles)) return 'none';
    if (styles.includes('allcaps')) return 'uppercase';
    if (styles.includes('smallcaps')) return 'small-caps';
    if (styles.includes('nocaps')) return 'lowercase';
    return 'none';
}

export function hexToColor(hex) {
    if (!hex) return '#000000';
    if (typeof hex !== 'string') return String(hex);
    if (hex.startsWith('#')) return hex;
    if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
    return hex;
}

export function debounce(fn, ms = 100) {
    let t = null;
    return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}

export function debugLog(...args) {
    try {
        if (typeof window !== 'undefined' && window.UI_DEBUG) console.log(...args);
    } catch (e) { }
}

export function updateTextIfChanged(el, text) {
    if (!el) return;
    const newText = (text === null || text === undefined) ? '\u00A0' : String(text);
    if (el.textContent !== newText) el.textContent = newText;
}

export function setClassIfChanged(el, className) {
    if (!el) return;
    if (el.className !== className) el.className = className;
}
