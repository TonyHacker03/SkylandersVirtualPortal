const { app, BrowserWindow } = require('electron');
const express = require('express');
const http = require('http');
const path = require('path');
const axios = require('axios');
const { ipcMain } = require('electron');

let server;
let mainWindow;

function createWindow(url) {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadURL(url);
}

async function startWebServer() {
    return new Promise((resolve, reject) => {
        const expressApp = express();
        const wwwPath = __dirname; // Corretto
        console.log(wwwPath);
        const port = 3000;

        expressApp.use(express.static(wwwPath));

        server = http.createServer(expressApp);
        server.listen(port, () => {
            console.log(`Web server avviato su http://localhost:${port}`);
            resolve(`http://localhost:${port}`);
        });

        server.on('error', (err) => {
            reject(err);
        });
    });
}

app.on('ready', async () => {
    try {
        const serverUrl = await startWebServer();
        createWindow(serverUrl);
    } catch (err) {
        console.error('Errore durante l\'avvio del server:', err);
        app.quit();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    if (server) {
        server.close(() => {
            console.log('Web server chiuso.');
        });
    }
});

app.on('activate', async () => {
    if (mainWindow === null) {
        try {
            const serverUrl = await startWebServer();
            createWindow(serverUrl);
        } catch (err) {
            console.error('Errore durante il riavvio del server:', err);
            app.quit();
        }
    }
});

ipcMain.handle('cdv-plugin-exec', async (_, serviceName, action, ...args) => {
    if (serviceName === 'AdvancedHttp') {
        try {
            if (action === 'get') {
                const [url] = args;
                const response = await axios.get(url);
                return response.data;
            }
            if (action === 'post') {
                const [url, headers, data] = args;
                const response = await axios.post(url, data, { headers });
                return response.data;
            }
            // Gestisci qui altre azioni come 'put', 'head', ecc.
            return Promise.reject(new Error(`Azione non supportata per il servizio AdvancedHttp: ${action}`));
        } catch (error) {
            console.error(`Errore nel servizio AdvancedHttp: ${error.message}`);
            return Promise.reject(error);
        }
    }

    // Logica di fallback per altri plugin che non sono gestiti.
    console.warn(`Servizio non gestito: ${serviceName}`);
    return Promise.reject(new Error(`Servizio non gestito: ${serviceName}`));
});
