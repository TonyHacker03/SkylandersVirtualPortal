const SkylanderDecoder = {
    // Activision Constant (must be exactly 53 bytes, note the trailing space!)
    AES_CONST: " Copyright (C) 2010 Activision. All Rights Reserved. ",

    decryptBlock(data, blockIndex) {
        const first32 = data.slice(0, 32);
        const block = data.slice(blockIndex * 16, blockIndex * 16 + 16);

        const keyInput = new Uint8Array(32 + 1 + 53);
        keyInput.set(first32, 0);
        keyInput[32] = blockIndex;
        
        const constChars = this.AES_CONST.split('').map(c => c.charCodeAt(0));
        keyInput.set(constChars, 33);

        // Convert to hex string to be 100% safe with CryptoJS
        let hexString = '';
        for (let i = 0; i < keyInput.length; i++) {
            hexString += keyInput[i].toString(16).padStart(2, '0');
        }
        const keyInputWords = CryptoJS.enc.Hex.parse(hexString);
        const md5Key = CryptoJS.MD5(keyInputWords);

        let blockHex = '';
        for (let i = 0; i < block.length; i++) {
            blockHex += block[i].toString(16).padStart(2, '0');
        }
        const encryptedWords = CryptoJS.enc.Hex.parse(blockHex);

        const decryptedWords = CryptoJS.AES.decrypt({ ciphertext: encryptedWords }, md5Key, {
            mode: CryptoJS.mode.ECB,
            padding: CryptoJS.pad.NoPadding
        });

        const decryptedHex = decryptedWords.toString(CryptoJS.enc.Hex);
        const decryptedBytes = new Uint8Array(16);
        for (let i = 0; i < 16; i++) {
            decryptedBytes[i] = parseInt(decryptedHex.substr(i * 2, 2), 16);
        }
        return decryptedBytes;
    },

    async decodeStats(fileBlob, isCrystal = false) {
        if (!fileBlob || !window.CryptoJS) return null;
        try {
            const arrayBuffer = await fileBlob.arrayBuffer();
            if (arrayBuffer.byteLength !== 1024) return null;
            const data = new Uint8Array(arrayBuffer);

            // Helper to auto-detect if a specific block is decrypted or encrypted.
            // This is crucial because during a game save, the file might be in a "hybrid" state
            // where some blocks are written encrypted and others are still in community decrypted format.
            const getBlock = (blockIndex) => {
                const raw = data.slice(blockIndex * 16, blockIndex * 16 + 16);
                const enc = this.decryptBlock(data, blockIndex);
                let zR = 0, zE = 0;
                for (let i = 0; i < 16; i++) {
                    if (raw[i] === 0) zR++;
                    if (enc[i] === 0) zE++;
                }
                return (zR > zE) ? raw : enc;
            };

            const b8 = getBlock(8);
            const b36 = getBlock(36);

            // Compare sequence numbers (byte 9) with wrap-around logic
            const diff = (b8[9] - b36[9]) & 0xFF;
            const useBlock8 = (diff < 128);
            const activeGoldBlock = useBlock8 ? b8 : b36;

            const expA = activeGoldBlock[0] | (activeGoldBlock[1] << 8);
            const gold = activeGoldBlock[3] | (activeGoldBlock[4] << 8);

            // Decrypt Block 17 and 45 (Area 0 and Area 1 for ExpB and ExpC)
            const b17 = getBlock(17);
            const b45 = getBlock(45);

            // Sequence number for 17 vs 45 is at byte 2! (offset 274 vs 722 -> 274-272 = 2)
            const useBlock17 = (b17[2] >= b45[2]);
            const activeExpBlock = useBlock17 ? b17 : b45;

            // expB is offset 3 (275 - 272 = 3)
            const expB = isCrystal ? 0 : (activeExpBlock[3] | (activeExpBlock[4] << 8));
            
            // expC is offset 8 (280 - 272 = 8)
            const expC = isCrystal ? 0 : (activeExpBlock[8] | (activeExpBlock[9] << 8));

            // Many "virgin" community dumps are incorrectly padded with zeroes but contain garbage.
            // If the checksum bytes (14 and 15) of the active gold block are exactly 0,
            // this is almost certainly a fake virgin dump.
            if (activeGoldBlock[14] === 0 && activeGoldBlock[15] === 0) {
                return { xp: 0, gold: 0, level: 1 };
            }

            // Extract Nickname (Local offset 0x20 and 0x40 in active area)
            // Area 1 starts at block 8. Local 0x20 -> Block 10. Local 0x40 -> Block 12.
            // Area 2 starts at block 36. Local 0x20 -> Block 38. Local 0x40 -> Block 40.
            const nameBlock1 = getBlock(useBlock8 ? 10 : 38);
            const nameBlock2 = getBlock(useBlock8 ? 12 : 40);
            
            let nickname = "";
            const nameBytes = new Uint8Array(32);
            nameBytes.set(nameBlock1, 0);
            nameBytes.set(nameBlock2, 16);
            
            // Auto-detect encoding (UTF-16LE vs ASCII)
            let isUTF16 = (nameBytes[1] === 0 && nameBytes[0] !== 0);
            
            if (isUTF16) {
                for (let i = 0; i < 30; i += 2) {
                    const charCode = nameBytes[i] | (nameBytes[i+1] << 8);
                    if (charCode === 0) break;
                    nickname += String.fromCharCode(charCode);
                }
            } else {
                for (let i = 0; i < 30; i++) {
                    const charCode = nameBytes[i];
                    if (charCode === 0) break;
                    nickname += String.fromCharCode(charCode);
                }
            }

            // Total XP
            let totalXp = expA + expB + expC;
            let level = this.xpToLevel(totalXp);
            
            return { xp: totalXp, gold: gold, level: level, nickname: nickname.trim() };
        } catch (e) {
            console.error("Decoding error:", e);
            return null;
        }
    },

    async decodeVillainId(fileBlob) {
        if (!fileBlob || !window.CryptoJS) return null;
        try {
            const arrayBuffer = await fileBlob.arrayBuffer();
            if (arrayBuffer.byteLength !== 1024) return null;
            const data = new Uint8Array(arrayBuffer);

            const getBlock = (blockIndex) => {
                const raw = data.slice(blockIndex * 16, blockIndex * 16 + 16);
                const enc = this.decryptBlock(data, blockIndex);
                let zR = 0, zE = 0;
                for (let i = 0; i < 16; i++) {
                    if (raw[i] === 0) zR++;
                    if (enc[i] === 0) zE++;
                }
                return (zR > zE) ? raw : enc;
            };

            // Area Sequence for Traps is at Block 8 and 36, byte 9
            const b8 = getBlock(8);
            const b36 = getBlock(36);
            
            const diff = (b8[9] - b36[9]) & 0xFF;
            const useBlock8 = (diff < 128);
            
            // The active villain block is 9 or 37
            const activeVillainBlock = getBlock(useBlock8 ? 9 : 37);
            
            // Villain ID is the first byte (0)
            return activeVillainBlock[0];
        } catch (e) {
            console.error("Villain decode error:", e);
            return null;
        }
    },

    xpToLevel(xp) {
        const limits = [0, 1000, 2200, 3800, 6000, 9000, 13000, 18000, 24000, 33000, 
                        43000, 54000, 66000, 79000, 93000, 108000, 125000, 144000, 165000, 188000];
        let lvl = 1;
        for (let i = 0; i < limits.length; i++) {
            if (xp >= limits[i]) lvl = i + 1;
        }
        return lvl;
    }
};

window.SkylanderDecoder = SkylanderDecoder;
