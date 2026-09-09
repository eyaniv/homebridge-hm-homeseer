'use strict';

function createIrrigationAccessory(platform, accessory, device) {
  const { Service, Characteristic } = platform.api.hap;
  const ref = device.ref;
  const cv = platform.controlValues.get(ref) || {};
  const onVal = cv.onValue != null ? cv.onValue : 255;
  const offVal = cv.offValue != null ? cv.offValue : 0;

  let service = accessory.getService(Service.IrrigationSystem);
  if (!service) service = accessory.addService(Service.IrrigationSystem, accessory.displayName);

  service.getCharacteristic(Characteristic.Active)
    .onGet(async () => {
      const d = platform.deviceCache.get(ref);
      return d && d.value !== offVal
        ? Characteristic.Active.ACTIVE
        : Characteristic.Active.INACTIVE;
    })
    .onSet(async (value) => {
      const hsVal = value === Characteristic.Active.ACTIVE ? onVal : offVal;
      const d = platform.deviceCache.get(ref);
      if (d) d.value = hsVal;
      await platform.hs.controlDeviceByValue(ref, hsVal);
    });

  service.getCharacteristic(Characteristic.InUse)
    .onGet(async () => {
      const d = platform.deviceCache.get(ref);
      return d && d.value !== offVal
        ? Characteristic.InUse.IN_USE
        : Characteristic.InUse.NOT_IN_USE;
    });

  service.getCharacteristic(Characteristic.ProgramMode)
    .onGet(async () => {
      return Characteristic.ProgramMode.NO_PROGRAM_SCHEDULED;
    });

  platform.hs.onValueChange(ref, (value) => {
    const active = value !== offVal;
    service.updateCharacteristic(Characteristic.Active,
      active ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);
    service.updateCharacteristic(Characteristic.InUse,
      active ? Characteristic.InUse.IN_USE : Characteristic.InUse.NOT_IN_USE);
  });
}

module.exports = { createIrrigationAccessory };
