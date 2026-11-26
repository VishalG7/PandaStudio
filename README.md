# 🐼 Panda Studio (Modular Edition)

A high-performance, offline-first, zero-cloud desktop web platform designed for creators, AI artists, and developers. Built with a clean **micro-kernel modular architecture**, it allows adding unlimited independent tools and features without disturbing existing ones.

---

> ### 📦 **Quick Download (No Installation Required)**
> 
> **[⬇️ Download `PandaStudio.exe` (Standalone Windows Executable)](dist/PandaStudio.exe?raw=true)** (~9.46 MB)  
> *Ready to run on Windows 10 & 11 — zero Python, pip, or Node.js required. Just download, double-click, and start creating!*

---

## 📑 Table of Contents

- [🚀 Quick Start](#-quick-start)
  - [Option A: Standalone Windows Executable (Recommended)](#option-a-standalone-windows-executable-recommended)
  - [Option B: Windows Batch Launcher](#option-b-windows-batch-launcher)
  - [Option C: Python CLI](#option-c-python-cli)
  - [Rebuilding the Executable](#rebuilding-the-executable)
- [⚙️ Port Configuration](#-port-configuration)
- [🏛 Architecture & Modularity](#-architecture--modularity)
- [🛠 Built-In Modules (Tab Order)](#-built-in-modules-tab-order)
  - [Tab 1: 📋 Image & Text Library (`library`)](#tab-1--image--text-library-library)
  - [Tab 2: ✂️ 4-Panel Image Trimmer (`trimmer`)](#tab-2-️-4-panel-image-trimmer-trimmer)
  - [Tab 3: 🔄 Backup JSON Updater & Sync (`backup-updater`)](#tab-3--backup-json-updater--sync-backup-updater)
  - [Tab 4: 🪟 Grid Slicer (N-Tiles) (`grid-splitter`)](#tab-4--grid-slicer-n-tiles-grid-splitter)
  - [Tab 5: 🎙️ Text to Speech (`tts`)](#tab-5-️-text-to-speech-tts)
- [🌟 Global Platform Features](#-global-platform-features)
  - [Settings & Profile Modal](#settings--profile-modal)
  - [Light ☀️ / Dark 🌙 Theme Engine](#light-️--dark--theme-engine)
  - [Real-Time Activity Logging](#real-time-activity-logging)
  - [Direct Open Logs Folder Action](#direct-open-logs-folder-action)
  - [Server API Endpoints](#server-api-endpoints)
- [🧩 Plugin Guide (Adding New Tools)](#-plugin-guide-adding-new-tools)
- [📂 Project Directory Structure](#-project-directory-structure)
- [📖 Documentation Links](#-documentation-links)

---

## 🚀 Quick Start

### Option A: Standalone Windows Executable (Recommended)

👉 **[📥 Click here to download `PandaStudio.exe`](dist/PandaStudio.exe?raw=true)**

1. **Download:** Click the link above to save [`PandaStudio.exe`](dist/PandaStudio.exe?raw=true) (~9.46 MB) to any folder on your computer.
2. **Launch:** Double-click `PandaStudio.exe`.
3. **Start Creating:** The local server starts and automatically opens Panda Studio in your default browser at `http://localhost:6700`.

- **Zero Prerequisites:** No Python, pip packages, Git, or Node.js needed.
- **Embedded Assets:** All HTML, CSS, JavaScript, and custom panda icons are packed inside the single executable.
- **Persistent Storage:** Backups (`backups/`) and activity logs (`backups/logs/`) are created automatically alongside the executable on your disk.
- **Portable:** Move `PandaStudio.exe` to a USB drive or another Windows PC and it runs immediately.

### Option B: Windows Batch Launcher
Double-click [`start.bat`](file:///d:/Developer/Web/LocalImageTextLibrary/start.bat) in the project root.
- Runs `server.py` using your installed Python environment.
- Launches browser to `http://localhost:6700`.

### Option C: Python CLI
```bash
# Start on default configured port (6700)
python server.py

# Or start on a custom port
python server.py 6700
python server.py -p 6750

# Run in background without launching browser automatically
python server.py --no-browser
```

### Rebuilding the Executable
Whenever you modify HTML, CSS, JavaScript, or backend code, double-click [`build_exe.bat`](file:///d:/Developer/Web/LocalImageTextLibrary/build_exe.bat) or run:
```bash
python -m PyInstaller --clean PandaStudio.spec
```
The newly compiled standalone binary is placed in [`dist\PandaStudio.exe`](file:///d:/Developer/Web/LocalImageTextLibrary/dist/PandaStudio.exe).

---

## ⚙️ Port Configuration

The server defaults to port **6700**. You can customize the port via:
1. **Command Line:** `PandaStudio.exe -p 6750` or `python server.py -p 6750` (or positional `python server.py 6750`)
2. **Environment Variable:** `set PORT=6750` or `set PANDA_PORT=6750`
3. **Configuration File:** Edit `"port": 6700` in [`config.json`](file:///d:/Developer/Web/LocalImageTextLibrary/config.json)
4. **Default Fallback:** `6700`

---

## 🏛 Architecture & Modularity

Panda Studio uses a centralized **Micro-Kernel Architecture** (`js/app.js`):

```
                          ┌────────────────────────┐
                          │   App Kernel (app.js)  │
                          │  - Module Registry     │
                          │  - Tab Router          │
                          │  - Toast & Modals      │
                          │  - Logging Dispatcher  │
                          │  - Theme Manager       │
                          └───────────┬────────────┘
                                      │
        ┌───────────────────┬─────────┴─────────┬───────────────────┐
        ▼                   ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Tab 1:        │   │ Tab 2:        │   │ Tab 3:        │   │ Tab 4:        │
│ Library       │   │ Trimmer       │   │ Backup Updater│   │ Grid Splitter │
│ (library.js)  │   │ (trimmer.js)  │   │(backup-upd.js)│   │(grid-split.js)│
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │                   │
        ▼                   ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  IndexedDB    │   │  File System  │   │  REST Sync &  │   │  Canvas 2D &  │
│  (Client DB)  │   │  Access API   │   │  Diff Engine  │   │  JSZip Pack   │
└───────────────┘   └───────────────┘   └───────────────┘   └───────────────┘
        │                                       │
        └───────────────────┬───────────────────┘
                            ▼
              ┌───────────────────────────┐
              │ Python Backend (server.py)│
              │ or Standalone (.exe)      │
              └─────────────┬─────────────┘
                            ▼
              ┌───────────────────────────┐
              │  Local Disk Storage       │
              │  - backups/*.json         │
              │  - backups/logs/*.log     │
              └───────────────────────────┘
```

- **Zero Coupling:** Modules do not depend on each other and communicate only via the kernel.
- **Dynamic Tab Generation:** Navigation tabs are dynamically created on startup.
- **Strict Tab Ordering:** Tab 1 (`library`), Tab 2 (`trimmer`), Tab 3 (`backup-updater`), Tab 4 (`grid-splitter`).

---

## 🛠 Built-In Modules (Tab Order)

### Tab 1: 📋 Image & Text Library (`library`)
Full image-prompt catalogue and asset management system:
- **Client IndexedDB:** Stores binary image `Blob`s and metadata locally (`LocalImageTextLibrary`, version 1).
- **Task Completion & Done State (Greyed-Out):** One-click completion toggle (`○` / `✓`) directly on card headers. Completed items are visually greyed out with title strikethrough, subtle contrast, and green `✓ Done` pills. Includes sidebar filters (`⏳ Pending` / `✅ Done`) and multi-item bulk completion actions.
- **Natural Numerical Sorting:** Intelligently sorts items whose titles begin with numbers (`1.`, `2.`, `28. Stick Insect`).
- **Real-Time Filtering:** Search across titles, descriptions, and tags with sidebar filters for Favorites, Groups, and Tags.
- **Group Management with Cascade Deletion:** Deleting a group automatically purges all items assigned to that group to prevent orphaned ghost items.
- **Multi-Action Clipboard & Card Shortcuts:** Copy Image (auto-normalizes to standard PNG format), Copy Text, or Copy Both in one click. Direct `📋 Image` and `📝 Text` quick-copy buttons are placed on every item card so you can copy without opening the detail modal.
- **Automated Debounced Backup & Retention Cleanup:** Edits in Tab 1 automatically sync to `backups/library-backup-auto.json` after 5 seconds of inactivity. Manual `📤 Export / Backup` creates timestamped `backups/library-backup-YYYYMMDD_HHMMSS.json` snapshots, and the server automatically retains only the newest `max_backup_files` (default `5`, configurable in `config.json`) while cleaning up older snapshots.

---

### Tab 2: ✂️ 4-Panel Image Trimmer (`trimmer`)
Computer-vision panel splitter for 2×2 composite images:
- **Intelligent Gutter & Edge Removal:** Pinpoints and trims white dividing lines and outer margins.
- **Sequence Naming:** Automatically detects range numbers from source file names (e.g. `1-4.jpg` → `1.jpg`, `2.jpg`, `3.jpg`, `4.jpg`) or supports custom starting integers.
- **File Overwrite & Conflict Protection:** Probes target disk folders before saving. If filenames already exist, provides safe options:
  - **Save with Unique Suffix:** Automatically renames existing collisions (e.g. `1_1.jpg`).
  - **Advance Sequence:** Shifts range to the next available integers (e.g. `5.jpg`–`8.jpg`).
  - **Explicit Overwrite Confirmation:** Protects against accidental data loss.
- **Direct Disk Saving:** Writes cropped panels directly to your chosen folder using the File System Access API (`showDirectoryPicker`), or downloads a single ZIP archive.

---

### Tab 3: 🔄 Backup JSON Updater & Sync (`backup-updater`)
Smart reconciliation and merge engine for scene prompts:
- **Targeted Group Selector & Dropdown:** Dropdown automatically displays all existing groups discovered across the latest backup JSON (both `groups` array and item properties), with two-way synchronization to a custom text input.
- **Auto-Loads Latest Backup:** Fetches the newest snapshot in `backups/` from the backend automatically.
- **Smart Matching Hierarchy:**
  1. Matches by exact `id`.
  2. If ID differs, matches by `title` inside the target group.
  3. Matches by `title` among unassigned items.
- **Data & Image Preservation:** Preserves existing binary Base64 images, tags, and favorites. Never deletes image data unless replaced.
- **Ghost Item Prevention:** Automatically sweeps and eliminates empty imageless duplicate records.
- **Enhanced File Pickers:** Polished Choose Files buttons for image folders and JSON patches with status badges and consistent typography.
- **Instant Live Sync to Tab 1:** Previews an item-by-item diff table (including an **Image** column showing `🖼️ Image Added`, `🖼️ Kept`, or `✕ No Image` per title), updates backup in-place via **`💾 Update backup`**, syncs directly into the live browser IndexedDB via **`✨ Apply and Sync`** (placed side-by-side with Update backup, with instantaneous Tab 1 auto-refresh), saves a new snapshot, or downloads JSON.

---

### Tab 4: 🪟 Grid Slicer (N-Tiles) (`grid-splitter`)
Arbitrary $N$-tile grid slicing tool:
- **Dynamic Dimension Calculation:** Computes column and row counts from user tile count ($1\times1$, $2\times2$, $3\times3$, $4\times4$).
- **Per-Tile Custom Naming Arguments:** Configurable output file names per tile (e.g. `crop_1.png` or custom scene labels).
- **Batch Export:** Download slices individually or as a single compiled ZIP archive via `JSZip`.

---

### Tab 5: 🎙️ Text to Speech (`tts`)
Convert text and video prompts into natural neural speech:
- **Freely Available AI Voice Models:** Over 40+ curated neural voices (US, UK, Indian, Australian, Canadian, Hindi, European, and Asian) without requiring any API keys. Automatically detects Hindi/Devanagari script and falls back to `hi-IN-SwaraNeural` if an English voice is selected.
- **Python Backend Engine:** Synthesizes audio using Python `edge-tts` and saves directly to disk in the local `audio/` directory as MP3.
- **In-Browser Playback:** Interactive audio player with auto-play, replay, seek, and volume control.
- **Voice Fine-Tuning:** Adjustable speaking speed (0.75x to 1.5x) and voice pitch presets.
- **Local Audio History:** Browse, replay, download, and delete saved MP3s, or open the `audio/` directory directly in Windows Explorer.

---

## 🌟 Global Platform Features

### Settings & Profile Modal
Accessible via the gear icon (`⚙️`) in the top-left header:
- **Developer Attribution:** Developed by **Vishal**.
- **YouTube Studio Shortcut:** One-click launch to [YouTube Creator Studio](https://studio.youtube.com/).
- **Activity Log Path:** Displays current logs directory (`backups/logs/`).

### Light ☀️ / Dark 🌙 Theme Engine
- Switch seamlessly between clean slate Light Mode and charcoal Dark Mode (`[data-theme="dark"]`).
- Persistent in browser `localStorage`.
- High-contrast color palette with WCAG-compliant readability.

### Real-Time Activity Logging
- Every user action (clicks, file picks, merges, theme changes) is logged with Tab ID and timestamps.
- Appended directly to `backups/logs/app-YYYY-MM-DD.log` with instant disk flush (`os.fsync`).

### Direct Open Logs Folder Action
- Inside Settings modal, click **"Open Logs Folder (`backups/logs/`)"** to open the physical directory directly in Windows Explorer via `/api/open-logs`.

### Server API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves `index.html` and bundled client assets |
| `GET` | `/api/status` | Returns server health, active port, and storage paths |
| `GET` | `/api/latest-backup` | Returns newest backup file and parsed payload |
| `GET` | `/api/logs` | Lists physical log files in `backups/logs/` |
| `GET` / `POST` | `/api/open-logs` | Opens `backups/logs/` folder directly in Windows Explorer |
| `POST` | `/save-backup` | Saves backup snapshot JSON to `backups/` |
| `POST` | `/api/update-backup` | Updates backup in-place or saves a new version |
| `POST` | `/api/log` | Appends formatted action entry to today's log file |

---

## 🧩 Plugin Guide (Adding New Tools)

Adding a new tool takes only 2 steps:

### Step 1: Create module in `js/modules/my-tool.js`
```javascript
export const MyToolModule = {
    id: "my-tool",
    name: "My Custom Tool",
    icon: "🚀",

    init(container, app) {
        this.container = container;
        this.app = app;
        container.innerHTML = `
            <div style="padding: 24px;">
                <h2>My Custom Tool</h2>
                <button class="btn btn-primary" id="myBtn">Click Me</button>
            </div>
        `;
        container.querySelector("#myBtn").onclick = () => {
            app.log(this.id, "Clicked sample button");
            app.showToast("Button clicked!", "success");
        };
    }
};
```

### Step 2: Register in `index.html`
```javascript
import { MyToolModule } from "./js/modules/my-tool.js?v=7";
App.registerModule(MyToolModule);
```
Your module automatically receives a navigation tab, container viewport, and logging integration!

---

## 📂 Project Directory Structure

```text
LocalImageTextLibrary/
├── index.html                  # Master modular application shell
├── favicon.svg                 # Panda Studio browser tab SVG icon
├── panda.ico                   # Application icon for Windows executable
├── config.json                 # Port and host configuration (default: 6700)
├── server.py                   # Python backend & PyInstaller-aware asset server
├── start.bat                   # Batch script to launch server with Python
├── build_exe.bat               # One-click batch script to build PandaStudio.exe
├── PandaStudio.spec            # PyInstaller build specification
├── README.md                   # User documentation and guide
├── tech.md                     # Deep technical architecture & test specification
├── instructions.md             # Invariants & guidelines for AI models & developers
├── dist/
│   └── PandaStudio.exe         # Standalone compiled Windows executable (~9.4 MB)
├── css/
│   ├── app.css                 # Core design tokens, light/dark themes, toast & modals
│   ├── library.css             # Tab 1: Image & Text Library styling
│   ├── trimmer.css             # Tab 2 & 4: Image Trimmer & Grid Slicer styling
│   └── backup-updater.css      # Tab 3: Backup JSON Updater styling
├── js/
│   ├── app.js                  # Central App Kernel, router, logger, and theme engine
│   ├── utils/
│   │   └── db.js               # IndexedDB wrapper (LocalImageTextLibrary v1)
│   └── modules/
│       ├── library.js          # Tab 1: Library module
│       ├── trimmer.js          # Tab 2: 4-Panel Trimmer module
│       ├── backup-updater.js   # Tab 3: Backup JSON Updater module
│       └── grid-splitter.js    # Tab 4: Grid Slicer module
└── backups/
    ├── *.json                  # Auto-saved and merged backup files
    └── logs/
        └── app-YYYY-MM-DD.log  # User activity logs
```

---

## 📖 Documentation Links

- [Technical Specifications & Test Cases (`tech.md`)](file:///d:/Developer/Web/LocalImageTextLibrary/tech.md) — Exhaustive technical breakdown, invariants, edge cases, and 7 complete test suites.
- [AI Model & Contributor Instructions (`instructions.md`)](file:///d:/Developer/Web/LocalImageTextLibrary/instructions.md) — 11 mandatory engineering invariants for future AI assistants and engineers.
