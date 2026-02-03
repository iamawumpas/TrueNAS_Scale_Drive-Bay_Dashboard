export function createChassisHTML(pci, data) {
    const pciRaw = data.topology[pci].settings.pci_raw || pci;
    const hostname = data.hostname;

    return `
        <div class="chassis-inner">
            <div class="chassis-header">
                <div class="header-left">
                    <div class="hostname">${hostname}</div>
                    <div class="pci-container">
                        <span class="pci-address-grey">${pciRaw}</span>
                    </div>
                </div>

                <div class="legend-box">
                    <div class="legend-items-row">
                        <div class="legend-item"><span class="dot green"></span> ALLOCATED-HEALTHY</div>
                        <div class="legend-item"><span class="dot allocated-offline"></span> ALLOCATED-OFFLINE</div>
                        <div class="legend-item"><span class="dot orange"></span> ERROR</div>
                        <div class="legend-item"><span class="dot red"></span> FAULTED</div>
                        <div class="legend-item"><span class="dot white"></span> RESILVERING</div>
                        <div class="legend-item"><span class="dot purple"></span> UNALLOCATED</div>
                        <div class="legend-item"><span class="dot unalloc-error"></span> UNALLOC-ERROR</div>
                        <div class="legend-item"><span class="dot unalloc-fault"></span> UNALLOC-FAULT</div>
                    </div>
                </div>
            </div>
            <div class="capacity-warning" id="capacity-warning-${pci}">
                Capacity unknown. Please configure ports and lanes in config.json.
            </div>
            <div class="slots" id="slots-${pci}"></div>
        </div>
    `;
}