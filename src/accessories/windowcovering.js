'use strict';

// HS4 blind values: 0=closed, 1-98=position, 99=open, 255=last, 1255=stop
const toHk = (hs) => hs >= 99 ? 100 : Math.max(0, Math.round(hs));
const toHs = (hk) => hk >= 100 ? 99 : Math.max(0, Math.round(hk));

function createWindowCoveringAccessory(platform, accessory, device) {
  const { Service, Characteristic } = platform.api.hap;
  const ref = device.ref;

  let service = accessory.getService(Service.WindowCovering);
  if (!service) service = accessory.addService(Service.WindowCovering, accessory.displayName);

  service.getCharacteristic(Characteristic.CurrentPosition)
    .onGet(async () => {
      const d = platform.deviceCache.get(ref);
      return d ? toHk(d.value) : 0;
    });

  service.getCharacteristic(Characteristic.TargetPosition)
    .onGet(async () => {
      const d = platform.deviceCache.get(ref);
      return d ? toHk(d.value) : 0;
    })
    .onSet(async (value) => {
      const hsVal = toHs(value);
      const d = platform.deviceCache.get(ref);
      if (d) d.value = hsVal;
      await platform.hs.controlDeviceByValue(ref, hsVal);
    });

  service.getCharacteristic(Characteristic.PositionState)
    .onGet(async () => {
      return Characteristic.PositionState.STOPPED;
    });

  platform.hs.onValueChange(ref, (value) => {
    service.updateCharacteristic(Characteristic.CurrentPosition, toHk(value));
    service.updateCharacteristic(Characteristic.TargetPosition, toHk(value));
    service.updateCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);
  });
}

module.exports = { createWindowCoveringAccessory };
