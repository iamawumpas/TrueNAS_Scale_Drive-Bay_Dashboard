import json, os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_FILE = os.path.join(BASE_DIR, 'config.json')
STYLE_CONFIG_FILE = os.path.join(BASE_DIR, 'config.json')

DEFAULT_CONFIG_JSON = {
    "fonts": {
        "default": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
        "monospace": "Courier New, monospace"
    },
    "fontSizes": {
        "legendTitle": "1.25rem",
        "legend": "0.75rem",
        "serverName": "2.8rem",
        "pciAddress": "1.1rem",
        "bayId": "0.8vw",
        "diskSerial": "1.1vw",
        "diskSize": "1.1vw",
        "diskPool": "1.1vw",
        "diskIndex": "1.1vw"
    },
    "fontStyles": {
        "bold": "bold",
        "italic": "italic",
        "underline": "underline",
        "smallCaps": "small-caps",
        "allCaps": "uppercase"
    },
    "colors": {
        "serverName": "#ffffff",
        "pciAddress": "#666666",
        "legend": "#cccccc",
        "legendTitle": "rgba(255, 255, 255, 0.9)",
        "bayId": "#ffaa00",
        "diskSerial": "#ffff00",
        "diskSize": "#ff00ff",
        "diskPool": "#ffffff",
        "diskIndex": "#00ffff",
        "chassisBgBase": "#1a1a1a",
        "chassisBorder": "#333333",
        "chassisShadow": "rgba(0,0,0,0.8)",
        "bayBgBase": "#121212",
        "bayBorder": "#333333",
        "bayTopBorder": "#444444",
        "ledAllocatedHealthy": "#00ff00",
        "ledAllocatedOffline": "#555555",
        "ledError": "#ffaa00",
        "ledFaulted": "#ff0000",
        "ledResilvering": "#ffffff",
        "ledUnallocated": "#a000ff",
        "ledUnallocError": "#ffaa00",
        "ledUnallocFault": "#ff0000",
        "ledActivity": "#008cff"
    }
}

