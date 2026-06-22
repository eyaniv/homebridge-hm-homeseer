'use strict';

const fs = require('fs');
const path = require('path');

const { HsApi } = require('./hsApi');
const { autoDetectType, isBattery } = require('./discovery');
const { startWebServer } = require('./webui/server');
const { createSwitchAccessory } = require('./accessories/switch');
const { createLightbulbAccessory, createLightbulbNoDimAccessory } = require('./accessories/lightbulb');
const { createFanAccessory } = require('./accessories/fan');
const { createGarageAccessory } = require('./accessories/garage');
const { createLockAccessory } = require('./accessories/lock');
const { createSensorAccessory } = require('./accessories/sensors');
const { createThermostatAccessory } = require('./accessories/thermostat');
const { createValveAccessory } = require('./accessories/valve');
const { createSecurityAccessory } = require('./accessories/security');

const PLUGIN_NAME   = 'homebridge-hm-homeseer';
const PLATFORM_NAME = 'HomeSeerNG';
const SYNC_INTERVAL = 5 * 60 * 1000; // check for new/removed voice commands every 5 min

class HomeSeerNGPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;

    this.deviceCache    = new Map(); // ref -> device object
    this.accessories    = new Map(); // uuid -> PlatformAccessory
    this.typeOverrides  = new Map(); // ref -> type (from JSON file)
    this.disabledRefs   = new Set(); // refs explicitly disabled by user
    this.controlValues  = new Map(); // ref -> { onValue, offValue, lockValue, unlockValue }

    const lanAccess = this.config.lanAccess !== false;
    this.hs = new HsApi(
      this.config.host || '192.168.0.5',
      this.config.port || 80,
      log,
      lanAccess ? null : this.config.username,
      lanAccess ? null : this.config.password
    );

    this._devicesFile = path.join(api.user.storagePath(), 'homeseer-ng-devices.json');
    this._loadTypeOverrides();

    api.on('didFinishLaunching', () => this._init());
    api.on('shutdown', () => this.hs.destroy());
  }

  async _init() {
    this.log.info('[HomeSeerNG] Initializing...');

    const uiPort = this.config.uiPort || 8583;
    const homebridgeIp = this.config.homebridgeIp || 'localhost';
    this._updateSchemaLink(homebridgeIp, uiPort);
    try { startWebServer(this, uiPort); } catch (e) {
      this.log.warn(`[HomeSeerNG] Web UI failed to start: ${e.message}`);
    }

    await this.refreshDevices();
    await this.fetchControlValues();
    this.syncAccessories(true);

    this.hs.connectEventStream(
      (ref, value, valueString) => {
        const d = this.deviceCache.get(ref);
        if (d) { d.value = value; d.value_string = valueString; }
      },
      (err) => this.log.warn(`[HomeSeerNG] Stream error: ${err.message}`),
      this.config.asciiPort || 11000
    );

    // Periodically refresh devices and sync voice-command changes
    setInterval(async () => {
      await this.refreshDevices();
      this.syncAccessories(false); // incremental — only add/remove, don't reconfigure existing
    }, SYNC_INTERVAL);

    this.log.info('[HomeSeerNG] Ready.');
  }

  configureAccessory(accessory) {
    this.accessories.set(accessory.UUID, accessory);
  }

  async refreshDevices() {
    try {
      const devices = await this.hs.getAllDevices();
      for (const d of devices) {
        if (d.ref != null) this.deviceCache.set(d.ref, d);
      }
      this.log.info(`[HomeSeerNG] Loaded ${this.deviceCache.size} devices from HS4.`);
    } catch (e) {
      this.log.error(`[HomeSeerNG] Failed to load devices: ${e.message}`);
    }
  }

  async fetchControlValues() {
    const CONTROL_USE = { ON: 1, OFF: 2, DIM: 3, ON_ALT: 4, LOCK: 18, UNLOCK: 19 };
    let count = 0;
    for (const [ref] of this.deviceCache) {
      const hasVoice = this.deviceCache.get(ref).voice_command && this.deviceCache.get(ref).voice_command.trim();
      if (!hasVoice && !this.typeOverrides.has(ref)) continue;
      if (this.disabledRefs.has(ref)) continue;
      try {
        const data = await this.hs.getControl(ref);
        const pairs = (data && data.ControlPairs) || [];
        if (pairs.length === 0) continue;
        const cv = {};
        for (const p of pairs) {
          switch (p.ControlUse) {
            case CONTROL_USE.ON:     cv.onValue = p.ControlValue; break;
            case CONTROL_USE.OFF:    cv.offValue = p.ControlValue; break;
            case CONTROL_USE.DIM:    cv.hasDim = true; break;
            case CONTROL_USE.ON_ALT: cv.onAltValue = p.ControlValue; break;
            case CONTROL_USE.LOCK:   cv.lockValue = p.ControlValue; break;
            case CONTROL_USE.UNLOCK: cv.unlockValue = p.ControlValue; break;
          }
        }
        // Always scan for open/close/stop/speed (no ControlUse enum for these)
        for (const p of pairs) {
          const label = (p.Label || '').toLowerCase().trim();
          if ((label === 'open' || label === 'opening') && cv.openValue == null) cv.openValue = p.ControlValue;
          else if ((label === 'close' || label === 'closed' || label === 'closing') && cv.closeValue == null) cv.closeValue = p.ControlValue;
          else if (label === 'stop' && cv.stopValue == null) cv.stopValue = p.ControlValue;
          if (label.includes('speed') || label.includes('rotation') || (label === 'dim' && !cv.hasDim)) cv.hasDim = true;
          if (label.includes('disarm') && cv.disarmValue == null) cv.disarmValue = p.ControlValue;
          if (label.includes('arm') && label.includes('stay') && cv.armStayValue == null) cv.armStayValue = p.ControlValue;
          if (label.includes('arm') && label.includes('away') && cv.armAwayValue == null) cv.armAwayValue = p.ControlValue;
          if (label.includes('arm') && label.includes('night') && cv.armNightValue == null) cv.armNightValue = p.ControlValue;
          if (label.includes('arm') && label.includes('max') && cv.armMaxValue == null) cv.armMaxValue = p.ControlValue;
          if (label.includes('arm') && label.includes('instant') && cv.armInstantValue == null) cv.armInstantValue = p.ControlValue;
        }
        // Fallback: if ControlUse was all 0, detect on/off/lock from labels
        if (cv.onValue == null && cv.offValue == null && cv.lockValue == null) {
          for (const p of pairs) {
            const label = (p.Label || '').toLowerCase().trim();
            if (label === 'off' && cv.offValue == null) cv.offValue = p.ControlValue;
            else if ((label === 'on' || label === '(value)') && cv.onValue == null) cv.onValue = p.ControlValue;
            else if (label.includes('lock') && !label.includes('unlock') && cv.lockValue == null) cv.lockValue = p.ControlValue;
            else if (label.includes('unlock') && cv.unlockValue == null) cv.unlockValue = p.ControlValue;
          }
        }
        if (Object.keys(cv).length > 0) {
          this.controlValues.set(ref, cv);
          count++;
        } else if (pairs.length > 0) {
          this.log.info(`[HomeSeerNG] ref=${ref}: ${pairs.length} ControlPairs but no values detected. Labels: ${pairs.map(p => `"${p.Label}"=${p.ControlValue}(CU=${p.ControlUse})`).join(', ')}`);
        }
      } catch (e) {
        this.log.debug(`[HomeSeerNG] Could not fetch control pairs for ref=${ref}: ${e.message}`);
      }
    }
    this.log.info(`[HomeSeerNG] Loaded control values for ${count} devices.`);
  }

  /**
   * Sync HomeKit accessories to match HS4 devices that have a voice command.
   * full=true  → reconfigure all existing accessories (used on startup)
   * full=false → only add new / remove gone ones (used for periodic sync)
   */
  syncAccessories(full = true) {
    const ignoreBattery = this.config.ignoreBattery !== false;
    const wantedUuids   = new Set();

    for (const [ref, device] of this.deviceCache) {
      const hasVoice = device.voice_command && device.voice_command.trim();
      const inOverrides = this.typeOverrides.has(ref);
      if (!hasVoice && !inOverrides) continue;
      if (this.disabledRefs.has(ref)) continue;
      if (ignoreBattery && isBattery(device)) continue;

      const type        = this.typeOverrides.get(ref) || autoDetectType(device);
      const uuid        = this.api.hap.uuid.generate(`HomeSeerNG:${ref}`);
      const displayName = this._buildDisplayName(device, hasVoice);
      wantedUuids.add(uuid);

      let accessory = this.accessories.get(uuid);
      if (!accessory) {
        accessory = new this.api.platformAccessory(displayName, uuid);
        accessory.context.ref  = ref;
        accessory.context.type = type;
        this.accessories.set(uuid, accessory);
        this._configureAccessory(accessory, device, type);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.log.info(`[HomeSeerNG] Added: "${displayName}" (ref=${ref}, type=${type})`);
      } else if (full) {
        if (accessory.context.type !== type) {
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          this.accessories.delete(uuid);
          accessory = new this.api.platformAccessory(displayName, uuid);
          accessory.context.ref  = ref;
          accessory.context.type = type;
          this.accessories.set(uuid, accessory);
          this._configureAccessory(accessory, device, type);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          this.log.info(`[HomeSeerNG] Re-created: "${displayName}" (ref=${ref}, type changed to ${type})`);
        } else {
          if (accessory.displayName !== displayName) accessory.displayName = displayName;
          this._configureAccessory(accessory, device, type);
          this.log.debug(`[HomeSeerNG] Restored: "${displayName}" (ref=${ref}, type=${type})`);
        }
      }
    }

    // Remove accessories whose device no longer has a voice command
    const toRemove = [];
    for (const [uuid, acc] of this.accessories) {
      if (!wantedUuids.has(uuid)) {
        toRemove.push(acc);
        this.accessories.delete(uuid);
      }
    }
    if (toRemove.length > 0) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, toRemove);
      this.log.info(`[HomeSeerNG] Removed ${toRemove.length} accessory(ies) (no voice command).`);
    }
  }

  _configureAccessory(accessory, device, type) {
    const { Service } = this.api.hap;
    for (const svc of accessory.services) {
      if (svc.UUID !== Service.AccessoryInformation.UUID) {
        try { accessory.removeService(svc); } catch {}
      }
    }

    const info = accessory.getService(Service.AccessoryInformation);
    if (info) {
      info.setCharacteristic(this.api.hap.Characteristic.Name, accessory.displayName);
      info.setCharacteristic(this.api.hap.Characteristic.Manufacturer, 'HomeSeer');
      info.setCharacteristic(this.api.hap.Characteristic.Model, device.device_type_string || 'Device');
      info.setCharacteristic(this.api.hap.Characteristic.SerialNumber, `HS-${device.ref}`);
    }

    switch (type) {
      case 'switch':    createSwitchAccessory(this, accessory, device);      break;
      case 'lightbulb': createLightbulbAccessory(this, accessory, device);   break;
      case 'lightbulb-nodim': createLightbulbNoDimAccessory(this, accessory, device); break;
      case 'fan':       createFanAccessory(this, accessory, device);         break;
      case 'garage':    createGarageAccessory(this, accessory, device);      break;
      case 'lock':      createLockAccessory(this, accessory, device);        break;
      case 'valve':     createValveAccessory(this, accessory, device);       break;
      case 'security':  createSecurityAccessory(this, accessory, device);    break;
      case 'thermostat': createThermostatAccessory(this, accessory, device); break;
      default:          createSensorAccessory(this, accessory, device, type); break;
    }
  }

  autoDetect(device) {
    return autoDetectType(device);
  }

  /**
   * Save type overrides from the web UI (ref -> type for devices the user wants to override)
   */
  saveTypeOverrides(allSelections) {
    const enabled  = allSelections.filter(o => o.enabled !== false);
    const disabled = allSelections.filter(o => o.enabled === false);
    this.typeOverrides = new Map(enabled.map(o => [o.ref, o.type]));
    this.disabledRefs  = new Set(disabled.map(o => o.ref));
    try {
      fs.writeFileSync(this._devicesFile, JSON.stringify(allSelections, null, 2));
    } catch (e) {
      this.log.error(`[HomeSeerNG] Failed to save type overrides: ${e.message}`);
    }
    this.syncAccessories(true);
  }

  _loadTypeOverrides() {
    try {
      if (fs.existsSync(this._devicesFile)) {
        const data = JSON.parse(fs.readFileSync(this._devicesFile, 'utf8'));
        const enabled  = data.filter(o => o.enabled !== false);
        const disabled = data.filter(o => o.enabled === false);
        this.typeOverrides = new Map(enabled.map(o => [o.ref, o.type]));
        this.disabledRefs  = new Set(disabled.map(o => o.ref));
      }
    } catch (e) {
      this.log.warn(`[HomeSeerNG] Could not load type overrides: ${e.message}`);
      this.typeOverrides = new Map();
      this.disabledRefs  = new Set();
    }
  }

  _buildDisplayName(device, hasVoice) {
    if (hasVoice) return device.voice_command.trim();
    const name = (device.name || '').trim();
    if (!name) return `Device ${device.ref}`;
    const loc = (device.location || '').trim();
    if (!loc) return name;
    if (name.toLowerCase().startsWith(loc.toLowerCase())) return name;
    return `${loc} ${name}`;
  }

  _updateSchemaLink(ip, port) {
    try {
      const schemaPath = path.join(__dirname, '..', 'config.schema.json');
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      const url = `http://${ip}:${port}`;
      const linkHtml = `<div style='margin-top:20px;padding:14px;background:#1a1a2e;border-radius:8px;text-align:center;border:2px solid #e94560'><a href='${url}' target='_blank' style='color:#e94560;font-size:1.5em;font-weight:900;text-decoration:underline'>OPEN DEVICE SELECTION PAGE</a></div>`;
      const helpItem = schema.layout && schema.layout.find(l => l.type === 'help');
      if (helpItem && helpItem.helpvalue !== linkHtml) {
        helpItem.helpvalue = linkHtml;
        fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
        this.log.info(`[HomeSeerNG] Updated config schema link to ${url}`);
      }
    } catch (e) {
      this.log.debug(`[HomeSeerNG] Could not update schema link: ${e.message}`);
    }
  }
}

module.exports = { HomeSeerNGPlatform };
