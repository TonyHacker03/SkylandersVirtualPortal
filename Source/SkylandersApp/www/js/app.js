let serverIp = localStorage.getItem('serverIp');
if (!serverIp) {
    window.location.href = 'index.html';
}

const API_BASE = 'http://' + serverIp + ':5678';

// Generate a unique, persistent device ID for multi-player slot ownership
let deviceId = localStorage.getItem('deviceId');
if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
    localStorage.setItem('deviceId', deviceId);
}

let slots = Array.from({length: 8}, () => ({ file: null, syncInterval: null, isSyncing: false }));

// slotOwners[slotIndex] = deviceId string ('' = free)
let slotOwners = Array(8).fill('');

const VILLAIN_MAP = {
    1: 'ChompyMage', 2: 'DrKrankcase', 3: 'Wolfgang', 4: 'ChefPepperJack',  
    5: 'Nightshade', 6: 'Luminous', 7: 'GoldenQueen', 8: 'Dreamcatcher',  
    9: 'Gulper', 10: 'Kaos', 11: 'CuckooClocker', 12: 'BuzzerBeak', 
    13: 'ShieldShredder', 14: 'CrossCrow', 15: 'BoneChompy', 16: 'BrawlAndChain',
    17: 'BombShell', 18: 'MaskerMind', 19: 'ChillBill', 20: 'SheepCreep',
    21: 'Shrednaught', 22: 'ChompChest', 23: 'BroccoliGuy', 24: 'RageMage',
    25: 'LobGoblin', 26: 'Chompy', 27: 'Fisticuffs', 28: 'TrollingThunder',
    29: 'HoodSickle', 30: 'BruiserCruiser', 31: 'Brawlrus', 32: 'TussleSprout',
    33: 'Krankenstein', 34: 'ScrapShooter', 35: 'SlobberTrap', 36: 'Grinnade',
    37: 'BadJuju', 38: 'BlasterTron', 39: 'TaeKwonCrow', 40: 'Painyatta',
    41: 'SmokeScream', 42: 'EyeFive', 43: 'GraveClobber', 44: 'ThreatPack',
    45: 'MadLobs', 46: 'EyeScream'
};

function setScrollingName(element, nameText) {
    if (!element) return;
    if (nameText.length > 12) {
        element.innerHTML = `<marquee scrollamount="3">${nameText}</marquee>`;
    } else {
        element.textContent = nameText;
    }
}

let filePaths = {}; // originalName -> ["Giants", "Skylanders", "Air"]
let allFiles = [];

document.addEventListener('deviceready', init, false);
if (!window.cordova) {
    window.onload = init;
}

