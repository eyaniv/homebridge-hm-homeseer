'use strict';

function createLockAccessory(platform, accessory, device) {
  const { Service, Characteristic } = platform.api.hap;
  const ref = device.ref;
  const { LockCurrentState, LockTargetState } = Characteristic;
  const cv = platform.controlValues.get(ref) || {};
  const lockVal = cv.lockValue != null ? cv.lockValue : 255;
  const unlockVal = cv.unlockValue != null ? cv.unlockValue : 0;

  let service = accessory.getService(Service.LockMechanism);
  if (!service) service = accessory.addService(Service.LockMechanism, accessory.displayName);

  const isLocked = (vs, value) => {
    if (vs) {
      const s = vs.toLowerCase();
      if (s.includes('unlock')) return false;
      if (s.includes('lock')) return true;
    }
    return value === lockVal;
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
      await platform.hs.controlDeviceByValue(ref, value === LockTargetState.SECURED ? lockVal : unlockVal);
    });

  platform.hs.onValueChange(ref, async () => {
    const fresh = await platform.hs.getDevice(ref);
    const locked = fresh ? isLocked(fresh.value_string || fresh.status, fresh.value) : true;
    service.updateCharacteristic(LockCurrentState, locked ? LockCurrentState.SECURED : LockCurrentState.UNSECURED);
    service.updateCharacteristic(LockTargetState, locked ? LockTargetState.SECURED : LockTargetState.UNSECURED);
  });
}

module.exports = { createLockAccessory };
