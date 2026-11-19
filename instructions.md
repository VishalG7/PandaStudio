# 🤖 Panda Studio — AI Model & Developer Guidelines

> **Target Audience:** AI Assistants (GPT, Gemini, Claude) & Contributing Engineers  
> **Purpose:** Mandated engineering rules, structural invariants, and verification procedures for making changes to this codebase without causing regressions.

---

## ⚠️ Non-Negotiable Hard Rules & Invariants

When modifying this repository, you **MUST** adhere to the following rules:

### 1. Tab Order & Module IDs
Do not change tab order, module IDs, or display names unless explicitly instructed:
1. **Tab 1 (`library`):** `LibraryModule` (`js/modules/library.js`) — *"Image & Text Library"*
2. **Tab 2 (`trimmer`):** `TrimmerModule` (`js/modules/trimmer.js`) — *"4-Panel Image Trimmer"*
3. **Tab 3 (`backup-updater`):** `BackupUpdaterModule` (`js/modules/backup-updater.js`) — *"Backup JSON Updater"*
4. **Tab 4 (`grid-splitter`):** `GridSplitterModule` (`js/modules/grid-splitter.js`) — *"Grid Slicer (N-Tiles)"*

### 2. Tab 1 Group Deletion Semantics
- **Rule:** When a user deletes a group, **ALL items assigned to that group MUST be deleted from IndexedDB** (`dbDelete("items", item.id)`).
- **Forbidden:** Never set `item.group = null` or leave items orphaned when a group is deleted.
- **Startup Protection:** `LibraryModule.loadData()` sweeps IndexedDB on mount to purge any imageless items whose group no longer exists or is null.

### 3. Tab 2 File Overwrite & Duplicate Protection
- **Rule:** When saving cropped panels directly to disk via File System Access API (`showDirectoryPicker`), **NEVER silently overwrite an existing file**.
- **Required Logic:**
  1. Probe whether any planned filenames (`1.jpg`, `2.jpg`, etc.) exist using `fileExistsInDir(dirHandle, name)`.
  2. If files exist:
     - If policy is `"ask"`: Show the confirmation modal (`#trimmerConflictModal`).
     - If policy is `"unique"`: Generate safe suffixes via `findUniqueFileName(dirHandle, desiredName)` (e.g. `1_1.jpg`).
     - If policy is `"advance"`: Automatically advance to the next free integer sequence (`5.jpg`–`8.jpg`).
     - Only overwrite if the user explicitly clicked the red `Overwrite Existing Files` button.

### 4. Tab 3 Backup Merging & Ghost Item Prevention
- **Rule:** Merging prompt JSON into a base backup must **never** create duplicate items for the same title/scene.
- **Hierarchy:**
  1. Match by `update.id === item.id`.
  2. If not matched, match by `item.title === update.title` within the target group.
  3. If not matched, match by title among unassigned/orphan items.
- **Orphan Cleanup:** Always filter out items that have both `group: null` and `image: null`, and remove imageless duplicates in the target group if an image exists for that title.

### 5. ES6 Module Cache-Busting Requirement
- **Rule:** Web browsers cache ES6 modules aggressively. Whenever you edit any `.js` file in `js/` or any `.css` file in `css/`, you **MUST increment the version query parameter `?v=N`** across:
  - All `<script type="module">` import paths in `index.html`.
  - All `<link rel="stylesheet">` tags in `index.html`.

### 6. Verification Before Completion
Before ending your turn or reporting completion, you **MUST** run the following syntax verification commands:
```bash
node --check js/app.js js/modules/backup-updater.js js/modules/grid-splitter.js js/modules/library.js js/modules/trimmer.js js/utils/db.js
python -c "import server; print('server ok')"
```
If any file throws a syntax error, fix it immediately.

### 7. Action Logging Requirement
- Every user action (clicks, file picks, merges, theme changes) must call `this.app.log(this.id, "Action description", details)`.
- This ensures actions are recorded in `backups/logs/app-YYYY-MM-DD.log`.