let initialized = false;
async function init() {
    if (initialized) return;
    initialized = true;

    // Native enhancements
    if (window.AndroidFullScreen) {
        window.AndroidFullScreen.immersiveMode(null, null);
    }
    if (window.plugins && window.plugins.insomnia) {
        window.plugins.insomnia.keepAwake();
    }
    document.addEventListener("backbutton", onBackKeyDown, false);

    // Game Map Tree is no longer needed because structures are identical!
    
    if (window.StorageManager) {
        await StorageManager.init();
    } else {
        alert("StorageManager not loaded!");
    }

    allFiles = StorageManager.fileList;
    renderGrid();

    // Connection failure tracking
    let consecutiveFailures = 0;
    const MAX_FAILURES = 3;

    let connectionPollInterval = null;

    function handlePortalDisconnect() {
        if (connectionPollInterval) {
            clearInterval(connectionPollInterval);
            connectionPollInterval = null;
        }
        // Stop all slot sync intervals
        slots.forEach((slot, i) => {
            if (slot.syncInterval) {
                clearInterval(slot.syncInterval);
                slot.syncInterval = null;
            }
            slot.file = null;
            slot.isSyncing = false;
        });
        slotOwners.fill('');
        // Show disconnection message then go back to portal search
        const overlay = document.getElementById('loading-overlay');
        const txt = document.getElementById('loading-text');
        if (overlay && txt) {
            txt.textContent = 'Portal disconnected. Searching...';
            overlay.classList.add('show');
        }
        setTimeout(() => { window.location.href = 'index.html'; }, 2000);
    }

    // Heartbeat + slot status polling (every 2 seconds)
    connectionPollInterval = setInterval(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        
        try {
            await fetch(API_BASE + '/heartbeat?deviceId=' + encodeURIComponent(deviceId), { signal: controller.signal });
        } catch(e) {}
        
        try {
            const r = await fetch(API_BASE + '/slots', { cache: 'no-store', signal: controller.signal });
            if (r.ok) {
                consecutiveFailures = 0;
                const data = await r.json();
                let changed = false;
                data.slots.forEach(s => {
                    if (slotOwners[s.slot] !== s.owner) {
                        slotOwners[s.slot] = s.owner;
                        changed = true;
                    }
                });
                if (changed) updateAllSlotLockUI();
            } else if (r.status !== 400 && r.status !== 404) {
                consecutiveFailures++;
                if (consecutiveFailures >= MAX_FAILURES) handlePortalDisconnect();
            }
        } catch(e) {
            consecutiveFailures++;
            if (consecutiveFailures >= MAX_FAILURES) handlePortalDisconnect();
        } finally {
            clearTimeout(timeoutId);
        }
    }, 2000);

    // Add Stats overlay to slots
    for (let i = 0; i < 8; i++) {
        const slotEl = document.getElementById('slot-' + i);
        if (slotEl) {
            const statsDiv = document.createElement('div');
            statsDiv.className = 'slot-stats';
            statsDiv.id = 'slot-' + i + '-stats';
            statsDiv.style.display = 'none';
            statsDiv.innerHTML = `<span id="slot-${i}-lvl" class="stat-badge stat-lvl"></span><span id="slot-${i}-gold" class="stat-badge stat-gold"></span>`;
            
            // Append to slot-wrapper so it appears under the slot
            const wrapper = slotEl.closest('.slot-wrapper');
            if (wrapper) wrapper.appendChild(statsDiv);
        }
    }

    // Hide overlay
    document.getElementById('loading-overlay').classList.remove('show');

    // Search event
    document.getElementById('search-bar').addEventListener('input', renderGrid);
}

function getOriginalName(name) {
    let base = name.substring(name.lastIndexOf('/') + 1).trim();
    if (base.includes(' - ')) {
        return base.split(' - ')[0].trim();
    }
    return base;
}

let currentNavPath = [];

function goBack() {
    if (currentNavPath.length > 0) {
        currentNavPath.pop();
        renderGrid();
    }
}

function onBackKeyDown(e) {
    if (currentNavPath.length > 0) {
        e.preventDefault();
        goBack();
    } else {
        // At root, prevent exiting if user accidentally presses back twice
        e.preventDefault(); 
    }
}

function renderGrid() {
    const drillContainer = document.getElementById('drill-down-container');
    const gridContainer = document.getElementById('skylanders-grid');
    const backBtn = document.getElementById('back-btn');
    const breadcrumb = document.getElementById('breadcrumb');
    
    const searchTerm = document.getElementById('search-bar').value.toLowerCase();

    // Build a dynamic N-level tree
    const rootTree = { children: {}, items: [] };
    
    allFiles.forEach(file => {
        let normalizedFile = file.replace(/\\/g, '/');
        let parts = normalizedFile.split('/');
        let fileBaseName = parts.pop(); // Remove the .dump filename
        
        let name = fileBaseName.replace('.dump', '').replace(/\uFFFD/g, "'");
        let baseName = name.trim();
        
        const originalName = getOriginalName(name);
        
        // Path is now directly derived from the file's own directory structure
        let path = parts;
        if (!path || path.length === 0) path = ["Uncategorized"];

        if (searchTerm) {
            if (baseName.toLowerCase().includes(searchTerm)) {
                // Prevent duplicates in search results
                if (!rootTree.items.find(i => i.originalName === originalName && i.file === file)) {
                    // Hide Tops from main view
                    if (!originalName.endsWith(' Top')) {
                        rootTree.items.push({ file, name: baseName, originalName, path });
                    }
                }
            }
            return;
        }

        // Hide Swap Force Tops from the main grid view (they will be in the modal)
        if (originalName.endsWith(' Top')) {
            return;
        }

        // Traverse the tree dynamically
        let currentNode = rootTree;
        path.forEach(segment => {
            if (!currentNode.children[segment]) {
                currentNode.children[segment] = { children: {}, items: [] };
            }
            currentNode = currentNode.children[segment];
        });
        
        // Add item to the leaf node, preventing exact duplicates
        if (!currentNode.items.find(i => i.originalName === originalName && i.file === file)) {
            currentNode.items.push({ file, name: baseName, originalName, path });
        }
    });

    let displayNode = rootTree;

    if (!searchTerm) {
        // Navigate to current path
        for (let segment of currentNavPath) {
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
    if (gridContainer) {
        gridContainer.style.display = hasItems ? 'grid' : 'none';
        gridContainer.innerHTML = '';
    }

    if (backBtn) {
        backBtn.style.display = (currentNavPath.length > 0 && !searchTerm) ? 'inline-block' : 'none';
    }

    if (breadcrumb) {
        breadcrumb.textContent = '';
    }

    // Render Folders
    if (hasFolders && !searchTerm) {
        const gameLogos = {
            "Spyro's Adventure": "1.png",
            "Giants": "2.png",
            "Swap Force": "3.png",
            "Trap Team": "4.png",
            "SuperChargers": "5.png",
            "Imaginators": "6.png"
        };
        const isRoot = currentNavPath.length === 0;
        const gameOrder = [
            "Spyro's Adventure",
            "Giants",
            "Swap Force",
            "Trap Team",
            "SuperChargers",
            "Imaginators"
        ];

        const folders = Object.keys(displayNode.children).sort((a, b) => {
            if (isRoot) {
                const indexA = gameOrder.indexOf(a);
                const indexB = gameOrder.indexOf(b);
                if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            }
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
                currentNavPath.push(folderName);
                renderGrid();
            };
            drillContainer.appendChild(btn);
        });
    }

    // Render Items
    if (hasItems) {
        displayNode.items.sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
            gridContainer.appendChild(createCard(item));
        });
    }
}



