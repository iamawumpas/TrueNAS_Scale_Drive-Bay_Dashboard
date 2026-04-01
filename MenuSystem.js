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
	let lastTopology = null;
	let lastHostname = null;
	let lastDiskArraysMenuSignature = '';
	let isResetInProgress = false;
	let menuModalBackdrop = null;
	let menuModalTitle = null;
	let menuModalMessage = null;
	let menuModalConfirmBtn = null;
	let menuModalCancelBtn = null;
	let menuModalResolver = null;

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

	function hexToRgbComponents(hex) {
		const clean = String(hex || '').replace('#', '');
		if (clean.length !== 6) return null;
		return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
	}

	const scratchTextureCache = new Map();
	const MAX_SCRATCH_CACHE_ENTRIES = 48;

	function randomInt(min, max) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	function mixHex(hex, amount) {
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
			r = Math.round(r * (1 + amount));
			g = Math.round(g * (1 + amount));
			b = Math.round(b * (1 + amount));
		}
		return `#${[r, g, b].map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
	}

	function grillSliderScale(v) {
		const c = Math.max(0, Math.min(100, Number(v) || 50));
		const t = (c - 50) / 50;
		return Math.max(0.15, 1 + Math.sign(t) * Math.pow(Math.abs(t), 1.7) * 1.5);
	}

	function buildGrillImageCss(shape, holeColor, grillPx) {
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

	function pickScratchAngle() {
		// Random-ish angles with only a light center bias so the surface stays irregular.
		const roll = Math.random();
		if (roll < 0.55) return randomInt(-18, 18);
		if (roll < 0.85) return randomInt(-28, 28);
		return randomInt(-40, 40);
	}

	function buildRandomScratchTexture(levelRaw, densityRaw, intensityRaw) {
		const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));
		const level = clamp(levelRaw);
		const density = clamp(densityRaw);
		const intensity = clamp(intensityRaw);
		const key = `${level}|${density}|${intensity}`;
		if (scratchTextureCache.has(key)) return scratchTextureCache.get(key);

		if (level <= 0) {
			scratchTextureCache.set(key, 'none');
			return 'none';
		}

		const levelUnit = level / 100;
		const densityUnit = density / 100;
		const intensityUnit = intensity / 100;

		const totalScratchCount = Math.max(1, Math.round(levelUnit * (8 + densityUnit * 32)));

		let deepMin = 0;
		let deepMax = 0;
		if (intensityUnit > 0) {
			if (intensityUnit <= 0.5) {
				const t = intensityUnit / 0.5;
				deepMin = Math.round(t * 1);
				deepMax = Math.max(deepMin, Math.round(t * 2));
			} else {
				const t = (intensityUnit - 0.5) / 0.5;
				deepMin = Math.round(1 + t * 7);
				deepMax = Math.round(2 + t * 8);
			}
		}

		const deepScaleByLevel = Math.max(0, levelUnit);
		deepMin = Math.round(deepMin * deepScaleByLevel);
		deepMax = Math.round(deepMax * deepScaleByLevel);
		const deepCount = Math.min(totalScratchCount, deepMax > 0 ? randomInt(deepMin, Math.max(deepMin, deepMax)) : 0);

		const layers = [];
		const lightAlpha = 0.04 + intensityUnit * 0.08;
		const deepAlpha = 0.14 + intensityUnit * 0.22;
		const clusterCount = Math.max(0, Math.round(totalScratchCount * 0.18));
		const clusterAnchors = Array.from({ length: clusterCount }, () => ({
			start: randomInt(8, 88),
			angle: pickScratchAngle()
		}));

		for (let i = 0; i < totalScratchCount; i += 1) {
			const isDeep = i < deepCount;
			const useCluster = clusterAnchors.length > 0 && Math.random() < 0.55;
			const anchor = useCluster ? clusterAnchors[randomInt(0, clusterAnchors.length - 1)] : null;
			const angle = anchor ? Math.max(-40, Math.min(40, anchor.angle + randomInt(-6, 6))) : pickScratchAngle();
			const start = anchor ? Math.max(3, Math.min(95, anchor.start + randomInt(-7, 7))) : randomInt(3, 95);
			const width = isDeep ? 2 : 1;
			const extraLength = isDeep ? randomInt(0, 2) : randomInt(0, 1);
			const end = Math.min(99, start + width + extraLength);
			const color = isDeep ? `rgba(0,0,0,${deepAlpha.toFixed(3)})` : `rgba(255,255,255,${lightAlpha.toFixed(3)})`;
			layers.push(
				`linear-gradient(${angle}deg, transparent ${start}%, ${color} ${start}%, ${color} ${end}%, transparent ${end}%)`
			);
		}

		const texture = layers.length > 0 ? layers.join(', ') : 'none';
		scratchTextureCache.set(key, texture);
		if (scratchTextureCache.size > MAX_SCRATCH_CACHE_ENTRIES) {
			const oldestKey = scratchTextureCache.keys().next().value;
			scratchTextureCache.delete(oldestKey);
		}
		return texture;
	}

	let _recreateTimer = null;
	function scheduleChartRecreation() {
		if (_recreateTimer) return;
		_recreateTimer = setTimeout(() => {
			_recreateTimer = null;
			if (window.activityMonitor && typeof window.activityMonitor.recreateCharts === 'function') {
				window.activityMonitor.recreateCharts();
			}
		}, 120);
	}

	function applyActivityVariables(config) {
		const rootStyle = document.documentElement.style;
		const activity = config?.ui?.activity || {};
		const chartColors = config?.chart?.colors || {};
		const typography = config?.chart?.typography || {};
		const setOrClear = (name, value) => {
			if (value === undefined || value === null || value === '') {
				rootStyle.removeProperty(name);
				return;
			}
			rootStyle.setProperty(name, String(value));
		};
		const clampSlider = (v) => Math.max(0, Math.min(100, Number(v ?? 50)));
		const curveCentered = (v, power = 1.7) => {
			const t = (clampSlider(v) - 50) / 50;
			return Math.sign(t) * Math.pow(Math.abs(t), power);
		};
		const sliderToUnit = (v) => (curveCentered(v) + 1) / 2;
		const sliderToScale = (v) => Math.max(0.15, 1 + curveCentered(v) * 1.5);

		setOrClear('--activity-chassis-bg', activity.chassis_color);
		setOrClear('--activity-legend-color', activity.legend_color);
		const serverName = activity.server_name || {};
		const serverStyles = Array.isArray(serverName.style) ? serverName.style.map(v => String(v).toLowerCase()) : [];
		setOrClear('--activity-server-name-color', serverName.color);
		setOrClear('--activity-server-name-font', serverName.font);
		setOrClear('--activity-server-name-weight', serverStyles.includes('bold') ? '700' : '400');
		setOrClear('--activity-server-name-style', serverStyles.includes('italic') ? 'italic' : 'normal');
		setOrClear('--activity-server-name-transform', serverStyles.includes('allcaps') ? 'uppercase' : 'none');
		setOrClear('--activity-server-name-variant', serverStyles.includes('smallcaps') ? 'small-caps' : 'normal');
		const subtextColor = mixHex(String(serverName.color || '#ffffff'), -0.30);
		setOrClear('--activity-subtext-color-derived', subtextColor);
		const scratchLevel = Number(activity.scratch_level ?? 50);
		const scratchDensity = Number(activity.scratch_density ?? 50);
		const scratchIntensity = Number(activity.scratch_intensity ?? 50);
		const scratchOpacity = (sliderToUnit(scratchLevel) * sliderToUnit(scratchIntensity) * 0.09);
		const scratchTexture = buildRandomScratchTexture(
			scratchLevel,
			scratchDensity,
			scratchIntensity
		);
		rootStyle.setProperty('--activity-chassis-stripe', `rgba(255,255,255,${scratchOpacity.toFixed(4)})`);
		rootStyle.setProperty('--activity-random-scratches', scratchTexture);

		if (chartColors.readColor) {
			rootStyle.setProperty('--chart-read-color', String(chartColors.readColor));
			rootStyle.setProperty('--chart-read-dot-color', String(chartColors.readColor));
			const rgb = hexToRgbComponents(chartColors.readColor);
			if (rgb) {
				rootStyle.setProperty('--chart-read-gradient-top', `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.5)`);
				rootStyle.setProperty('--chart-read-gradient-bottom', `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
			}
		} else {
			rootStyle.removeProperty('--chart-read-color');
			rootStyle.removeProperty('--chart-read-dot-color');
			rootStyle.removeProperty('--chart-read-gradient-top');
			rootStyle.removeProperty('--chart-read-gradient-bottom');
		}
		if (chartColors.writeColor) {
			rootStyle.setProperty('--chart-write-color', String(chartColors.writeColor));
			rootStyle.setProperty('--chart-write-dot-color', String(chartColors.writeColor));
			const rgb = hexToRgbComponents(chartColors.writeColor);
			if (rgb) {
				rootStyle.setProperty('--chart-write-gradient-top', `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.5)`);
				rootStyle.setProperty('--chart-write-gradient-bottom', `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
			}
		} else {
			rootStyle.removeProperty('--chart-write-color');
			rootStyle.removeProperty('--chart-write-dot-color');
			rootStyle.removeProperty('--chart-write-gradient-top');
			rootStyle.removeProperty('--chart-write-gradient-bottom');
		}
		setOrClear('--chart-y-axis-label-color', chartColors.yAxisLabelColor);
		setOrClear('--chart-y-axis-grid-color', chartColors.yAxisGridColor);
		setOrClear('--activity-title-color', chartColors.graphTitleColor);

		rootStyle.setProperty('--chart-graph-title-scale', sliderToScale(typography.graph_title_size_scale).toFixed(3));
		rootStyle.setProperty('--chart-legend-text-scale', sliderToScale(typography.legend_text_size_scale).toFixed(3));
		rootStyle.setProperty('--chart-y-axis-label-font-size', `${Math.max(6, Math.round(9 * sliderToScale(typography.y_axis_label_size_scale)))}px`);
	}

	function applyMenuVariables(config) {
		const menu = config?.ui?.menu || {};
		const sectionName = menu.section_name || {};
		const hasSectionNameStyle = Array.isArray(sectionName.style);
		const sectionNameStyles = Array.isArray(sectionName.style)
			? sectionName.style.map(v => String(v).toLowerCase())
			: [];
		const controls = menu.controls || {};
		const buttons = menu.buttons || {};
		const warning = menu.warning || {};
		const rootStyle = document.documentElement.style;

		// Convert dropdown_opacity from 0-100 slider to 0.5-1.0 opacity
		const dropdownOpacity = menu.dropdown_opacity !== undefined 
			? (0.5 + (Number(menu.dropdown_opacity) / 100) * 0.5)
			: 1.0;

		applyConfigMap(rootStyle, {
			'--menu-bg-color': menu.background,
			'--menu-border-color': menu.border,
			'--menu-text-color': menu.text,
			'--menu-button-text': menu.button_text,
			'--menu-opacity': menu.opacity,
			'--menu-dropdown-opacity': dropdownOpacity,
			'--menu-font-family': menu.font,
			'--menu-font-size': menu.size,
			'--menu-label-color': menu.label_color,
			'--menu-section-title-color': sectionName.color || menu.section_title_color,
			'--menu-section-title-size': sectionName.size,
			'--menu-section-title-weight': hasSectionNameStyle ? (sectionNameStyles.includes('bold') ? '700' : '400') : undefined,
			'--menu-section-title-style': hasSectionNameStyle ? (sectionNameStyles.includes('italic') ? 'italic' : 'normal') : undefined,
			'--menu-section-title-transform': hasSectionNameStyle ? (sectionNameStyles.includes('allcaps') ? 'uppercase' : 'none') : undefined,
			'--menu-section-title-variant': hasSectionNameStyle ? (sectionNameStyles.includes('smallcaps') ? 'small-caps' : 'normal') : undefined,
			'--menu-dropdown-bg': menu.dropdown_background,
			'--menu-dropdown-border': menu.dropdown_border,
			'--menu-dropdown-shadow': menu.dropdown_shadow,
			'--menu-control-bg': controls.background,
			'--menu-control-border': controls.border,
			'--menu-control-text': controls.text,
			'--menu-control-focus-border': controls.focus_border,
			'--menu-control-focus-glow': (() => {
				if (controls.focus_glow) return controls.focus_glow;
				const hex = String(controls.focus_border || '').trim();
				if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
					const rgb = hexToRgbComponents(hex);
					if (rgb) return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.4)`;
				}
				return undefined;
			})(),
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

	function applyEnclosurePreview(config) {
		const devices = config?.devices || {};
		const globalHoleColor = config?.ui?.bay?.grill_hole_color || '#000000';
		const globalSizeScale = Math.min(100, Math.max(0, Number(config?.ui?.bay?.grill_size_scale ?? 50)));
		const baseGrillPx = 10 + (globalSizeScale / 100) * 10;
		const clampSlider = (v) => Math.max(0, Math.min(100, Number(v ?? 50)));
		const curveCentered = (v, power = 1.7) => {
			const t = (clampSlider(v) - 50) / 50;
			return Math.sign(t) * Math.pow(Math.abs(t), power);
		};
		const sliderToUnit = (v) => (curveCentered(v) + 1) / 2;
		const setOrClear = (el, name, value) => {
			if (value === undefined || value === null || value === '') {
				el.style.removeProperty(name);
				return;
			}
			el.style.setProperty(name, String(value));
		};
		Object.entries(devices).forEach(([key, devCfg]) => {
			const el = document.querySelector(`.chassis-card[data-key="${key}"]`);
			if (!el) return;
			const bayDev = devCfg?.bay || {};
			const doorColor = bayDev.door_color;
			const hasDoorColor = !!(doorColor && /^#[0-9a-fA-F]{6}$/.test(doorColor));
			if (hasDoorColor) {
				el.style.setProperty('--enc-bay-bg-start', mixHex(doorColor, -0.10));
				el.style.setProperty('--enc-bay-bg-end', mixHex(doorColor, -0.30));
				el.style.setProperty('--enc-latch-start', mixHex(doorColor, 0.15));
				el.style.setProperty('--enc-latch-mid', doorColor);
				el.style.setProperty('--enc-latch-end', mixHex(doorColor, -0.20));
			}
			const grillShape = bayDev.grill_shape || 'round';
			const holeColor = hasDoorColor ? mixHex(doorColor, -0.50) : globalHoleColor;
			const sizeScale = bayDev.grill_size_scale;
			const grillPx = sizeScale !== undefined
				? Math.max(2, Math.round(baseGrillPx * grillSliderScale(sizeScale)))
				: baseGrillPx;
			el.style.removeProperty('--enc-grill-opacity');
			el.style.removeProperty('--enc-grill-image');
			el.style.removeProperty('--enc-grill-size');
			el.style.removeProperty('--enc-grill-pos2');
			if (grillShape !== 'round' || hasDoorColor || sizeScale !== undefined) {
				const g = buildGrillImageCss(grillShape, holeColor, grillPx);
				if (g.opacity !== undefined) el.style.setProperty('--enc-grill-opacity', g.opacity);
				if (g.image) el.style.setProperty('--enc-grill-image', g.image);
				if (sizeScale !== undefined) el.style.setProperty('--enc-grill-size', `${grillPx}px`);
				if (g.pos2) el.style.setProperty('--enc-grill-pos2', g.pos2);
			}

			const chassisDev = devCfg?.chassis || {};
			const chassisColor = chassisDev.color;
			const hasChassisColor = !!(chassisColor && /^#[0-9a-fA-F]{6}$/.test(chassisColor));

			if (hasChassisColor) {
				el.style.setProperty('--enc-chassis-bg', chassisColor);
				el.style.setProperty('--enc-chassis-bg-body', mixHex(chassisColor, -0.18));
				el.style.setProperty('--enc-chassis-gradient-start', mixHex(chassisColor, -0.35));
				el.style.setProperty('--enc-chassis-gradient-mid-a', mixHex(chassisColor, -0.12));
				el.style.setProperty('--enc-chassis-gradient-mid-b', mixHex(chassisColor, 0.08));
				el.style.setProperty('--enc-chassis-gradient-end', mixHex(chassisColor, -0.32));
			} else {
				el.style.removeProperty('--enc-chassis-bg');
				el.style.removeProperty('--enc-chassis-bg-body');
				el.style.removeProperty('--enc-chassis-gradient-start');
				el.style.removeProperty('--enc-chassis-gradient-mid-a');
				el.style.removeProperty('--enc-chassis-gradient-mid-b');
				el.style.removeProperty('--enc-chassis-gradient-end');
			}

			const serverName = chassisDev.server_name || {};
			const serverStyles = Array.isArray(serverName.style)
				? serverName.style.map(v => String(v).toLowerCase())
				: [];
			const hasServerStyleOverride = Array.isArray(serverName.style);

			setOrClear(el, '--server-name-color', serverName.color);
			setOrClear(el, '--server-name-font', serverName.font);
			setOrClear(el, '--server-name-weight', hasServerStyleOverride ? (serverStyles.includes('bold') ? '700' : '400') : undefined);
			setOrClear(el, '--server-name-style', hasServerStyleOverride ? (serverStyles.includes('italic') ? 'italic' : 'normal') : undefined);
			setOrClear(el, '--server-name-transform', hasServerStyleOverride ? (serverStyles.includes('allcaps') ? 'uppercase' : 'none') : undefined);
			setOrClear(el, '--server-name-variant', hasServerStyleOverride ? (serverStyles.includes('smallcaps') ? 'small-caps' : 'normal') : undefined);
			setOrClear(el, '--pci-address-color', chassisDev?.pci_address?.color);

			const hasScratchOverride =
				chassisDev.scratch_level !== undefined ||
				chassisDev.scratch_density !== undefined ||
				chassisDev.scratch_intensity !== undefined;

			if (hasScratchOverride) {
				const scratchLevel = Number(chassisDev.scratch_level ?? 50);
				const scratchDensity = Number(chassisDev.scratch_density ?? 50);
				const scratchIntensity = Number(chassisDev.scratch_intensity ?? 50);
				const scratchOpacity = (sliderToUnit(scratchLevel) * sliderToUnit(scratchIntensity) * 0.09);
				const scratchTexture = buildRandomScratchTexture(
					scratchLevel,
					scratchDensity,
					scratchIntensity
				);
				el.style.setProperty('--enc-chassis-stripe', `rgba(255,255,255,${scratchOpacity.toFixed(4)})`);
				el.style.setProperty('--enc-chassis-scratches', scratchTexture);
			} else {
				el.style.removeProperty('--enc-chassis-stripe');
				el.style.removeProperty('--enc-chassis-scratches');
			}
		});
	}

	function setPreviewConfig(config) {
		window.__previewConfig__ = deepClone(config);
		window.dispatchEvent(new CustomEvent('dashboard-preview-config-updated'));
	}

	async function fetchPayload() {
		const response = await fetch('/data?t=' + Date.now(), { cache: 'no-store' });
		if (!response.ok) throw new Error('Failed to fetch /data');
		return await response.json();
	}

	async function fetchCurrentConfig() {
		const payload = await fetchPayload();
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
			applyActivityVariables(originalConfig);
			applyEnclosurePreview(originalConfig);
			scheduleChartRecreation();
			updateDirtyUI();
		} catch (error) {
			console.error('[menu] save failed', error);
			if (statusEl) statusEl.textContent = 'Save failed';
			updateDirtyUI();
		}
	}

	async function resetConfigToDefaults() {
		if (isResetInProgress) return;
		const confirmed = await showMenuConfirm(
			'Reset all dashboard customizations to default settings?',
			'Reset Dashboard'
		);
		if (!confirmed) return;

		try {
			isResetInProgress = true;
			const resetBtn = document.getElementById('menu-reset-btn');
			if (resetBtn) {
				resetBtn.disabled = true;
				resetBtn.textContent = 'RESETTING...';
			}
			if (statusEl) statusEl.textContent = 'Resetting to defaults...';
			const response = await fetch('/reset-config', {
				method: 'POST'
			});
			if (!response.ok) {
				let message = 'Reset failed with HTTP ' + response.status;
				try {
					const data = await response.json();
					if (data && data.message) message = data.message;
				} catch (_e) {
					// Ignore parse errors and keep the HTTP status message.
				}
				throw new Error(message);
			}

			await showMenuMessage(
				'Defaults restored. Dashboard will hard refresh in 3 seconds.',
				'Reset Complete'
			);
			if (statusEl) statusEl.textContent = 'Defaults restored. Hard refreshing in 3s...';

			setTimeout(() => {
				try {
					window.location.reload();
				} catch (_err) {
					// Fallback to same-path cache-busted reload if reload is blocked.
					window.location.href = `${window.location.pathname}?hardReload=${Date.now()}`;
				}
			}, 3000);
		} catch (error) {
			console.error('[menu] reset failed', error);
			if (statusEl) statusEl.textContent = 'Reset failed';
			await showMenuMessage(`Reset failed: ${error.message || error}`, 'Reset Failed');
			const resetBtn = document.getElementById('menu-reset-btn');
			if (resetBtn) {
				resetBtn.disabled = false;
				resetBtn.textContent = 'RESET ALL';
			}
		} finally {
			if (!window.location.href.includes('hardReload=')) {
				isResetInProgress = false;
			}
		}
	}

	function revertConfig() {
		if (!originalConfig) return;
		workingConfig = deepClone(originalConfig);
		isDirty = false;
		setPreviewConfig(workingConfig);
		applyMenuVariables(workingConfig);
		applyActivityVariables(workingConfig);
		applyEnclosurePreview(workingConfig);
		scheduleChartRecreation();
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

		const joinedPath = path.join('|');
		if (joinedPath === 'chart|colors|readColor') {
			if (!workingConfig.chart) workingConfig.chart = {};
			if (!workingConfig.chart.colors) workingConfig.chart.colors = {};
			workingConfig.chart.colors.readDotColor = value;
		}
		if (joinedPath === 'chart|colors|writeColor') {
			if (!workingConfig.chart) workingConfig.chart = {};
			if (!workingConfig.chart.colors) workingConfig.chart.colors = {};
			workingConfig.chart.colors.writeDotColor = value;
		}

		isDirty = true;
		setPreviewConfig(workingConfig);
		applyMenuVariables(workingConfig);
		applyActivityVariables(workingConfig);
		const p0 = path[0], p1 = path[1];
		if (p0 === 'chart' || (p0 === 'ui' && p1 === 'activity')) {
			scheduleChartRecreation();
		}
		if (p0 === 'devices') {
			applyEnclosurePreview(workingConfig);
		}
		updateDirtyUI();
	}

	const WEB_FONTS = [
		'Calibri, Candara, Segoe UI, Optima, Arial, sans-serif',
		'Arial, Helvetica, sans-serif',
		'Verdana, Geneva, sans-serif',
		'Trebuchet MS, Helvetica, sans-serif',
		'Georgia, Times New Roman, serif',
		'Courier New, Courier, monospace',
		'Impact, Charcoal, sans-serif',
		'Comic Sans MS, cursive',
		'Tahoma, Geneva, sans-serif',
		'Palatino Linotype, Book Antiqua, Palatino, serif',
	];

	function getNestedValue(obj, path) {
		if (!obj || !Array.isArray(path)) return undefined;
		return path.reduce((cur, key) => (cur && typeof cur === 'object' ? cur[key] : undefined), obj);
	}

	function toSafeId(str) {
		return String(str || '').replace(/[^a-zA-Z0-9_-]/g, '-');
	}

	function htmlEscape(str) {
		return String(str || '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function normalizeKeyLR(topologyKey, pciRaw) {
		if (!topologyKey) return pciRaw;
		if (topologyKey.includes('-')) {
			const parts = topologyKey.split('-');
			if (parts.length >= 4) {
				const pci = `${parts[0]}:${parts[1]}:${parts[2]}.${parts[3]}`;
				const suffix = parts.length > 4 ? `-${parts.slice(4).join('-')}` : '';
				return `${pci}${suffix}`;
			}
		}
		return pciRaw || topologyKey;
	}

	function getDiskArraysMenuSignature(topology, hostname) {
		const entries = Object.entries(topology || {}).map(([topologyKey, chassisData]) => {
			const settings = chassisData?.settings || {};
			return {
				topologyKey,
				pciRaw: settings.pci_raw || topologyKey,
				arrayAddress: settings.array_address || settings.array_id || '',
				hasBackplane: Boolean(settings.has_backplane),
				maxBays: settings.max_bays || 0
			};
		});
		return JSON.stringify({ hostname: hostname || '', entries });
	}

	function buildColorRow(labelText, configPath) {
		const id = 'mc-' + toSafeId(configPath.join('-'));
		return `
			<div class="menu-control-row">
				<label class="menu-ctrl-label" for="${id}">${labelText}</label>
				<div class="menu-ctrl-right">
					<span class="color-swatch" id="${id}-swatch" data-path="${configPath.join('|')}"></span>
					<input type="color" class="hidden-color-input" id="${id}" data-path="${configPath.join('|')}">
				</div>
			</div>`;
	}

	function buildFontRow(labelText, configPath) {
		const id = 'mc-' + toSafeId(configPath.join('-'));
		const opts = WEB_FONTS.map(f => `<option value="${f}">${f.split(',')[0].trim()}</option>`).join('');
		return `
			<div class="menu-control-row">
				<label class="menu-ctrl-label" for="${id}">${labelText}</label>
				<div class="menu-ctrl-right">
					<select class="menu-font-select" id="${id}" data-path="${configPath.join('|')}">${opts}</select>
				</div>
			</div>`;
	}

	function buildSliderRow(labelText, configPath) {
		const id = 'mc-' + toSafeId(configPath.join('-'));
		return `
			<div class="menu-control-row">
				<label class="menu-ctrl-label" for="${id}">${labelText}</label>
				<div class="menu-ctrl-right menu-slider-wrap">
					<input type="range" class="menu-slider" id="${id}" data-path="${configPath.join('|')}" min="0" max="100" step="1">
					<span class="menu-slider-value" id="${id}-val">50</span>
				</div>
			</div>`;
	}

	function buildPxSliderRow(labelText, configPath, min = 6, max = 24, step = 1) {
		const id = 'mc-' + toSafeId(configPath.join('-'));
		return `
			<div class="menu-control-row">
				<label class="menu-ctrl-label" for="${id}">${labelText}</label>
				<div class="menu-ctrl-right menu-slider-wrap">
					<input type="range" class="menu-slider" id="${id}" data-path="${configPath.join('|')}" data-value-format="px" min="${min}" max="${max}" step="${step}">
					<span class="menu-slider-value" id="${id}-val">10px</span>
				</div>
			</div>`;
	}

	function buildStyleCheckboxRow(labelText, configPath) {
		const id = 'mc-' + toSafeId(configPath.join('-'));
		const options = [
			['normal', 'Normal'],
			['bold', 'Bold'],
			['italic', 'Italic'],
			['allcaps', 'AllCaps'],
			['smallcaps', 'SmallCaps']
		];
		const boxes = options.map(([value, text]) => `
			<label class="menu-style-option">
				<input type="checkbox" class="menu-style-checkbox" data-style-path="${configPath.join('|')}" data-style-value="${value}" id="${id}-${value}">
				<span>${text}</span>
			</label>`).join('');
		return `
			<div class="menu-control-row menu-style-row">
				<div class="menu-ctrl-label">${labelText}</div>
				<div class="menu-ctrl-right menu-style-options">${boxes}
				</div>
			</div>`;
	}

	function buildTempStyleCheckboxRow(labelText, configPath) {
		const id = 'mc-' + toSafeId(configPath.join('-'));
		return `
			<div class="menu-control-row menu-style-row">
				<div class="menu-ctrl-label">${labelText}</div>
				<div class="menu-ctrl-right menu-style-options">
					<label class="menu-style-option">
						<input type="checkbox" class="menu-style-checkbox" data-temp-style-path="${configPath.join('|')}" data-temp-style-value="normal" id="${id}-normal">
						<span>Normal</span>
					</label>
					<label class="menu-style-option">
						<input type="checkbox" class="menu-style-checkbox" data-temp-style-path="${configPath.join('|')}" data-temp-style-value="bold" id="${id}-bold">
						<span>Bold</span>
					</label>
					<label class="menu-style-option">
						<input type="checkbox" class="menu-style-checkbox" data-temp-style-path="${configPath.join('|')}" data-temp-style-value="italic" id="${id}-italic">
						<span>Italic</span>
					</label>
				</div>
			</div>`;
	}

	function buildUnitRadioRow(labelText, configPath) {
		const id = 'mc-' + toSafeId(configPath.join('-'));
		const options = [
			['C', '\u00B0C'],
			['F', '\u00B0F']
		];
		const radios = options.map(([value, text]) => `
			<label class="menu-shape-option">
				<input type="radio" class="menu-shape-radio"
					name="${id}"
					data-path="${configPath.join('|')}"
					data-radio-value="${value}"
					${value === 'C' ? 'data-radio-default="true"' : ''}
					id="${id}-${value}">
				<span>${text}</span>
			</label>`).join('');
		return `
			<div class="menu-control-row menu-shape-row">
				<div class="menu-ctrl-label">${labelText}</div>
				<div class="menu-ctrl-right menu-shape-options">${radios}
				</div>
			</div>`;
	}

	function buildBayOrientationRow(labelText, configPath) {
		const id = 'mc-' + toSafeId(configPath.join('-'));
		const options = [
			['vertical', 'Vertical'],
			['horizontal', 'Horizontal']
		];
		const radios = options.map(([value, text]) => `
			<label class="menu-shape-option">
				<input type="radio" class="menu-shape-radio"
					name="${id}"
					data-path="${configPath.join('|')}"
					data-radio-value="${value}"
					${value === 'vertical' ? 'data-radio-default="true"' : ''}
					id="${id}-${value}">
				<span>${text}</span>
			</label>`).join('');
		return `
			<div class="menu-control-row menu-shape-row">
				<div class="menu-ctrl-label">${labelText}</div>
				<div class="menu-ctrl-right menu-shape-options">${radios}
				</div>
			</div>`;
	}

	function buildBayOrderRow(labelText, configPath) {
		const id = 'mc-' + toSafeId(configPath.join('-'));
		const options = [
			['left_to_right', 'Left-to-Right'],
			['top_to_bottom', 'Top-to-Bottom']
		];
		const radios = options.map(([value, text]) => `
			<label class="menu-shape-option">
				<input type="radio" class="menu-shape-radio"
					name="${id}"
					data-path="${configPath.join('|')}"
					data-radio-value="${value}"
					${value === 'left_to_right' ? 'data-radio-default="true"' : ''}
					id="${id}-${value}">
				<span>${text}</span>
			</label>`).join('');
		return `
			<div class="menu-control-row menu-shape-row">
				<div class="menu-ctrl-label">${labelText}</div>
				<div class="menu-ctrl-right menu-shape-options">${radios}
				</div>
			</div>`;
	}

		function buildGrillShapeRow(labelText, configPath) {
			const id = 'mc-' + toSafeId(configPath.join('-'));
			const shapes = [
				['solid',    'Solid'],
				['round',    'Round'],
				['square',   'Square'],
				['triangle', 'Triangle'],
				['hexagonal','Hex']
			];
			const radios = shapes.map(([value, text]) => `
				<label class="menu-shape-option">
					<input type="radio" class="menu-shape-radio"
						name="${id}"
						data-path="${configPath.join('|')}"
						data-radio-value="${value}"
						${value === 'round' ? 'data-radio-default="true"' : ''}
						id="${id}-${value}">
					<span>${text}</span>
				</label>`).join('');
			return `
				<div class="menu-control-row menu-shape-row">
					<div class="menu-ctrl-label">${labelText}</div>
					<div class="menu-ctrl-right menu-shape-options">${radios}
					</div>
				</div>`;
		}

	function buildDashboardPanel() {
		return `
			<div class="dropdown-panel" id="dashboard-panel">
				<div class="panel-section">
					<div class="panel-section-title">Page</div>
					${buildColorRow('Background Color', ['ui', 'environment', 'page_bg_color'])}
				</div>
				<div class="panel-section">
					<div class="panel-section-title">Menu</div>
					${buildColorRow('Background Color', ['ui', 'menu', 'background'])}
					${buildColorRow('Text Color', ['ui', 'menu', 'text'])}
					${buildFontRow('Font', ['ui', 'menu', 'font'])}
					${buildSliderRow('Dropdown Transparency', ['ui', 'menu', 'dropdown_opacity'])}
					${buildColorRow('Control Background Colour', ['ui', 'menu', 'controls', 'background'])}
					${buildColorRow('Control Highlight Colour', ['ui', 'menu', 'controls', 'focus_border'])}
					<div class="panel-subsection">
						<div class="panel-subsection-title">Section Name</div>
						${buildColorRow('Colour', ['ui', 'menu', 'section_name', 'color'])}
						${buildPxSliderRow('Font Size', ['ui', 'menu', 'section_name', 'size'], 8, 24, 1)}
						${buildStyleCheckboxRow('Font Style', ['ui', 'menu', 'section_name', 'style'])}
					</div>
				</div>
				<div class="panel-section">
					<div class="panel-section-title">Reset</div>
					<div class="menu-control-row menu-action-row">
						<div class="menu-ctrl-label">Restore all defaults</div>
						<div class="menu-ctrl-right">
							<button class="menu-action-btn menu-reset-btn" id="menu-reset-btn" type="button">RESET ALL</button>
						</div>
					</div>
					<div class="menu-reset-note">Rewrites config.json from service defaults. Hard refresh runs in 3s.</div>
				</div>
			</div>`;
	}

	function buildActivityMonitorPanel() {
		return `
			<div class="dropdown-panel activity-monitor-panel" id="activity-monitor-panel">
				<div class="panel-section">
					<div class="panel-section-title">Chassis</div>
					${buildColorRow('Colour', ['ui', 'activity', 'chassis_color'])}
					${buildSliderRow('Scratch Level', ['ui', 'activity', 'scratch_level'])}
					${buildSliderRow('Scratch Density', ['ui', 'activity', 'scratch_density'])}
					${buildSliderRow('Scratch Intensity', ['ui', 'activity', 'scratch_intensity'])}
					<div class="panel-subsection">
						<div class="panel-subsection-title">Server Name</div>
						${buildFontRow('Font Name', ['ui', 'activity', 'server_name', 'font'])}
						${buildStyleCheckboxRow('Font Style', ['ui', 'activity', 'server_name', 'style'])}
						${buildColorRow('Colour', ['ui', 'activity', 'server_name', 'color'])}
					</div>
				</div>
				<div class="panel-section">
					<div class="panel-section-title">Graphs</div>
					${buildColorRow('Read Colour', ['chart', 'colors', 'readColor'])}
					${buildColorRow('Write Colour', ['chart', 'colors', 'writeColor'])}
					${buildColorRow('Grid Colour', ['chart', 'colors', 'yAxisGridColor'])}
					<div class="panel-subsection">
						<div class="panel-subsection-title">Graph Title</div>
						${buildSliderRow('Font Size', ['chart', 'typography', 'graph_title_size_scale'])}
						${buildColorRow('Colour', ['chart', 'colors', 'graphTitleColor'])}
					</div>
					<div class="panel-subsection">
						<div class="panel-subsection-title">y-axis Label</div>
						${buildSliderRow('Font Size', ['chart', 'typography', 'y_axis_label_size_scale'])}
						${buildColorRow('Colour', ['chart', 'colors', 'yAxisLabelColor'])}
					</div>
					<div class="panel-subsection panel-subsection-last">
						<div class="panel-subsection-title">Legend Text</div>
						${buildSliderRow('Font Size', ['chart', 'typography', 'legend_text_size_scale'])}
						${buildColorRow('Colour', ['ui', 'activity', 'legend_color'])}
					</div>
				</div>
			</div>`;
	}

	function syncPanelValues(panel) {
		panel.querySelectorAll('[data-path]').forEach(el => {
			const path = el.dataset.path.split('|');
			const val = getNestedValue(workingConfig, path);
			if (el.classList.contains('color-swatch')) {
				el.style.background = val || '#000000';
			} else if (el.type === 'color') {
				// Extract first hex-like color from the value (handles gradients too)
				const hex = val ? (val.match(/#[0-9a-fA-F]{3,8}/) || [])[0] || '#000000' : '#000000';
				el.value = hex;
			} else if (el.type === 'range') {
				const isPx = String(el.dataset.valueFormat || '').toLowerCase() === 'px';
				const num = val !== undefined
					? (isPx ? Number(String(val).replace('px', '')) : Number(val))
					: (isPx ? 10 : 50);
				el.value = num;
				const valEl = panel.querySelector(`#${el.id}-val`);
				if (valEl) valEl.textContent = isPx ? `${num}px` : num;
			} else if (el.tagName === 'SELECT') {
				if (val) el.value = val;
			}
		});

		panel.querySelectorAll('input[data-style-path]').forEach(input => {
			const path = input.dataset.stylePath.split('|');
			const styles = getNestedValue(workingConfig, path);
			const active = Array.isArray(styles) ? styles.map(v => String(v).toLowerCase()) : [];
			input.checked = active.includes(String(input.dataset.styleValue).toLowerCase());
		});

		panel.querySelectorAll('input[data-temp-style-path]').forEach(input => {
			const path = input.dataset.tempStylePath.split('|');
			const styles = getNestedValue(workingConfig, path);
			const active = Array.isArray(styles) ? styles.map(v => String(v).toLowerCase()) : [];
			input.checked = active.includes(String(input.dataset.tempStyleValue).toLowerCase());
		});

		panel.querySelectorAll('input[type="radio"][data-path]').forEach(input => {
			const path = input.dataset.path.split('|');
			const val = getNestedValue(workingConfig, path);
			if (val !== undefined && val !== null) {
				input.checked = (String(val) === String(input.dataset.radioValue));
			} else if (input.dataset.radioDefault) {
				input.checked = true;
			}
		});
	}

	function bindPanelEvents(panel) {
		// Wire swatches → open hidden color input
		panel.querySelectorAll('.color-swatch').forEach(swatch => {
			const path = swatch.dataset.path;
			const input = panel.querySelector(`input[data-path="${path}"]`);
			if (input) swatch.addEventListener('click', () => input.click());
		});

		// Wire color inputs
		panel.querySelectorAll('input[type="color"]').forEach(input => {
			const path = input.dataset.path.split('|');
			const swatch = panel.querySelector(`.color-swatch[data-path="${input.dataset.path}"]`);
			input.addEventListener('input', () => {
				if (swatch) swatch.style.background = input.value;
				setConfigValue(path, input.value);
			});
		});

		// Wire font selects
		panel.querySelectorAll('select[data-path]').forEach(sel => {
			const path = sel.dataset.path.split('|');
			sel.addEventListener('change', () => setConfigValue(path, sel.value));
		});

		// Wire range sliders
		panel.querySelectorAll('input[type="range"]').forEach(input => {
			const path = input.dataset.path.split('|');
			const valEl = document.getElementById(input.id + '-val');
			input.addEventListener('input', () => {
				const num = Number(input.value);
				const isPx = String(input.dataset.valueFormat || '').toLowerCase() === 'px';
				if (valEl) valEl.textContent = isPx ? `${num}px` : num;
				setConfigValue(path, isPx ? `${num}px` : num);
			});
		});

		// Wire style checkboxes
		panel.querySelectorAll('input[data-style-path]').forEach(input => {
			input.addEventListener('change', () => {
				const path = input.dataset.stylePath.split('|');
				const value = String(input.dataset.styleValue).toLowerCase();
				const current = getNestedValue(workingConfig, path);
				let next = Array.isArray(current) ? current.map(v => String(v).toLowerCase()) : [];

				if (value === 'normal') {
					next = input.checked ? ['normal'] : [];
				} else if (input.checked) {
					next = next.filter(v => v !== 'normal');
					if (!next.includes(value)) next.push(value);
				} else {
					next = next.filter(v => v !== value);
				}

				setConfigValue(path, next);
				syncPanelValues(panel);
			});
		});

		panel.querySelectorAll('input[data-temp-style-path]').forEach(input => {
			input.addEventListener('change', () => {
				const path = input.dataset.tempStylePath.split('|');
				const value = String(input.dataset.tempStyleValue).toLowerCase();
				const current = getNestedValue(workingConfig, path);
				let next = Array.isArray(current) ? current.map(v => String(v).toLowerCase()) : [];

				if (value === 'normal') {
					next = input.checked ? ['normal'] : [];
				} else if (input.checked) {
					next = next.filter(v => v !== 'normal');
					if (!next.includes(value)) next.push(value);
				} else {
					next = next.filter(v => v !== value);
					if (next.length === 0) next = ['normal'];
				}

				setConfigValue(path, next);
				syncPanelValues(panel);
			});
		});

		// Wire shape radio buttons
		panel.querySelectorAll('input[type="radio"][data-path]').forEach(input => {
			input.addEventListener('change', () => {
				if (!input.checked) return;
				const path = input.dataset.path.split('|');
				setConfigValue(path, input.dataset.radioValue);
			});
		});

		// Wire reset button
		const resetBtn = panel.querySelector('#menu-reset-btn');
		if (resetBtn) {
			resetBtn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				resetConfigToDefaults();
			});
		}
	}

	function openDropdown(panel, trigger) {
		syncPanelValues(panel);
		panel.classList.add('open');
		trigger.classList.add('active');
	}

	function closeDropdown(panel, trigger) {
		panel.classList.remove('open');
		trigger?.classList.remove('active');
	}

	function closeAllDropdowns() {
		document.querySelectorAll('.dropdown-panel.open').forEach(p => {
			const triggerId = p.dataset.trigger;
			const trigger = triggerId ? document.getElementById(triggerId) : null;
			closeDropdown(p, trigger);
		});
	}

	function ensureMenuModalShell() {
		if (menuModalBackdrop) return;

		menuModalBackdrop = document.createElement('div');
		menuModalBackdrop.id = 'menu-modal-backdrop';
		menuModalBackdrop.innerHTML = `
			<div class="menu-modal" role="dialog" aria-modal="true" aria-labelledby="menu-modal-title" aria-describedby="menu-modal-message">
				<div class="menu-modal-title" id="menu-modal-title"></div>
				<div class="menu-modal-message" id="menu-modal-message"></div>
				<div class="menu-modal-actions">
					<button class="menu-modal-btn menu-modal-btn-secondary" id="menu-modal-cancel" type="button">Cancel</button>
					<button class="menu-modal-btn menu-modal-btn-primary" id="menu-modal-confirm" type="button">OK</button>
				</div>
			</div>`;

		document.body.appendChild(menuModalBackdrop);

		menuModalTitle = document.getElementById('menu-modal-title');
		menuModalMessage = document.getElementById('menu-modal-message');
		menuModalConfirmBtn = document.getElementById('menu-modal-confirm');
		menuModalCancelBtn = document.getElementById('menu-modal-cancel');

		menuModalConfirmBtn?.addEventListener('click', () => closeMenuModal(true));
		menuModalCancelBtn?.addEventListener('click', () => closeMenuModal(false));

		menuModalBackdrop.addEventListener('click', (e) => {
			if (e.target === menuModalBackdrop) closeMenuModal(false);
		});

		document.addEventListener('keydown', (e) => {
			if (!menuModalBackdrop?.classList.contains('active')) return;
			if (e.key === 'Escape') {
				e.preventDefault();
				closeMenuModal(false);
				return;
			}
			if (e.key === 'Enter') {
				e.preventDefault();
				closeMenuModal(true);
			}
		});
	}

	function closeMenuModal(result) {
		if (!menuModalBackdrop) return;
		menuModalBackdrop.classList.remove('active');
		const resolver = menuModalResolver;
		menuModalResolver = null;
		if (resolver) resolver(result);
	}

	function openMenuModal({ title, message, confirmText, cancelText, showCancel }) {
		ensureMenuModalShell();
		if (!menuModalBackdrop || !menuModalTitle || !menuModalMessage || !menuModalConfirmBtn || !menuModalCancelBtn) {
			return Promise.resolve(false);
		}

		menuModalTitle.textContent = title || 'Message';
		menuModalMessage.textContent = message || '';
		menuModalConfirmBtn.textContent = confirmText || 'OK';
		menuModalCancelBtn.textContent = cancelText || 'Cancel';
		menuModalCancelBtn.style.display = showCancel ? 'inline-flex' : 'none';
		menuModalBackdrop.classList.add('active');

		setTimeout(() => {
			if (showCancel) menuModalCancelBtn.focus();
			else menuModalConfirmBtn.focus();
		}, 0);

		return new Promise(resolve => {
			menuModalResolver = resolve;
		});
	}

	function showMenuConfirm(message, title = 'Confirm') {
		return openMenuModal({
			title,
			message,
			confirmText: 'Confirm',
			cancelText: 'Cancel',
			showCancel: true
		});
	}

	function showMenuMessage(message, title = 'Notice') {
		return openMenuModal({
			title,
			message,
			confirmText: 'OK',
			showCancel: false
		});
	}

	function buildDiskArraysMenu(topology, hostname) {
		const host = document.getElementById('menu-bar');
		if (!host) return;

		lastTopology = topology || {};
		lastHostname = hostname || '';
		const nextSignature = getDiskArraysMenuSignature(lastTopology, lastHostname);
		const existing = document.getElementById('disk-arrays-panel');
		if (existing && nextSignature === lastDiskArraysMenuSignature) return;

		// Remove any existing Disk Arrays panel wrapper to avoid duplicates
		if (existing) existing.closest('.menu-dropdown-wrapper')?.remove();

		const entries = Object.entries(lastTopology);
		if (entries.length === 0) return;

		let panelSections = '';
		entries.forEach(([topologyKey, chassisData]) => {
			const settings = chassisData?.settings || {};
			const pciRaw = settings.pci_raw || topologyKey;
			const key = normalizeKeyLR(topologyKey, pciRaw);
			const arrayAddress = settings.array_address || settings.array_id || '';
			const hasBackplane = Boolean(settings.has_backplane);
			const caption = hasBackplane ? 'Backplane Enclosure' : 'Direct-Attach Enclosure';
			const enclosureId = arrayAddress ? `${pciRaw} / ${arrayAddress}` : pciRaw;

			panelSections += `
				<div class="da-enclosure" data-key="${htmlEscape(key)}">
					<button class="da-enclosure-header" type="button">
						<span class="da-toggle">&#9654;</span>
						<div class="da-enclosure-title">
							<span class="da-enclosure-name">${htmlEscape(hostname)}<span class="da-enclosure-caption">${htmlEscape(caption)}</span></span>
							<span class="da-enclosure-addr">${htmlEscape(enclosureId)}</span>
						</div>
					</button>
					<div class="da-enclosure-body" hidden>
						<div class="panel-section">
							<div class="panel-section-title">Chassis</div>
							${buildColorRow('Colour', ['devices', key, 'chassis', 'color'])}
							${buildSliderRow('Scratch Level', ['devices', key, 'chassis', 'scratch_level'])}
							${buildSliderRow('Scratch Density', ['devices', key, 'chassis', 'scratch_density'])}
							${buildSliderRow('Scratch Intensity', ['devices', key, 'chassis', 'scratch_intensity'])}
							<div class="panel-subsection">
								<div class="panel-subsection-title">Server Name</div>
								${buildFontRow('Font Name', ['devices', key, 'chassis', 'server_name', 'font'])}
								${buildStyleCheckboxRow('Font Style', ['devices', key, 'chassis', 'server_name', 'style'])}
								${buildColorRow('Colour', ['devices', key, 'chassis', 'server_name', 'color'])}
							</div>
							<div class="panel-subsection">
								<div class="panel-subsection-title">Enclosure ID</div>
								${buildColorRow('Subtitle Colour', ['devices', key, 'chassis', 'pci_address', 'color'])}
							</div>
						</div>
						<div class="panel-section">
							<div class="panel-section-title">Drive Bay</div>
							${buildColorRow('Door Colour', ['devices', key, 'bay', 'door_color'])}
							<div class="panel-subsection">
								<div class="panel-subsection-title">Chassis Configuration</div>
								${buildBayOrientationRow('Bay Orientation', ['devices', key, 'bay', 'layout'])}
								${buildBayOrderRow('Bay Order', ['devices', key, 'bay', 'fill_order'])}
							</div>
							<div class="panel-subsection">
								<div class="panel-subsection-title">Grill</div>
								${buildGrillShapeRow('Shape', ['devices', key, 'bay', 'grill_shape'])}
								${buildSliderRow('Size', ['devices', key, 'bay', 'grill_size_scale'])}
							</div>
						</div>
					</div>
				</div>`;
		});

		const wrapper = document.createElement('div');
		wrapper.className = 'menu-dropdown-wrapper';
		wrapper.innerHTML = `
			<button class="menu-button" id="disk-arrays-menu-btn" type="button">Disk Arrays</button>
			<div class="dropdown-panel disk-arrays-panel" id="disk-arrays-panel">
				<div class="panel-section">
					<div class="panel-section-title">Drive Temperature</div>
					${buildUnitRadioRow('Unit', ['ui', 'drive_temperature', 'unit'])}
					${buildFontRow('Font', ['ui', 'drive_temperature', 'font'])}
					${buildPxSliderRow('Font Size', ['ui', 'drive_temperature', 'size'])}
					${buildTempStyleCheckboxRow('Font Style', ['ui', 'drive_temperature', 'style'])}
					${buildColorRow('Font Colour', ['ui', 'drive_temperature', 'color'])}
				</div>
				${panelSections}
			</div>`;

		const leftGroup = host.querySelector('.menu-left-group');
		if (!leftGroup) return;
		leftGroup.appendChild(wrapper);
		lastDiskArraysMenuSignature = nextSignature;

		const daBtn = document.getElementById('disk-arrays-menu-btn');
		const daPanel = document.getElementById('disk-arrays-panel');
		if (daBtn && daPanel) {
			daPanel.dataset.trigger = 'disk-arrays-menu-btn';
			bindPanelEvents(daPanel);
			daBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				const isOpen = daPanel.classList.contains('open');
				closeAllDropdowns();
				if (!isOpen) openDropdown(daPanel, daBtn);
			});
		}

		// Wire accordion toggles
		daPanel?.querySelectorAll('.da-enclosure-header').forEach(btn => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				const enclosure = btn.closest('.da-enclosure');
				const body = enclosure?.querySelector('.da-enclosure-body');
				const toggle = btn.querySelector('.da-toggle');
				if (!body) return;
				const isOpen = !body.hidden;
				body.hidden = isOpen;
				if (toggle) toggle.textContent = isOpen ? '\u25B6' : '\u25BC';
			});
		});
	}

	function buildMenuBar() {
		const host = document.getElementById('menu-bar');
		if (!host) return;

		host.innerHTML = `
			<div class="menu-container">
				<div class="menu-left-group">
					<div class="menu-dropdown-wrapper">
						<button class="menu-button" id="dashboard-menu-btn" type="button">Dashboard</button>
						${buildDashboardPanel()}
					</div>
					<div class="menu-dropdown-wrapper">
						<button class="menu-button" id="activity-monitor-menu-btn" type="button">Activity Monitor</button>
						${buildActivityMonitorPanel()}
					</div>
				</div>
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
		const directResetBtn = document.getElementById('menu-reset-btn');

		saveButton?.addEventListener('click', saveConfig);
		revertButton?.addEventListener('click', revertConfig);
		legendButton?.addEventListener('click', toggleLegendOverlay);
		// Deactivated redundant direct reset binding.
		// Reset is already bound through bindPanelEvents(dashPanel).
		// directResetBtn?.addEventListener('click', (e) => {
		// 	e.preventDefault();
		// 	e.stopPropagation();
		// 	resetConfigToDefaults();
		// });

		// Dashboard dropdown
		const dashBtn = document.getElementById('dashboard-menu-btn');
		const dashPanel = document.getElementById('dashboard-panel');
		if (dashBtn && dashPanel) {
			dashPanel.dataset.trigger = 'dashboard-menu-btn';
			bindPanelEvents(dashPanel);
			dashBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				const isOpen = dashPanel.classList.contains('open');
				closeAllDropdowns();
				if (!isOpen) openDropdown(dashPanel, dashBtn);
			});
		}

		// Activity Monitor dropdown
		const amBtn = document.getElementById('activity-monitor-menu-btn');
		const amPanel = document.getElementById('activity-monitor-panel');
		if (amBtn && amPanel) {
			amPanel.dataset.trigger = 'activity-monitor-menu-btn';
			bindPanelEvents(amPanel);
			amBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				const isOpen = amPanel.classList.contains('open');
				closeAllDropdowns();
				if (!isOpen) openDropdown(amPanel, amBtn);
			});
		}

		// Close all dropdowns when clicking outside the menu bar
		document.addEventListener('click', (e) => {
			if (!host.contains(e.target)) closeAllDropdowns();
		}, { capture: false });
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

	function handleDashboardDataUpdate(event) {
		const payload = event?.detail?.data;
		if (!payload || typeof payload !== 'object') return;

		const topology = payload.topology;
		if (topology && typeof topology === 'object' && Object.keys(topology).length > 0) {
			lastTopology = topology;
			lastHostname = payload.hostname || lastHostname || '';
			buildDiskArraysMenu(lastTopology, lastHostname);
		}

		if (!originalConfig && payload.config) {
			originalConfig = payload.config;
			workingConfig = deepClone(originalConfig);
			applyMenuVariables(workingConfig);
			applyActivityVariables(workingConfig);
			setPreviewConfig(workingConfig);
			updateDirtyUI();
			if (statusEl) statusEl.textContent = '';
			return;
		}

		if (!isDirty && payload.config) {
			originalConfig = deepClone(payload.config);
			workingConfig = deepClone(payload.config);
			applyMenuVariables(workingConfig);
			applyActivityVariables(workingConfig);
			setPreviewConfig(workingConfig);
			updateDirtyUI();
			if (statusEl) statusEl.textContent = '';
		}
	}

	async function init() {
		buildMenuBar();
		ensureLegendOverlayShell();
		ensureMenuModalShell();
		window.addEventListener('dashboard-data-updated', handleDashboardDataUpdate);
		try {
			const payload = await fetchPayload();
			originalConfig = payload?.config || {};
			lastTopology = payload?.topology || {};
			lastHostname = payload?.hostname || '';
			workingConfig = deepClone(originalConfig);
			applyMenuVariables(workingConfig);
			applyActivityVariables(workingConfig);
			setPreviewConfig(workingConfig);
			updateDirtyUI();
			buildDiskArraysMenu(lastTopology, lastHostname);
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
