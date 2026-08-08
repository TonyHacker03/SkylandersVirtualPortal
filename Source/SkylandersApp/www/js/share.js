let shareFiles = [];
let shareNavPath = [];
let shareSearchTerm = '';

document.addEventListener('deviceready', initShare, false);
if (!window.cordova) {
    window.onload = initShare;
}

let shareInitialized = false;
async function initShare() {
    if (shareInitialized) return;
    shareInitialized = true;

    if (window.StorageManager) {
        await StorageManager.init();
        shareFiles = StorageManager.fileList;
        renderShareGrid();
        
        setTimeout(() => {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) overlay.classList.add('hidden');
        }, 500);
    }
}

function getOriginalName(name) {
    let base = name.substring(name.lastIndexOf('/') + 1).trim();
    if (base.includes(' - ')) {
        return base.split(' - ')[0].trim();
    }
    return base;
}

window.goBack = function() {
    if (shareNavPath.length > 0) {
        shareNavPath.pop();
        renderShareGrid();
    }
}

window.handleSearch = function() {
    shareNavPath = []; // reset path on search
    renderShareGrid();
}

window.closeQRModal = function() {
    document.getElementById('qr-modal').classList.add('overlay-hidden');
}

function renderShareGrid() {
    const drillContainer = document.getElementById('drill-down-container');
    const gridEl = document.getElementById('skylanders-grid');
    const backBtn = document.getElementById('back-btn');
    const breadcrumb = document.getElementById('breadcrumb');
    
    const shareSearchTerm = document.getElementById('search-bar').value.toLowerCase();

    const rootTree = { children: {}, items: [] };
    
    shareFiles.forEach(file => {
        let normalizedFile = file.replace(/\\/g, '/');
        let parts = normalizedFile.split('/');
        let fileBaseName = parts.pop();
        
        let name = fileBaseName.replace('.dump', '').replace(/\uFFFD/g, "'");
        let baseName = name.trim();
        const originalName = getOriginalName(name);
        
        let path = parts;
        if (!path || path.length === 0) path = ["Uncategorized"];

        if (shareSearchTerm) {
            if (baseName.toLowerCase().includes(shareSearchTerm)) {
                if (!rootTree.items.find(i => i.originalName === originalName && i.file === file)) {
                    if (!originalName.endsWith(' Top')) {
                        rootTree.items.push({ file, name: baseName, originalName, path });
                    }
                }
            }
            return;
        }

        if (originalName.endsWith(' Top')) return;

        let currentNode = rootTree;
        path.forEach(segment => {
            if (!currentNode.children[segment]) {
                currentNode.children[segment] = { children: {}, items: [] };
            }
            currentNode = currentNode.children[segment];
        });
        
        if (!currentNode.items.find(i => i.originalName === originalName && i.file === file)) {
            currentNode.items.push({ file, name: baseName, originalName, path });
        }
    });

    let displayNode = rootTree;
    if (!shareSearchTerm) {
        for (let segment of shareNavPath) {
            if (displayNode.children[segment]) {
                displayNode = displayNode.children[segment];
            } else {
                break;
            }
        }
    }

    const hasFolders = Object.keys(displayNode.children).length > 0;
    const hasItems = displayNode.items.length > 0;

    if (drillContainer) {
        drillContainer.style.display = hasFolders ? 'grid' : 'none';
        drillContainer.innerHTML = '';
    }
    if (gridEl) {
        gridEl.style.display = hasItems ? 'grid' : 'none';
        gridEl.innerHTML = '';
    }

    if (backBtn) {
        backBtn.style.display = shareNavPath.length > 0 ? 'block' : 'none';
    }
    if (breadcrumb) {
        breadcrumb.textContent = shareNavPath.length > 0 ? shareNavPath.join(' > ') : (shareSearchTerm ? 'Search Results' : 'Library');
    }

    if (!hasItems && drillContainer) {
        const gameLogos = {
            "Spyro's Adventure": "1.png",
            "Giants": "2.png",
            "Swap Force": "3.png",
            "Trap Team": "4.png",
            "SuperChargers": "5.png",
            "Imaginators": "6.png"
        };
        const isRoot = shareNavPath.length === 0;
        
        let folders = Object.keys(displayNode.children);
        folders.sort((a, b) => {
            if (isRoot) return getElementIndex(a) - getElementIndex(b);
            return a.localeCompare(b);
        });
        
        folders.forEach(folderName => {
            const btn = document.createElement('div');
            btn.className = 'drill-btn premium-glass';
            
            const logoSrc = isRoot ? gameLogos[folderName] : null;

            if (logoSrc) {
                const img = document.createElement('img');
                img.src = 'assets/logos/' + logoSrc;
                img.style.width = '90%';
                img.style.height = '90%';
                img.style.objectFit = 'contain';
                img.style.filter = 'drop-shadow(0 4px 6px rgba(0,0,0,0.6))';
                btn.appendChild(img);
            } else {
                const text = document.createElement('span');
                text.textContent = folderName;
                text.style.fontSize = '14px';
                text.style.fontWeight = 'bold';
                btn.appendChild(text);
            }
            
            btn.onclick = () => {
                shareNavPath.push(folderName);
                renderShareGrid();
            };
            drillContainer.appendChild(btn);
        });
    }

    if (hasItems && gridEl) {
        let items = displayNode.items;
        if (shareSearchTerm) {
            items.sort((a, b) => a.name.localeCompare(b.name));
        }

        items.forEach(item => {
            const card = createShareCard(item);
            gridEl.appendChild(card);
        });
    }
}