function createCard(item) {
    const card = document.createElement('div');
    card.className = 'sky-card premium-glass-card';

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
        const unifiedImageName = sfBaseName.replace(/\s+/g, ''); // e.g. Blast Zone -> BlastZone
        img.src = 'assets/SwapForceImage/' + unifiedImageName + '.png';
    }

    img.onerror = () => { img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; };

    imgContainer.appendChild(img);

    const nameEl = document.createElement('div');
    nameEl.className = 'sky-name';
    // Format name: Add spaces before uppercase letters and remove numbers
    setScrollingName(nameEl, item.name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[0-9]/g, ''));

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'card-actions';

    const isClone = item.name !== item.originalName;
    const virginPath = [...item.path, item.originalName + '.dump'].join('/');

    const cloneBtn = document.createElement('button');
    cloneBtn.className = 'clone-btn action-pop';
    cloneBtn.innerHTML = '➕';
    cloneBtn.onclick = async (e) => {
        e.stopPropagation();
        let suffix = prompt("Variant Name (e.g. PVP):", "Clone");
        if (suffix) {
            let copyData = confirm("Do you want to copy the current progress?\n\nOK = Copy Progress\nCancel = Empty Level 1 Clone");
            await StorageManager.cloneFile(virginPath, suffix, copyData ? item.file : null);
            allFiles = StorageManager.fileList;
            renderGrid();
        }
    };

    if (isClone) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'reset-btn action-pop';
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.style.background = 'rgba(255, 50, 50, 0.6)';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            showResetOverlay(item.file, item.name, 'delete');
        };
        actionsDiv.appendChild(cloneBtn);
        actionsDiv.appendChild(deleteBtn);
    } else {
        const resetBtn = document.createElement('button');
        resetBtn.className = 'reset-btn action-pop';
        resetBtn.innerHTML = '↻';
        resetBtn.onclick = (e) => {
            e.stopPropagation();
            showResetOverlay(item.file, item.name, 'reset');
        };
        actionsDiv.appendChild(cloneBtn);
        actionsDiv.appendChild(resetBtn);
    }

    if (isBottom) {
        const swapBtn = document.createElement('button');
        swapBtn.className = 'swap-btn action-pop';
        swapBtn.innerHTML = '🔀';
        swapBtn.style.position = 'absolute';
        swapBtn.style.bottom = '-5px';
        swapBtn.style.right = '-5px';
        swapBtn.style.zIndex = '20';
        swapBtn.onclick = (e) => {
            e.stopPropagation();
            openTopModal(item, img.src);
        };
        card.appendChild(swapBtn);
    }

    card.appendChild(actionsDiv);
    card.appendChild(imgContainer);
    card.appendChild(nameEl);

    const isStatable = item.file.includes('Skylanders') || item.file.includes('Creation Crystal');
    const isTrap = item.file.includes('Trap Team/Trap') || item.file.includes('Special Villain');

    if (isStatable) {
        const statsDiv = document.createElement('div');
        statsDiv.className = 'slot-stats';
        statsDiv.style.flexDirection = 'row';
        statsDiv.style.marginTop = '10px';
        statsDiv.dataset.file = item.file; // Added so it can be updated on sync
        card.appendChild(statsDiv);

        // Load stats asynchronously from local device storage
        StorageManager.getFileBlob(item.file).then(blob => {
            if (blob && window.SkylanderDecoder) {
                const isCrystal = item.file.toLowerCase().includes('crystal') || item.name.toLowerCase().includes('claw');
                window.SkylanderDecoder.decodeStats(blob, isCrystal).then(stats => {
                    if (stats) {
                        statsDiv.innerHTML = `<span class="stat-badge stat-lvl">Lvl ${stats.level}</span><span class="stat-badge stat-gold">💰 ${stats.gold}</span>`;
                        if (stats.nickname && stats.nickname.length > 0) {
                            setScrollingName(nameEl, stats.nickname);
                        }
                    }
                }).catch(err => console.error("Failed to decode stats for", item.name, err));
            }
        }).catch(err => console.error("Failed to load blob for", item.name, err));
    } else if (isTrap) {
        // Load villain asynchronously
        StorageManager.getFileBlob(item.file).then(blob => {
            if (blob && window.SkylanderDecoder) {
                window.SkylanderDecoder.decodeVillainId(blob).then(vid => {
                    if (vid > 0) {
                        const villainName = VILLAIN_MAP[vid];
                        if (villainName) {
                            img.src = 'assets/TrappedVillain/' + villainName + '.png';
                            setScrollingName(nameEl, villainName.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[0-9]/g, ''));
                        } else {
                            console.warn("Unknown Villain ID:", vid, "for file", item.file);
                            img.src = '';
                            setScrollingName(nameEl, 'Unknown (ID ' + vid + ')');
                        }
                    }
                }).catch(err => console.error("Failed to decode trap villain for", item.name, err));
            }
        }).catch(err => console.error("Failed to load trap blob for", item.name, err));
    }

    card.dataset.file = item.file; // Tag the card with the file path for real-time updates
    
    if (isBottom) {
        // Find matching default top
        const defaultTopName = sfBaseName + ' Top';
        card.onclick = () => {
            const topFile = allFiles.find(f => getOriginalName(f.replace('.dump', '').replace(/\uFFFD/g, "'").trim()) === defaultTopName && !f.includes(' - '));
            summonSwapForce(item.file, item.name, img.src, topFile, defaultTopName, img.src);
        };
    } else {
        card.onclick = () => summon(item.file, item.name, img.src);
    }
    
    return card;
}

