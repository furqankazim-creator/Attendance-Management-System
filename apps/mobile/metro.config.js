// Keep Metro's cache inside the project (E: drive) instead of the system temp folder, which can be full.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');

const config = getDefaultConfig(__dirname);
config.cacheStores = [new FileStore({ root: path.join(__dirname, '.metro-cache') })];
module.exports = config;