# config.json remarks as requested
DEFAULT_CONFIG = {
    "__REMARK_NETWORK": "Port settings for the web dashboard.",
    "network": {"port": 8010},
    "__REMARK_HARDWARE": "Optional overrides for controller ports and lanes per port.",
    "hardware": {
        "controller_overrides": [
            {
                "pci_address": "0000:00:10.0",
                "ports": 4,
                "lanes_per_port": 4
            }
        ]
    },
    "__REMARK_UI": "Dashboard UI configuration. All values are applied live without restart.\nUse style arrays to combine: [\"bold\", \"italic\", \"allcaps\"]",
    "ui": {
        "__REMARK_SERVER_NAME": "Server name display (top-left of each chassis).",
        "server_name": {
            "color": "#ffffff",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "2.8rem",
            "style": ["bold", "smallcaps"]
        },
        "__REMARK_ENCLOSURE_LABEL": "Inline Backplane/Direct-Attach label shown beside hostname.",
        "enclosure_label": {
            "color": "#ffffff",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size_scale": 40,
            "style": ["allcaps"]
        },
        "__REMARK_PCI_ADDRESS": "PCI / enclosure identifier line under server name.",
        "pci_address": {
            "color": "#666666",
            "font": "Courier New, monospace",
            "size": "0.66rem",
            "style": ["bold"]
        },
        "__REMARK_LEGEND": "Legend chassis typography.",
        "legend": {
            "title_color": "rgba(255, 255, 255, 0.9)",
            "title_size": "1.25rem",
            "title_weight": "800",
            "item_color": "#cccccc",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "0.75rem",
            "style": ["bold", "allcaps"]
        },
        "__REMARK_BAY_ID": "Latch number styling.",
        "bay_id": {
            "color": "#ffaa00",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "0.8vw",
            "style": ["bold", "allcaps"]
        },
        "__REMARK_DISK_SERIAL": "Disk serial suffix text.",
        "disk_serial": {
            "color": "#ffff00",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "1.1vw",
            "style": ["bold"]
        },
        "__REMARK_DISK_SIZE": "Disk capacity text.",
        "disk_size": {
            "color": "#ff00ff",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "1.1vw",
            "style": ["bold"]
        },
        "__REMARK_DISK_POOL": "Pool name text.",
        "disk_pool": {
            "color": "#ffffff",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "1.1vw",
            "style": ["bold"]
        },
        "__REMARK_DISK_INDEX": "Pool index text.",
        "disk_index": {
            "color": "#00ffff",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "1.1vw",
            "style": ["bold"]
        },
        "__REMARK_DRIVE_TEMPERATURE": "Drive temperature text (global for all drive bays).",
        "drive_temperature": {
            "unit": "C",
            "color": "#ffffff",
            "font": "Arial, Helvetica, sans-serif",
            "size": "10px",
            "style": ["normal"]
        },
        "__REMARK_CHASSIS": "Chassis/legend/activity shell styling.",
        "chassis": {
            "background_base": "#1a1a1a",
            "border": "#333333",
            "shadow": "rgba(0,0,0,0.8)",
            "header_divider": "rgba(255,255,255,0.1)",
            "font_color": "#ffffff",
            "meta_color": "#98a7bd",
            "subtitle_color": "#7f8b9b",
            "stripe": "rgba(255, 255, 255, 0.03)",
            "gradient_start": "#111111",
            "gradient_mid_a": "#222222",
            "gradient_mid_b": "#333333",
            "gradient_end": "#111111"
        },
        "__REMARK_BAY": "Drive bay shell styling.",
        "bay": {
            "background_base": "#121212",
            "border": "#333333",
            "top_border": "#444444",
            "grill_size_scale": 50,
            "text_color": "#ced9ea",
            "empty_text_color": "#6e7d91",
            "led_panel_bg": "rgba(0, 0, 0, 0.2)",
            "grill_hole_color": "#000000",
            "bg_gradient_start": "#111621",
            "bg_gradient_end": "#0a0f18"
        },
        "__REMARK_LATCH": "Drive latch/handle styling.",
        "latch": {
            "gradient_start": "#333333",
            "gradient_mid": "#222222",
            "gradient_end": "#111111",
            "border_color": "rgba(255, 255, 255, 0.22)"
        },
        "__REMARK_LED_SHELL": "LED shell and dark-state colors.",
        "led_shell": {
            "dark_core": "#111111",
            "dark_highlight": "#222222",
            "border": "rgba(255, 255, 255, 0.05)",
            "shadow": "rgba(0, 0, 0, 0.9)"
        },
        "__REMARK_ACTIVITY": "Activity monitor card styling.",
        "activity": {
            "card_bg": "#0c0c0e",
            "card_border_top": "rgba(255, 255, 255, 0.15)",
            "card_border_left": "rgba(255, 255, 255, 0.1)",
            "card_border_right": "rgba(0, 0, 0, 0.5)",
            "card_border_bottom": "rgba(0, 0, 0, 0.6)",
            "card_shadow_inner": "rgba(0, 0, 0, 0.9)",
            "card_shadow_outer": "rgba(255, 255, 255, 0.05)",
            "card_glare": "rgba(255, 255, 255, 0.03)",
            "title_color": "#f28a02",
            "legend_color": "#ffffff"
        },
        "__REMARK_POOL": "Pool state indicator styling.",
        "pool": {
            "faulted_gradient_start": "#cc0000",
            "faulted_gradient_end": "#ff0000",
            "faulted_border": "#ffffff",
            "faulted_shadow": "rgba(255, 0, 0, 0.6)",
            "degraded_bg": "rgba(255, 165, 0, 0.3)",
            "degraded_border": "#ffa500",
            "state_text_color": "#ffffff",
            "state_text_bg": "rgba(0, 0, 0, 0.3)",
            "state_text_shadow": "rgba(0, 0, 0, 0.8)"
        },
        "__REMARK_LEDS": "LED and legend dot colors.",
        "led_colors": {
            "allocated_healthy": "#00ff00",
            "allocated_offline": "#555555",
            "error": "#ffaa00",
            "faulted": "#ff0000",
            "resilvering": "#ffffff",
            "unallocated": "#a000ff",
            "unalloc_error": "#ffaa00",
            "unalloc_fault": "#ff0000",
            "activity": "#008cff"
        },
        "__REMARK_ENVIRONMENT": "Page background settings.",
        "environment": {
            "page_bg_color": "#0a0a0a",
            "body_text_color": "#ffffff",
            "rebuild_border": "#2f3d52",
            "rebuild_bg": "#151a22",
            "rebuild_color": "#a4b4c8"
        },
        "__REMARK_LAYOUT": "Physical rack and bay spacing model.",
        "layout": {
            "rack_width_in": 19,
            "u_height_in": 1.75,
            "bay_gap_px": 6,
            "dashboard_max_width": "98vw",
            "dashboard_gap": "16px",
            "dashboard_top_gap": "14px"
        },
        "__REMARK_MENU": "Menu bar and form control styling for the rebuilt menu shell.",
        "menu": {
            "background": "linear-gradient(180deg, #222222 0%, #1a1a1a 100%)",
            "border": "#444444",
            "text": "#ffffff",
            "button_text": "#ffffff",
            "opacity": "1",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "12pt",
            "label_color": "#cccccc",
            "section_title_color": "#64c8ff",
            "section_name": {
                "color": "#64c8ff",
                "size": "10pt",
                "style": ["bold", "allcaps"]
            },
            "dropdown_background": "#1a1a1a",
            "dropdown_border": "#555555",
            "dropdown_shadow": "rgba(0, 0, 0, 0.8)",
            "dropdown_opacity": 100,
            "controls": {
                "background": "#2a2a2a",
                "border": "#555555",
                "text": "#ffffff",
                "focus_border": "#64c8ff",
                "focus_glow": "rgba(100, 200, 255, 0.4)"
            },
            "buttons": {
                "save_bg": "#00cc00",
                "save_hover_bg": "#00ff00",
                "save_glow": "rgba(0, 255, 0, 0.5)",
                "revert_bg": "#cc0000",
                "revert_hover_bg": "#ff0000",
                "revert_glow": "rgba(255, 0, 0, 0.5)"
            },
            "warning": {
                "background": "#aa0000",
                "border": "#ffffff",
                "text": "#ffb3b3"
            }
        }
    },
    "__REMARK_CHART": "Activity monitor colors and dimensions.",
    "chart": {
        "__REMARK_COLORS": "Line and gradient colors for pool activity charts.",
        "colors": {
            "readColor": "#2a00d6",
            "writeColor": "#ff9f00",
            "readDotColor": "#2a00d6",
            "writeDotColor": "#ff9f00",
            "readGradientTop": "rgba(42, 0, 214, 0.5)",
            "readGradientBottom": "rgba(42, 0, 214, 0)",
            "writeGradientTop": "rgba(255, 159, 0, 0.5)",
            "writeGradientBottom": "rgba(255, 159, 0, 0)",
            "yAxisLabelColor": "#ffffff",
            "yAxisGridColor": "rgba(255, 255, 255, 0.3)"
        },
        "__REMARK_DIMENSIONS": "Chart sizing and line styling parameters.",
        "dimensions": {
            "chartHeight": "50px",
            "cardWidth": "360px",
            "containerGap": "25px",
            "lineTension": "0.7",
            "lineWidth": "2",
            "cardMarginRight": "20px"
        }
    },
    "fonts": {
        "default": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
        "monospace": "Courier New, monospace"
    },
    "__REMARK_DEVICES": "Per-device geometry/layout overrides. Keys are PCI addresses.",
    "devices": {
        "0000:00:10.0": {
            "chassis": {
                "rack_units": 2
            },
            "bay": {
                "gap_px": 6
            }
        },
        "0000:00:10.0-e2": {
            "chassis": {
                "rack_units": 2
            },
            "bay": {
                "gap_px": 6,
                "layout": "horizontal",
                "grid_cols": 4,
                "grid_rows": 3,
                "fill_order": "row_major_ltr",
                "drive_sequence": "horizontal"
            }
        }
    }
}