let currentBottomSelection = null;
function openTopModal(bottomItem, bottomImgSrc) {
    currentBottomSelection = { item: bottomItem, imgSrc: bottomImgSrc };
    const modal = document.getElementById('sf-modal');
    const grid = document.getElementById('sf-modal-grid');
    grid.innerHTML = '';
    
    document.querySelector('.sf-modal-title').textContent = 'Top for ' + bottomItem.name;
    
    // Find all Tops
    const tops = [];
    allFiles.forEach(file => {
        let normalizedFile = file.replace(/\\/g, '/');
        let parts = normalizedFile.split('/');
        let fileBaseName = parts.pop();
        let name = fileBaseName.replace('.dump', '').replace(/\uFFFD/g, "'").trim();
        let originalName = getOriginalName(name);
        if (originalName.endsWith(' Top')) {
            tops.push({ file, name, originalName, path: parts });
        }
    });
    
    const elementOrder = ['air', 'earth', 'fire', 'life', 'magic', 'tech', 'undead', 'water'];
    
    tops.sort((a, b) => {
        const elemA = a.path[a.path.length - 1].toLowerCase();
        const elemB = b.path[b.path.length - 1].toLowerCase();
        let idxA = elementOrder.indexOf(elemA);
        let idxB = elementOrder.indexOf(elemB);
        if (idxA === -1) idxA = 99;
        if (idxB === -1) idxB = 99;
        
        if (idxA !== idxB) return idxA - idxB;
        return a.name.localeCompare(b.name);
    }).forEach(topItem => {
        const card = createCard(topItem);
        // Override onclick to summon this top with the selected bottom
        card.onclick = () => {
            modal.classList.add('overlay-hidden');
            const topImg = card.querySelector('img').src;
            summonSwapForce(bottomItem.file, bottomItem.name, bottomImgSrc, topItem.file, topItem.name, topImg);
        };
        grid.appendChild(card);
    });
    
    modal.classList.remove('overlay-hidden');
}

