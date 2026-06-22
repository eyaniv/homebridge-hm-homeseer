'use strict';

/**
 * Determines the best HomeKit accessory type for a HS4 device.
 *
 * HS4 device types (device_type_string / status):
 *   - Dimmer, Dimmable Light → Lightbulb (with brightness)
 *   - Switch, Plug, Relay    → Switch
 *   - Thermostat             → Thermostat
 *   - Lock                   → LockMechanism
 *   - Garage                 → GarageDoorOpener
 *   - Fan                    → Fan
 *   - Temperature sensor     → TemperatureSensor
 *   - Humidity sensor        → HumiditySensor
 *   - Motion sensor          → MotionSensor
 *   - Contact sensor         → ContactSensor
 *   - Smoke / CO             → SmokeSensor / CarbonMonoxideSensor
 *   - Leak / Water           → LeakSensor
 *   - Light sensor (lux)     → LightSensor
 *   - Battery                → BatteryService (filter option)
 *   - Default                → Switch
 */

const TYPE_SWITCH      = 'switch';
const TYPE_LIGHTBULB   = 'lightbulb';
const TYPE_FAN         = 'fan';
const TYPE_GARAGE      = 'garage';
const TYPE_LOCK        = 'lock';
const TYPE_THERMOSTAT  = 'thermostat';
const TYPE_TEMP        = 'temperature';
const TYPE_HUMIDITY    = 'humidity';
const TYPE_MOTION      = 'motion';
const TYPE_CONTACT     = 'contact';
const TYPE_SMOKE       = 'smoke';
const TYPE_CO          = 'co';
const TYPE_LEAK        = 'leak';
const TYPE_LIGHT       = 'lightsensor';
const TYPE_VALVE       = 'valve';
const TYPE_SECURITY    = 'security';
const TYPE_BATTERY     = 'battery';

const ALL_TYPES = [
  TYPE_SWITCH, TYPE_LIGHTBULB, TYPE_FAN, TYPE_GARAGE, TYPE_LOCK,
  TYPE_THERMOSTAT, TYPE_TEMP, TYPE_HUMIDITY, TYPE_MOTION, TYPE_CONTACT,
  TYPE_SMOKE, TYPE_CO, TYPE_LEAK, TYPE_LIGHT, TYPE_VALVE, TYPE_SECURITY, TYPE_BATTERY,
];

function autoDetectType(device) {
  const name = (device.name || '').toLowerCase();
  const dts  = (device.device_type_string || '').toLowerCase();
  const loc  = ((device.location || '') + ' ' + (device.location2 || '')).toLowerCase();
  const text = `${name} ${dts} ${loc}`;

  // --- device_type_string first (most reliable) ---
  if (/zhaOpenClose|zhaContact|openclose|open.close/i.test(dts))        return TYPE_CONTACT;
  if (/zhaMotion|zhaPresence|zhaPIR|motion.sensor/i.test(dts))          return TYPE_MOTION;
  if (/zhaHumidity|humidity.sensor/i.test(dts))                         return TYPE_HUMIDITY;
  if (/zhaTemperature|temperature.sensor/i.test(dts))                   return TYPE_TEMP;
  if (/zhaSmoke|smoke.sensor/i.test(dts))                               return TYPE_SMOKE;
  if (/zhaCO|carbon.mono|co.sensor|co.detect/i.test(dts))               return TYPE_CO;
  if (/zhaWater|zhaLeak|zhaFlood|water.sensor|leak.sensor/i.test(dts))  return TYPE_LEAK;
  if (/zhaLux|zhaIllum|zhaLight.Level|lux.sensor|light.sensor/i.test(dts)) return TYPE_LIGHT;
  if (/zhaDimmer|zhaBulb|zhaBrightness|dimm|dimmable|multilevel.switch|switch.multilevel/i.test(dts)) return TYPE_LIGHTBULB;
  if (/zhaFan|fan.control|bond\.power|bond\.fan/i.test(dts))             return TYPE_FAN;
  if (/zhaBattery|battery.sensor/i.test(dts))                           return TYPE_BATTERY;
  if (/thermostat|zhaTherm/i.test(dts))                                 return TYPE_THERMOSTAT;
  if (/ecobee|honeywell/i.test(dts + ' ' + loc) && !/temperature|humidity|occupancy|in use|fan|mode|status|setpoint|program|outdoor|battery|sensor/i.test(name)) return TYPE_THERMOSTAT;
  if (/alarm|security.panel|security.system|partition/i.test(dts))        return TYPE_SECURITY;
  if (/\bvalve\b|water.valve|shutoff|shut.off/i.test(dts))               return TYPE_VALVE;
  if (/garage.door|garage.opener/i.test(dts))                           return TYPE_GARAGE;
  if (/\block\b|deadbolt|lock.mech/i.test(dts))                         return TYPE_LOCK;
  if (/\bvalve\b|water.valve|shutoff|shut.off/i.test(name))             return TYPE_VALVE;
  if (/zhaSwitch|binary.switch|relay|outlet|plug/i.test(dts))           return TYPE_SWITCH;

  // --- name / location fallback ---
  if (/therm/i.test(text))                                              return TYPE_THERMOSTAT;
  if (/garage.door|garage.opener/i.test(text))                          return TYPE_GARAGE;
  if (/\balarm\b|security.system|security.panel|\bpartition\b/i.test(text) && !/smoke|co|carbon|fire/i.test(text)) return TYPE_SECURITY;
  if (/\bvalve\b|water.valve|shutoff|shut.off/i.test(text))              return TYPE_VALVE;
  if (/\block\b|deadbolt/i.test(text))                                  return TYPE_LOCK;
  if (/smoke/i.test(text))                                              return TYPE_SMOKE;
  if (/carbon.mono|co.detect/i.test(text))                              return TYPE_CO;
  if (/\bleak\b|water.sensor|flood/i.test(text))                        return TYPE_LEAK;
  if (/motion|pir|presence/i.test(text))                                return TYPE_MOTION;
  if (/contact|door.sensor|window.sensor|\bdoor\b|\bwindow\b/i.test(text) && !/lock|deadbolt|opener/i.test(text)) return TYPE_CONTACT;
  if (/humid/i.test(text))                                              return TYPE_HUMIDITY;
  if (/lux|illumin|light.level/i.test(text))                            return TYPE_LIGHT;
  if (/temperature|temp.sensor|thermometer/i.test(text))                return TYPE_TEMP;
  if (/\bfan\b/i.test(text))                                            return TYPE_FAN;
  if (/dimm|brightness/i.test(text))                                    return TYPE_LIGHTBULB;
  if (/battery/i.test(text))                                            return TYPE_BATTERY;
  if (/switch|plug|relay|outlet|socket/i.test(text))                    return TYPE_SWITCH;

  return TYPE_SWITCH;
}

function isBattery(device) {
  return autoDetectType(device) === TYPE_BATTERY ||
    /battery/i.test(device.name || '');
}

module.exports = { autoDetectType, isBattery, ALL_TYPES, TYPE_SWITCH, TYPE_LIGHTBULB,
  TYPE_FAN, TYPE_GARAGE, TYPE_LOCK, TYPE_THERMOSTAT, TYPE_TEMP, TYPE_HUMIDITY,
  TYPE_MOTION, TYPE_CONTACT, TYPE_SMOKE, TYPE_CO, TYPE_LEAK, TYPE_LIGHT, TYPE_VALVE, TYPE_SECURITY, TYPE_BATTERY };
