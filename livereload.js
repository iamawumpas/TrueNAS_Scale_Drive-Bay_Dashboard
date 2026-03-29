(function () {
	'use strict';

	let originalConfig = null;
	let workingConfig = null;
	let isDirty = false;
	let saveButton = null;
	let revertButton = null;
	let statusEl = null;
	let legendButton = null;
	let legendBackdrop = null;

	function deepClone(value) {
		return JSON.parse(JSON.stringify(value || {}));
	}

	function applyConfigMap(rootStyle, mapping) {
		Object.entries(mapping).forEach(([key, value]) => {
			if (value !== undefined && value !== null && value !== '') {
				rootStyle.setProperty(key, String(value));
			}
		});
	}

	function applyMenuVariables(config) {
		const menu = config?.ui?.menu || {};
		const controls = menu.controls || {};
		const buttons = menu.buttons || {};
		const warning = menu.warning || {};
		const rootStyle = document.documentElement.style;

		applyConfigMap(rootStyle, {
			'--menu-bg-color': menu.background,
			'--menu-border-color': menu.border,
			'--menu-text-color': menu.text,
			'--menu-button-text': menu.button_text,
			'--menu-opacity': menu.opacity,
			'--menu-font-family': menu.font,
			'--menu-font-size': menu.size,
			'--menu-label-color': menu.label_color,
			'--menu-section-title-color': menu.section_title_color,
			'--menu-dropdown-bg': menu.dropdown_background,
			'--menu-dropdown-border': menu.dropdown_border,
			'--menu-dropdown-shadow': menu.dropdown_shadow,
			'--menu-control-bg': controls.background,
			'--menu-control-border': controls.border,
			'--menu-control-text': controls.text,
			'--menu-control-focus-border': controls.focus_border,
			'--menu-control-focus-glow': controls.focus_glow,
			'--menu-save-bg': buttons.save_bg,
			'--menu-save-hover-bg': buttons.save_hover_bg,
			'--menu-save-glow': buttons.save_glow,
			'--menu-revert-bg': buttons.revert_bg,
			'--menu-revert-hover-bg': buttons.revert_hover_bg,
			'--menu-revert-glow': buttons.revert_glow,
			'--menu-warning-bg': warning.background,
			'--menu-warning-border': warning.border,
			'--menu-warning-text': warning.text
		});
	}

	function updateDirtyUI() {
		if (!saveButton || !revertButton) return;
		const buttonContainer = saveButton.closest('.menu-buttons');
		saveButton.disabled = !isDirty;
		revertButton.disabled = !isDirty;
		if (buttonContainer) {
			buttonContainer.classList.toggle('dirty', isDirty);
		}
	}

	function setPreviewConfig(config) {
		window.__previewConfig__ = deepClone(config);
		window.dispatchEvent(new CustomEvent('dashboard-preview-config-updated'));
	}

	async function fetchCurrentConfig() {
		const response = await fetch('/data?t=' + Date.now(), { cache: 'no-store' });
		if (!response.ok) throw new Error('Failed to fetch /data');
		const payload = await response.json();
		return payload?.config || {};
	}

	async function saveConfig() {
		if (!isDirty || !workingConfig) return;

		saveButton.disabled = true;
		revertButton.disabled = true;
		if (statusEl) statusEl.textContent = 'Saving...';

		try {
			const response = await fetch('/save-config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(workingConfig)
			});
			if (!response.ok) {
				throw new Error('Save failed with HTTP ' + response.status);
			}

			originalConfig = deepClone(workingConfig);
			isDirty = false;
			setPreviewConfig(originalConfig);
			applyMenuVariables(originalConfig);
			updateDirtyUI();
		} catch (error) {
			console.error('[menu] save failed', error);
			if (statusEl) statusEl.textContent = 'Save failed';
			updateDirtyUI();
		}
	}

	function revertConfig() {
		if (!originalConfig) return;
		workingConfig = deepClone(originalConfig);
		isDirty = false;
		setPreviewConfig(workingConfig);
		applyMenuVariables(workingConfig);
		updateDirtyUI();
	}

	function setConfigValue(path, value) {
		if (!workingConfig || !Array.isArray(path) || path.length === 0) return;

		let cursor = workingConfig;
		for (let i = 0; i < path.length - 1; i += 1) {
			const key = path[i];
			if (!cursor[key] || typeof cursor[key] !== 'object') {
				cursor[key] = {};
			}
			cursor = cursor[key];
		}
		cursor[path[path.length - 1]] = value;

		isDirty = true;
		setPreviewConfig(workingConfig);
		applyMenuVariables(workingConfig);
		updateDirtyUI();
	}

	function buildMenuBar() {
		const host = document.getElementById('menu-bar');
		if (!host) return;

		host.innerHTML = `
			<div class="menu-container">
				<div class="menu-right-group">
					<button class="menu-button legend-menu-btn" id="legend-menu-btn" type="button">Legend</button>
					<div class="menu-buttons">
						<button class="save-btn" id="menu-save-btn" disabled>SAVE</button>
						<button class="revert-btn" id="menu-revert-btn" disabled>REVERT</button>
					</div>
				</div>
			</div>
		`;

		saveButton = document.getElementById('menu-save-btn');
		revertButton = document.getElementById('menu-revert-btn');
		legendButton = document.getElementById('legend-menu-btn');

		saveButton?.addEventListener('click', saveConfig);
		revertButton?.addEventListener('click', revertConfig);
		legendButton?.addEventListener('click', toggleLegendOverlay);
	}

	function ensureLegendOverlayShell() {
		if (legendBackdrop) return;
		legendBackdrop = document.createElement('div');
		legendBackdrop.id = 'legend-overlay-backdrop';
		legendBackdrop.addEventListener('click', closeLegendOverlay);
		document.body.appendChild(legendBackdrop);
	}

	function openLegendOverlay() {
		const legend = document.getElementById('legend-chassis');
		if (!legend) return;
		ensureLegendOverlayShell();
		legend.classList.add('legend-overlay-active');
		legendBackdrop.classList.add('active');
	}

	function closeLegendOverlay() {
		const legend = document.getElementById('legend-chassis');
		if (legend) legend.classList.remove('legend-overlay-active');
		if (legendBackdrop) legendBackdrop.classList.remove('active');
	}

	function toggleLegendOverlay() {
		const legend = document.getElementById('legend-chassis');
		if (!legend) return;
		if (legend.classList.contains('legend-overlay-active')) {
			closeLegendOverlay();
			return;
		}
		openLegendOverlay();
	}

	async function init() {
		buildMenuBar();
		ensureLegendOverlayShell();
		try {
			originalConfig = await fetchCurrentConfig();
			workingConfig = deepClone(originalConfig);
			applyMenuVariables(workingConfig);
			setPreviewConfig(workingConfig);
			updateDirtyUI();
		} catch (error) {
			console.error('[menu] init failed', error);
			if (statusEl) statusEl.textContent = 'Config unavailable';
		}
	}

	// Public API for future controls: keeps live-preview + dirty-page behavior.
	window.MenuLivePreview = {
		set(path, value) {
			setConfigValue(path, value);
		},
		reset() {
			revertConfig();
		},
		snapshot() {
			return deepClone(workingConfig || {});
		},
		markDirty() {
			isDirty = true;
			updateDirtyUI();
		}
	};

	document.addEventListener('DOMContentLoaded', init);
})();
