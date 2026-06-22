'use strict';

// HS4 mode values: 0=Off, 1=Heat, 2=Cool, 3=Auto
// HomeKit TargetHeatingCoolingState: OFF=0, HEAT=1, COOL=2, AUTO=3 (same mapping)
// HomeKit CurrentHeatingCoolingState: OFF=0, HEAT=1, COOL=2 (no AUTO)

function createThermostatAccessory(platform, accessory, device) {
  const { Service, Characteristic } = platform.api.hap;
  const ref = device.ref;
  const deviceName = device.name || '';

  const THCS = Characteristic.TargetHeatingCoolingState;
  const CHCS = Characteristic.CurrentHeatingCoolingState;

  const tempRef = findCompanionRef(platform, deviceName, ref,
    ['Ambient Temperature', 'Current Temp', 'Temperature', 'Indoor Temp', 'Temp']);
  const heatSetpointRef = findCompanionRef(platform, deviceName, ref,
    ['Heat Setpoint', 'Heating Setpoint', 'Target Temperature Low']);
  const coolSetpointRef = findCompanionRef(platform, deviceName, ref,
    ['Cool Setpoint', 'Cooling Setpoint', 'Target Temperature High']);
  const targetRef = heatSetpointRef || findCompanionRef(platform, deviceName, ref,
    ['Target', 'Target Temp', 'Setpoint']);
  const modeRef = findCompanionRef(platform, deviceName, ref,
    ['System Mode', 'HVAC Mode', 'Mode', 'Operating Mode']);
  const stateRef = findCompanionRef(platform, deviceName, ref,
    ['Operating State', 'Operating Status', 'HVAC Status', 'State']);
  const humidityRef = findCompanionRef(platform, deviceName, ref,
    ['Humidity', 'Indoor Humidity', 'Relative Humidity']);

  const hasCoolAndHeat = !!(heatSetpointRef && coolSetpointRef);

  platform.log.info(`[Thermostat] ref=${ref} temp=${tempRef} heatSP=${heatSetpointRef} coolSP=${coolSetpointRef} target=${targetRef} mode=${modeRef} state=${stateRef} humidity=${humidityRef}`);

  let service = accessory.getService(Service.Thermostat);
  if (!service) service = accessory.addService(Service.Thermostat, accessory.displayName);

  // --- Display Units ---
  service.getCharacteristic(Characteristic.TemperatureDisplayUnits)
    .onGet(() => Characteristic.TemperatureDisplayUnits.FAHRENHEIT)
    .onSet(() => {});

  // --- Target Heating/Cooling State (mode) ---
  const validModes = hasCoolAndHeat
    ? [THCS.OFF, THCS.HEAT, THCS.COOL, THCS.AUTO]
    : modeRef
      ? [THCS.OFF, THCS.HEAT, THCS.COOL, THCS.AUTO]
      : coolSetpointRef
        ? [THCS.OFF, THCS.COOL]
        : [THCS.HEAT];

  service.getCharacteristic(THCS)
    .setProps({ validValues: validModes })
    .onGet(async () => {
      if (modeRef) {
        const d = platform.deviceCache.get(modeRef);
        if (d) return hsToHkMode(d.value);
      }
      return THCS.HEAT;
    })
    .onSet(async (value) => {
      if (modeRef) {
        const d = platform.deviceCache.get(modeRef);
        if (d) d.value = value;
        await platform.hs.controlDeviceByValue(modeRef, value);
      }
    });

  if (modeRef) {
    platform.hs.onValueChange(modeRef, (value) => {
      service.updateCharacteristic(THCS, hsToHkMode(value));
      // When mode changes, update target temp to show the right setpoint
      const tRef = effectiveTargetRef();
      if (tRef) {
        const d = platform.deviceCache.get(tRef);
        if (d) service.updateCharacteristic(Characteristic.TargetTemperature, clamp(toC(d.value), 7.5, 40));
      }
    });
  }

  // --- Current Heating/Cooling State ---
  service.getCharacteristic(CHCS)
    .onGet(async () => {
      if (stateRef) {
        const fresh = await platform.hs.getDevice(stateRef);
        if (fresh) return hsToHkState(fresh.value, fresh.value_string);
      }
      if (modeRef) {
        const d = platform.deviceCache.get(modeRef);
        if (d) {
          const mode = hsToHkMode(d.value);
          return mode === THCS.AUTO ? CHCS.OFF : mode;
        }
      }
      return CHCS.HEAT;
    });

  if (stateRef) {
    platform.hs.onValueChange(stateRef, async () => {
      const fresh = await platform.hs.getDevice(stateRef);
      if (fresh) {
        service.updateCharacteristic(CHCS, hsToHkState(fresh.value, fresh.value_string));
      }
    });
  }

  // --- Current Temperature ---
  if (tempRef) {
    service.getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({ minValue: -20, maxValue: 60 })
      .onGet(async () => {
        const d = platform.deviceCache.get(tempRef);
        return d ? toC(d.value) : 20;
      });

    platform.hs.onValueChange(tempRef, (value) => {
      service.updateCharacteristic(Characteristic.CurrentTemperature, toC(value));
    });
  }

  // --- Target Temperature ---
  const effectiveTargetRef = () => {
    if (!hasCoolAndHeat) return targetRef || heatSetpointRef || coolSetpointRef;
    if (modeRef) {
      const d = platform.deviceCache.get(modeRef);
      if (d) {
        const mode = hsToHkMode(d.value);
        if (mode === THCS.COOL) return coolSetpointRef;
      }
    }
    return heatSetpointRef;
  };

  service.getCharacteristic(Characteristic.TargetTemperature)
    .setProps({ minValue: 7.5, maxValue: 40, minStep: 0.1 })
    .onGet(async () => {
      const tRef = effectiveTargetRef();
      if (!tRef) return toC(72);
      const d = platform.deviceCache.get(tRef);
      return d ? clamp(toC(d.value), 7.5, 40) : toC(72);
    })
    .onSet(async (value) => {
      const tRef = effectiveTargetRef();
      if (!tRef) return;
      const tempF = toF(value);
      platform.log.info(`[Thermostat] Setting target to ${tempF}°F (ref=${tRef})`);
      const d = platform.deviceCache.get(tRef);
      if (d) d.value = tempF;
      await platform.hs.controlDeviceByValue(tRef, tempF);
    });

  if (heatSetpointRef) {
    platform.hs.onValueChange(heatSetpointRef, (value) => {
      if (effectiveTargetRef() === heatSetpointRef) {
        service.updateCharacteristic(Characteristic.TargetTemperature, clamp(toC(value), 7.5, 40));
      }
    });
  }
  if (coolSetpointRef && coolSetpointRef !== heatSetpointRef) {
    platform.hs.onValueChange(coolSetpointRef, (value) => {
      if (effectiveTargetRef() === coolSetpointRef) {
        service.updateCharacteristic(Characteristic.TargetTemperature, clamp(toC(value), 7.5, 40));
      }
    });
  }
  if (targetRef && targetRef !== heatSetpointRef && targetRef !== coolSetpointRef) {
    platform.hs.onValueChange(targetRef, (value) => {
      service.updateCharacteristic(Characteristic.TargetTemperature, clamp(toC(value), 7.5, 40));
    });
  }

  // --- Humidity (optional) ---
  if (humidityRef) {
    let humService = accessory.getService(Service.HumiditySensor);
    if (!humService) humService = accessory.addService(Service.HumiditySensor, accessory.displayName + ' Humidity');

    humService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .onGet(async () => {
        const d = platform.deviceCache.get(humidityRef);
        return d ? clamp(d.value, 0, 100) : 0;
      });

    platform.hs.onValueChange(humidityRef, (value) => {
      humService.updateCharacteristic(Characteristic.CurrentRelativeHumidity, clamp(value, 0, 100));
    });
  }
}