# config.json remarks as requested
CONFIG_MTIME = 0
CONFIG_CACHE = DEFAULT_CONFIG.copy()

def _deep_merge_dict(base, override):
    result = dict(base) if isinstance(base, dict) else {}
    if not isinstance(override, dict):
        return result
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge_dict(result[key], value)
        else:
            result[key] = value
    return result


def _strip_legacy_layout_overrides(config_obj):
    """Remove deprecated per-device chassis layout keys from config payload."""
    if not isinstance(config_obj, dict):
        return config_obj

    devices = config_obj.get("devices")
    if not isinstance(devices, dict):
        return config_obj

    for device_cfg in devices.values():
        if not isinstance(device_cfg, dict):
            continue
        chassis_cfg = device_cfg.get("chassis")
        if not isinstance(chassis_cfg, dict):
            continue
        chassis_cfg.pop("rows", None)
        chassis_cfg.pop("bays_per_row", None)

    return config_obj

def load_config():
    global CONFIG_MTIME, CONFIG_CACHE

    try:
        if not os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'w') as f:
                json.dump(DEFAULT_CONFIG, f, indent=4)

        mtime = os.path.getmtime(CONFIG_FILE)
        if mtime == CONFIG_MTIME and CONFIG_CACHE:
            return CONFIG_CACHE

        with open(CONFIG_FILE, 'r') as f:
            data = json.load(f)
        merged = _deep_merge_dict(DEFAULT_CONFIG, data)
        merged = _strip_legacy_layout_overrides(merged)

        # If new defaults were added, rewrite config.json so users
        # can see and edit the new options directly.
        if merged != data:
            try:
                with open(CONFIG_FILE, 'w') as f:
                    json.dump(merged, f, indent=4)
            except Exception:
                pass

        CONFIG_CACHE = merged
        CONFIG_MTIME = mtime
        return merged
    except Exception as e:
        print(f"config file error :: reverting to default settings ({e})")
        CONFIG_CACHE = DEFAULT_CONFIG
        return DEFAULT_CONFIG

