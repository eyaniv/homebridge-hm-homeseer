'use strict';

function createThermostatAccessory(platform, accessory, device) {
  const { Service, Characteristic } = platform.api.hap;
  const ref = device.ref;
  const deviceName = device.name || '';

  const tempRef = findCompanionRef(platform, deviceName, ref, ['Temp', 'Current Temp', 'Temperature']);
  const targetRef = findCompanionRef(platform, deviceName, ref, ['Target', 'Target Temp', 'Setpoint', 'Heat Setpoint']);

  if (tempRef) platform.log.info(`[Thermostat] ref=${ref} companion temp ref=${tempRef}`);
  if (targetRef) platform.log.info(`[Thermostat] ref=${ref} companion target ref=${targetRef}`);

  let service = accessory.getService(Service.Thermostat);
  if (!service) service = accessory.addService(Service.Thermostat, accessory.displayName);

  service.getCharacteristic(Characteristic.TemperatureDisplayUnits)
    .onGet(() => Characteristic.TemperatureDisplayUnits.FAHRENHEIT)
    .onSet(() => {});

  service.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
    .onGet(() => Characteristic.CurrentHeatingCoolingState.HEAT);

  service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
    .setProps({ validValues: [Characteristic.TargetHeatingCoolingState.HEAT] })
    .onGet(() => Characteristic.TargetHeatingCoolingState.HEAT)
    .onSet(() => {});

  if (tempRef) {
    service.getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({ minValue: -20, maxValue: 60 })
      .onGet(async () => {
        const d = platform.deviceCache.get(tempRef);
        return d ? toC(d.value) : 0;
      });

    platform.hs.onValueChange(tempRef, (value) => {
      service.updateCharacteristic(Characteristic.CurrentTemperature, toC(value));
    });
  }

  if (targetRef) {
    service.getCharacteristic(Characteristic.TargetTemperature)
      .setProps({ minValue: toC(46), maxValue: toC(104), minStep: toC(47) - toC(46) })
      .onGet(async () => {
        const d = platform.deviceCache.get(targetRef);
        return d ? toC(d.value) : toC(80);
      })
      .onSet(async (value) => {
        const tempF = toF(value);
        platform.log.info(`[Thermostat] Setting target to ${tempF}°F`);
        await platform.hs.controlDeviceByValue(targetRef, tempF);
      });

    platform.hs.onValueChange(targetRef, (value) => {
      service.updateCharacteristic(Characteristic.TargetTemperature, toC(value));
    });
  }
}

function findCompanionRef(platform, baseName, baseRef, suffixes) {
  const baseLC = baseName.toLowerCase();
  for (const suffix of suffixes) {
    const target = `${baseLC} ${suffix.toLowerCase()}`;
    for (const [ref, d] of platform.deviceCache) {
      if ((d.name || '').toLowerCase() === target) return ref;
    }
  }
  for (let offset = 1; offset <= 5; offset++) {
    const d = platform.deviceCache.get(baseRef + offset);
    if (!d) continue;
    const n = (d.name || '').toLowerCase();
    for (const suffix of suffixes) {
      if (n.includes(suffix.toLowerCase())) return d.ref;
    }
  }
  return null;
}

function toC(f) { return (f - 32) * 5 / 9; }
function toF(c) { return Math.round(c * 9 / 5 + 32); }

module.exports = { createThermostatAccessory };