function createShareCard(item) {
    const card = document.createElement('div');
    card.className = 'sky-card premium-glass-card';
    card.onclick = () => generateQR(item);

    const imgContainer = document.createElement('div');
    imgContainer.className = 'circle-img-container premium-glass-img';
    
    let ringColor = '#FFD700'; // Default gold
    const pathLower = item.path.map(p => p.toLowerCase());
    if (pathLower.includes('fire')) ringColor = '#FF4500';
    else if (pathLower.includes('water')) ringColor = '#1E90FF';
    else if (pathLower.includes('earth')) ringColor = '#8B4513';
    else if (pathLower.includes('life')) ringColor = '#32CD32';
    else if (pathLower.includes('air')) ringColor = '#87CEFA';
    else if (pathLower.includes('tech')) ringColor = '#D2691E';
    else if (pathLower.includes('magic')) ringColor = '#9932CC';
    else if (pathLower.includes('undead')) ringColor = '#483D8B';
    else if (pathLower.includes('light')) ringColor = '#FFFFE0';
    else if (pathLower.includes('dark')) ringColor = '#2F4F4F';
    else if (pathLower.includes('kaos')) ringColor = '#000000';

    imgContainer.style.setProperty('--ring-color', ringColor);
    
    const img = document.createElement('img');
    let imgPath = [...item.path, item.originalName + '.png'].map(encodeURIComponent).join('/');
    img.src = 'assets/SkylandersImages/' + imgPath;
    
    // Swap Force specific logic
    const isTop = item.originalName.endsWith(' Top');
    const isBottom = item.originalName.endsWith(' Bottom');
    const isSF = isTop || isBottom;
    let sfBaseName = item.originalName;
    
    if (isSF) {
        if (isTop) sfBaseName = sfBaseName.replace(' Top', '');
        if (isBottom) sfBaseName = sfBaseName.replace(' Bottom', '');
        const unifiedImageName = sfBaseName.replace(/\s+/g, '');
        img.src = 'assets/SwapForceImage/' + unifiedImageName + '.png';
    }

    img.onerror = () => { img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; };
    imgContainer.appendChild(img);

    const nameEl = document.createElement('div');
    nameEl.className = 'sky-name';
    nameEl.textContent = item.name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[0-9]/g, '');

    if (isBottom) {
        const bottomBadge = document.createElement('div');
        bottomBadge.innerHTML = '🔽 Bottom';
        bottomBadge.style.position = 'absolute';
        bottomBadge.style.top = '2px';
        bottomBadge.style.left = '2px';
        bottomBadge.style.background = 'rgba(0,0,0,0.7)';
        bottomBadge.style.color = 'white';
        bottomBadge.style.borderRadius = '10px';
        bottomBadge.style.fontSize = '10px';
        bottomBadge.style.padding = '2px 5px';
        imgContainer.appendChild(bottomBadge);
    }
    
    card.appendChild(imgContainer);
    card.appendChild(nameEl);
    
    return card;
}

function getElementIndex(folderName) {
    const order = ['air', 'earth', 'fire', 'life', 'magic', 'tech', 'undead', 'water', 'light', 'dark'];
    const idx = order.indexOf(folderName.toLowerCase());
    return idx === -1 ? 999 : idx;
}

// --- QR CODE SHARING LOGIC ---

function arrayBufferToBase64(buffer) {
    let binary = '';
    let bytes = new Uint8Array(buffer);
    let len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
    let binary_string = window.atob(base64);
    let len = binary_string.length;
    let bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

async function generateQR(item) {
    try {
        const blob = await StorageManager.getFileBlob(item.file);
        const arrayBuffer = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(blob);
        });
        
        const uint8Array = new Uint8Array(arrayBuffer);
        const compressed = pako.deflate(uint8Array);
        
        const base64Data = arrayBufferToBase64(compressed.buffer);
        const fileName = item.file.split('/').pop();
        const payload = fileName + '|zip|' + base64Data;
        
        document.getElementById('qr-modal').classList.remove('overlay-hidden');
        const container = document.getElementById('qrcode-container');
        container.innerHTML = ''; // clear previous
        
        new QRCode(container, {
            text: payload,
            width: 320,
            height: 320,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.L
        });
        
    } catch(err) {
        console.error("Error generating QR", err);
        alert("Error generating QR Code");
    }
}

// End of share.js
