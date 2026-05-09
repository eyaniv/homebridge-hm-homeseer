'use strict';

function createFanAccessory(platform, accessory, device) {
  const { Service, Characteristic } = platform.api.hap;
  const ref = device.ref;

  let service = accessory.getService(Service.Fan);
  if (!service) service = accessory.addService(Service.Fan, accessory.displayName);

  service.getCharacteristic(Characteristic.On)
    .onGet(async () => {
      const d = platform.deviceCache.get(ref);
      return d ? (d.value !== 0) : false;
    })
    .onSet(async (value) => {
      await platform.hs.controlDeviceByValue(ref, value ? 255 : 0);
    });

  platform.hs.onValueChange(ref, (value) => {
    service.updateCharacteristic(Characteristic.On, value !== 0);
  });
}

module.exports = { createFanAccessory };