function findCompanionRef(platform, baseName, baseRef, suffixes) {
  const baseLC = baseName.toLowerCase().replace(/\s+/g, ' ').trim();
  // Exact match: "Thermostat" + "Heat Setpoint" = "thermostat heat setpoint"
  for (const suffix of suffixes) {
    const target = `${baseLC} ${suffix.toLowerCase()}`;
    for (const [ref, d] of platform.deviceCache) {
      if ((d.name || '').toLowerCase().replace(/\s+/g, ' ').trim() === target) return ref;
    }
  }
  // Partial match: name contains both base name and suffix
  for (const suffix of suffixes) {
    const suffixLC = suffix.toLowerCase();
    for (const [ref, d] of platform.deviceCache) {
      const n = (d.name || '').toLowerCase();
      if (n.includes(baseLC) && n.includes(suffixLC) && ref !== baseRef) return ref;
    }
  }
  // Proximity: check nearby refs (±20, both directions)
  for (let offset = 1; offset <= 20; offset++) {
    for (const dir of [1, -1]) {
      const d = platform.deviceCache.get(baseRef + offset * dir);
      if (!d) continue;
      if (d.relationship != 4) continue;
      if (d.associated_devices[0] != baseRef) continue;
      const n = (d.name || '').toLowerCase();
      for (const suffix of suffixes) {
        if (n.includes(suffix.toLowerCase())) return d.ref;
      }
    }
  }
  // Last resort: exact name match against suffixes anywhere in device cache
  for (const suffix of suffixes) {
    const suffixLC = suffix.toLowerCase();
    for (const [ref, d] of platform.deviceCache) {
      if ((d.name || '').toLowerCase().trim() === suffixLC && ref !== baseRef) {
        const sameLoc = (d.location || '') === (platform.deviceCache.get(baseRef) || {}).location;
        if (sameLoc) return ref;
      }
    }
  }
  return null;
}

function hsToHkMode(hsVal) {
  switch (Math.round(hsVal)) {
    case 0: return 0; // OFF
    case 1: return 1; // HEAT
    case 2: return 2; // COOL
    case 3: return 3; // AUTO
    default: return 1;
  }
}

function hsToHkState(hsVal, valueString) {
  if (valueString) {
    const s = valueString.toLowerCase();
    if (s.includes('heat')) return 1; // HEAT
    if (s.includes('cool')) return 2; // COOL
    if (s.includes('idle') || s.includes('off')) return 0; // OFF
  }
  switch (Math.round(hsVal)) {
    case 0: return 0; // OFF
    case 1: return 1; // HEAT
    case 2: return 2; // COOL
    default: return 0;
  }
}

function toC(f) { return Math.round((f - 32) * 5 / 9 * 10) / 10; }
function toF(c) { return Math.round(c * 9 / 5 + 32); }
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

module.exports = { createThermostatAccessory };
