'use strict';

function createGarageAccessory(platform, accessory, device) {
  const { Service, Characteristic } = platform.api.hap;
  const ref = device.ref;
  const { CurrentDoorState, TargetDoorState } = Characteristic;
  const cv = platform.controlValues.get(ref) || {};
  const openVal = cv.openValue != null ? cv.openValue : (cv.onValue != null ? cv.onValue : 255);
  const closeVal = cv.closeValue != null ? cv.closeValue : (cv.offValue != null ? cv.offValue : 0);

  platform.log.info(`[Garage] ref=${ref} openVal=${openVal} closeVal=${closeVal} stopVal=${cv.stopValue}`);

  let service = accessory.getService(Service.GarageDoorOpener);
  if (!service) service = accessory.addService(Service.GarageDoorOpener, accessory.displayName);

  const getDoorState = (value, valueString) => {
    if (valueString) {
      const s = valueString.toLowerCase();
      if (s.includes('open') && s.includes('ing')) return CurrentDoorState.OPENING;
      if (s.includes('clos') && s.includes('ing')) return CurrentDoorState.CLOSING;
      if (s.includes('open')) return CurrentDoorState.OPEN;
      if (s.includes('clos')) return CurrentDoorState.CLOSED;
      if (s.includes('stop') || s.includes('idle')) return CurrentDoorState.STOPPED;
    }
    if (value === openVal) return CurrentDoorState.OPEN;
    if (value === closeVal) return CurrentDoorState.CLOSED;
    return CurrentDoorState.STOPPED;
  };

  const getTarget = (currentState) => {
    if (currentState === CurrentDoorState.OPEN || currentState === CurrentDoorState.OPENING)
      return TargetDoorState.OPEN;
    return TargetDoorState.CLOSED;
  };

  service.getCharacteristic(CurrentDoorState)
    .onGet(async () => {
      const fresh = await platform.hs.getDevice(ref);
      if (!fresh) return CurrentDoorState.CLOSED;
      return getDoorState(fresh.value, fresh.value_string || fresh.status);
    });

  service.getCharacteristic(TargetDoorState)
    .onGet(async () => {
      const fresh = await platform.hs.getDevice(ref);
      if (!fresh) return TargetDoorState.CLOSED;
      return getTarget(getDoorState(fresh.value, fresh.value_string || fresh.status));
    })
    .onSet(async (value) => {
      const sendVal = value === TargetDoorState.OPEN ? openVal : closeVal;
      const d = platform.deviceCache.get(ref);
      if (d) d.value = sendVal;
      await platform.hs.controlDeviceByValue(ref, sendVal);
    });

  service.getCharacteristic(Characteristic.ObstructionDetected)
    .onGet(async () => false);

  platform.hs.onValueChange(ref, async () => {
    const fresh = await platform.hs.getDevice(ref);
    if (!fresh) return;
    const state = getDoorState(fresh.value, fresh.value_string || fresh.status);
    service.updateCharacteristic(CurrentDoorState, state);
    service.updateCharacteristic(TargetDoorState, getTarget(state));
  });
}

module.exports = { createGarageAccessory };
