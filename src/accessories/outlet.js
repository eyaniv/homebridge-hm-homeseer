'use strict';

function createOutletAccessory(platform, accessory, device) {
  const { Service, Characteristic } = platform.api.hap;
  const ref = device.ref;
  const cv = platform.controlValues.get(ref) || {};
  const onVal = cv.onValue != null ? cv.onValue : 255;
  const offVal = cv.offValue != null ? cv.offValue : 0;

  let service = accessory.getService(Service.Outlet);
  if (!service) service = accessory.addService(Service.Outlet, accessory.displayName);

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

  service.getCharacteristic(Characteristic.OutletInUse)
    .onGet(async () => {
      const d = platform.deviceCache.get(ref);
      return d ? (d.value !== offVal) : false;
    });

  platform.hs.onValueChange(ref, (value) => {
    service.updateCharacteristic(Characteristic.On, value !== offVal);
    service.updateCharacteristic(Characteristic.OutletInUse, value !== offVal);
  });
}

module.exports = { createOutletAccessory };
