'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');

/**
 * Web UI server for HomeSeerNG device selection.
 * Runs on a configurable port (default 8583).
 */
function startWebServer(platform, port) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Serve static HTML
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  // GET /api/devices — return all devices; mark enabled if in overrides or has voice command
  app.get('/api/devices', (req, res) => {
    const devices = [];
    for (const [ref, device] of platform.deviceCache) {
      const typeOverride = platform.typeOverrides.get(ref);
      const autoType = platform.autoDetect(device);
      const hasVoice = !!(device.voice_command && device.voice_command.trim());
      const isDisabled = platform.disabledRefs.has(ref);
      devices.push({
        ref,
        name: device.name,
        voiceCommand: device.voice_command || '',
        location: device.location,
        location2: device.location2,
        value: device.value,
        valueString: device.value_string || device.status || '',
        deviceType: device.device_type_string || '',
        enabled: !!typeOverride || (hasVoice && !isDisabled),
        type: typeOverride || autoType,
        autoType,
      });
    }
    devices.sort((a, b) => {
      const locA = `${a.location2}/${a.location}/${a.name}`;
      const locB = `${b.location2}/${b.location}/${b.name}`;
      return locA.localeCompare(locB);
    });
    res.json(devices);
  });

  // POST /api/devices — save enabled devices and explicitly disabled voice devices
  // Body: { devices: [{ ref, type, enabled }, ...] }
  app.post('/api/devices', (req, res) => {
    const { devices } = req.body;
    if (!Array.isArray(devices)) return res.status(400).json({ error: 'Expected devices array' });
    const toSave = [];
    for (const d of devices) {
      if (d.enabled) {
        toSave.push({ ref: d.ref, type: d.type });
      } else {
        const cached = platform.deviceCache.get(d.ref);
        if (cached && cached.voice_command && cached.voice_command.trim()) {
          toSave.push({ ref: d.ref, type: d.type, enabled: false });
        }
      }
    }
    platform.saveTypeOverrides(toSave);
    const enabledCount = toSave.filter(d => d.enabled !== false).length;
    res.json({ ok: true, count: enabledCount });
  });

  // GET /api/config — current plugin config
  app.get('/api/config', (req, res) => {
    res.json({
      hsHost: platform.config.host,
      hsPort: platform.config.port || 80,
      ignoreBattery: platform.config.ignoreBattery !== false,
      deviceCount: platform.deviceCache.size,
      selectedCount: platform.typeOverrides.size,
    });
  });

  // POST /api/refresh — trigger device re-discovery
  app.post('/api/refresh', async (req, res) => {
    try {
      await platform.refreshDevices();
      res.json({ ok: true, count: platform.deviceCache.size });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.listen(port, () => {
    platform.log.info(`[HomeSeerNG] Web UI available at http://localhost:${port}`);
  });
}

module.exports = { startWebServer };
