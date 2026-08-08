// cordova-bridge.js
/*
* File di ponte per la comunicazione tra l'app web e il processo principale di Electron.
* Sostituisce il file cordova.js standard e simula i plugin per evitare modifiche alla web app.
*/
if (typeof require !== 'function') {
    console.warn("cordova-bridge.js: l'ambiente non è Electron. La comunicazione IPC non sarà disponibile.");
} else {
    const { ipcRenderer } = require('electron');

    window.cordova = {
        exec: function(success, fail, serviceName, action, args) {
            ipcRenderer.invoke('cdv-plugin-exec', serviceName, action, ...args)
                .then(success)
                .catch(fail);
        },
        platformId: 'electron',
        
        // Aggiungi un oggetto 'plugins' per la compatibilità con la web app
        plugins: {
            http: {
                // Implementa le funzioni del plugin http.
                get: function(url, headers, data, success, fail) {
                    window.cordova.exec(success, fail, 'AdvancedHttp', 'get', [url, headers, data]);
                },
                post: function(url, headers, data, success, fail) {
                    window.cordova.exec(success, fail, 'AdvancedHttp', 'post', [url, headers, data]);
                },
                sendRequest: function(url, options, success, fail) {
                    if (options.method && options.method.toLowerCase() === 'post') {
                        window.cordova.exec(success, fail, 'AdvancedHttp', 'post', [url, options.headers, options.data]);
                    } else {
                        window.cordova.exec(success, fail, 'AdvancedHttp', 'get', [url, options.headers, options.data]);
                    }
                }
            }
        },

        // NUOVO: Aggiungi un oggetto 'plugin' (al singolare) che punta a 'plugins'
        plugin: {
            // Assegna il tuo oggetto http personalizzato a questa proprietà
            http: {
                sendRequest: function(url, options, success, fail) {
                    window.cordova.plugins.http.sendRequest(url, options, success, fail);
                }
            }
        },

        addConstructor: function() {}
    };

    document.addEventListener('DOMContentLoaded', () => {
        const event = new Event('deviceready');
        document.dispatchEvent(event);
    });
}