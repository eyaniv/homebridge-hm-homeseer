'use strict';

const toHs = (hk) => hk >= 100 ? 99 : Math.max(1, Math.round(hk));
const toHk = (hs) => hs >= 99  ? 100 : Math.max(0, Math.round(hs));

function createFanAccessory(platform, accessory, device) {
  const { Service, Characteristic } = platform.api.hap;
  const ref = device.ref;
  const cv = platform.controlValues.get(ref) || {};
  const onVal = cv.onValue != null ? cv.onValue : 255;
  const offVal = cv.offValue != null ? cv.offValue : 0;
  const hasDim = !!cv.hasDim;

  const speedRef = findCompanionSpeed(platform, device);
  const hasSpeed = hasDim || speedRef != null;

  platform.log.info(`[Fan] ref=${ref} onVal=${onVal} offVal=${offVal} hasDim=${hasDim} speedRef=${speedRef}`);

  let service = accessory.getService(Service.Fanv2) || accessory.getService(Service.Fan);
  if (service && hasSpeed && service.UUID === Service.Fan.UUID) {
    accessory.removeService(service);
    service = null;
  }
  if (service && !hasSpeed && service.UUID === Service.Fanv2.UUID) {
    accessory.removeService(service);
    service = null;
  }

  if (hasSpeed) {
    if (!service) service = accessory.addService(Service.Fanv2, accessory.displayName);

    const useCompanion = speedRef != null;
    const maxSpeed = useCompanion ? detectMaxSpeed(platform, speedRef) : 0;
    const toSpeedHk = (v) => maxSpeed > 0 ? Math.round(v * 100 / maxSpeed) : toHk(v);
    const toSpeedHs = (hk) => maxSpeed > 0 ? Math.max(1, Math.min(maxSpeed, Math.round(hk * maxSpeed / 100))) : toHs(hk);

    let speedJustSet = false;

    service.getCharacteristic(Characteristic.Active)
      .onGet(async () => {
        const d = platform.deviceCache.get(ref);
        return d && d.value !== offVal ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
      })
      .onSet(async (value) => {
        if (value === Characteristic.Active.INACTIVE) {
          const d = platform.deviceCache.get(ref);
          if (d) d.value = offVal;
          await platform.hs.controlDeviceByValue(ref, offVal);
        } else if (!speedJustSet) {
          const d = platform.deviceCache.get(ref);
          if (d) d.value = onVal;
          await platform.hs.controlDeviceByValue(ref, onVal);
        }
      });

    service.getCharacteristic(Characteristic.RotationSpeed)
      .onGet(async () => {
        if (useCompanion) {
          const d = platform.deviceCache.get(speedRef);
          return d ? clamp(toSpeedHk(d.value), 0, 100) : 0;
        }
        const d = platform.deviceCache.get(ref);
        return d ? toHk(d.value) : 0;
      })
      .onSet(async (value) => {
        speedJustSet = true;
        setTimeout(() => { speedJustSet = false; }, 200);
        if (useCompanion) {
          const hsVal = toSpeedHs(value);
          const d = platform.deviceCache.get(speedRef);
          if (d) d.value = hsVal;
          await platform.hs.controlDeviceByValue(speedRef, hsVal);
          // Also turn on if off
          const pd = platform.deviceCache.get(ref);
          if (pd && pd.value === offVal) {
            pd.value = onVal;
            await platform.hs.controlDeviceByValue(ref, onVal);
          }
        } else {
          const hsVal = toHs(value);
          const d = platform.deviceCache.get(ref);
          if (d) d.value = hsVal;
          await platform.hs.controlDeviceByValue(ref, hsVal);
        }
      });

    platform.hs.onValueChange(ref, (value) => {
      service.updateCharacteristic(Characteristic.Active,
        value !== offVal ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);
      if (!useCompanion) {
        service.updateCharacteristic(Characteristic.RotationSpeed, toHk(value));
      }
    });

    if (useCompanion) {
      platform.hs.onValueChange(speedRef, (value) => {
        service.updateCharacteristic(Characteristic.RotationSpeed, clamp(toSpeedHk(value), 0, 100));
      });
    }
  } else {
    if (!service) service = accessory.addService(Service.Fan, accessory.displayName);

    service.getCharacteristic(Characteristic.On)
      .onGet(async () => {
        const d = platform.deviceCache.get(ref);
        return d ? (d.value !== offVal) : false;
      })
      .onSet(async (value) => {
        const d = platform.deviceCache.get(ref);
        if (d) d.value = value ? onVal : offVal;
        await platform.hs.controlDeviceByValue(ref, value ? onVal : offVal);
      });

    platform.hs.onValueChange(ref, (value) => {
      service.updateCharacteristic(Characteristic.On, value !== offVal);
    });
  }
}

function findCompanionSpeed(platform, device) {
  const baseName = (device.name || '').toLowerCase().replace(/\.power|\.switch|\s+power$/i, '').trim();
  const baseRef = device.ref;

  // check to see if speed is represented by the device itself
  if (baseName.includes('speed') || baseName.includes('fanspeed')) return baseRef;

  // Search by name: same base + speed/fanspeed suffix
  for (const [ref, d] of platform.deviceCache) {
    if (ref === baseRef) continue;
    const n = (d.name || '').toLowerCase();
    if (n.includes(baseName) && (n.includes('speed') || n.includes('fanspeed'))) return ref;
  }

  // Search nearby refs (±10) for speed in name or dts
  for (let offset = 1; offset <= 10; offset++) {
    for (const dir of [1, -1]) {
      const candidate = baseRef + offset * dir;
      const d = platform.deviceCache.get(candidate);
      if (!d) continue;
      if (d.relationship != 4) continue;
      if (d.associated_devices[0] != baseRef) continue;
      const n = (d.name || '').toLowerCase();
      const dts = (d.device_type_string || '').toLowerCase();
      if (n.includes('speed') || dts.includes('speed')) return candidate;
    }
  }

  return null;
}

function detectMaxSpeed(platform, speedRef) {
  const d = platform.deviceCache.get(speedRef);
  if (!d) return 6;
  // If current value is small, assume discrete speeds
  if (d.value >= 0 && d.value <= 10) return 6;
  // Otherwise treat as 0-99 dimmer range
  return 0;
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

module.exports = { createFanAccessory };