async function summonSwapForce(bFile, bName, bImg, tFile, tName, tImg) {
    await summon(bFile, bName, bImg);
    if (tFile) {
        // small delay to ensure slot locking works smoothly
        await new Promise(r => setTimeout(r, 500));
        await summon(tFile, tName, tImg);
    }
}

// Update all slot visuals to reflect multi-player ownership
function updateAllSlotLockUI() {
    for (let i = 0; i < 8; i++) {
        const slotEl = document.getElementById('slot-' + i);
        if (!slotEl) continue;
        const owner = slotOwners[i];
        const isMine = !owner || owner === deviceId;
        const isOther = owner && owner !== deviceId;

        // Lock indicator element
        let lockEl = document.getElementById('slot-' + i + '-lock');
        if (!lockEl) {
            lockEl = document.createElement('div');
            lockEl.id = 'slot-' + i + '-lock';
            lockEl.style.cssText = `
                position:absolute; top:0; left:0; width:100%; height:100%;
                background:rgba(0,0,0,0.6); border-radius:12px;
                display:flex; align-items:center; justify-content:center;
                font-size:28px; z-index:10; pointer-events:none;
            `;
            lockEl.innerHTML = '🔒';
            slotEl.style.position = 'relative';
            slotEl.appendChild(lockEl);
        }

        // Show lock only if slot is owned by another player AND not already showing our skylander
        if (isOther && !slots[i].file) {
            lockEl.style.display = 'flex';
            slotEl.style.opacity = '0.45';
            slotEl.style.pointerEvents = 'none';
        } else {
            lockEl.style.display = 'none';
            slotEl.style.opacity = '1';
            slotEl.style.pointerEvents = '';
        }
    }
}

async function forceManualSync(slotIndex) {
    const slot = slots[slotIndex];
    if (!slot.file) return;

    while (slot.isSyncing) {
        await new Promise(r => setTimeout(r, 100));
    }
    slot.isSyncing = true;

    try {
        console.log("Final Sync for " + slot.file + " on slot " + slotIndex);
        const res = await fetch(API_BASE + '/download?slot=' + slotIndex);
        if (res.ok) {
            const blob = await res.blob();
            await StorageManager.saveFromServer(slot.file, blob);
        }
    } catch (e) {
        console.error("Final sync error", e);
    } finally {
        slot.isSyncing = false;
    }
}

