'use strict';

// Z-Wave dimmers: HomeKit 100% <-> HS4 99
const toHs = (hk) => hk >= 100 ? 99 : Math.max(1, Math.round(hk));
const toHk = (hs) => hs >= 99  ? 100 : Math.max(0, Math.round(hs));

function createLightbulbAccessory(platform, accessory, device) {
  const { Service, Characteristic } = platform.api.hap;
  const ref = device.ref;

  let service = accessory.getService(Service.Lightbulb);
  if (!service) service = accessory.addService(Service.Lightbulb, accessory.displayName);

  // Flag: Brightness.onSet just fired — skip On.onSet command to avoid override
  let brightnessJustSet = false;

  service.getCharacteristic(Characteristic.On)
    .onGet(async () => {
      const d = platform.deviceCache.get(ref);
      return d ? (d.value !== 0) : false;
    })
    .onSet(async (value) => {
      if (!value) {
        const d = platform.deviceCache.get(ref);
        if (d) d.value = 0;
        await platform.hs.controlDeviceByValue(ref, 0);
      } else if (!brightnessJustSet) {
        // Only send if Brightness didn't just fire (e.g. tapping power button)
        const hkBrightness = service.getCharacteristic(Characteristic.Brightness).value || 100;
        const hsVal = toHs(hkBrightness);
        const d = platform.deviceCache.get(ref);
        if (d) d.value = hsVal;
        await platform.hs.controlDeviceByValue(ref, hsVal);
      }
    });

  service.getCharacteristic(Characteristic.Brightness)
    .onGet(async () => {
      const d = platform.deviceCache.get(ref);
      return d ? toHk(d.value) : 0;
    })
    .onSet(async (value) => {
      brightnessJustSet = true;
      setTimeout(() => { brightnessJustSet = false; }, 200);
      const hsVal = toHs(value);
      const d = platform.deviceCache.get(ref);
      if (d) d.value = hsVal;
      await platform.hs.controlDeviceByValue(ref, hsVal);
    });

  platform.hs.onValueChange(ref, (value) => {
    service.updateCharacteristic(Characteristic.On, value !== 0);
    service.updateCharacteristic(Characteristic.Brightness, toHk(value));
  });
}

module.exports = { createLightbulbAccessory };
