export function resolveLayoutSettings(globalConfig, deviceConfig) {
    const uiLayout = globalConfig?.ui?.layout || {};
    const deviceBay = deviceConfig?.bay || {};
    const deviceChassis = deviceConfig?.chassis || {};

    const rackWidthIn = Number(uiLayout.rack_width_in ?? 19);
    const uHeightIn = Number(uiLayout.u_height_in ?? 1.75);
    const bayGapPx = Number(deviceBay.gap_px ?? uiLayout.bay_gap_px ?? 6);
    const headerHeightPx = Number(uiLayout.header_height_px ?? 0);

    return {
        rackWidthIn: Number.isFinite(rackWidthIn) && rackWidthIn > 0 ? rackWidthIn : 19,
        uHeightIn: Number.isFinite(uHeightIn) && uHeightIn > 0 ? uHeightIn : 1.75,
        bayGapPx: Number.isFinite(bayGapPx) && bayGapPx >= 0 ? bayGapPx : 6,
        headerHeightPx: Number.isFinite(headerHeightPx) && headerHeightPx > 0 ? headerHeightPx : 0,
        chassisRackUnits: Number.isFinite(Number(deviceChassis.rack_units ?? deviceBay.rack_units ?? 2))
            ? Math.max(1, Number(deviceChassis.rack_units ?? deviceBay.rack_units ?? 2))
            : 2
    };
}

export function applyPhysicalLayout({ storageUnit, slotContainer, baysPerRow, rows, maxBays, bayLayout, settings }) {
    if (!storageUnit || !slotContainer) return;

    const renderedWidth = storageUnit.getBoundingClientRect().width;
    if (renderedWidth <= 0) return;

    slotContainer.style.setProperty('--bay-gap', `${settings.bayGapPx}px`);

    const storageUnitStyles = window.getComputedStyle(storageUnit);
    const slotStyles = window.getComputedStyle(slotContainer);
    const measuredHeaderHeight = storageUnit.querySelector('.chassis-header')?.getBoundingClientRect().height || 0;
    const headerHeight = settings.headerHeightPx && settings.headerHeightPx > 0
        ? settings.headerHeightPx
        : measuredHeaderHeight;
    const warningEl = storageUnit.querySelector('.capacity-warning');
    const warningHeight = warningEl && window.getComputedStyle(warningEl).display !== 'none'
        ? warningEl.getBoundingClientRect().height
        : 0;
    const unitVerticalPadding = (parseFloat(storageUnitStyles.paddingTop) || 0) + (parseFloat(storageUnitStyles.paddingBottom) || 0);
    const slotVerticalPadding = (parseFloat(slotStyles.paddingTop) || 0) + (parseFloat(slotStyles.paddingBottom) || 0);
    const slotHorizontalPadding = (parseFloat(slotStyles.paddingLeft) || 0) + (parseFloat(slotStyles.paddingRight) || 0);

    const baseRowGap = parseFloat(slotStyles.rowGap || slotStyles.gap || '0') || 0;
    const columnGap = parseFloat(slotStyles.columnGap || slotStyles.gap || '0') || 0;

    const slotContentWidth = Math.max(1, slotContainer.clientWidth - slotHorizontalPadding);

    // One canonical long-edge bay length for both orientations, width-referenced.
    const referenceCols = 4;
    const canonicalBayLength = Math.max(
        1,
        (slotContentWidth - (columnGap * Math.max(0, referenceCols - 1))) / referenceCols
    );
    const horizontalBayHeight = Math.max(1, canonicalBayLength / 3.5);

    const bayContentHeight = bayLayout === 'vertical'
        ? (rows * canonicalBayLength) + (baseRowGap * Math.max(0, rows - 1))
        : (rows * horizontalBayHeight) + (baseRowGap * Math.max(0, rows - 1));
    const targetBayAreaHeight = Math.max(1, bayContentHeight + slotVerticalPadding);

    const targetChassisHeight = headerHeight + warningHeight + unitVerticalPadding + targetBayAreaHeight;
    storageUnit.style.height = `${targetChassisHeight}px`;
    slotContainer.style.height = `${targetBayAreaHeight}px`;

    if (bayLayout === 'vertical') {
        const slotWidth = Math.max(1, (slotContentWidth - (columnGap * Math.max(0, baysPerRow - 1))) / baysPerRow);
        const verticalBayAspectRatio = slotWidth / canonicalBayLength;

        slotContainer.style.rowGap = `${baseRowGap}px`;
        slotContainer.style.gridTemplateRows = `repeat(${rows}, minmax(0, ${canonicalBayLength}px))`;
        slotContainer.style.gridTemplateColumns = `repeat(${baysPerRow}, minmax(0, 1fr))`;
        slotContainer.style.setProperty('--vertical-bay-aspect-ratio', `${verticalBayAspectRatio}`);
    } else {
        slotContainer.style.rowGap = `${baseRowGap}px`;
        slotContainer.style.gridTemplateRows = `repeat(${rows}, minmax(0, ${horizontalBayHeight}px))`;
        slotContainer.style.gridTemplateColumns = `repeat(${baysPerRow}, minmax(0, ${canonicalBayLength}px))`;
        slotContainer.style.removeProperty('--vertical-bay-aspect-ratio');
    }
}
