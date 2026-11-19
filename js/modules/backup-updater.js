/**
 * Module 4: Backup JSON Updater / Synchronizer
 * Takes an input JSON containing only { id, title, text, group } nodes,
 * merges it into the latest backup JSON (updating existing items or adding new ones),
 * sets remaining fields to current date/time defaults, and saves back to disk or IndexedDB.
 */

import { App } from "../app.js";
import { dbPut, dbGetAll } from "../utils/db.js";

export const BackupUpdaterModule = {
    id: "backup-updater",
    name: "Backup JSON Updater",
    icon: "🔄",

    state: {
        latestBackupData: null,
        latestBackupFilename: null,
        mergedResult: null,
        imageFolder: null
    },

    init(container, app) {
        this.container = container;
        this.app = app;
        this.render();
        this.bindEvents();
        this.fetchLatestBackup();
    },

    render() {
        this.container.innerHTML = `
            <div class="updater-container">
                <div class="updater-header">
                    <h2>🔄 Backup JSON Updater & Sync</h2>
                    <p>Provide an input JSON with only <code>id</code>, <code>title</code>, <code>text</code>, and <code>group</code>. Updates your latest backup JSON, sets missing timestamps to the current date/time, and preserves existing binary images.</p>
                </div>

                <div class="updater-grid">
                    <!-- LEFT COLUMN: Base Backup Status & Input File Picker -->
                    <div class="updater-card">
                        <div class="card-title-row">
                            <h3><span>📦 1. Target Backup</span></h3>
                            <button class="btn btn-sm" id="updaterRefreshBackupBtn" title="Fetch newest file from backups/ folder">🔄 Refresh</button>
                        </div>

                        <div class="backup-source-info" id="backupSourceCard">
                            <div class="source-stat-row">
                                <span>Status:</span>
                                <strong id="backupStatusText">Checking backups/ folder...</strong>
                            </div>
                            <div class="source-stat-row">
                                <span>File:</span>
                                <strong id="backupFilenameText" style="font-family:var(--font-mono); font-size:12px;">-</strong>
                            </div>
                            <div class="source-stat-row">
                                <span>Existing Items:</span>
                                <strong id="backupItemsCount">-</strong>
                            </div>
                            <div class="source-stat-row">
                                <span>Existing Groups:</span>
                                <strong id="backupGroupsCount">-</strong>
                            </div>
                        </div>

                        <div style="margin-top:auto;">
                            <label class="form-label">Or Choose a Different Backup File:</label>
                            <input type="file" id="updaterBaseFileInput" accept=".json" style="display:none;">
                            <button class="btn btn-sm" id="updaterPickBaseBtn" style="width:100%;">📁 Select Custom Backup JSON</button>
                        </div>
                    </div>

                    <!-- RIGHT COLUMN: Input Updates JSON -->
                    <div class="updater-card">
                        <div class="card-title-row">
                            <h3><span>📝 2. Input Updates JSON</span></h3>
                            <div style="display:flex; gap:6px;">
                                <button class="btn btn-sm" id="updaterTemplateBtn" title="Insert sample JSON">📋 Sample</button>
                                <button class="btn btn-sm" id="updaterUploadBtn">📂 Load File</button>
                                <input type="file" id="updaterPatchFileInput" accept=".json" style="display:none;">
                            </div>
                        </div>

                        <!-- Target Group Input Field -->
                        <div class="form-group" style="margin-bottom:14px;">
                            <label class="form-label" for="updaterTargetGroupInput">Target Group Name (Applies to all input items):</label>
                            <input type="text" id="updaterTargetGroupInput" class="form-input" list="updaterExistingGroupsList" placeholder="e.g. Poems, Scenes, Anthill Chronicles">
                            <datalist id="updaterExistingGroupsList"></datalist>
                            <div class="form-hint">Every item in this input will be assigned to this group name in the backup.</div>
                        </div>

                        <div class="form-hint" style="margin-bottom:8px;">
                            Input format: Object with items (like <code>test.json</code>) or array, containing <code>id</code>, <code>title</code>, and <code>text</code>:
                        </div>

                        <textarea id="updaterJsonTextarea" class="json-input-textarea" placeholder='{\n  "item1": {\n    "id": "abcd",\n    "title": "1",\n    "text": "SCENE 04 — THE ANT BABIES ARE IN DANGER..."\n  },\n  "item2": {\n    "id": "item2",\n    "title": "2",\n    "text": "SCENE 05 — THE WORKER ANTS..."\n  }\n}'></textarea>
<div class="form-group" style="margin-top:12px;">
    <label class="form-label" for="updaterImageFolder">📁 Image folder (optional)</label>
    <input type="file" id="updaterImageFolder" multiple webkitdirectory>
    <small>Images must be named exactly as the title (e.g. 1.jpg, 2.png). If not provided, image stays null.</small>
</div>

                        <!-- Merge & Sync Options -->
                        <div class="updater-options-box" style="margin-top:12px; display:flex; flex-direction:column; gap:6px; background:var(--bg-main); padding:10px 12px; border-radius:var(--radius-sm); border:1px solid var(--border);">
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12.5px; font-weight:600; color:var(--text-primary);">
                                <input type="checkbox" id="updaterPurgeOrphansCheckbox" checked>
                                <span>🧹 Purge imageless ghost items (removes orphan items with no group and no image)</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12.5px; font-weight:600; color:var(--text-primary);">
                                <input type="checkbox" id="updaterMatchTitleCheckbox" checked>
                                <span>🎯 Match by Title if ID doesn't match (prevents duplicate items for same title)</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12.5px; font-weight:600; color:var(--text-primary);">
                                <input type="checkbox" id="updaterReplaceGroupCheckbox">
                                <span>🔄 Replace all existing items in Target Group (syncs only input items into this group)</span>
                            </label>
                        </div>

                        <div style="margin-top:14px; display:flex; justify-content:space-between; align-items:center;">
                            <button class="btn btn-primary" id="updaterMergeBtn">
                                ⚡ Process & Merge Updates
                            </button>
                            <button class="btn btn-sm" id="updaterClearBtn">Clear</button>
                        </div>
                    </div>
                </div>

                <!-- BOTTOM SECTION: Results, Diff & Action Buttons -->
                <div id="updaterResultSection" style="display:none;">
                    <div class="diff-stats-banner">
                        <div class="diff-stat-item">
                            <span class="diff-stat-num" id="statUpdatedCount">0</span>
                            <span class="diff-stat-label">Items Updated</span>
                        </div>
                        <div class="diff-stat-item">
                            <span class="diff-stat-num" id="statAddedCount" style="color:var(--success);">0</span>
                            <span class="diff-stat-label">New Items Added</span>
                        </div>
                        <div class="diff-stat-item">
                            <span class="diff-stat-num" id="statGroupsCount" style="color:var(--accent);">0</span>
                            <span class="diff-stat-label">New Groups Created</span>
                        </div>
                        <div class="diff-stat-item">
                            <span class="diff-stat-num" id="statTotalCount">0</span>
                            <span class="diff-stat-label">Total Items in Output</span>
                        </div>
                    </div>

                    <!-- Diff Table -->
                    <div class="diff-table-wrap">
                        <table class="diff-table">
                            <thead>
                                <tr>
                                    <th>Status</th>
                                    <th>Item ID</th>
                                    <th>Title (Old → New)</th>
                                    <th>Group Name</th>
                                    <th>Text Preview</th>
                                </tr>
                            </thead>
                            <tbody id="diffTableBody"></tbody>
                        </table>
                    </div>

                    <!-- Action Buttons -->
                    <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center; background:white; padding:18px 24px; border-radius:var(--radius-lg); border:1px solid var(--border);">
                        <button class="btn btn-primary" id="updaterSaveInPlaceBtn">
                            💾 Update Backup File In-Place
                        </button>
                        <button class="btn" id="updaterSaveNewSnapshotBtn">
                            📤 Save as New Timestamped Backup
                        </button>
                        <button class="btn" id="updaterDownloadBtn">
                            ⬇️ Download JSON File
                        </button>
                        <button class="btn btn-success" id="updaterSyncLibraryBtn" style="margin-left:auto;">
                            ✨ Apply & Sync into Active Library (IndexedDB)
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    bindEvents() {
        const root = this.container;

        root.querySelector("#updaterRefreshBackupBtn").onclick = () => this.fetchLatestBackup();

        // Custom base file upload
        const pickBaseBtn = root.querySelector("#updaterPickBaseBtn");
        const baseFileInput = root.querySelector("#updaterBaseFileInput");
        pickBaseBtn.onclick = () => baseFileInput.click();
        baseFileInput.onchange = e => this.handleCustomBaseFile(e);

        // Input JSON upload
        const uploadBtn = root.querySelector("#updaterUploadBtn");
        const patchFileInput = root.querySelector("#updaterPatchFileInput");
        uploadBtn.onclick = () => patchFileInput.click();
        patchFileInput.onchange = e => this.handlePatchFileUpload(e);

        // Sample template
        root.querySelector("#updaterTemplateBtn").onclick = () => this.insertSampleTemplate();
        root.querySelector("#updaterClearBtn").onclick = () => {
            root.querySelector("#updaterJsonTextarea").value = "";
            root.querySelector("#updaterResultSection").style.display = "none";
        };

        // Merge button
        root.querySelector("#updaterMergeBtn").onclick = () => this.processMerge();

        // Save actions
        root.querySelector("#updaterSaveInPlaceBtn").onclick = () => this.saveToDisk(true);
        root.querySelector("#updaterSaveNewSnapshotBtn").onclick = () => this.saveToDisk(false);
        root.querySelector("#updaterDownloadBtn").onclick = () => this.downloadJson();
        root.querySelector("#updaterSyncLibraryBtn").onclick = () => this.syncToIndexedDB();

        // Image folder selector
        root.querySelector("#updaterImageFolder").onchange = e => this.handleImageFolderSelect(e);
    },

    handleImageFolderSelect(event) {
        const files = Array.from(event.target.files || []);
        this.state.imageFolder = files.length > 0 ? files : null;
        this.app.log(this.id, `Image folder selected (${files.length} files)`, files.map(f => f.name));
        if (files.length > 0) {
            this.app.showToast(`Selected ${files.length} image files from folder`, "info");
        }
    },

    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    },

    async fetchLatestBackup() {
        const statusText = this.container.querySelector("#backupStatusText");
        const filenameText = this.container.querySelector("#backupFilenameText");
        const itemsCount = this.container.querySelector("#backupItemsCount");
        const groupsCount = this.container.querySelector("#backupGroupsCount");

        statusText.textContent = "Connecting to server...";

        try {
            const res = await fetch("/api/latest-backup");
            const result = await res.json();

            if (res.ok && result.success && result.data) {
                this.state.latestBackupData = result.data;
                this.state.latestBackupFilename = result.filename;

                statusText.textContent = "✓ Latest Backup Loaded from Server";
                statusText.style.color = "var(--success)";
                filenameText.textContent = result.filename;
                itemsCount.textContent = `${(result.data.items || []).length} items`;
                groupsCount.textContent = `${(result.data.groups || []).length} groups`;
                this.populateExistingGroupsList();
                this.app.log(this.id, `Loaded backup from server: ${result.filename}`, { items: (result.data.items || []).length, groups: (result.data.groups || []).length });
                this.app.showToast(`Loaded ${result.filename}`, "success");
            } else {
                throw new Error(result.error || "No backups found");
            }
        } catch (err) {
            this.app.log(this.id, `Failed to fetch server backup: ${err.message}`);
            statusText.textContent = "No server backup found (use custom file below)";
            statusText.style.color = "var(--text-muted)";
            filenameText.textContent = "None";
            itemsCount.textContent = "-";
            groupsCount.textContent = "-";
        }
    },

    populateExistingGroupsList() {
        const datalist = this.container.querySelector("#updaterExistingGroupsList");
        const input = this.container.querySelector("#updaterTargetGroupInput");
        if (!datalist || !this.state.latestBackupData) return;

        datalist.innerHTML = "";
        const groupNames = (this.state.latestBackupData.groups || []).map(g => {
            return typeof g === "object" && g !== null && g.name ? g.name : String(g);
        }).filter(Boolean);

        groupNames.forEach(name => {
            const opt = document.createElement("option");
            opt.value = name;
            datalist.appendChild(opt);
        });

        if (input && !input.value.trim() && groupNames.length > 0) {
            input.value = groupNames[0];
        }
    },

    async handleCustomBaseFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (!data.items || !Array.isArray(data.items)) {
                throw new Error("Invalid backup JSON structure");
            }

            this.state.latestBackupData = data;
            this.state.latestBackupFilename = file.name;

            const root = this.container;
            root.querySelector("#backupStatusText").textContent = "✓ Custom Base File Loaded";
            root.querySelector("#backupStatusText").style.color = "var(--primary)";
            root.querySelector("#backupFilenameText").textContent = file.name;
            root.querySelector("#backupItemsCount").textContent = `${data.items.length} items`;
            root.querySelector("#backupGroupsCount").textContent = `${(data.groups || []).length} groups`;
            this.populateExistingGroupsList();
            this.app.log(this.id, `Custom base backup loaded: ${file.name}`, { items: data.items.length, groups: (data.groups || []).length });
            this.app.showToast(`Loaded ${file.name}`, "success");
        } catch (err) {
            this.app.showToast(`Could not read file: ${err.message}`, "error");
        } finally {
            event.target.value = "";
        }
    },

    async handlePatchFileUpload(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            // Validate JSON
            JSON.parse(text);
            this.container.querySelector("#updaterJsonTextarea").value = text;
            this.app.log(this.id, `Input patch JSON file loaded: ${file.name}`);
            this.app.showToast(`Loaded updates from ${file.name}`, "success");
        } catch (err) {
            this.app.showToast(`Invalid JSON file: ${err.message}`, "error");
        } finally {
            event.target.value = "";
        }
    },

    insertSampleTemplate() {
        let sampleId = "abcd";
        if (this.state.latestBackupData?.items?.[0]) {
            sampleId = this.state.latestBackupData.items[0].id;
        }

        // Format matching test.json: dictionary of items with id, title, and text
        const template = {
            "item1": {
                "id": sampleId,
                "title": "1",
                "text": "SCENE 04 — THE ANT BABIES ARE IN DANGER (10 SECONDS)\n\nVIDEO PROMPT:\nCreate a dramatic underground cutaway view of the damaged anthill. Show an intricate network of earthen tunnels and chambers filled with tiny white ant eggs and baby larvae."
            },
            "item2": {
                "id": "new-item-02",
                "title": "2",
                "text": "SCENE 05 — WORKER ANTS GATHER SUPPLIES (10 SECONDS)\n\nVIDEO PROMPT:\nClose up macro view of industrious worker ants tenderly carrying white larvae away from falling soil debris."
            }
        };

        this.container.querySelector("#updaterJsonTextarea").value = JSON.stringify(template, null, 4);

        const targetGroupInput = this.container.querySelector("#updaterTargetGroupInput");
        if (targetGroupInput && !targetGroupInput.value.trim()) {
            targetGroupInput.value = "Poems";
        }

        this.app.log(this.id, "Sample template inserted into Input JSON");
        this.app.showToast("Sample template (test.json format) inserted", "info");
    },

    async processMerge() {
        if (!this.state.latestBackupData) {
            this.app.showToast("Please load a base backup JSON first.", "error");
            return;
        }

        const targetGroupInput = this.container.querySelector("#updaterTargetGroupInput");
        const targetGroupName = (targetGroupInput?.value || "").trim();

        if (!targetGroupName) {
            this.app.showToast("Please specify a Target Group Name on the panel.", "error");
            targetGroupInput?.focus();
            return;
        }

        const rawText = this.container.querySelector("#updaterJsonTextarea").value.trim();
        if (!rawText) {
            this.app.showToast("Please enter or upload update JSON.", "error");
            return;
        }

        let updateItems = [];
        try {
            const parsed = JSON.parse(rawText);
            if (Array.isArray(parsed)) {
                updateItems = parsed;
            } else if (parsed && Array.isArray(parsed.items)) {
                updateItems = parsed.items;
            } else if (typeof parsed === "object" && parsed !== null) {
                // Dictionary of items like test.json: { "item1": { id, title, text }, ... }
                updateItems = Object.entries(parsed).map(([key, val]) => {
                    if (typeof val === "object" && val !== null) {
                        return {
                            id: val.id || key,
                            title: val.title,
                            text: val.text
                        };
                    }
                    return { id: key, text: String(val) };
                });
            } else {
                throw new Error("JSON must be an object with items or an array.");
            }
        } catch (err) {
            this.app.showToast(`JSON Syntax Error: ${err.message}`, "error");
            return;
        }

        if (updateItems.length === 0) {
            this.app.showToast("No update items found in JSON.", "error");
            return;
        }

        // Clone base data to avoid destructive changes before confirmation
        const merged = JSON.parse(JSON.stringify(this.state.latestBackupData));
        if (!Array.isArray(merged.items)) merged.items = [];
        if (!Array.isArray(merged.groups)) merged.groups = [];

        // Normalize groups array to clean names if legacy format was [{id, name}]
        const legacyIdToName = new Map();
        const currentGroupNames = new Set();

        merged.groups = merged.groups.map(g => {
            if (typeof g === "object" && g !== null && g.name) {
                if (g.id) legacyIdToName.set(g.id, g.name.trim());
                currentGroupNames.add(g.name.trim().toLowerCase());
                return g.name.trim();
            } else if (typeof g === "string") {
                currentGroupNames.add(g.trim().toLowerCase());
                return g.trim();
            }
            return String(g);
        });

        // Ensure the specified target group name exists in groups
        let newGroupsCount = 0;
        if (!currentGroupNames.has(targetGroupName.toLowerCase())) {
            merged.groups.push(targetGroupName);
            currentGroupNames.add(targetGroupName.toLowerCase());
            newGroupsCount++;
        }

        // Read merge/sync options
        const purgeOrphans = this.container.querySelector("#updaterPurgeOrphansCheckbox")?.checked ?? true;
        const matchByTitle = this.container.querySelector("#updaterMatchTitleCheckbox")?.checked ?? true;
        const replaceGroup = this.container.querySelector("#updaterReplaceGroupCheckbox")?.checked ?? false;

        // If replaceGroup is selected, remove all existing items in the target group
        if (replaceGroup) {
            const beforeTargetCount = merged.items.length;
            merged.items = merged.items.filter(item => {
                const g = item.group ? String(item.group).trim().toLowerCase() : "";
                return g !== targetGroupName.toLowerCase();
            });
            const removedFromGroup = beforeTargetCount - merged.items.length;
            if (removedFromGroup > 0) {
                this.app.log(this.id, `Replaced target group: removed ${removedFromGroup} existing items from "${targetGroupName}"`);
            }
        }

        // If purgeOrphans is enabled, clean up orphan items with no group and no image
        if (purgeOrphans) {
            const beforeCount = merged.items.length;
            merged.items = merged.items.filter(item => {
                const hasGroup = item.group && String(item.group).trim() !== "" && item.group !== "null";
                const hasImage = Boolean(item.image);
                return hasGroup || hasImage;
            });
            const purgedCount = beforeCount - merged.items.length;
            if (purgedCount > 0) {
                this.app.log(this.id, `Purged ${purgedCount} imageless orphan item(s)`);
            }
        }

        // If any groups were removed from the original backup, delete items belonging to them
        const originalGroups = Array.isArray(this.state.latestBackupData.groups)
            ? this.state.latestBackupData.groups.map(g => (typeof g === "object" && g !== null && g.name) ? g.name : String(g))
            : [];
        const deletedGroups = originalGroups.filter(g => !merged.groups.includes(g));
        if (deletedGroups.length > 0) {
            merged.items = merged.items.filter(item => !deletedGroups.includes(item.group));
            this.app.showToast(`Removed ${deletedGroups.length} groups and their items`, "info");
        }

        let updatedCount = 0;
        let addedCount = 0;
        const diffList = [];
        const now = Date.now();

        // Build image map from selected folder: title (without extension) → File
        const imgMap = new Map();
        if (this.state.imageFolder && this.state.imageFolder.length > 0) {
            for (const file of this.state.imageFolder) {
                // Only consider image files
                if (!file.type.startsWith("image/")) continue;
                // Strip extension to get the title key: "1.jpg" → "1", "2.png" → "2"
                const nameWithoutExt = file.name.replace(/\.[^.]+$/, "").trim();
                imgMap.set(nameWithoutExt, file);
            }
            console.log("[BackupUpdater] Image map built:", [...imgMap.keys()]);
        }

        for (const update of updateItems) {
            if (!update || !update.id) continue;

            const updateId = String(update.id).trim();
            const newTitle = update.title != null ? String(update.title).trim() : null;
            const newText = update.text != null ? String(update.text) : null;

            // Find item in existing backup
            // Priority 1: Direct match by item ID
            let existingItem = merged.items.find(i => String(i.id).trim() === updateId);

            // Priority 2: Match by Title within target group
            if (!existingItem && matchByTitle && newTitle !== null) {
                existingItem = merged.items.find(i =>
                    i.group &&
                    String(i.group).trim().toLowerCase() === targetGroupName.toLowerCase() &&
                    String(i.title).trim() === newTitle
                );
            }

            // Priority 3: Match by Title among unassigned/orphan items
            if (!existingItem && matchByTitle && newTitle !== null) {
                existingItem = merged.items.find(i =>
                    (!i.group || i.group === "null") &&
                    String(i.title).trim() === newTitle
                );
            }

            if (existingItem) {
                // UPDATE EXISTING ITEM
                const oldTitle = existingItem.title || "Untitled";

                existingItem.id = updateId;
                if (newTitle !== null) existingItem.title = newTitle;
                if (newText !== null) existingItem.text = newText;

                // Assign the target group name
                existingItem.group = targetGroupName;

                // Update timestamp to current date/time
                existingItem.updatedAt = now;

                // Attach image from folder if available
                if (imgMap.has(existingItem.title)) {
                    const imgFile = imgMap.get(existingItem.title);
                    console.log(`[BackupUpdater] Reading image for existing item title "${existingItem.title}" from ${imgFile.name}`);
                    existingItem.image = await this.readFileAsDataURL(imgFile);
                }

                updatedCount++;

                diffList.push({
                    id: updateId,
                    status: "updated",
                    oldTitle,
                    newTitle: existingItem.title,
                    group: targetGroupName,
                    textSnippet: existingItem.text || ""
                });
            } else {
                // ADD NEW ITEM WITH DEFAULT VALUES FOR CURRENT DATE/TIME
                const itemTitle = newTitle !== null ? newTitle : "Untitled";
                let itemImage = null;
                if (imgMap.has(itemTitle)) {
                    const imgFile = imgMap.get(itemTitle);
                    console.log(`[BackupUpdater] Reading image for new item title "${itemTitle}" from ${imgFile.name}`);
                    itemImage = await this.readFileAsDataURL(imgFile);
                }

                const newItem = {
                    id: updateId,
                    title: itemTitle,
                    text: newText !== null ? newText : "",
                    group: targetGroupName,
                    favorite: false,
                    tags: [],
                    image: itemImage,
                    createdAt: now,
                    updatedAt: now
                };

                merged.items.push(newItem);
                addedCount++;

                diffList.push({
                    id: updateId,
                    status: "new",
                    oldTitle: "-",
                    newTitle: newItem.title,
                    group: targetGroupName,
                    textSnippet: newItem.text || ""
                });
            }
        }

        // Post-merge duplicate cleanup: if an item has an image, remove any duplicate with the same title that has no image
        if (purgeOrphans) {
            const titlesWithImage = new Set(
                merged.items
                    .filter(i => i.group && String(i.group).toLowerCase() === targetGroupName.toLowerCase() && Boolean(i.image))
                    .map(i => String(i.title).trim())
            );

            const beforeDups = merged.items.length;
            merged.items = merged.items.filter(item => {
                if (item.group && String(item.group).toLowerCase() === targetGroupName.toLowerCase()) {
                    if (!item.image && titlesWithImage.has(String(item.title).trim())) {
                        return false;
                    }
                }
                return true;
            });
            const dupsRemoved = beforeDups - merged.items.length;
            if (dupsRemoved > 0) {
                this.app.log(this.id, `Removed ${dupsRemoved} duplicate imageless item(s)`);
            }
        }

        merged.version = 2;
        merged.exportedAt = new Date().toISOString();

        const stats = {
            updated: updatedCount,
            added: addedCount,
            newGroups: newGroupsCount,
            total: merged.items.length
        };

        this.state.mergedResult = {
            data: merged,
            stats,
            diff: diffList
        };

        this.renderDiffSection();
        this.app.log(this.id, `Process & Merge completed: ${updatedCount} updated, ${addedCount} added into group "${targetGroupName}"`, stats);
        this.app.showToast(`Merged ${updatedCount} updates, added ${addedCount} new items into group "${targetGroupName}"`, "success");
    },

    renderDiffSection() {
        const { stats, diff } = this.state.mergedResult;
        const root = this.container;

        root.querySelector("#statUpdatedCount").textContent = stats.updated;
        root.querySelector("#statAddedCount").textContent = stats.added;
        root.querySelector("#statGroupsCount").textContent = stats.newGroups;
        root.querySelector("#statTotalCount").textContent = stats.total;

        const tbody = root.querySelector("#diffTableBody");
        tbody.innerHTML = "";

        diff.forEach(d => {
            const tr = document.createElement("tr");

            const statusBadge = d.status === "updated"
                ? `<span class="badge-updated">Updated</span>`
                : `<span class="badge-new">New Item</span>`;

            const titleDisplay = d.status === "updated"
                ? `<span style="color:var(--text-muted); text-decoration:line-through;">${this.escapeHtml(d.oldTitle)}</span> → <strong>${this.escapeHtml(d.newTitle)}</strong>`
                : `<strong>${this.escapeHtml(d.newTitle)}</strong>`;

            const snippet = d.textSnippet.length > 70
                ? `${d.textSnippet.slice(0, 70)}...`
                : d.textSnippet;

            tr.innerHTML = `
                <td>${statusBadge}</td>
                <td><code>${this.escapeHtml(d.id)}</code></td>
                <td>${titleDisplay}</td>
                <td><span class="card-tag">${this.escapeHtml(d.group)}</span></td>
                <td style="color:var(--text-secondary); font-size:12px;">${this.escapeHtml(snippet)}</td>
            `;
            tbody.appendChild(tr);
        });

        root.querySelector("#updaterResultSection").style.display = "block";
        root.querySelector("#updaterResultSection").scrollIntoView({ behavior: "smooth" });
    },

    async saveToDisk(overwrite = false) {
        if (!this.state.mergedResult) return;

        try {
            const payload = {
                filename: this.state.latestBackupFilename,
                data: this.state.mergedResult.data,
                overwrite: overwrite
            };

            const res = await fetch("/api/update-backup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const result = await res.json();

            if (res.ok && result.success) {
                this.state.latestBackupFilename = result.filename;
                this.state.latestBackupData = this.state.mergedResult.data;
                this.container.querySelector("#backupFilenameText").textContent = result.filename;
                this.app.log(this.id, `Saved backup to disk: ${result.filename} (overwrite: ${overwrite})`);
                this.app.showToast(`Saved to ${result.filename}!`, "success");
            } else {
                throw new Error(result.error || "Save failed");
            }
        } catch (err) {
            console.error(err);
            this.app.showToast(`Server save failed: ${err.message}. Use 'Download JSON File' instead.`, "error");
        }
    },

    downloadJson() {
        if (!this.state.mergedResult) return;

        const data = this.state.mergedResult.data;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        a.download = `updated-backup-${ts}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        this.app.log(this.id, `Downloaded updated backup JSON: ${a.download}`);
        this.app.showToast("Downloaded updated backup JSON", "success");
    },

    async syncToIndexedDB() {
        if (!this.state.mergedResult) return;

        if (!confirm("Apply these updates directly into your active Image & Text Library? Existing items and groups in your browser will be updated.")) {
            return;
        }

        const data = this.state.mergedResult.data;
        const existingGroups = await dbGetAll("groups");
        const existingItems = await dbGetAll("items");

        // 1. Ensure all groups exist in IndexedDB
        for (const gName of data.groups) {
            if (!gName) continue;
            const exists = existingGroups.some(g => g.name.toLowerCase() === gName.toLowerCase());
            if (!exists) {
                const newGrp = { id: crypto.randomUUID(), name: gName };
                existingGroups.push(newGrp);
                await dbPut("groups", newGrp);
            }
        }

        // 2. Put items into IndexedDB
        for (const item of data.items) {
            // Map group name to group ID
            let groupId = null;
            if (item.group) {
                const grp = existingGroups.find(g => g.name.toLowerCase() === item.group.toLowerCase());
                if (grp) groupId = grp.id;
            }

            const existing = existingItems.find(i => i.id === item.id);

            // Convert data-URL image to Blob for IndexedDB (library expects Blob)
            let imageBlob = existing ? existing.image : null;
            if (item.image && typeof item.image === "string" && item.image.startsWith("data:")) {
                try {
                    const res = await fetch(item.image);
                    imageBlob = await res.blob();
                } catch (e) {
                    console.warn(`[BackupUpdater] Could not convert image for item ${item.id}:`, e);
                }
            }

            const record = {
                id: item.id,
                title: item.title,
                text: item.text,
                group: groupId,
                favorite: !!item.favorite,
                tags: item.tags || [],
                image: imageBlob,
                createdAt: item.createdAt || Date.now(),
                updatedAt: item.updatedAt || Date.now()
            };

            await dbPut("items", record);
        }

        this.app.log(this.id, `Synced merged data to IndexedDB: ${data.items.length} items, ${data.groups.length} groups`);
        this.app.showToast("Active library database synced successfully!", "success");

        // If Library module is loaded, refresh its data
        const libMod = App.modules.get("library");
        if (libMod && libMod.initialized) {
            libMod.loadData();
        }
    },

    escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};
