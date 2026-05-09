'use strict';

function createLockAccessory(platform, accessory, device) {
  const { Service, Characteristic } = platform.api.hap;
  const ref = device.ref;
  const { LockCurrentState, LockTargetState } = Characteristic;

  let service = accessory.getService(Service.LockMechanism);
  if (!service) service = accessory.addService(Service.LockMechanism, accessory.displayName);

  // Use value_string ("Locked"/"Unlocked") from HS4 — more reliable than raw value
  // since Z-Wave locks use varying conventions (0/255, 255/0, etc.)
  const isLocked = (vs, value) => {
    if (vs) {
      const s = vs.toLowerCase();
      if (s.includes('unlock')) return false;
      if (s.includes('lock')) return true;
    }
    return value === 255; // fallback: HS4 255=locked, 0=unlocked
  };

  service.getCharacteristic(LockCurrentState)
    .onGet(async () => {
      const fresh = await platform.hs.getDevice(ref);
      if (!fresh) return LockCurrentState.SECURED;
      return isLocked(fresh.value_string || fresh.status, fresh.value)
        ? LockCurrentState.SECURED : LockCurrentState.UNSECURED;
    });

  service.getCharacteristic(LockTargetState)
    .onGet(async () => {
      const fresh = await platform.hs.getDevice(ref);
      if (!fresh) return LockTargetState.SECURED;
      return isLocked(fresh.value_string || fresh.status, fresh.value)
        ? LockTargetState.SECURED : LockTargetState.UNSECURED;
    })
    .onSet(async (value) => {
      // HS4: 255=locked, 0=unlocked
      await platform.hs.controlDeviceByValue(ref, value === LockTargetState.SECURED ? 255 : 0);
    });

  platform.hs.onValueChange(ref, async () => {
    const fresh = await platform.hs.getDevice(ref);
    const locked = fresh ? isLocked(fresh.value_string || fresh.status, fresh.value) : true;
    service.updateCharacteristic(LockCurrentState, locked ? LockCurrentState.SECURED : LockCurrentState.UNSECURED);
    service.updateCharacteristic(LockTargetState, locked ? LockTargetState.SECURED : LockTargetState.UNSECURED);
  });
}

module.exports = { createLockAccessory };
