#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// I percorsi sono relativi alla root del progetto Cordova
const customMainFilePath = path.join(__dirname, '..', 'custom-main.js');
const targetMainFilePath = path.join(__dirname, '..', 'platforms', 'electron', 'www', 'cdv-electron-main.js');

try {
    fs.copyFileSync(customMainFilePath, targetMainFilePath);
    console.log('Main file di Electron personalizzato copiato con successo.');
} catch (err) {
    console.error('Errore durante la copia del file del processo principale di Electron:', err);
}