### 8. Branding & Settings Protection
- App Name: **Panda Studio** with panda icon `🐼`.
- App Icons: Scalable browser tab icon `favicon.svg`, Windows application icon `panda.ico`.
- Top-left header contains `⚙️` Settings button `#appSettingsBtn`.
- Settings modal contains:
  - Developer Name: **Vishal**
  - Shortcut link: `https://studio.youtube.com/` (opens YouTube Studio)
  - Theme toggles: ☀️ Light / 🌙 Dark
  - Open Logs Folder button: `#openLogsFolderBtn` (calls `/api/open-logs` to reveal `backups/logs/` in Windows Explorer)
- Secondary blue brand badges (`.brand-badge`, `.tab-badge`) are permanently removed. Do not restore them.

### 9. Theme Styling Compatibility
- When adding new CSS or HTML components, use CSS Custom Properties from `css/app.css`:
  - `var(--bg-main)`, `var(--bg-card)`, `var(--bg-subtle)`
  - `var(--text-primary)`, `var(--text-secondary)`, `var(--text-muted)`
  - `var(--border)`, `var(--radius-sm)`, `var(--radius-md)`, `var(--radius-lg)`
  - `var(--primary)`, `var(--success)`, `var(--danger)`, `var(--warning)`
- Ensure all elements render with high contrast and proper legibility in both Light and Dark (`[data-theme="dark"]`) modes.

### 10. Port Configuration Precedence
- The server port is configurable via (in order of priority):
  1. CLI argument (`python server.py -p <port>` or positional `python server.py <port>`)
  2. Environment variable (`PORT` or `PANDA_PORT`)
  3. `config.json` (`"port": 6700`)
  4. Default fallback: `6700`
- Do not hardcode port numbers inside module code; client-side endpoints use relative URLs (e.g. `/api/status`, `/api/log`).

### 11. Standalone Windows Executable Build Invariants
- `PandaStudio.spec` bundles all static client assets (`index.html`, `favicon.svg`, `config.json`, `css/`, `js/`) and sets the application icon to `panda.ico`.
- When modifying `server.py`:
  - Always preserve `sys.frozen` path resolution: `BUNDLE_DIR` for read-only static files (`sys._MEIPASS`), and `EXE_DIR` (`Path(sys.executable).parent`) for user data (`backups/`, `backups/logs/`, `config.json`).
  - Always maintain `sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)` to prevent Windows console `cp1252` encoding crashes.
  - Rebuild the executable after major server or asset changes via `build_exe.bat` or `python -m PyInstaller --clean PandaStudio.spec`.

---

## 🏛 Micro-Kernel Architecture & Adding New Modules

Each module must follow the standard contract:

```javascript
import { App } from "../app.js";

export const MyNewModule = {
    id: "my-tool",              // Unique URL hash & DOM ID
    name: "My Tool Name",       // Display name on tab
    icon: "🚀",                 // Tab icon

    init(container, app) {
        this.container = container;
        this.app = app;
        this.render();
        this.bindEvents();
    },

    render() {
        this.container.innerHTML = `
            <div class="my-tool-container">
                <!-- Module DOM -->
            </div>
        `;
    },

    bindEvents() {
        // Attach DOM event listeners
    },

    onActivate() {
        // Optional: fired when user switches to this tab
    },

    onDeactivate() {
        // Optional: fired when user leaves this tab
    }
};
```

Register in `index.html`:
```javascript
import { MyNewModule } from "./js/modules/my-new-tool.js?v=N";
App.registerModule(MyNewModule);
```

---

## 📁 Key File Locations

- `index.html`: Master application shell, header, navigation, and modal backdrops.
- `server.py`: Python HTTP backend (`ThreadingHTTPServer`), backup APIs, and disk logger.
- `start.bat`: One-click Windows batch launcher.
- `css/app.css`: App-wide styles, theme tokens, modal styles, and toast notifications.
- `js/app.js`: Central kernel `AppKernel`, theme switcher, and logging dispatcher.
- `js/modules/library.js`: Tab 1 (Image & Text Library).
- `js/modules/trimmer.js`: Tab 2 (4-Panel Image Trimmer).
- `js/modules/backup-updater.js`: Tab 3 (Backup JSON Updater).
- `js/modules/grid-splitter.js`: Tab 4 (Grid Slicer).
- `js/utils/db.js`: IndexedDB promise helper (`openDatabase`, `dbPut`, `dbGetAll`, `dbDelete`).
- `tech.md`: Comprehensive tool architecture, conditions, and test cases.
- `instructions.md`: This guide.
