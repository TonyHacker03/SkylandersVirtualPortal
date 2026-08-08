const StorageManager = {
    fileList: [], // List of ALL dump files (assets + local clones)
    localFiles: [], // List of files explicitly in dataDirectory
    
    encodePath(path) {
        return path.replace(/\//g, '___');
    },

    decodePath(path) {
        return path.replace(/___/g, '/');
    },

    async init() {
        if (!window.cordova || !cordova.file) {
            console.error("Cordova file plugin not found!");
            return;
        }

        try {
            // 1. Load base roster from images JSON (since dump structure mirrors it perfectly)
            const res = await fetch('assets/SkylandersImages/file_list.json');
            const tree = await res.json();
            
            let baseFiles = [];
            function parseDumpTree(node, currentPath) {
                if (node.type === 'directory' || node.children) {
                    let path = [...currentPath];
                    if (node.name !== 'SkylandersImages') {
                        path.push(node.name);
                    }
                    if (node.children) {
                        node.children.forEach(c => parseDumpTree(c, path));
                    }
                } else {
                    if (node.name.endsWith('.png')) {
                        let dumpName = node.name.replace('.png', '.dump');
                        baseFiles.push([...currentPath, dumpName].join('/'));
                    }
                }
            }
            parseDumpTree(tree, []);
            
            // 2. Load local modified/cloned files from dataDirectory
            const dataDir = cordova.file.dataDirectory;
            let entries = await this.listLocalDir(dataDir);
            this.localFiles = entries.filter(e => e.name.endsWith('.dump')).map(e => this.decodePath(e.name));
            
            // Merge lists (unique)
            const allSet = new Set([...baseFiles, ...this.localFiles]);
            this.fileList = Array.from(allSet);
            
            console.log("Storage initialized. Total files: " + this.fileList.length);
        } catch (e) {
            console.error("Storage init error:", e);
        }
    },

    listLocalDir(path) {
        return new Promise((resolve, reject) => {
            window.resolveLocalFileSystemURL(path, (dirEntry) => {
                const reader = dirEntry.createReader();
                reader.readEntries(entries => resolve(entries), reject);
            }, reject);
        });
    },

    resolveDir(path) {
        return new Promise((resolve, reject) => {
            window.resolveLocalFileSystemURL(path, resolve, reject);
        });
    },

    writeFile(dirEntry, fileName, blob) {
        return new Promise((resolve, reject) => {
            dirEntry.getFile(this.encodePath(fileName), { create: true, exclusive: false }, (fileEntry) => {
                fileEntry.createWriter((writer) => {
                    writer.onwriteend = () => resolve(fileEntry);
                    writer.onerror = reject;
                    writer.write(blob);
                });
            }, reject);
        });
    },

    async getFileBlob(fileName) {
        // Try local dataDirectory first
        if (this.localFiles.includes(fileName)) {
            try {
                return await new Promise((resolve, reject) => {
                    const url = cordova.file.dataDirectory + encodeURIComponent(this.encodePath(fileName));
                    window.resolveLocalFileSystemURL(url, (fileEntry) => {
                        fileEntry.file(file => {
                            const reader = new FileReader();
                            reader.onloadend = function() {
                                resolve(new Blob([this.result], { type: 'application/octet-stream' }));
                            };
                            reader.onerror = reject;
                            reader.readAsArrayBuffer(file);
                        }, reject);
                    }, reject);
                });
            } catch(e) {
                console.warn("Local file read failed, falling back to assets", e);
            }
        }
        
        // Fallback to assets
        const encodedName = fileName.split('/').map(encodeURIComponent).join('/');
        const res = await fetch('assets/dump/' + encodedName);
        if (!res.ok) throw new Error("File not found in assets: " + fileName);
        return await res.blob();
    },

    async saveFromServer(fileName, blob) {
        const dirEntry = await this.resolveDir(cordova.file.dataDirectory);
        await this.writeFile(dirEntry, fileName, blob);
        if (!this.localFiles.includes(fileName)) {
            this.localFiles.push(fileName);
        }
        if (!this.fileList.includes(fileName)) {
            this.fileList.push(fileName);
        }
    },

    async resetFile(fileName) {
        // Deleting from dataDirectory restores the base file from assets
        if (this.localFiles.includes(fileName)) {
            await new Promise((resolve, reject) => {
                const url = cordova.file.dataDirectory + encodeURIComponent(this.encodePath(fileName));
                window.resolveLocalFileSystemURL(url, (fileEntry) => {
                    fileEntry.remove(() => {
                        this.localFiles = this.localFiles.filter(f => f !== fileName);
                        resolve();
                    }, reject);
                }, reject);
            });
        }
    },

    async cloneFile(virginPath, suffix, sourceFileToCopy = null) {
        const base = virginPath.replace('.dump', '');
        const newName = base + ' - ' + suffix + '.dump';
        
        let blob;
        if (sourceFileToCopy) {
            blob = await this.getFileBlob(sourceFileToCopy);
        } else {
            const encodedName = virginPath.split('/').map(encodeURIComponent).join('/');
            const res = await fetch('assets/dump/' + encodedName);
            if (!res.ok) throw new Error("Virgin file not found!");
            blob = await res.blob();
        }
        
        const dirEntry = await this.resolveDir(cordova.file.dataDirectory);
        await this.writeFile(dirEntry, newName, blob);
        
        this.localFiles.push(newName);
        if (!this.fileList.includes(newName)) {
            this.fileList.push(newName);
        }
        return newName;
    },

    async deleteClone(fileName) {
        if (this.localFiles.includes(fileName)) {
            await new Promise((resolve, reject) => {
                const url = cordova.file.dataDirectory + encodeURIComponent(this.encodePath(fileName));
                window.resolveLocalFileSystemURL(url, (fileEntry) => {
                    fileEntry.remove(() => {
                        this.localFiles = this.localFiles.filter(f => f !== fileName);
                        this.fileList = this.fileList.filter(f => f !== fileName);
                        resolve();
                    }, reject);
                }, reject);
            });
        }
    }
};
