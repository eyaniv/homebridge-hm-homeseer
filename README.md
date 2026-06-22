# HM HomeSeer Plugin for Homebridge

Integrate your HomeSeer 4 (HS4) home automation system with Apple HomeKit via Homebridge.

This plugin was built from scratch as a modern replacement for older HomeSeer-to-HomeKit bridges. The goal: point it at your HS4 server and have your devices show up in HomeKit with correct types, controls, and real-time updates — with minimal manual configuration.

## Features

- **Auto-discovery** — Pulls all devices from HS4 and intelligently detects device types (switches, dimmers, fans, thermostats, locks, garage doors, sensors) from device_type_string, name, and location fields
- **Real-time updates** — Connects to the HS4 ASCII event stream for instant state changes (no polling)
- **Web UI device picker** — Browse all your HS4 devices, search/filter, override auto-detected types, enable or disable individual devices
- **ControlPairs auto-detection** — Reads each device's control values from HS4 instead of assuming 0/255. Works with Z-Wave, ESPHome, Bond, MQTT, and other non-standard devices
- **Smart naming** — Uses voice command names when set, otherwise builds names from HS4 room + device name so you don't end up with five things called "Switch"
- **Thermostat support** — Full heat/cool/auto mode support with separate setpoints, companion device discovery for temperature, humidity, mode, and operating state. Works with Ecobee, Honeywell, Z-Wave thermostats, and others
- **Garage door intelligence** — Detects open/close/stop values from ControlPairs labels and reads value_string for state (Open, Closed, Opening, Closing, Stopped). Works with any numeric value scheme

## Supported Device Types

| Type | HomeKit Service | Notes |
|------|----------------|-------|
| Switch | Switch | Auto-detects on/off values from ControlPairs |
| Dimmer / Dimmable Light | Lightbulb | Brightness control via device value 0-100% |
| Fan | Fan | On/off from ControlPairs |
| Lock | Lock Mechanism | Lock/unlock values from ControlPairs, value_string fallback |
| Garage Door | Garage Door Opener | Open/close/stop from ControlPairs labels, supports transitional states |
| Thermostat | Thermostat | Heat/cool/auto modes, dual setpoints, humidity, companion ref discovery |
| Temperature Sensor | Temperature Sensor | Fahrenheit-to-Celsius conversion |
| Humidity Sensor | Humidity Sensor | |
| Motion Sensor | Motion Sensor | |
| Contact Sensor | Contact Sensor | Door/window sensors |
| Smoke Sensor | Smoke Sensor | |
| CO Sensor | Carbon Monoxide Sensor | |
| Leak Sensor | Leak Sensor | Water/flood sensors |
| Light Sensor | Light Sensor | Lux/illuminance |

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
| `lanAccess` | Set to false if HS4 requires login from your network | `true` |
| `username` | HS4 username (if lanAccess is false) | — |
| `password` | HS4 password (if lanAccess is false) | — |
| `asciiPort` | HS4 ASCII event stream port | `11000` |
| `homebridgeIp` | IP of this Homebridge server (for web UI link) | — |
| `uiPort` | Port for the device selection web UI | `8583` |
| `ignoreBattery` | Hide battery-only devices from HomeKit | `true` |

## Device Selection

After configuring, open `http://[homebridgeIp]:[uiPort]` in your browser. From there you can:

- See all discovered HS4 devices with their auto-detected types
- Override the detected type for any device
- Enable or disable individual devices
- Search and filter the device list
- Click **Save** to apply — Homebridge updates automatically without a restart

Devices with a **voice command** set in HS4 are automatically exposed to HomeKit. The web UI lets you add devices that don't have voice commands, or change how they appear.

## How It Works

### Device Type Detection

The plugin auto-detects each device's HomeKit type using (in priority order):

1. `device_type_string` from HS4 (most reliable for Z-Wave devices)
2. Device name and location keywords
3. Brand detection from location field (Ecobee, Honeywell)
4. Manual override from the web UI

### Control Value Detection

Instead of assuming every switch is 0=off / 255=on, the plugin queries the HS4 `getcontrol` API for each device. It reads:

- **ControlUse enum** — On, Off, Dim, Lock, Unlock
- **Label fallback** — "On", "Off", "Open", "Close", "Stop", "Lock", "Unlock"

This means ESPHome devices (0/1), Z-Wave devices (0/255), Bond fans, MQTT devices, and anything else with non-standard values will work automatically.

### Thermostat Companion Discovery

Thermostats in HS4 are typically split across multiple devices (mode, temperature, setpoints, humidity, operating state). The plugin automatically finds companion devices by:

1. Exact name matching (e.g., "Thermostat" + "Heat Setpoint" = "Thermostat Heat Setpoint")
2. Partial name matching (name contains both the thermostat name and a suffix like "Temperature")
3. Nearby ref search (devices within +/-20 refs in either direction)
4. Same-location matching (devices with matching suffix names in the same HS4 location)

## Changelog

### 1.0.13
- Garage door uses value_string for state detection (Open, Closed, Opening, Closing, Stopped)
- Open/close/stop ControlPairs detection always runs (not blocked by on/off detection)
- Supports HomeKit transitional door states

### 1.0.12
- Fan and garage door now read on/off/open/close values from ControlPairs (no more hardcoded 255/0)
- Better device naming: prepends HS4 room name when no voice command is set
- Added open/close/stop value detection to ControlPairs scanning

### 1.0.11
- Expanded thermostat companion ref search to +/-20 refs in both directions
- Added last-resort exact name match for setpoints in same HS4 location
- Changed temperature minStep from 0.5 to 0.1 for better Fahrenheit precision

### 1.0.10
- Full thermostat rewrite: heat/cool/auto modes, separate heat and cool setpoints
- Companion device discovery for Ecobee, Honeywell, and Z-Wave thermostats
- Humidity sensor support as linked service
- Operating state detection from value_string

### 1.0.9
- Ecobee and Honeywell auto-detection from device_type_string and location field
- Exclude thermostat sub-devices (sensors, setpoints, modes) from being detected as standalone thermostats

### 1.0.8
- ControlPairs auto-detection for switches, dimmers, locks
- Label-based fallback when ControlUse enum is not set (common for plugin-created devices)
- Type change detection: re-creates HomeKit accessory when device type changes

### 1.0.7
- Fixed Multilevel Sensor incorrectly detected as lightbulb
- Temperature sensors now convert Fahrenheit to Celsius for HomeKit
- Web UI cache flush after saving device selections

### 1.0.6
- Initial public release
- Auto-discovery, ASCII event stream, web UI device picker
- Support for switches, dimmers, fans, locks, garage doors, sensors

## License

MIT — HM Consulting Services
