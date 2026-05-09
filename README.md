# HM HomeSeer Plugin for Homebridge

Integrate your HomeSeer 4 (HS4) home automation system with Apple HomeKit via Homebridge.

## Features

- Auto-discovers all HS4 devices
- Real-time state updates via the HS4 ASCII event stream
- Web UI for selecting which devices to expose to HomeKit and setting their type
- Supports: switches, dimmers, fans, garage doors, locks, thermostats, contact sensors, motion sensors, smoke/CO/leak detectors, temperature, humidity, and light level sensors

## Requirements

- HomeSeer 4
- Homebridge v1.6.0 or later
- Node.js v18 or later

## Installation

Install via the Homebridge UI or:

```bash
npm install -g homebridge-hm-homeseer
```

## Configuration

Add the platform in your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "HomeSeerNG",
      "name": "HomeSeerNG",
      "host": "192.168.1.100",
      "port": 80,
      "homebridgeIp": "192.168.1.50",
      "uiPort": 8583
    }
  ]
}
```

| Field | Description | Default |
|-------|-------------|---------|
| `host` | IP address of your HS4 server | required |
| `port` | HS4 web server port | `80` |
| `lanAccess` | Disable if HS4 requires login | `true` |
| `username` | HS4 username (if lanAccess is false) | — |
| `password` | HS4 password (if lanAccess is false) | — |
| `asciiPort` | HS4 ASCII event stream port | `11000` |
| `homebridgeIp` | IP of this Homebridge server | — |
| `uiPort` | Port for the device selection UI | `8583` |

## Device Selection

After configuring, open `http://[homebridgeIp]:[uiPort]` in your browser to select which HS4 devices appear in HomeKit and set their device type. Click **Save** to apply changes — Homebridge will update automatically.

## License

MIT — HM Consulting Services
