'use strict';

const http = require('http');
const net = require('net');

/**
 * HomeSeer HS4 JSON API + ASCII event stream client
 */
class HsApi {
  constructor(host, port, log, user, pass) {
    this.host = host;
    this.port = port || 80;
    this.log = log;
    this._auth = (user && pass) ? `&user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}` : '';
    this._streamSocket = null;
    this._streamBuffer = '';
    this._valueCallbacks = new Map(); // ref -> [callback, ...]
  }

  _request(path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.host,
        port: this.port,
        path: path + this._auth,
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        timeout: 10000,
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { resolve(data); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      req.end();
    });
  }

  /**
   * Get all devices/features from HS4
   * Returns array of device objects with ref, name, value, status, location, location2, etc.
   */
  async getAllDevices() {
    const data = await this._request('/JSON?request=getstatus&JSON=1');
    if (data && data.Devices) return data.Devices;
    if (Array.isArray(data)) return data;
    return [];
  }

  async getDevice(ref) {
    const data = await this._request(`/JSON?request=getstatus&ref=${ref}&JSON=1`);
    if (data && data.Devices) return data.Devices[0] || null;
    return null;
  }

  /**
   * Get full control info (value pairs) for a device
   */
  async getControl(ref) {
    const data = await this._request(`/JSON?request=getcontrol&ref=${ref}`);
    return data;
  }

  /**
   * Set device value
   */
  async controlDeviceByValue(ref, value) {
    const data = await this._request(
      `/JSON?request=controldevicebyvalue&ref=${ref}&value=${value}`
    );
    return data;
  }

  async controlDeviceByLabel(ref, label) {
    const data = await this._request(
      `/JSON?request=controldevicebylabel&ref=${ref}&label=${encodeURIComponent(label)}`
    );
    return data;
  }

  /**
   * Connect to HS4 ASCII event stream on port 11000
   * Lines arrive as: ref,value,valuestring,date
   * onUpdate(ref, value, valueString) called on each event
   */
  connectEventStream(onUpdate, onError, asciiPort) {
    if (this._streamSocket) {
      try { this._streamSocket.destroy(); } catch {}
    }

    const port = asciiPort || 11000;
    this.log.debug(`[HS4] Connecting to ASCII event stream on port ${port}...`);
    const sock = new net.Socket();
    this._streamSocket = sock;

    sock.connect(port, this.host, () => {
      this.log.info('[HS4] ASCII event stream connected.');
    });

    sock.on('data', (chunk) => {
      this._streamBuffer += chunk.toString();
      const lines = this._streamBuffer.split('\n');
      this._streamBuffer = lines.pop(); // keep incomplete line
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Format: DC,ref,newValue,prevValue
        const parts = trimmed.split(',');
        if (parts.length < 3 || parts[0] !== 'DC') continue;
        const ref = parseInt(parts[1], 10);
        const value = parseFloat(parts[2]);
        if (isNaN(ref) || isNaN(value)) continue;
        onUpdate(ref, value, '');
        // Notify registered callbacks
        const cbs = this._valueCallbacks.get(ref);
        if (cbs) cbs.forEach(cb => cb(value, ''));
      }
    });

    sock.on('error', (err) => {
      this.log.warn(`[HS4] Stream error: ${err.message}`);
      if (onError) onError(err);
    });

    sock.on('close', () => {
      this.log.warn('[HS4] ASCII stream closed. Reconnecting in 10s...');
      setTimeout(() => this.connectEventStream(onUpdate, onError, port), 10000);
    });
  }

  /**
   * Register a callback for value changes on a specific device ref
   */
  onValueChange(ref, callback) {
    if (!this._valueCallbacks.has(ref)) {
      this._valueCallbacks.set(ref, []);
    }
    this._valueCallbacks.get(ref).push(callback);
  }

  destroy() {
    if (this._streamSocket) {
      try { this._streamSocket.destroy(); } catch {}
      this._streamSocket = null;
    }
  }
}

module.exports = { HsApi };
