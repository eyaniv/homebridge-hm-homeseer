'use strict';

const fs = require('fs');
const path = require('path');

const { HsApi } = require('./hsApi');
const { autoDetectType, isBattery } = require('./discovery');
const { startWebServer } = require('./webui/server');
const { createSwitchAccessory } = require('./accessories/switch');
const { createLightbulbAccessory } = require('./accessories/lightbulb');
const { createFanAccessory } = require('./accessories/fan');
const { createGarageAccessory } = require('./accessories/garage');
const { createLockAccessory } = require('./accessories/lock');
const { createSensorAccessory } = require('./accessories/sensors');
const { createThermostatAccessory } = require('./accessories/thermostat');

const PLUGIN_NAME   = 'homebridge-hm-homeseer';
const PLATFORM_NAME = 'HomeSeerNG';
const SYNC_INTERVAL = 5 * 60 * 1000; // check for new/removed voice commands every 5 min

class HomeSeerNGPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;

    this.deviceCache  = new Map(); // ref -> device object
    this.accessories  = new Map(); // uuid -> PlatformAccessory
    this.typeOverrides = new Map(); // ref -> type (from JSON file)

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
    try { startWebServer(this, uiPort); } catch (e) {
      this.log.warn(`[HomeSeerNG] Web UI failed to start: ${e.message}`);
    }

    await this.refreshDevices();
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
      if (ignoreBattery && isBattery(device)) continue;

      const type        = this.typeOverrides.get(ref) || autoDetectType(device);
      const uuid        = this.api.hap.uuid.generate(`HomeSeerNG:${ref}`);
      const displayName = (hasVoice ? device.voice_command.trim() : device.name) || `Device ${ref}`;
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
        if (accessory.displayName !== displayName) accessory.displayName = displayName;
        accessory.context.type = type;
        this._configureAccessory(accessory, device, type);
        this.log.debug(`[HomeSeerNG] Restored: "${displayName}" (ref=${ref}, type=${type})`);
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
      case 'fan':       createFanAccessory(this, accessory, device);         break;
      case 'garage':    createGarageAccessory(this, accessory, device);      break;
      case 'lock':      createLockAccessory(this, accessory, device);        break;
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
  saveTypeOverrides(overrides) {
    this.typeOverrides = new Map(overrides.map(o => [o.ref, o.type]));
    try {
      fs.writeFileSync(this._devicesFile, JSON.stringify(overrides, null, 2));
    } catch (e) {
      this.log.error(`[HomeSeerNG] Failed to save type overrides: ${e.message}`);
    }
    // Re-sync so type changes take effect immediately
    this.syncAccessories(true);
  }

  _loadTypeOverrides() {
    try {
      if (fs.existsSync(this._devicesFile)) {
        const data = JSON.parse(fs.readFileSync(this._devicesFile, 'utf8'));
        this.typeOverrides = new Map(data.map(o => [o.ref, o.type]));
      }
    } catch (e) {
      this.log.warn(`[HomeSeerNG] Could not load type overrides: ${e.message}`);
      this.typeOverrides = new Map();
    }
  }
}

module.exports = { HomeSeerNGPlatform };
