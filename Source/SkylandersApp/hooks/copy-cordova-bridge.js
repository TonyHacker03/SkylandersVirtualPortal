#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, '..', 'cordova-bridge.js');
const destFile = path.join(__dirname, '..', 'platforms', 'electron', 'www', 'cordova.js');

try {
    fs.copyFileSync(srcFile, destFile);
    console.log('File cordova-bridge.js copiato con successo come cordova.js.');
} catch (err) {
    console.error('Errore durante la copia del file cordova-bridge.js:', err.message);
}