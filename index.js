'use strict';

const { HomeSeerNGPlatform } = require('./src/platform');

const PLUGIN_NAME = 'homebridge-hm-homeseer';
const PLATFORM_NAME = 'HomeSeerNG';

module.exports = (api) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, HomeSeerNGPlatform);
};
