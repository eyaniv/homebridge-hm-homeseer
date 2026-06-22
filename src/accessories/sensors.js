'use strict';

const toC = (f) => Math.round((f - 32) * 5 / 9 * 10) / 10;

function createSensorAccessory(platform, accessory, device, type) {
  const { Service, Characteristic } = platform.api.hap;
  const ref = device.ref;

  let service, characteristic;

  switch (type) {
    case 'temperature':
      service = accessory.getService(Service.TemperatureSensor) ||
                accessory.addService(Service.TemperatureSensor, accessory.displayName);
      characteristic = Characteristic.CurrentTemperature;
      platform.hs.onValueChange(ref, (value) => {
        service.updateCharacteristic(characteristic, toC(value));
      });
      service.getCharacteristic(characteristic).onGet(async () => {
        const d = platform.deviceCache.get(ref);
        return d ? toC(d.value) : 20;
      });
      break;

    case 'humidity':
      service = accessory.getService(Service.HumiditySensor) ||
                accessory.addService(Service.HumiditySensor, accessory.displayName);
      characteristic = Characteristic.CurrentRelativeHumidity;
      platform.hs.onValueChange(ref, (value) => {
        service.updateCharacteristic(characteristic, Math.min(100, Math.max(0, value)));
      });
      service.getCharacteristic(characteristic).onGet(async () => {
        const d = platform.deviceCache.get(ref);
        return d ? Math.min(100, Math.max(0, d.value)) : 0;
      });
      break;

    case 'motion':
      service = accessory.getService(Service.MotionSensor) ||
                accessory.addService(Service.MotionSensor, accessory.displayName);
      characteristic = Characteristic.MotionDetected;
      platform.hs.onValueChange(ref, (value) => {
        service.updateCharacteristic(characteristic, value !== 0);
      });
      service.getCharacteristic(characteristic).onGet(async () => {
        const d = platform.deviceCache.get(ref);
        return d ? (d.value !== 0) : false;
      });
      break;

    case 'contact':
      service = accessory.getService(Service.ContactSensor) ||
                accessory.addService(Service.ContactSensor, accessory.displayName);
      characteristic = Characteristic.ContactSensorState;
      // Use value_string ("Open"/"Closed") from HS4 — more reliable than raw value
      // since some sensors (e.g. HANK) use non-standard values like 22/23 instead of 0/255
      const contactIsOpen = (vs, value) => {
        if (vs) {
          const s = vs.toLowerCase();
          if (s.includes('open')) return true;
          if (s.includes('clos')) return false;
        }
        return value !== 0; // fallback for unknown value_string
      };
      platform.hs.onValueChange(ref, async () => {
        const fresh = await platform.hs.getDevice(ref);
        const isOpen = fresh
          ? contactIsOpen(fresh.value_string || fresh.status, fresh.value)
          : true;
        service.updateCharacteristic(characteristic,
          isOpen ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
                 : Characteristic.ContactSensorState.CONTACT_DETECTED);
      });
      service.getCharacteristic(characteristic).onGet(async () => {
        const fresh = await platform.hs.getDevice(ref);
        if (!fresh) return Characteristic.ContactSensorState.CONTACT_DETECTED;
        const isOpen = contactIsOpen(fresh.value_string || fresh.status, fresh.value);
        return isOpen ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
                      : Characteristic.ContactSensorState.CONTACT_DETECTED;
      });
      break;

    case 'smoke':
      service = accessory.getService(Service.SmokeSensor) ||
                accessory.addService(Service.SmokeSensor, accessory.displayName);
      characteristic = Characteristic.SmokeDetected;
      platform.hs.onValueChange(ref, (value) => {
        service.updateCharacteristic(characteristic,
          value !== 0 ? Characteristic.SmokeDetected.SMOKE_DETECTED
                      : Characteristic.SmokeDetected.SMOKE_NOT_DETECTED);
      });
      service.getCharacteristic(characteristic).onGet(async () => {
        const d = platform.deviceCache.get(ref);
        if (!d) return Characteristic.SmokeDetected.SMOKE_NOT_DETECTED;
        return d.value !== 0 ? Characteristic.SmokeDetected.SMOKE_DETECTED
                             : Characteristic.SmokeDetected.SMOKE_NOT_DETECTED;
      });
      break;

    case 'co':
      service = accessory.getService(Service.CarbonMonoxideSensor) ||
                accessory.addService(Service.CarbonMonoxideSensor, accessory.displayName);
      characteristic = Characteristic.CarbonMonoxideDetected;
      platform.hs.onValueChange(ref, (value) => {
        service.updateCharacteristic(characteristic,
          value !== 0 ? Characteristic.CarbonMonoxideDetected.CO_LEVELS_ABNORMAL
                      : Characteristic.CarbonMonoxideDetected.CO_LEVELS_NORMAL);
      });
      service.getCharacteristic(characteristic).onGet(async () => {
        const d = platform.deviceCache.get(ref);
        if (!d) return Characteristic.CarbonMonoxideDetected.CO_LEVELS_NORMAL;
        return d.value !== 0 ? Characteristic.CarbonMonoxideDetected.CO_LEVELS_ABNORMAL
                             : Characteristic.CarbonMonoxideDetected.CO_LEVELS_NORMAL;
      });
      break;

    case 'leak':
      service = accessory.getService(Service.LeakSensor) ||
                accessory.addService(Service.LeakSensor, accessory.displayName);
      characteristic = Characteristic.LeakDetected;
      platform.hs.onValueChange(ref, (value) => {
        service.updateCharacteristic(characteristic,
          value !== 0 ? Characteristic.LeakDetected.LEAK_DETECTED
                      : Characteristic.LeakDetected.LEAK_NOT_DETECTED);
      });
      service.getCharacteristic(characteristic).onGet(async () => {
        const d = platform.deviceCache.get(ref);
        if (!d) return Characteristic.LeakDetected.LEAK_NOT_DETECTED;
        return d.value !== 0 ? Characteristic.LeakDetected.LEAK_DETECTED
                             : Characteristic.LeakDetected.LEAK_NOT_DETECTED;
      });
      break;

    case 'lightsensor':
      service = accessory.getService(Service.LightSensor) ||
                accessory.addService(Service.LightSensor, accessory.displayName);
      characteristic = Characteristic.CurrentAmbientLightLevel;
      platform.hs.onValueChange(ref, (value) => {
        service.updateCharacteristic(characteristic, Math.max(0.0001, value));
      });
      service.getCharacteristic(characteristic).onGet(async () => {
        const d = platform.deviceCache.get(ref);
        return d ? Math.max(0.0001, d.value) : 0.0001;
      });
      break;

    case 'number':
      service = accessory.getService(Service.LightSensor) ||
                accessory.addService(Service.LightSensor, accessory.displayName);
      characteristic = Characteristic.CurrentAmbientLightLevel;
      service.getCharacteristic(characteristic)
        .setProps({ minValue: 0, maxValue: 100000 });
      platform.hs.onValueChange(ref, (value) => {
        service.updateCharacteristic(characteristic, Math.max(0, value));
      });
      service.getCharacteristic(characteristic).onGet(async () => {
        const d = platform.deviceCache.get(ref);
        return d ? Math.max(0, d.value) : 0;
      });
      break;

    default:
      break;
  }
}

module.exports = { createSensorAccessory };
