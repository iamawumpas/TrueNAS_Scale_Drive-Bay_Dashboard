export function createChassisHTML(pci, data) {
    const settings = data.topology[pci].settings || {};
    const pciRaw = settings.pci_raw || pci;
    const arrayAddr = settings.array_address || settings.array_id || "";
    const chassisIdentifier = arrayAddr ? `${pciRaw} / ${arrayAddr}` : pciRaw;
    const hostname = data.hostname;

    return `
        <div class="chassis-inner">
            <div class="chassis-header">
                <div class="header-left">
                    <div class="hostname">${hostname}</div>
                    <div class="pci-container">
                        <span class="pci-address-grey">${chassisIdentifier}</span>
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