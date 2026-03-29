// geometry.js
// Locked default geometry constants for chassis and bay layout rebuild.

export const GEOMETRY_DEFAULTS = {
    // Physical rack geometry
    RACK_WIDTH_MM: 482.6,          // 19.0 in
    RACK_UNIT_HEIGHT_MM: 44.45,    // 1U

    // 3.5" HDD enclosure dimensions
    HDD_LONG_MM: 101.6,            // 4.000 in
    HDD_SHORT_MM: 26.1,            // 1.028 in

    // Faceplate insets inside the HDD enclosure
    // Faceplate is what we fit to chassis bay fields.
    FACE_INSET_X_MM: 1.5,
    FACE_INSET_Y_MM: 4.0,

    // Bay field paddings inside chassis (px)
    BAY_FIELD_PAD_X_PX: 5,
    BAY_FIELD_PAD_Y_PX: 5,

    // Consistent gap between bays (px)
    BAY_GAP_PX: 6,

    // Header treatment
    HEADER_EXCLUDED_FROM_PHYSICAL_BAY_FIELD: true,

    // Scale and rounding policies
    SCALE_POLICY: 'px_per_mm = rendered_chassis_width_px / RACK_WIDTH_MM',
    ROUNDING_STEP_PX: 0.1,

    // Layout mode
    // absolute_enclosure_mm: strict full enclosure dimensions
    // faceplate_fit_preserve_ratio: fit only faceplates, preserve long/short ratio
    DIMENSION_MODE: 'faceplate_fit_preserve_ratio'
};

export const CHASSIS_BAY_PRESETS = {
    '1u_horizontal': { rackUnits: 1, rows: 1, cols: 4 },
    '2u_horizontal': { rackUnits: 2, rows: 3, cols: 4 },
    '2u_vertical': { rackUnits: 2, rows: 1, cols: 12 },
    '4u_horizontal': { rackUnits: 4, rows: 6, cols: 4 },
    '4u_vertical': { rackUnits: 4, rows: 2, cols: 12 }
};

export function roundPx(value, step = GEOMETRY_DEFAULTS.ROUNDING_STEP_PX) {
    const safeStep = Number.isFinite(step) && step > 0 ? step : 0.1;
    return Math.round(value / safeStep) * safeStep;
}

export function getFaceplateMm(defaults = GEOMETRY_DEFAULTS) {
    const longMm = defaults.HDD_LONG_MM - (2 * defaults.FACE_INSET_Y_MM);
    const shortMm = defaults.HDD_SHORT_MM - (2 * defaults.FACE_INSET_X_MM);

    return {
        longMm: Math.max(1, longMm),
        shortMm: Math.max(1, shortMm)
    };
}

export function pxPerMm(renderedChassisWidthPx, defaults = GEOMETRY_DEFAULTS) {
    const widthPx = Number(renderedChassisWidthPx);
    if (!Number.isFinite(widthPx) || widthPx <= 0) return 0;
    return widthPx / defaults.RACK_WIDTH_MM;
}
