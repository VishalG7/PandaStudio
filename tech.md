# 🐼 Panda Studio — Technical Architecture, Tools, Features & Test Specification

> **Version:** 2.0 (Modular Edition)  
> **Target OS:** Windows 10 / 11 (Cross-Platform Compatible)  
> **App Host:** Local HTTP Server (`http://127.0.0.1:6700` via `python server.py` / `start.bat`, configurable via `config.json`, CLI, or `PORT` env var)  
> **Storage:** Browser IndexedDB (`LocalImageTextLibrary`, v1) + Local Disk (`backups/`, `backups/logs/`)

---

## 📑 Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Module Specifications & Detailed Usage](#2-module-specifications--detailed-usage)
   - [Tab 1: 📋 Image & Text Library (`library`)](#tab-1--image--text-library-library)
   - [Tab 2: ✂️ 4-Panel Image Trimmer (`trimmer`)](#tab-2-️-4-panel-image-trimmer-trimmer)
   - [Tab 3: 🔄 Backup JSON Updater & Sync (`backup-updater`)](#tab-3--backup-json-updater--sync-backup-updater)
   - [Tab 4: 🪟 Grid Slicer (N-Tiles) (`grid-splitter`)](#tab-4--grid-slicer-n-tiles-grid-splitter)
3. [Core Services & Global Features](#3-core-services--global-features)
   - [Central App Kernel (`js/app.js`)](#central-app-kernel-jsappjs)
   - [Settings & About Modal](#settings--about-modal)
   - [Light / Dark Theme System](#light--dark-theme-system)
   - [Real-Time Activity Logging Engine](#real-time-activity-logging-engine)
   - [Server API Endpoints (`server.py`)](#server-api-endpoints-serverpy)
   - [Standalone Windows Executable (`PandaStudio.exe`)](#standalone-windows-executable-pandastudioexe)
4. [Conditions & Business Rules](#4-conditions--business-rules)
5. [Complete Verification & Test Case Suite](#5-complete-verification--test-case-suite)
   - [Test Suite 1: Library Module (Tab 1)](#test-suite-1-library-module-tab-1)
   - [Test Suite 2: 4-Panel Trimmer Module (Tab 2)](#test-suite-2-4-panel-trimmer-module-tab-2)
   - [Test Suite 3: Backup JSON Updater Module (Tab 3)](#test-suite-3-backup-json-updater-module-tab-3)
   - [Test Suite 4: Grid Slicer Module (Tab 4)](#test-suite-4-grid-slicer-module-tab-4)
   - [Test Suite 5: Kernel, Themes, Logging & Settings](#test-suite-5-kernel-themes-logging--settings)
   - [Test Suite 6: Backend HTTP API](#test-suite-6-backend-http-api)
   - [Test Suite 7: Standalone Windows Executable](#test-suite-7-standalone-windows-executable)

---

## 1. System Architecture Overview

Panda Studio is built on a **micro-kernel modular architecture**. Modules are completely decoupled from each other and communicate only via the central `AppKernel` instance.

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
              │ - POST /save-backup       │
              │ - POST /api/update-backup │
              │ - POST /api/log           │
              │ - GET  /api/latest-backup │
              │ - GET  /api/status        │
              │ - GET  /api/logs          │
              └─────────────┬─────────────┘
                            ▼
              ┌───────────────────────────┐
              │  Local Disk Storage       │
              │  - backups/*.json         │
              │  - backups/logs/*.log     │
              └───────────────────────────┘
```

### Key Technical Characteristics
- **Zero Framework Bloat:** Vanilla ES6+ modules (`import`/`export`), standard DOM APIs, CSS Custom Properties.
- **Client Storage:** IndexedDB `LocalImageTextLibrary` (v1) storing raw image `Blob` objects.
- **Serverless Fallback:** Fully operational offline; when Python server is running, adds automated disk backups and file logging.
- **Cache-Busted Module Loading:** `index.html` loads all ES6 module scripts and CSS sheets with versioned parameters (`?v=7`).

---

## 2. Module Specifications & Detailed Usage

### Tab 1: 📋 Image & Text Library (`library`)

- **Identifier:** `library`
- **File:** `js/modules/library.js`
- **CSS:** `css/library.css`

#### Purpose
Organize, view, filter, copy, and maintain pairs of prompt text and generated images. Provides rich clipboard interaction, search, tagging, and group management.

#### Core Features
1. **Paired Card Gallery:**
   - Displays pairs of images and video prompts/text descriptions in responsive grid cards.
   - Natural numerical sorting: Titles starting with numbers (e.g. `1`, `2`, `10`, `28. Scene`) are sorted in natural human numerical sequence.
   - Favorite Star toggle (persisted in IndexedDB).
2. **Multi-Action Clipboard Copy Engine:**
   - **Copy Text:** Copies prompt/text to clipboard via `navigator.clipboard.writeText`.
   - **Copy Image:** Automatically normalizes any source image format (JPEG, WebP, PNG) into a standard PNG `Blob` via offscreen canvas, then writes to OS clipboard via `navigator.clipboard.write([new ClipboardItem({"image/png": blob})])`.
   - **Copy Both:** Copies formatted prompt text and image simultaneously.
3. **Group Management & Strict Deletion Cascade:**
   - Create new groups with custom names.
   - Sidebar group filter counts items in real time.
   - **Deletion Rule:** When a group is deleted, **all items belonging to that group are permanently deleted from IndexedDB**.
   - **Startup Sweep:** On module load, cleans up orphan items whose groups were deleted or items with no group and no image.
4. **Tagging & Search:**
   - Dynamic tag cloud extracted from all items.
   - Instant search across Title, Prompt Text, and Tags.
5. **Item Completion & Done State (Greyed-Out):**
   - Quick one-click Done toggle button (`○` / `✓`) directly on each card header.
   - When marked as Done:
     - Card is visually greyed out (`opacity: 0.52`, `filter: grayscale(85%)`, subtle background).
     - Title displays a clean strikethrough.
     - Footer renders a green `✓ Done` pill.
     - On hover, opacity recovers to `0.88` to allow reviewing details or toggling incomplete with one click.
   - In Detail Modal: Toggle button switches between `✓ Mark as Done` and `✓ Completed (Mark Incomplete)`.
   - In Create/Edit Modal: Checkbox `✓ Mark as Done` allows presetting completion status.
   - In Bulk Actions: `✓ Mark Done` and `↩ Mark Incomplete` buttons allow marking multiple selected items simultaneously.
   - In Navigation Sidebar: Dedicated `⏳ Pending / Todo` and `✅ Done` filters with real-time count badges.
6. **Bulk Operations:**
   - Multi-select checkboxes on cards.
   - "Select All" / "Deselect All" button.
   - Bulk Mark Done, Bulk Mark Incomplete, and Bulk Delete buttons with item counts and confirmation.
7. **Export & Import:**
   - **Export / Auto-Backup:** Translates internal UUIDs into human-readable group names (e.g. `"group": "In"`), formats as formatted JSON, preserves `done` completion status, downloads locally, and automatically saves to `backups/` via `POST /save-backup`.
   - **Import JSON:** Merges or restores items, automatically creating referenced groups if they do not yet exist, and restoring `done` status.

---

### Tab 2: ✂️ 4-Panel Image Trimmer (`trimmer`)

- **Identifier:** `trimmer`
- **File:** `js/modules/trimmer.js`
- **CSS:** `css/trimmer.css`

#### Purpose
Upload 2×2 composite images (e.g. Midjourney grids), excise white dividing lines and borders using Computer Vision, and save 4 discrete cropped panels sequentially.

#### Core Features
1. **Computer Vision Divider & Border Detection:**
   - `findDivider()`: Evaluates pixel luminance in central cross-sections (`y` for horizontal divider, `x` for vertical divider). Identifies white gutter regions (`R > 232, G > 232, B > 232`) and calculates exact boundary cuts (`before` and `after`).
   - `trimEdges()`: Scans outer 8% margins to automatically eliminate solid white external border pixels.
2. **Sequence Numbering:**
   - Auto-detects filename pattern (e.g. `1-4.jpg`, `5-8.png`) and initializes Sequence Start Number.
   - Manual sequence start number input with live preview (`1.jpg, 2.jpg, 3.jpg, 4.jpg`).
3. **Direct Disk Saving via File System Access API:**
   - `window.showDirectoryPicker()` allows users to choose a disk folder once.
   - Slices are saved directly to disk.
   - Fallback: browser downloads and one-click ZIP packaging via `JSZip`.
4. **Duplicate Protection & Conflict Management:**
   - **Pre-Save Collision Detection:** Checks if any planned output files (`1.jpg`, `2.jpg`, etc.) already exist in the chosen folder.
   - **Duplicate Filename Action Setting:**
     - `❓ Always Ask (Confirmation Dialog)` *(Default)*
     - `🛡️ Save with Unique Name (e.g. 1_1.jpg)`
     - `🔢 Auto-advance Sequence (use next free number)`
     - `⚠️ Overwrite (Replace existing files)`
   - **Conflict Modal Dialog:** If files exist and policy is `ask`, displays modal showing the conflicting files with buttons:
     - *Save with Unique Names*: Keeps existing files untouched, saves new panels as `1_1.jpg`, `2_1.jpg`, etc.
     - *Auto-advance Sequence*: Scans highest existing number in folder and re-numbers to next free sequence (e.g. `5.jpg`–`8.jpg`).
     - *Overwrite*: Overwrites existing files only after explicit user confirmation.
     - *Cancel*: Aborts saving safely.
   - **Folder Scan on Selection:** Choosing a folder scans for existing numeric images and automatically suggests the next available sequence start number.

---

### Tab 3: 🔄 Backup JSON Updater & Sync (`backup-updater`)

- **Identifier:** `backup-updater`
- **File:** `js/modules/backup-updater.js`
- **CSS:** `css/backup-updater.css`

#### Purpose
Takes external input JSON (e.g. generated prompt scripts) containing only `id`, `title`, and `text`, pairs with an image folder, and merges into the latest backup JSON while preserving existing images and assigning a target group name.

#### Core Features
1. **Target Group Assignment:**
   - User inputs a single Target Group Name (e.g. `In`, `Poems`, `SouthPark`).
   - Datalist auto-completes with existing groups from the base backup.
   - All input items are assigned to this group name.
2. **Base Backup Source:**
   - Automatically loads latest backup from `GET /api/latest-backup`.
   - "Refresh" button re-queries the server.
   - "Select Custom Backup JSON" allows manual base file selection.
3. **Smart Matching Hierarchy:**
   - **Priority 1 (Match by ID):** Matches `update.id === item.id`.
   - **Priority 2 (Match by Title in Target Group):** If ID doesn't match, matches by `item.title === update.title` within the target group.
   - **Priority 3 (Match by Title among Orphan Items):** Matches orphan items with `group: null` having the same title.
4. **Image Folder Pairing:**
   - User selects an image folder via directory picker (`<input webkitdirectory>`).
   - Slices/images are mapped by filename without extension (e.g. `1.png` → title `"1"`).
   - Matched images are converted to Base64 data URLs and attached to items.
5. **Orphan & Duplicate Cleaning Options:**
   - `🧹 Purge imageless ghost items`: Removes orphan items with no group and no image, and purges imageless duplicates within the target group.
   - `🎯 Match by Title if ID doesn't match`: Prevents creating duplicate entries for items with UUIDs.
   - `🔄 Replace all existing items in Target Group`: Wipes existing items from the target group before inserting new ones.
6. **Diff & Action Panel:**
   - Real-time diff table previewing status (`Updated` / `New Item`), Old Title → New Title, Group, and Text preview.
   - **Update Backup In-Place:** Overwrites the current base file on disk (`POST /api/update-backup` with `overwrite: true`).
   - **Save as New Snapshot:** Creates a new timestamped file `library-backup-YYYYMMDD_HHMMSS.json`.
   - **Download JSON File:** Direct client download.
   - **Apply & Sync into Active Library:** Directly syncs merged items into browser IndexedDB.

---

### Tab 4: 🪟 Grid Slicer (N-Tiles) (`grid-splitter`)

- **Identifier:** `grid-splitter`
- **File:** `js/modules/grid-splitter.js`
- **CSS:** `css/trimmer.css`

#### Purpose
General-purpose image slicing tool that splits any image into an arbitrary $N$-tile grid ($1\times1$, $2\times2$, $3\times3$, $4\times4$, etc.) with custom per-tile naming arguments and batch ZIP packaging.

#### Core Features
1. **Dynamic Grid Layout Calculation:**
   - User specifies total number of tiles (e.g. 9).
   - System computes: `cols = Math.ceil(Math.sqrt(count))`, `rows = Math.ceil(count / cols)`.
2. **Per-Tile Custom Naming Arguments:**
   - Automatically renders input fields for each tile label (e.g. `crop_1.png`, `crop_2.png`, or custom suffixes like `scene_A`, `scene_B`).
3. **Canvas Slicing & ZIP Packaging:**
   - Slices image on canvas and generates data URLs.
   - Result preview grid with individual tile downloads.
   - "Download All as ZIP" compiles all slices into a single ZIP archive via `JSZip`.

---

## 3. Core Services & Global Features

### Central App Kernel (`js/app.js`)
- **Module Registration:** `App.registerModule(config)` dynamically adds tools to navigation.
- **Module Navigation:** Renders `#moduleNav` dynamically with icons and names.
- **Tab Switching:** `switchModule(targetId)` hides inactive viewports (`.module-viewport`), activates selected container, updates URL hash `#moduleId`, and initializes the module on first mount.
- **Toast Notifications:** `App.showToast(message, type, duration)` shows floating success, error, or info toasts.

### Settings & About Modal
- **Location:** Header gear icon (`#appSettingsBtn`) in top-left.
- **Contents:**
  - **Theme Toggle:** Switch between ☀️ Light Mode and 🌙 Dark Mode.
  - **Shortcuts:** One-click shortcut to YouTube Creator Studio (`https://studio.youtube.com/`).
  - **Open Logs Folder Button:** `#openLogsFolderBtn` button triggers `GET /api/open-logs` to directly open the physical `backups/logs/` directory in Windows Explorer.
  - **About:** Displays app name (🐼 Panda Studio), developer name (**Vishal**), active version, and activity log directory path (`backups/logs/`).

### App Branding & Icons
- **Browser Tab:** `favicon.svg` (crisp scalable Panda face with studio badge and red dot).
- **Windows Executable:** `panda.ico` embedded directly into `dist\PandaStudio.exe`.
- **Title Banner:** "🐼 Panda Studio" across header and CLI output.

### Light / Dark Theme System
- Controlled via `data-theme="dark"` attribute on `<html>` root.
- Persistent in `localStorage` (`panda_studio_theme`).
- Complete color palette mapped via CSS variables in `css/app.css`:
  - Light mode: Clean modern slate/blue styling.
  - Dark mode: Charcoal background (`#0f172a`), deep card surfaces (`#1e293b`), crisp borders (`#334155`), bright readable text (`#f8fafc`).

### Real-Time Activity Logging Engine
- Every user action across all 4 tabs and the app shell is logged with Tab No., Tab ID, Action description, and timestamp.
- **Client Dispatch:** `App.log(moduleId, action, details)` logs to console and dispatches async `POST /api/log`.
- **Automatic Event Interception:** `setupModuleActionLogging()` automatically intercepts clicks on buttons, toggles on checkboxes, and file selections inside each module container.
- **Disk Persistence:** `server.py` writes to dated log files: `backups/logs/app-YYYY-MM-DD.log`.
- **Flush & Sync:** Explicit buffer flush and `os.fsync` guarantee logs are written to disk immediately.

### Server API Endpoints (`server.py`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves `index.html` and static files (`js/`, `css/`) |
| `GET` | `/api/status` | Returns server health, active port, app name, backup and log directories |
| `GET` | `/api/latest-backup` | Returns newest valid backup file metadata and parsed JSON data |
| `GET` | `/api/logs` | Returns list of log files in `backups/logs/` with size and mtime |
| `GET` / `POST` | `/api/open-logs` | Opens the physical `backups/logs/` directory in Windows Explorer |
| `GET` / `POST` | `/api/open-folder` | Alias for `/api/open-logs` to open folder in OS file manager |
| `POST` | `/save-backup` | Saves backup JSON into `backups/library-backup-YYYYMMDD_HHMMSS.json` |
| `POST` | `/api/update-backup` | Updates existing backup in-place or creates new timestamped file |
| `POST` | `/api/log` | Appends formatted action log line to `backups/logs/app-YYYY-MM-DD.log` |

---

### Standalone Windows Executable (`PandaStudio.exe`)

Panda Studio can run directly as a single portable Windows executable (`dist\PandaStudio.exe`) without requiring Python, Git, or any external runtime dependencies installed on the user's machine.

#### Packaging Specifications
- **Build Tool:** PyInstaller 6.x (`pyinstaller`)
- **Specification File:** `PandaStudio.spec`
- **Output Executable:** `dist\PandaStudio.exe` (~9.4 MB)
- **Application Icon:** Embedded `panda.ico` (256x256 multi-resolution icon)
- **One-Click Build Script:** `build_exe.bat`

#### Runtime Path Resolution Architecture
In `server.py`, the backend detects whether it is running as source code or frozen inside a PyInstaller single-file package:

```python
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    BUNDLE_DIR = Path(sys._MEIPASS).resolve()           # Read-only bundled assets
    EXE_DIR = Path(sys.executable).resolve().parent      # Directory containing PandaStudio.exe
else:
    BUNDLE_DIR = Path(__file__).resolve().parent
    EXE_DIR = BUNDLE_DIR

BACKUP_DIR = EXE_DIR / "backups"
LOGS_DIR = BACKUP_DIR / "logs"
CONFIG_FILE = EXE_DIR / "config.json"
```

1. **Bundled Read-Only Assets (`BUNDLE_DIR`):**
   - Extracted automatically by PyInstaller into `%TEMP%/_MEIxxxx/`.
   - Contains: `index.html`, `favicon.svg`, `css/`, `js/`, and base `config.json`.
   - Served cleanly by `LocalLibraryHandler` via HTTP.
2. **Persistent User Data (`EXE_DIR`):**
   - User backups (`backups/*.json`) and logs (`backups/logs/*.log`) are always written next to `PandaStudio.exe` on physical disk, never inside the temporary folder.
   - User overrides for `config.json` next to the `.exe` take precedence over the bundled default.
3. **Windows Console Encoding Protection:**
   - Both `sys.stdout` and `sys.stderr` are configured on startup with `reconfigure(encoding="utf-8", errors="replace", line_buffering=True)` to prevent `UnicodeEncodeError` (e.g. `charmap` / `cp1252`) on standard Windows Command Prompts.

#### Building the Executable
To recompile the standalone binary after making codebase modifications:
```cmd
build_exe.bat
```
Or via shell:
```bash
python -m PyInstaller --clean PandaStudio.spec
```

---

## 4. Conditions & Business Rules

1. **Tab Ordering & Badges:**
   - Tabs must appear in exact order: (1) `library`, (2) `trimmer`, (3) `backup-updater`, (4) `grid-splitter`.
   - Secondary blue badges (`.brand-badge`, `.tab-badge`) are permanently removed.
2. **Library Group Deletion:**
   - Deleting a group MUST delete all items assigned to that group from IndexedDB.
   - Never set item group to `null` or leave orphan items behind when a group is deleted.
3. **Trimmer Duplicate Prevention:**
   - NEVER silently overwrite files in the selected disk folder.
   - When a file exists, either ask via confirmation modal or save with unique suffix (`_1`, `_2`).
4. **Backup Updater Merging:**
   - Merge must never produce duplicate entries for the same scene/title.
   - Imageless orphan items with `group: null` must be purged.
   - Existing binary images must never be deleted unless replaced by a new image.
5. **ES6 Module Cache Busting:**
   - Whenever modifying any `.js` or `.css` file, increment the version query parameter (e.g. `?v=7` → `?v=8`) across all module imports in `index.html` and stylesheet `<link>` tags.

---

## 5. Complete Verification & Test Case Suite

### Test Suite 1: Library Module (Tab 1)

#### TC-1.1: New Item Creation
- **Steps:** Click `＋ New Item`, enter Title "Scene 1", choose Group "Poems", enter description text, click `Save Item`.
- **Expected:** Item appears in the cards grid with Title and Group badge. Item count increments.
- **Verification:** Refresh page; item persists in IndexedDB.

#### TC-1.2: Image Paste & File Upload
- **Steps:** In Item modal, paste an image from clipboard (Ctrl+V) or click `Choose Image File` and select a PNG/JPG.
- **Expected:** Image preview appears in modal. Saving the item displays the image on the card.

#### TC-1.3: Natural Numerical Sorting
- **Steps:** Create items with titles "1", "2", "10", "3", "20".
- **Expected:** Cards sort in order: 1, 2, 3, 10, 20 (not 1, 10, 2, 20, 3).

#### TC-1.4: Clipboard Copy Image / Text
- **Steps:** On an item card, click `📋 Image`.
- **Expected:** Toast indicates "Image copied to clipboard". Paste into an external app (Paint, Discord, Telegram); image pastes cleanly.
- **Steps:** Click `📋 Text`.
- **Expected:** Toast indicates text copied. Paste into Notepad; exact text is pasted.

#### TC-1.5: Group Creation & Filtering
- **Steps:** Click `＋` next to Groups in sidebar, enter group name "SciFi", click `Create Group`.
- **Expected:** "SciFi" appears in group list with count `0`. Clicking the group filters the gallery.

#### TC-1.6: Group Deletion Cascade (Item Removal)
- **Steps:** Assign 2 items to group "SciFi". In sidebar, click `✕` next to "SciFi". Confirm deletion prompt.
- **Expected:** Group "SciFi" is removed. **Both items belonging to "SciFi" are deleted from the database and no longer appear under "All Items"**.

#### TC-1.7: Multi-Select & Bulk Delete
- **Steps:** Check checkboxes on 2 cards. Header displays `Delete Selected (2)`. Click `Delete Selected (2)` and confirm.
- **Expected:** Both selected items are removed from IndexedDB and gallery.

#### TC-1.8: Export / Auto-Backup
- **Steps:** Click `📤 Export / Backup`.
- **Expected:** JSON file downloads via browser, and server console confirms `[Backup] Successfully saved: backups/library-backup-YYYYMMDD_HHMMSS.json`. File contains items with readable group names.

#### TC-1.9: Import Backup JSON
- **Steps:** Click `📥 Import JSON`, choose a backup file with a new group "Fantasy".
- **Expected:** Items are imported, group "Fantasy" is automatically created, and items display under that group.

#### TC-1.10: Item Completion & Greyed-Out Visual State
- **Steps:** On an active card in the gallery, click the top-right completion toggle `○`.
- **Expected:**
  1. Toggle icon immediately switches to a green checkmark `✓`.
  2. The entire card becomes greyed out (`opacity: 0.52`, `grayscale(85%)`).
  3. The item title receives a strikethrough.
  4. Card footer renders a green `✓ Done` pill badge.
  5. Sidebar badges update: `Pending / Todo` count decrements, `Done` count increments.
  6. Action is logged to disk via `/api/log`.
- **Steps:** Refresh the browser page.
- **Expected:** Done status and greyed-out appearance persist from IndexedDB.
- **Steps:** Click the green checkmark `✓` button again.
- **Expected:** Card restores to full opacity, title strikethrough is removed, and it returns to active/pending state.

#### TC-1.11: Sidebar Done / Pending Filtering & Bulk Completion
- **Steps:** In the sidebar navigation, click `⏳ Pending / Todo`.
- **Expected:** Gallery filters to show only uncompleted items.
- **Steps:** Click `✅ Done`.
- **Expected:** Gallery filters to show only completed (greyed-out) items.
- **Steps:** Select 3 checkboxes on cards. Header displays `✓ Mark Done` and `↩ Mark Incomplete`. Click `✓ Mark Done`.
- **Expected:** All 3 items are marked as done in bulk and immediately become greyed out.

---

### Test Suite 2: 4-Panel Trimmer Module (Tab 2)

#### TC-2.1: Image Slicing & Border Removal
- **Steps:** Drag and drop a 2×2 grid image (e.g. `1-4.jpg`). Click `⚡ Trim & Save 4 Panels`.
- **Expected:** Original image is sliced into 4 panels with white gutters and outer borders trimmed. 4 result cards display with dimensions and download buttons.

#### TC-2.2: Sequence Start Number Auto-Detection
- **Steps:** Drop a file named `5-8.png`.
- **Expected:** Start number input automatically updates to `5`. Sequence preview shows `5.png, 6.png, 7.png, 8.png`.

#### TC-2.3: Direct Folder Save
- **Steps:** Click `📁 Choose Folder`, select an empty directory. Click `⚡ Trim & Save 4 Panels`.
- **Expected:** 4 image files are saved directly into that directory without browser download prompts.

#### TC-2.4: Duplicate File Detection & Conflict Modal (Unique Name Option)
- **Steps:** With the same folder selected, click `⚡ Trim & Save 4 Panels` again with start number `1`.
- **Expected:** Conflict modal appears listing `1.jpg, 2.jpg, 3.jpg, 4.jpg` as existing files.
- **Action:** Click `🛡️ Save with Unique Names`.
- **Expected:** Existing `1.jpg`–`4.jpg` remain untouched. New panels are saved as `1_1.jpg, 2_1.jpg, 3_1.jpg, 4_1.jpg`. Result cards show the unique filenames.

#### TC-2.5: Conflict Modal — Auto-Advance Sequence Option
- **Steps:** In a folder with `1.jpg`–`4.jpg`, trigger trim with start number `1`.
- **Action:** In conflict modal, click `🔢 Auto-advance Sequence Number`.
- **Expected:** Sequence number advances to `5`. Files are saved as `5.jpg, 6.jpg, 7.jpg, 8.jpg`. Start number input updates to `5`.

#### TC-2.6: Conflict Modal — Overwrite Option
- **Steps:** Trigger trim where files exist. Click `⚠️ Overwrite Existing Files`.
- **Expected:** Existing files are updated with the new trimmed slices.

#### TC-2.7: Conflict Modal — Cancel Option
- **Steps:** Trigger trim where files exist. Click `Cancel`.
- **Expected:** Modal closes. No files are written or overwritten. Status reports `Save cancelled to protect existing files`.

#### TC-2.8: Folder Auto-Scan on Selection
- **Steps:** Have `1.png` through `4.png` in a folder. Click `📁 Choose Folder` and pick that folder.
- **Expected:** Folder label shows `Selected: folder_name (contains images up to #4)`. Start number input auto-adjusts to `5`.

#### TC-2.9: Batch ZIP Download
- **Steps:** Trim an image. Click `📦 Download All as ZIP`.
- **Expected:** ZIP file `trimmed_panels_X-Y.zip` downloads containing all 4 slices.

---

### Test Suite 3: Backup JSON Updater Module (Tab 3)

#### TC-3.1: Fetch Latest Backup
- **Steps:** Navigate to Tab 3.
- **Expected:** Status reads `✓ Latest Backup Loaded from Server`. File name, Existing Items count, and Groups count populate accurately.

#### TC-3.2: Merge Updates by ID
- **Steps:** Input JSON containing `id: "clip01"`, `title: "1"`, `text: "New text"`. Set Target Group "In". Click `⚡ Process & Merge Updates`.
- **Expected:** Existing item `clip01` updates its title, text, and timestamp. Diff table shows status `Updated`.

#### TC-3.3: Merge Updates by Title (UUID Reconciliation)
- **Steps:** Base backup has an item with `id: "uuid-1234"`, `title: "2"`. Input JSON has `id: "clip02"`, `title: "2"`.
- **Expected:** Title match links the input to `uuid-1234`. Item updates without creating a duplicate. Diff count shows 1 updated, 0 added.

#### TC-3.4: Image Folder Attachment
- **Steps:** Provide update JSON for titles "1", "2", "3". Select image folder containing `1.png`, `2.png`, `3.png`. Click `⚡ Process & Merge Updates`.
- **Expected:** Images are read as Base64 data URLs and attached to items 1, 2, and 3.

#### TC-3.5: Purge Imageless Ghost Items
- **Steps:** Base backup contains 2 orphan items with `group: null` and `image: null`. Ensure `Purge imageless ghost items` checkbox is checked. Click `⚡ Process & Merge Updates`.
- **Expected:** Orphan items are purged. Output contains exactly the expected input items, with zero ghost items.

#### TC-3.6: Replace All Items in Target Group
- **Steps:** Check `Replace all existing items in Target Group`. Target Group "In" previously had 10 items. Input JSON has 3 items. Click `⚡ Process & Merge Updates`.
- **Expected:** Old 10 items in "In" are removed. Output contains only the 3 new items in group "In". Items in other groups are unaffected.

#### TC-3.7: In-Place Disk Update
- **Steps:** Click `💾 Update Backup File In-Place`.
- **Expected:** Server console logs `[Backup Update] Saved to: backups/library-backup-...json`. Server returns `overwritten: true`.

#### TC-3.8: Sync to IndexedDB
- **Steps:** Click `✨ Apply & Sync into Active Library (IndexedDB)`.
- **Expected:** Toast indicates `Successfully synced items to active library`. Switch to Tab 1; gallery immediately displays updated items.

---

### Test Suite 4: Grid Slicer Module (Tab 4)

#### TC-4.1: Custom Grid Dimensions
- **Steps:** Upload image, set Number of Tiles to `9`.
- **Expected:** Grid calculation hint shows `Grid layout: 3 columns × 3 rows`. 9 tile argument fields render.

#### TC-4.2: Slice Generation & Custom Labels
- **Steps:** Enter custom label "intro" for tile 1. Click `⚡ Slice Grid`.
- **Expected:** 9 sliced cards appear in results grid. Tile 1 is named `crop_intro.png`.

#### TC-4.3: ZIP Export
- **Steps:** Click `📦 Download All as ZIP`.
- **Expected:** ZIP file `grid_slices_9_tiles.zip` downloads containing all 9 slices.

---

### Test Suite 5: Kernel, Themes, Logging & Settings

#### TC-5.1: Settings Modal & Developer Info
- **Steps:** Click gear icon `⚙️` in top-left header.
- **Expected:** Modal opens displaying Developer name **Vishal** and shortcut button to YouTube Studio.
- **Steps:** Click `Open YouTube Studio`.
- **Expected:** Opens `https://studio.youtube.com/` in a new browser tab.

#### TC-5.2: Light / Dark Theme Toggle
- **Steps:** In Settings modal, click `🌙 Dark`.
- **Expected:** Entire UI immediately transitions to dark mode. Document root receives `data-theme="dark"`.
- **Steps:** Refresh page.
- **Expected:** Dark theme persists from `localStorage`.
- **Steps:** Click `☀️ Light`.
- **Expected:** UI switches back to light mode.

#### TC-5.3: Server Status Health Indicator
- **Steps:** Launch with Python server running.
- **Expected:** Status pill in top-right displays green dot and `Server Online`.
- **Steps:** Stop Python server.
- **Expected:** Status pill displays red dot and `Offline Mode`.

#### TC-5.4: Activity Logging to Disk
- **Steps:** Perform actions: switch tabs, click trim, merge backup.
- **Expected:** Check `backups/logs/app-YYYY-MM-DD.log`.
- **Verification:** File contains lines with timestamp, tab identifier, and action description:
  ```text
  [2026-11-19 20:45:00] [Tab 2: trimmer] Executed 4-panel trim: saved files 1.jpg - 4.jpg
  ```

#### TC-5.5: Open Logs Folder Action
- **Steps:** Open Settings modal (`⚙️`), click button `Open Logs Folder (backups/logs/)`.
- **Expected:** Button shows brief loading state; Windows Explorer opens pointing directly to the `backups/logs/` directory. Toast indicates `Opened logs folder in Explorer`.

---

### Test Suite 6: Backend HTTP API

#### TC-6.1: API Status Endpoint
- **Command:** `curl -s http://127.0.0.1:6700/api/status`
- **Expected:** HTTP 200 with JSON: `{"status": "online", "app": "Panda Studio", "port": 6700, ...}`.

#### TC-6.2: Latest Backup Endpoint
- **Command:** `curl -s http://127.0.0.1:6700/api/latest-backup`
- **Expected:** HTTP 200 with `success: true`, newest file name, and parsed JSON payload containing `items` and `groups`.

#### TC-6.3: Log Writing Endpoint
- **Command:** `curl -X POST http://127.0.0.1:6700/api/log -H "Content-Type: application/json" -d '{"tab":"test","action":"verify"}'`
- **Expected:** HTTP 200 with `success: true`. Check log file; entry is appended immediately.

#### TC-6.4: Open Logs Endpoint
- **Command:** `curl -s http://127.0.0.1:6700/api/open-logs`
- **Expected:** HTTP 200 with `{"success": true, "opened": true, "path": "..."}` and triggers OS folder window.

---

### Test Suite 7: Standalone Windows Executable

#### TC-7.1: CLI Help Output & Character Encoding
- **Command:** `.\dist\PandaStudio.exe --help`
- **Expected:** Clean usage and options list displayed without throwing `UnicodeEncodeError` on Windows `cp1252` console code pages. Returns exit code 0.

#### TC-7.2: Custom Port via CLI Argument
- **Command:** `.\dist\PandaStudio.exe -p 6750 --no-browser`
- **Expected:** Server binds to port 6750. Console banner prints `Local URL  : http://localhost:6750` and `Port Source: command-line argument (--port 6750)`.

#### TC-7.3: Directory Portability & Disk Storage Isolation
- **Steps:** Copy `PandaStudio.exe` to an isolated folder (e.g. `C:\Users\VishalGupta\Desktop\TestPanda`). Double-click `PandaStudio.exe`.
- **Expected:**
  1. Default browser opens automatically to `http://localhost:6700`.
  2. A `backups\` folder and `backups\logs\` folder are automatically created in the folder next to `PandaStudio.exe`.
  3. Action logs are recorded in `backups\logs\app-YYYY-MM-DD.log`.
  4. Closing the console window stops the server cleanly.

