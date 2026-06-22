'use strict';

function createValveAccessory(platform, accessory, device) {
  const { Service, Characteristic } = platform.api.hap;
  const ref = device.ref;
  const cv = platform.controlValues.get(ref) || {};
  const openVal = cv.openValue != null ? cv.openValue : (cv.onValue != null ? cv.onValue : 255);
  const closeVal = cv.closeValue != null ? cv.closeValue : (cv.offValue != null ? cv.offValue : 0);

  let service = accessory.getService(Service.Valve);
  if (!service) service = accessory.addService(Service.Valve, accessory.displayName);

  service.getCharacteristic(Characteristic.ValveType)
    .onGet(() => Characteristic.ValveType.WATER_FAUCET);

  const isOpen = (value, valueString) => {
    if (valueString) {
      const s = valueString.toLowerCase();
      if (s.includes('open') || s.includes('on')) return true;
      if (s.includes('clos') || s.includes('off') || s.includes('shut')) return false;
    }
    return value !== closeVal;
  };

  service.getCharacteristic(Characteristic.Active)
    .onGet(async () => {
      const fresh = await platform.hs.getDevice(ref);
      if (!fresh) return Characteristic.Active.INACTIVE;
      return isOpen(fresh.value, fresh.value_string || fresh.status)
        ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
    })
    .onSet(async (value) => {
      const sendVal = value === Characteristic.Active.ACTIVE ? openVal : closeVal;
      const d = platform.deviceCache.get(ref);
      if (d) d.value = sendVal;
      await platform.hs.controlDeviceByValue(ref, sendVal);
    });

  service.getCharacteristic(Characteristic.InUse)
    .onGet(async () => {
      const fresh = await platform.hs.getDevice(ref);
      if (!fresh) return Characteristic.InUse.NOT_IN_USE;
      return isOpen(fresh.value, fresh.value_string || fresh.status)
        ? Characteristic.InUse.IN_USE : Characteristic.InUse.NOT_IN_USE;
    });

  platform.hs.onValueChange(ref, async () => {
    const fresh = await platform.hs.getDevice(ref);
    if (!fresh) return;
    const open = isOpen(fresh.value, fresh.value_string || fresh.status);
    service.updateCharacteristic(Characteristic.Active,
      open ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);
    service.updateCharacteristic(Characteristic.InUse,
      open ? Characteristic.InUse.IN_USE : Characteristic.InUse.NOT_IN_USE);
  });
}

module.exports = { createValveAccessory };
