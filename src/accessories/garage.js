'use strict';

function createGarageAccessory(platform, accessory, device) {
  const { Service, Characteristic } = platform.api.hap;
  const ref = device.ref;
  const { CurrentDoorState, TargetDoorState } = Characteristic;

  let service = accessory.getService(Service.GarageDoorOpener);
  if (!service) service = accessory.addService(Service.GarageDoorOpener, accessory.displayName);

  // HS4 convention: 0=closed, 255=open (common for Z-Wave garage controllers)
  const hsToHK = (v) => v === 0 ? CurrentDoorState.CLOSED : CurrentDoorState.OPEN;

  service.getCharacteristic(CurrentDoorState)
    .onGet(async () => {
      const d = platform.deviceCache.get(ref);
      return d ? hsToHK(d.value) : CurrentDoorState.CLOSED;
    });

  service.getCharacteristic(TargetDoorState)
    .onGet(async () => {
      const d = platform.deviceCache.get(ref);
      return d ? (d.value === 0 ? TargetDoorState.CLOSED : TargetDoorState.OPEN) : TargetDoorState.CLOSED;
    })
    .onSet(async (value) => {
      await platform.hs.controlDeviceByValue(ref, value === TargetDoorState.OPEN ? 255 : 0);
    });

  platform.hs.onValueChange(ref, (value) => {
    service.updateCharacteristic(CurrentDoorState, hsToHK(value));
    service.updateCharacteristic(TargetDoorState, value === 0 ? TargetDoorState.CLOSED : TargetDoorState.OPEN);
  });
}

module.exports = { createGarageAccessory };
