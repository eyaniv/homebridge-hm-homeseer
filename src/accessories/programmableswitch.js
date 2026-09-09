'use strict';

// Maps HS4 value to HomeKit ProgrammableSwitchEvent: 0=single, 1=double, 2=long
function createProgrammableSwitchAccessory(platform, accessory, device) {
  const { Service, Characteristic } = platform.api.hap;
  const ref = device.ref;

  let service = accessory.getService(Service.StatelessProgrammableSwitch);
  if (!service) service = accessory.addService(Service.StatelessProgrammableSwitch, accessory.displayName);

  service.getCharacteristic(Characteristic.ProgrammableSwitchEvent)
    .setProps({ validValues: [0, 1, 2] });

  platform.hs.onValueChange(ref, (value) => {
    const event = value <= 0 ? 0 : value === 1 ? 1 : 2;
    service.updateCharacteristic(Characteristic.ProgrammableSwitchEvent, event);
  });
}

module.exports = { createProgrammableSwitchAccessory };