async function summon(file, name, imgSrc) {
    if (slots[0].file === file || slots[1].file === file) {
        alert("This Skylander is already on the portal! Clone it (➕) if you want to place two of the same.");
        return;
    }

    const overlay = document.getElementById('loading-overlay');
    document.getElementById('loading-text').textContent = 'Summoning...';
    overlay.classList.add('show');

    try {
        let targetSlot = -1;
        for (let i = 0; i < slots.length; i++) {
            // Skip slots that are locally in use OR owned by another player
            if (!slots[i].file && (!slotOwners[i] || slotOwners[i] === deviceId)) {
                targetSlot = i;
                break;
            }
        }
        
        if (targetSlot === -1) {
            alert("No empty slots on the portal! Please remove a Skylander before adding another.");
            overlay.classList.remove('show');
            return;
        }

        if (slots[targetSlot].file) {
            if (slots[targetSlot].syncInterval) {
                clearInterval(slots[targetSlot].syncInterval);
                slots[targetSlot].syncInterval = null;
            }
            await forceManualSync(targetSlot);
        }

        const blob = await StorageManager.getFileBlob(file);

        // --- ATOMIC CLAIM: prenota lo slot prima di scrivere il file ---
        // Tenta il claim dello slot scelto; se 409, scala al prossimo libero
        let claimRes = await fetch(API_BASE + '/claim?slot=' + targetSlot + '&deviceId=' + encodeURIComponent(deviceId));
        if (claimRes.status === 409) {
            // Trova il prossimo slot libero non occupato da altri
            let fallbackSlot = -1;
            for (let i = 0; i < slots.length; i++) {
                if (i !== targetSlot && !slots[i].file && (!slotOwners[i] || slotOwners[i] === deviceId)) {
                    fallbackSlot = i;
                    break;
                }
            }
            if (fallbackSlot === -1) {
                alert('All available slots are occupied by other players!');
                overlay.classList.remove('show');
                return;
            }
            targetSlot = fallbackSlot;
            claimRes = await fetch(API_BASE + '/claim?slot=' + targetSlot + '&deviceId=' + encodeURIComponent(deviceId));
        }
        if (!claimRes.ok) {
            alert('Could not claim slot ' + targetSlot);
            overlay.classList.remove('show');
            return;
        }

        const res = await fetch(API_BASE + '/upload?slot=' + targetSlot, {
            method: 'POST',
            body: blob,
            headers: {
                'Content-Type': 'text/plain'
            }
        });

        // 409: slot taken by another player at the last moment → try next free slot
        if (res.status === 409) {
            let fallbackSlot = -1;
            for (let i = 0; i < slots.length; i++) {
                if (i !== targetSlot && !slots[i].file && (!slotOwners[i] || slotOwners[i] === deviceId)) {
                    fallbackSlot = i;
                    break;
                }
            }
            if (fallbackSlot === -1) {
                alert('All available slots are occupied by other players!');
                overlay.classList.remove('show');
                return;
            }
            targetSlot = fallbackSlot;
            const retryRes = await fetch(API_BASE + '/upload?slot=' + targetSlot, {
                method: 'POST',
                body: blob,
                headers: { 'Content-Type': 'text/plain' }
            });
            if (!retryRes.ok) {
                alert('Failed to send ' + name);
                overlay.classList.remove('show');
                return;
            }
        } else if (!res.ok) {
            alert('Failed to send ' + name);
            overlay.classList.remove('show');
            return;
        }

        if (res.ok || res.status === 409 /* già claimed da noi */) {
            // 409 sull'upload = slot già claimed da questo device = ok procedere col SUMMON
            // Trigger the Cemu USB emulated device to load the newly uploaded dump file
            const summonUrl = API_BASE + '/?cmd=SUMMON&slot=' + targetSlot + '&file=' + encodeURIComponent('SkylandersDumps/Slot' + targetSlot + '.dump') + '&deviceId=' + encodeURIComponent(deviceId);
            const summonRes = await fetch(summonUrl);
            if (!summonRes.ok) {
                console.warn("Upload succeeded but SUMMON trigger failed.");
            }
            // Mark slot as mine locally
            slotOwners[targetSlot] = deviceId;
            updateAllSlotLockUI();

            slots[targetSlot].file = file;
            slots[targetSlot].isSyncing = false;

            const slotEl = document.getElementById('slot-' + targetSlot);
            const slotImg = document.getElementById('slot-' + targetSlot + '-img');
            
            // Add Top/Bottom badge if it's a swap force part
            let badge = slotEl.querySelector('.sf-badge');
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'sf-badge';
                badge.style.display = 'none';
                slotEl.appendChild(badge);
            }
            if (file.includes(' Top.dump') || file.includes(' Top - ')) {
                badge.textContent = '🔼';
                badge.style.display = 'flex';
            } else if (file.includes(' Bottom.dump') || file.includes(' Bottom - ')) {
                badge.textContent = '🔽';
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }

            slotEl.classList.add('active');
            slotImg.src = imgSrc;
            slotImg.style.display = 'block';

            slots[targetSlot].syncInterval = setInterval(async () => {
                const slot = slots[targetSlot];
                if (!slot.file || slot.isSyncing) return;
                slot.isSyncing = true;
                try {
                    const r = await fetch(API_BASE + '/download?slot=' + targetSlot, { cache: 'no-store' });
                    if (r.ok) {
                        const b = await r.blob();
                        await StorageManager.saveFromServer(slot.file, b);
                        // Decode Stats or Villain
                        const isStatable = slot.file.includes('Skylanders') || slot.file.includes('Creation Crystal') || slot.file.toLowerCase().includes('claw');
                        const isTrap = slot.file.includes('Trap Team/Trap') || slot.file.includes('Special Villain');
                        
                        if (isStatable && window.SkylanderDecoder) {
                            const isCrystal = slot.file.toLowerCase().includes('crystal') || slot.file.toLowerCase().includes('claw');
                            const stats = await window.SkylanderDecoder.decodeStats(b, isCrystal);
                            if (stats) {
                                const statsDiv = document.getElementById('slot-' + targetSlot + '-stats');
                                if (statsDiv) {
                                    statsDiv.style.display = 'flex';
                                    document.getElementById('slot-' + targetSlot + '-lvl').textContent = 'Lvl ' + stats.level;
                                    document.getElementById('slot-' + targetSlot + '-gold').textContent = '💰 ' + stats.gold;
                                }
                                
                                // Update the card in the grid without needing to refresh the page
                                const cardStatsDivs = document.querySelectorAll('.slot-stats');
                                cardStatsDivs.forEach(div => {
                                    if (div.dataset.file === slot.file) {
                                        div.innerHTML = `<span class="stat-badge stat-lvl">Lvl ${stats.level}</span><span class="stat-badge stat-gold">💰 ${stats.gold}</span>`;
                                    }
                                });
                            }
                        } else if (isTrap && window.SkylanderDecoder) {
                            const vid = await window.SkylanderDecoder.decodeVillainId(b);
                            if (vid !== null) {
                                console.log(`[POLL] Slot ${targetSlot} - Decoded vid: ${vid}`);
                                const villainName = VILLAIN_MAP[vid];
                                const slotImg = document.getElementById('slot-' + targetSlot + '-img');
                                const slotName = document.getElementById('slot-' + targetSlot + '-name');
                                if (villainName) {
                                    if (slotImg) slotImg.src = 'assets/TrappedVillain/' + villainName + '.png';
                                    const displayName = villainName.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[0-9]/g, '');
                                    setScrollingName(slotName, displayName);
                                    
                                    // Update grid card image if visible
                                    const card = document.querySelector('.sky-card[data-file="' + slot.file.replace(/\\/g, '\\\\') + '"]');
                                    if (card) {
                                        const img = card.querySelector('img');
                                        if (img) img.src = 'assets/TrappedVillain/' + villainName + '.png';
                                        const nameEl = card.querySelector('.sky-name');
                                        setScrollingName(nameEl, displayName);
                                    }
                                } else {
                                    if (slotImg) slotImg.src = '';
                                    setScrollingName(slotName, 'Unknown (ID ' + vid + ')');
                                    
                                    const card = document.querySelector('.sky-card[data-file="' + slot.file.replace(/\\/g, '\\\\') + '"]');
                                    if (card) {
                                        const img = card.querySelector('img');
                                        if (img) img.src = '';
                                        const nameEl = card.querySelector('.sky-name');
                                        setScrollingName(nameEl, 'Unknown (ID ' + vid + ')');
                                    }
                                }
                            }
                        }
                    }
                } catch (e) { 
                } finally {
                    slot.isSyncing = false;
                }
            }, 5000);
        } else {
            alert('Failed to send ' + name);
        }
    } catch (err) {
        alert('Connection error to Cemu');
    } finally {
        setTimeout(() => overlay.classList.remove('show'), 500);
    }
}

