// js/utils.js — shared utility functions used by both app.js and MenuSystem.js

export function clampInt(value, fallback, min = 1, max = 999) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(n)));
}

export function mixHex(hex, amount) {
    const value = String(hex || '').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return value;
    const n = parseInt(value.slice(1), 16);
    let r = (n >> 16) & 0xff;
    let g = (n >> 8) & 0xff;
    let b = n & 0xff;
    if (amount >= 0) {
        r = Math.round(r + (255 - r) * amount);
        g = Math.round(g + (255 - g) * amount);
        b = Math.round(b + (255 - b) * amount);
    } else {
        const a = 1 + amount;
        r = Math.round(r * a);
        g = Math.round(g * a);
        b = Math.round(b * a);
    }
    const out = (r << 16) | (g << 8) | b;
    return `#${out.toString(16).padStart(6, '0')}`;
}

export function grillSliderScale(v) {
    const c = Math.max(0, Math.min(100, Number(v) || 50));
    const t = (c - 50) / 50;
    return Math.max(0.15, 1 + Math.sign(t) * Math.pow(Math.abs(t), 1.7) * 1.5);
}

export function buildGrillImageCss(shape, holeColor, grillPx) {
    switch (shape) {
        case 'solid':
            return { opacity: '0' };
        case 'square': {
            const enc = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="20" y="20" width="60" height="60" fill="${holeColor}"/></svg>`);
            return { image: `url("data:image/svg+xml,${enc}")` };
        }
        case 'triangle': {
            const enc = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,8 92,92 8,92" fill="${holeColor}"/></svg>`);
            return { image: `url("data:image/svg+xml,${enc}")` };
        }
        case 'hexagonal': {
            const enc = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,5 93,27.5 93,72.5 50,95 7,72.5 7,27.5" fill="${holeColor}"/></svg>`);
            return { image: `url("data:image/svg+xml,${enc}")` };
        }
        case 'round':
        default: {
            return {
                image: `radial-gradient(circle, ${holeColor} 42%, transparent 45%), radial-gradient(circle, ${holeColor} 42%, transparent 45%)`,
                pos2: `calc(${grillPx}px / 2) calc(${grillPx}px / 2)`
            };
        }
    }
}

export function applyConfigMap(rootStyle, mapping) {
    Object.entries(mapping).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            rootStyle.setProperty(key, String(value));
        }
    });
}

export function applyStyleConfig(rootStyle, prefix, configBlock) {
    if (!configBlock || typeof configBlock !== 'object') return;
    const styles = Array.isArray(configBlock.style)
        ? configBlock.style.map(value => String(value).toLowerCase())
        : [];
    applyConfigMap(rootStyle, {
        [`--${prefix}-color`]: configBlock.color,
        [`--${prefix}-font`]: configBlock.font,
        [`--${prefix}-size`]: configBlock.size,
        [`--${prefix}-weight`]: styles.includes('bold') ? '700' : '400',
        [`--${prefix}-style`]: styles.includes('italic') ? 'italic' : 'normal',
        [`--${prefix}-transform`]: styles.includes('allcaps') ? 'uppercase' : 'none',
        [`--${prefix}-variant`]: styles.includes('smallcaps') ? 'small-caps' : 'normal'
    });
}

// Decoration texture proxy — resolved at runtime from the global loaded by DecorationTexture.js
export function getDecorationTextureFn() {
    return (window.DashboardDecorationTexture &&
        typeof window.DashboardDecorationTexture.buildRandomDecorationTexture === 'function')
        ? window.DashboardDecorationTexture.buildRandomDecorationTexture
        : () => 'none';
}

export function sliderCurve(v, power = 1.7) {
    const clamped = Math.max(0, Math.min(100, Number(v ?? 50)));
    const t = (clamped - 50) / 50;
    return Math.sign(t) * Math.pow(Math.abs(t), power);
}

export function sliderToUnit(v) {
    return (sliderCurve(v) + 1) / 2;
}

export function sliderToScale(v) {
    return Math.max(0.15, 1 + sliderCurve(v) * 1.5);
}
