'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

function hsRequest(host, port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: host, port, path: urlPath, timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
}

module.exports = (api) => {

  api.onRequest('/link', async () => {
    const [cfg] = await api.getPluginConfig();
    const ip   = (cfg && cfg.homebridgeIp) || '';
    const port = (cfg && cfg.uiPort) || 8583;
    return { url: ip ? `http://${ip}:${port}` : '' };
  });

  api.onRequest('/devices', async () => {
    const [cfg] = await api.getPluginConfig();
    const host  = cfg.host || '192.168.0.5';
    const port  = cfg.port || 80;
    const auth  = (cfg.lanAccess === false && cfg.username)
      ? `&user=${encodeURIComponent(cfg.username)}&pass=${encodeURIComponent(cfg.password)}`
      : '';

    const devicesFile = path.join('/homebridge', 'homeseer-ng-devices.json');
    let selected = [];
    try { selected = JSON.parse(fs.readFileSync(devicesFile, 'utf8')); } catch {}

    const data = await hsRequest(host, port, `/JSON?request=getstatus&JSON=1${auth}`);
    const hsDevices = data.Devices || data || [];

    const devices = hsDevices.map(d => {
      const sel = selected.find(s => s.ref === d.ref);
      const hasVoice = !!(d.voice_command && d.voice_command.trim());
      return {
        ref: d.ref,
        name: d.name,
        voiceCommand: d.voice_command || '',
        location: d.location,
        location2: d.location2,
        value: d.value,
        valueString: d.value_string || d.status || '',
        deviceType: d.device_type_string || '',
        enabled: sel ? true : false,
        type: sel ? sel.type : autoDetect(d),
        autoType: autoDetect(d),
      };
    });

    devices.sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return `${a.location2}/${a.location}/${a.name}`.localeCompare(`${b.location2}/${b.location}/${b.name}`);
    });

    return { devices };
  });

  api.onRequest('/save', async (body) => {
    try {
      const devicesFile = path.join('/homebridge', 'homeseer-ng-devices.json');
      const devices = Array.isArray(body) ? body : (body.devices || []);
      const selected = devices.filter(d => d.enabled).map(d => ({ ref: d.ref, type: d.type }));
      fs.writeFileSync(devicesFile, JSON.stringify(selected, null, 2));
      return { ok: true, count: selected.length };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  });

};

function autoDetect(device) {
  const dts  = (device.device_type_string || '').toLowerCase();
  const text = `${device.name || ''} ${dts} ${device.location || ''} ${device.location2 || ''}`;

  // device_type_string first (most reliable)
  if (/zhaOpenClose|zhaContact|openclose/i.test(dts))                   return 'contact';
  if (/zhaMotion|zhaPresence|zhaPIR/i.test(dts))                        return 'motion';
  if (/zhaHumidity|humidity.sensor/i.test(dts))                         return 'humidity';
  if (/zhaTemperature|temperature.sensor/i.test(dts))                   return 'temperature';
  if (/zhaSmoke|smoke.sensor/i.test(dts))                               return 'smoke';
  if (/zhaCO|carbon.mono|co.sensor/i.test(dts))                         return 'co';
  if (/zhaWater|zhaLeak|zhaFlood|water.sensor|leak.sensor/i.test(dts))  return 'leak';
  if (/zhaLux|zhaIllum|light.sensor/i.test(dts))                        return 'lightsensor';
  if (/zhaDimmer|zhaBulb|zhaBrightness|dimm|dimmable|multilevel/i.test(dts)) return 'lightbulb';
  if (/zhaFan|fan.control/i.test(dts))                                  return 'fan';
  if (/zhaBattery|battery.sensor/i.test(dts))                           return 'battery';
  if (/thermostat/i.test(dts))                                          return 'thermostat';
  if (/garage.door|garage.opener/i.test(dts))                           return 'garage';
  if (/\block\b|deadbolt/i.test(dts))                                   return 'lock';

  // name/location fallback
  if (/therm/i.test(text))                    return 'thermostat';
  if (/garage.door|garage.opener/i.test(text)) return 'garage';
  if (/\block\b|deadbolt/i.test(text))        return 'lock';
  if (/smoke/i.test(text))                    return 'smoke';
  if (/carbon.mono|co.detect/i.test(text))    return 'co';
  if (/\bleak\b|water.sensor|flood/i.test(text)) return 'leak';
  if (/motion|pir|presence/i.test(text))      return 'motion';
  if (/contact|door.sensor|window.sensor|\bdoor\b|\bwindow\b/i.test(text) && !/lock|deadbolt|opener/i.test(text)) return 'contact';
  if (/humid/i.test(text))                    return 'humidity';
  if (/lux|illumin|light.level/i.test(text))  return 'lightsensor';
  if (/temperature|temp.sensor/i.test(text))  return 'temperature';
  if (/\bfan\b/i.test(text))                  return 'fan';
  if (/dimm|brightness/i.test(text))          return 'lightbulb';
  if (/battery/i.test(text))                  return 'battery';
  return 'switch';
}