async function clearSlot(slotIndex) {
    const slotEl = document.getElementById('slot-' + slotIndex);
    if (!slotEl.classList.contains('active')) return;

    const slot = slots[slotIndex];
    if (slot.file) {
        document.getElementById('loading-overlay').classList.add('show');
        document.getElementById('loading-text').textContent = 'Removing...';
        
        if (slot.syncInterval) {
            clearInterval(slot.syncInterval);
            slot.syncInterval = null;
        }
        await forceManualSync(slotIndex);
        slot.file = null;
    }

    try {
        await fetch(API_BASE + '/?cmd=CLEAR&slot=' + slotIndex + '&deviceId=' + encodeURIComponent(deviceId));
        slotOwners[slotIndex] = '';
        updateAllSlotLockUI();
        slotEl.classList.remove('active');
        document.getElementById('slot-' + slotIndex + '-img').style.display = 'none';
        const statsDiv = document.getElementById('slot-' + slotIndex + '-stats');
        if (statsDiv) statsDiv.style.display = 'none';
        const badge = slotEl.querySelector('.sf-badge');
        if (badge) badge.style.display = 'none';
    } catch (err) {
        console.error(err);
    } finally {
        document.getElementById('loading-overlay').classList.remove('show');
    }
}

async function disconnect() {
    document.getElementById('loading-overlay').classList.add('show');
    document.getElementById('loading-text').textContent = 'Saving...';

    for (let i = 0; i < 8; i++) {
        if (slots[i].syncInterval) clearInterval(slots[i].syncInterval);
    }

    await Promise.all(
        slots.map((slot, index) => slot.file ? forceManualSync(index) : Promise.resolve())
    );

    localStorage.removeItem('serverIp');
    window.location.href = 'index.html';
}

