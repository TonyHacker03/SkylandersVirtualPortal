const fs = require('fs');
const CryptoJS = require('crypto-js');

const SkylanderDecoder = {
    AES_CONST: " Copyright (C) 2010 Activision. All Rights Reserved.",

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

    decodeStats(buffer) {
        const data = new Uint8Array(buffer);
        const b8 = this.decryptBlock(data, 8);
        const b36 = this.decryptBlock(data, 36);

        const useBlock8 = (b8[9] >= b36[9]);
        const activeGoldBlock = useBlock8 ? b8 : b36;

        const expA = activeGoldBlock[0] | (activeGoldBlock[1] << 8);
        const gold = activeGoldBlock[3] | (activeGoldBlock[4] << 8);

        const b17 = this.decryptBlock(data, 17);
        const b45 = this.decryptBlock(data, 45);

        const useBlock17 = (b17[2] >= b45[2]);
        const activeExpBlock = useBlock17 ? b17 : b45;

        const expB = activeExpBlock[3] | (activeExpBlock[4] << 8);
        const expC = activeExpBlock[8] | (activeExpBlock[9] << 8);

        const totalXp = expA + expB + expC;
        
        console.log("B8 seq:", b8[9]);
        console.log("B36 seq:", b36[9]);
        console.log("Active Gold Block:", activeGoldBlock);
        console.log("Decrypted B8 Hex:", Buffer.from(b8).toString('hex'));

        return { xp: totalXp, gold: gold };
    }
};

const buffer = fs.readFileSync('C:\\Users\\Antonio\\Desktop\\Cemu\\SkylandersNaked\\Spyro (Series 2).dump');
console.log(SkylanderDecoder.decodeStats(buffer));
