'use strict';

function createSecurityAccessory(platform, accessory, device) {
  const { Service, Characteristic } = platform.api.hap;
  const ref = device.ref;
  const { SecuritySystemCurrentState: SSCS, SecuritySystemTargetState: SSTS } = Characteristic;
  const cv = platform.controlValues.get(ref) || {};

  const stayVal    = cv.armStayValue != null ? cv.armStayValue : (cv.armInstantValue != null ? cv.armInstantValue : null);
  const awayVal    = cv.armAwayValue != null ? cv.armAwayValue : (cv.armMaxValue != null ? cv.armMaxValue : null);
  const nightVal   = cv.armNightValue;
  const disarmVal  = cv.disarmValue;

  platform.log.info(`[Security] ref=${ref} stay=${stayVal} away=${awayVal} night=${nightVal} disarm=${disarmVal}`);

  function valueToCurrent(value, valueString) {
    if (valueString) {
      const s = valueString.toLowerCase();
      if (s.includes('triggered') || s.includes('alarm')) return SSCS.ALARM_TRIGGERED;
      if (s.includes('disarm')) return SSCS.DISARMED;
      if (s.includes('stay') || s.includes('instant')) return SSCS.STAY_ARM;
      if (s.includes('away') || s.includes('max')) return SSCS.AWAY_ARM;
      if (s.includes('night')) return SSCS.NIGHT_ARM;
      if (s.includes('arm')) return SSCS.AWAY_ARM;
    }
    if (value === disarmVal) return SSCS.DISARMED;
    if (value === stayVal) return SSCS.STAY_ARM;
    if (value === awayVal) return SSCS.AWAY_ARM;
    if (value === nightVal) return SSCS.NIGHT_ARM;
    return SSCS.DISARMED;
  }

  function valueToTarget(value, valueString) {
    if (valueString) {
      const s = valueString.toLowerCase();
      if (s.includes('disarm')) return SSTS.DISARM;
      if (s.includes('stay') || s.includes('instant')) return SSTS.STAY_ARM;
      if (s.includes('away') || s.includes('max')) return SSTS.AWAY_ARM;
      if (s.includes('night')) return SSTS.NIGHT_ARM;
      if (s.includes('arm')) return SSTS.AWAY_ARM;
    }
    if (value === disarmVal) return SSTS.DISARM;
    if (value === stayVal) return SSTS.STAY_ARM;
    if (value === awayVal) return SSTS.AWAY_ARM;
    if (value === nightVal) return SSTS.NIGHT_ARM;
    return SSTS.DISARM;
  }

  let service = accessory.getService(Service.SecuritySystem);
  if (!service) service = accessory.addService(Service.SecuritySystem, accessory.displayName);

  const validTargets = [SSTS.DISARM];
  if (stayVal != null) validTargets.push(SSTS.STAY_ARM);
  if (awayVal != null) validTargets.push(SSTS.AWAY_ARM);
  if (nightVal != null) validTargets.push(SSTS.NIGHT_ARM);
  const validCurrent = validTargets.concat([SSCS.ALARM_TRIGGERED]);

  // Set initial values so HomeKit recognizes this as a controllable accessory
  const d = platform.deviceCache.get(ref);
  service.setCharacteristic(SSCS, d ? valueToCurrent(d.value, d.value_string || d.status) : SSCS.DISARMED);
  service.setCharacteristic(SSTS, d ? valueToTarget(d.value, d.value_string || d.status) : SSTS.DISARM);

  service.getCharacteristic(SSCS)
    .setProps({ validValues: validCurrent })
    .onGet(async () => {
      const fresh = await platform.hs.getDevice(ref);
      if (!fresh) return SSCS.DISARMED;
      return valueToCurrent(fresh.value, fresh.value_string || fresh.status);
    });

  service.getCharacteristic(SSTS)
    .setProps({ validValues: validTargets })
    .onGet(async () => {
      const fresh = await platform.hs.getDevice(ref);
      if (!fresh) return SSTS.DISARM;
      return valueToTarget(fresh.value, fresh.value_string || fresh.status);
    })
    .onSet(async (value) => {
      let sendVal;
      switch (value) {
        case SSTS.STAY_ARM:  sendVal = stayVal; break;
        case SSTS.AWAY_ARM:  sendVal = awayVal; break;
        case SSTS.NIGHT_ARM: sendVal = nightVal; break;
        case SSTS.DISARM:    sendVal = disarmVal; break;
      }
      if (sendVal == null) return;
      const dd = platform.deviceCache.get(ref);
      if (dd) dd.value = sendVal;
      await platform.hs.controlDeviceByValue(ref, sendVal);
    });

  platform.hs.onValueChange(ref, async () => {
    const fresh = await platform.hs.getDevice(ref);
    if (!fresh) return;
    service.updateCharacteristic(SSCS, valueToCurrent(fresh.value, fresh.value_string || fresh.status));
    service.updateCharacteristic(SSTS, valueToTarget(fresh.value, fresh.value_string || fresh.status));
  });
}

module.exports = { createSecurityAccessory };