/* Reset Overlay Logic */
let resetTimeout = null;
let resetInterval = null;
let currentResetTarget = null;
let currentHoldAction = 'reset';

function showResetOverlay(itemFile, itemName, action = 'reset') {
    currentResetTarget = itemFile;
    currentHoldAction = action;
    
    if (action === 'delete') {
        document.getElementById('reset-title').textContent = "Delete " + itemName + "?";
        document.getElementById('reset-hold-btn').querySelector('span').textContent = "Hold to Delete";
        document.getElementById('reset-hold-btn').style.background = "rgba(255, 50, 50, 0.8)";
    } else {
        document.getElementById('reset-title').textContent = "Reset " + itemName + " to Level 1?";
        document.getElementById('reset-hold-btn').querySelector('span').textContent = "Hold to Reset";
        document.getElementById('reset-hold-btn').style.background = "rgba(255, 50, 50, 0.8)";
    }
    
    document.getElementById('reset-progress').style.width = '0%';
    document.getElementById('reset-overlay').classList.remove('overlay-hidden');
}

function hideResetOverlay() {
    document.getElementById('reset-overlay').classList.add('overlay-hidden');
    currentResetTarget = null;
    clearResetTimers();
    document.getElementById('reset-progress').style.width = '0%';
}

function clearResetTimers() {
    if (resetTimeout) clearTimeout(resetTimeout);
    if (resetInterval) clearInterval(resetInterval);
    resetTimeout = null;
    resetInterval = null;
}

async function executeSafeReset(itemFile) {
    try {
        for (let i = 0; i < 8; i++) {
            if (slots[i] && slots[i].file === itemFile) {
                await clearSlot(i);
            }
        }
        await StorageManager.resetFile(itemFile);
        alert("Reset Completed!");
        renderGrid();
    } catch (err) {
        alert("Cannot find virgin file.");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const holdBtn = document.getElementById('reset-hold-btn');
    const cancelBtn = document.getElementById('reset-cancel-btn');

    if (holdBtn) {
        holdBtn.addEventListener('mousedown', startResetHold);
        holdBtn.addEventListener('touchstart', startResetHold, {passive: false});
        holdBtn.addEventListener('mouseup', stopResetHold);
        holdBtn.addEventListener('mouseleave', stopResetHold);
        holdBtn.addEventListener('touchend', stopResetHold);
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', hideResetOverlay);
    }
});

function startResetHold(e) {
    if (e.type === 'touchstart') e.preventDefault();
    if (!currentResetTarget) return;
    
    clearResetTimers();
    
    let progress = 0;
    const progressEl = document.getElementById('reset-progress');
    progressEl.style.transition = 'none';
    progressEl.style.width = '0%';
    
    const DURATION = 10000; // 10 seconds
    const INTERVAL = 50;
    const step = (INTERVAL / DURATION) * 100;
    
    resetInterval = setInterval(() => {
        progress += step;
        if (progress > 100) progress = 100;
        progressEl.style.width = progress + '%';
    }, INTERVAL);
    
    resetTimeout = setTimeout(async () => {
        clearResetTimers();
        const target = currentResetTarget;
        const action = currentHoldAction;
        hideResetOverlay();
        document.getElementById('loading-overlay').classList.add('show');
        
        if (action === 'delete') {
            document.getElementById('loading-text').textContent = 'Deleting...';
            for (let i = 0; i < 8; i++) {
                if (slots[i] && slots[i].file === target) {
                    await clearSlot(i);
                }
            }
            await StorageManager.deleteClone(target);
            allFiles = StorageManager.fileList;
            renderGrid();
            alert("Delete Completed!");
        } else {
            document.getElementById('loading-text').textContent = 'Resetting...';
            await executeSafeReset(target);
        }
        
        document.getElementById('loading-overlay').classList.remove('show');
    }, DURATION);
}

function stopResetHold() {
    if (resetTimeout || resetInterval) {
        clearResetTimers();
        const progressEl = document.getElementById('reset-progress');
        progressEl.style.transition = 'width 0.3s ease-out';
        progressEl.style.width = '0%';
    }
}