def load_style_config():
    """Load style configuration from config.json for fonts, colors, etc."""
    try:
        # First, try to load the main config file
        if not os.path.exists(CONFIG_FILE):
            # If no config exists, return default style config
            return DEFAULT_CONFIG_JSON

        with open(CONFIG_FILE, 'r') as f:
            data = json.load(f)
        
        # Check if this is the new style config format (fonts, fontSizes, colors)
        if 'fonts' in data and 'fontSizes' in data and 'colors' in data:
            # New format - use it directly
            merged = _deep_merge_dict(DEFAULT_CONFIG_JSON, data)
            return merged
        
        # Check if this is the old UI config format (ui.server_name, etc.)
        if 'ui' in data and isinstance(data['ui'], dict):
            # Convert old format to new format
            ui = data['ui']
            converted = {
                "fonts": {},
                "fontSizes": {},
                "colors": {}
            }
            
            # Extract fonts
            fonts_set = set()
            for key in ['server_name', 'pci_address', 'legend', 'bay_id', 'disk_serial', 'disk_size', 'disk_pool', 'disk_index']:
                if key in ui and isinstance(ui[key], dict) and 'font' in ui[key]:
                    fonts_set.add(ui[key]['font'])
            
            if fonts_set:
                # Identify default and monospace fonts
                for font in fonts_set:
                    if 'mono' in font.lower() or 'courier' in font.lower():
                        converted['fonts']['monospace'] = font
                    else:
                        converted['fonts']['default'] = font
            
            # Extract colors and sizes
            mapping = {
                'server_name': 'serverName',
                'pci_address': 'pciAddress',
                'bay_id': 'bayId',
                'disk_serial': 'diskSerial',
                'disk_size': 'diskSize',
                'disk_pool': 'diskPool',
                'disk_index': 'diskIndex'
            }
            
            for old_key, new_key in mapping.items():
                if old_key in ui and isinstance(ui[old_key], dict):
                    if 'color' in ui[old_key]:
                        converted['colors'][new_key] = ui[old_key]['color']
                    if 'size' in ui[old_key]:
                        converted['fontSizes'][new_key] = ui[old_key]['size']
            
            # Extract legend colors and sizes
            if 'legend' in ui and isinstance(ui['legend'], dict):
                if 'item_color' in ui['legend']:
                    converted['colors']['legend'] = ui['legend']['item_color']
                if 'title_color' in ui['legend']:
                    converted['colors']['legendTitle'] = ui['legend']['title_color']
                if 'size' in ui['legend']:
                    converted['fontSizes']['legend'] = ui['legend']['size']
                if 'title_size' in ui['legend']:
                    converted['fontSizes']['legendTitle'] = ui['legend']['title_size']
            
            # Extract chassis and bay colors
            if 'chassis' in ui and isinstance(ui['chassis'], dict):
                if 'background_base' in ui['chassis']:
                    converted['colors']['chassisBgBase'] = ui['chassis']['background_base']
                if 'border' in ui['chassis']:
                    converted['colors']['chassisBorder'] = ui['chassis']['border']
                if 'shadow' in ui['chassis']:
                    converted['colors']['chassisShadow'] = ui['chassis']['shadow']
            
            if 'bay' in ui and isinstance(ui['bay'], dict):
                if 'background_base' in ui['bay']:
                    converted['colors']['bayBgBase'] = ui['bay']['background_base']
                if 'border' in ui['bay']:
                    converted['colors']['bayBorder'] = ui['bay']['border']
                if 'top_border' in ui['bay']:
                    converted['colors']['bayTopBorder'] = ui['bay']['top_border']
            
            # Extract LED colors
            if 'led_colors' in ui and isinstance(ui['led_colors'], dict):
                led_mapping = {
                    'allocated_healthy': 'ledAllocatedHealthy',
                    'allocated_offline': 'ledAllocatedOffline',
                    'error': 'ledError',
                    'faulted': 'ledFaulted',
                    'resilvering': 'ledResilvering',
                    'unallocated': 'ledUnallocated',
                    'unalloc_error': 'ledUnallocError',
                    'unalloc_fault': 'ledUnallocFault',
                    'activity': 'ledActivity'
                }
                for old_key, new_key in led_mapping.items():
                    if old_key in ui['led_colors']:
                        converted['colors'][new_key] = ui['led_colors'][old_key]
            
            # Merge with defaults
            merged = _deep_merge_dict(DEFAULT_CONFIG_JSON, converted)
            return merged
        
        # If neither format, return defaults
        return DEFAULT_CONFIG_JSON
        
    except Exception as e:
        print(f"style config file error :: reverting to default settings ({e})")
        return DEFAULT_CONFIG_JSON


