export function createBayHTML(idx) {
    return `
        <div class="led-group">
            <div class="led status-led"></div>
            <div class="led activity-led"></div>
        </div>
        <div class="bay-id">BAY ${idx+1}</div>
        <div class="info-container">
            <div class="info-grid">
                <div class="sn-cell">&nbsp;</div>
                <div class="size-cell">&nbsp;</div>
                <div class="pool-cell">&nbsp;</div>
                <div class="idx-cell">&nbsp;</div>
            </div>
        </div>
        <div class="latch"></div>`;
}