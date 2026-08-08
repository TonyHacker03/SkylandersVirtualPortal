<div align="center">
  <h1>VirtPort (Virtual Portal for Cemu)</h1>
  <p>A mobile companion app and custom Cemu build that turns your Android device into a wireless Skylanders Portal of Power.</p>
</div>

## 🌟 Overview

**VirtPort** completely replaces the need for a physical Skylanders Portal of Power and physical figures when playing Skylanders games on the Wii U emulator. 

By running a custom build of **Cemu** and the **VirtPort Android App**, your Android phone becomes a fully functional, real-time virtual portal over Wi-Fi!

### ✨ Features
- **📱 Phone as a Portal**: No more physical hardware required. Connect your Android device directly to Cemu via your local Wi-Fi network.
- **⚡ Real-Time Syncing**: Instantly place or remove Skylanders, Traps, Creation Crystals, and Vehicles. Changes reflect instantly in-game.
- **📂 Preloaded Library**: The app comes preloaded with the entire collection of Skylander `.dump` files. No need to manually download or transfer any files!
- **🔄 Progress Saving**: Experience, Gold, and Upgrades are automatically saved back to your `.dump` files just like the real figures!
- **📤 QR Sharing**: Send your fully upgraded Skylanders or custom Creation Crystals to friends instantly via compressed QR codes.

---

## 📥 Installation & Setup

You can find the compiled Cemu build and the Android APK in the **[Releases](../../releases)** section of this repository.

### Step 1: Setup Cemu
1. Go to the **Releases** page and download **`Cemu_4_virtport.zip`**.
2. Extract the zip file to a folder of your choice on your PC.
3. Open `Cemu.exe`. 
4. Launch your Skylanders game of choice.

### Step 2: Setup the VirtPort App
1. From the **Releases** page, download **`VirtPort.apk`** to your Android device and install it.
2. *Note: You may need to enable "Install from Unknown Sources" in your Android settings.*
3. Ensure your Android device and your PC are connected to the **same Wi-Fi network**.

### Step 3: Connect and Play!
1. Open the **VirtPort** app on your phone.
2. The app will automatically scan your local network for your running Cemu instance. 
3. Tap on your PC's IP address when it appears.
4. You will see the main Portal interface. Tap any slot to add a Skylander from your library. The Skylander will instantly appear in the game!

---

## 🛠️ Repository Structure

- **`/SkylandersApp/`** - The Cordova source code for the Android Application.
- **`/Cemu/`** - The modified Cemu source code (C++) containing the custom EmulatedUSBDevice server logic.

---

## 🧩 Cemu Source Modifications

To implement the virtual portal logic and enable real-time communication with the Android application, the following files have been added/modified within the Cemu source code:

1. **`src/Cafe/OS/libs/nsyshid/Skylander.cpp`** (Contains the crucial 33ms USB polling rate adjustment to match physical hardware)
2. **`src/Cafe/OS/libs/nsyshid/SkylanderXbox360.cpp`**
3. **`src/gui/wxgui/EmulatedUSBDevices/SkylanderServer.cpp`**
4. **`src/gui/wxgui/EmulatedUSBDevices/SkylanderServer.h`**

These files implement a local HTTP REST API server (`SkylanderServer`) within the `EmulatedUSBDevices` module, which handles the USB hardware emulation of the portal and receives modifications and `.dump` files directly from the phone.

### How to Rebuild for Newer Cemu Versions
If you want to compile VirtPort for a more updated version of Cemu, follow these steps:
1. Clone the desired Cemu source code version from the [official repository](https://github.com/cemu-project/Cemu).
2. Copy the four files listed above (found inside the project's source .zip or in the `Cemu/src/` folder) to the corresponding paths in the new Cemu source tree.
3. Modify the `CMakeLists.txt` files to include `SkylanderServer.cpp` and ensure any necessary networking libraries for the HTTP server are linked.
4. Proceed with the normal CMake compilation as indicated in the [official Cemu build guide](https://github.com/cemu-project/Cemu/blob/main/BUILD.md).

---

## 🚀 Upcoming Features (TODO)

- **📡 Real Skylander Scanning**: Use your phone's NFC reader to scan your real physical Skylanders and import their progress directly into the app.
- **🏆 In-App Achievements**: A complete achievement system to track your progress and unlock rewards within the app.
- **⚡ Lite Mode**: An optimized, lightweight rendering mode to ensure perfectly smooth performance on older or lower-end Android devices.
- **🐬 Dolphin Emulator Support**: Bring VirtPort to Nintendo Wii by integrating with the Dolphin Emulator.
- **🎮 RPCS3 Emulator Support**: Bring VirtPort to the PlayStation 3 by integrating with the RPCS3 Emulator.

---

## ⚖️ Credits & Copyright Attribution

**VirtPort** relies on a custom fork of **Cemu**, the incredible open-source Wii U emulator.

- **Cemu** is created and maintained by the Cemu Team (Exzap and contributors).
- Cemu is licensed under the **Mozilla Public License 2.0 (MPL 2.0)**.
- For more information on Cemu, visit the official [Cemu Website](https://cemu.info/) or their [GitHub Repository](https://github.com/cemu-project/Cemu).

The modifications made to the Cemu source code in this project specifically implement a local WebSocket server (`SkylanderServer`) within the `EmulatedUSBDevices` module to allow bidirectional communication with the Android application.
