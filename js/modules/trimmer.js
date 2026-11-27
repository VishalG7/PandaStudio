/**
 * Module 1: 4-Panel Image Trimmer
 * Splits 2x2 images into 4 panels, removes white separator borders,
 * and automatically saves them sequentially (e.g., 1-4.jpg -> 1.jpg, 2.jpg, 3.jpg, 4.jpg).
 */

import { App } from "../app.js";

export const TrimmerModule = {
    id: "trimmer",
    name: "4-Panel Image Trimmer",
    icon: "✂️",

    state: {
        selectedFile: null,
        selectedFiles: [], // array of { id, file, startNumber, extension, url, width, height, status }
        imageObject: null,
        sourceUrl: null,
        outputDirectory: null,
        startNumber: 1,
        extension: "jpg",
        croppedResults: [] // array of { blob, name, width, height, url }
    },

    init(container, app) {
        this.container = container;
        this.app = app;
        this.render();
        this.bindEvents();
        this.initConflictPolicy();
    },

    render() {
        this.container.innerHTML = `
            <div class="trimmer-container">
                <div class="trimmer-header">
                    <h2>✂️ 4-Panel Image Trimmer</h2>
                    <p>Upload a 2×2 composite image (e.g. Midjourney grid). Automatically detects and excises white dividing lines, trims outer borders, and sequentially saves as <strong>1.jpg, 2.jpg, 3.jpg, 4.jpg</strong>.</p>
                </div>

                <div class="trimmer-card">
                    <div class="trimmer-grid-setup">
                        <!-- Dropzone -->
                        <div class="drop-area" id="trimmerDropArea">
                            <span class="drop-icon">🖼️</span>
                            <div class="drop-text" id="dropLabel">Click or Drag & Drop 2×2 Image(s)</div>
                            <div class="drop-sub" id="dropSub">Select one or multiple images (e.g. 1-4.jpg, 5-8.jpg, 9-12.jpg)</div>
                            <input type="file" id="trimmerFileInput" accept="image/*" multiple style="display:none;">
                        </div>

                        <!-- Settings -->
                        <div class="settings-box">
                            <div class="form-group">
                                <label class="form-label" for="trimmerStartNum">Sequence Start Number</label>
                                <input type="number" id="trimmerStartNum" class="form-input" min="0" value="1" placeholder="e.g. 1">
                                <div class="form-hint" id="sequencePreview">Output files: 1.jpg, 2.jpg, 3.jpg, 4.jpg</div>
                            </div>

                            <div class="folder-selector">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <span style="font-weight:600; font-size:13px;">Save Directly to Disk Folder</span>
                                    <button type="button" class="btn btn-sm" id="trimmerFolderBtn">📁 Choose Folder</button>
                                </div>
                                <div class="folder-path-pill" id="folderLabel">No folder chosen (downloads via browser)</div>
                                <div class="form-hint">Saves all 4 images directly to disk with duplicate protection.</div>
                            </div>

                            <div class="form-group" style="margin-top:2px;">
                                <label class="form-label" for="trimmerConflictPolicy">Duplicate Filename Protection</label>
                                <select id="trimmerConflictPolicy" class="form-select" style="font-size:12.5px;">
                                    <option value="ask" selected>❓ Always Ask (Confirmation Dialog)</option>
                                    <option value="unique">🛡️ Save with Unique Name (e.g. 1_1.jpg)</option>
                                    <option value="advance">🔢 Auto-advance Sequence (use next free number)</option>
                                    <option value="overwrite">⚠️ Overwrite (Replace existing files)</option>
                                </select>
                                <div class="form-hint">Protects your existing images whenever a file with the same name exists.</div>
                            </div>
                        </div>
                    </div>

                    <div class="trimmer-actions">
                        <button type="button" class="btn btn-primary" id="executeTrimBtn" disabled>
                            ⚡ Trim & Save 4 Panels
                        </button>
                        <button type="button" class="btn btn-success" id="downloadZipBtn" style="display:none;">
                            📦 Download All as ZIP
                        </button>
                        <button type="button" class="btn btn-sm" id="clearQueueBtn" style="display:none;">
                            ✕ Clear Queue
                        </button>
                        <span class="status-badge" id="trimmerStatus">Select an image to begin.</span>
                    </div>
                </div>

                <!-- Multi-Image Batch Queue -->
                <div class="trimmer-queue-card" id="trimmerQueueSection" style="display:none;">
                    <div class="trimmer-queue-header">
                        <h3><span>📚 Batch Queue</span> <span class="queue-count-pill" id="queueCountPill">0 images</span></h3>
                        <span class="form-hint">Files are processed in sequence order. Adjust any start number below if needed.</span>
                    </div>
                    <div class="trimmer-queue-list" id="trimmerQueueList"></div>
                </div>

                <!-- Previews & Results -->
                <div class="results-section" id="trimmerPreviewSection" style="display:none;">
                    <!-- Source Image -->
                    <div class="source-card">
                        <h3>
                            <span>Original Image</span>
                            <span id="sourceDimensions" style="font-size:12px; font-weight:normal; color:var(--text-muted);"></span>
                        </h3>
                        <div class="source-img-wrap">
                            <img id="trimmerSourceImg" alt="Source">
                        </div>
                    </div>

                    <!-- 4 Panels Output -->
                    <div class="panels-card">
                        <h3>
                            <span>Trimmed Results (Top-L, Top-R, Bottom-L, Bottom-R)</span>
                            <span id="panelsCountBadge" style="font-size:12px; font-weight:normal; color:var(--text-muted);"></span>
                        </h3>
                        <div class="panel-results-grid" id="panelResultsGrid"></div>
                    </div>
                </div>

                <!-- File Conflict Confirmation Modal -->
                <div class="modal-backdrop" id="trimmerConflictModal">
                    <div class="modal-window" style="max-width: 500px;">
                        <div class="modal-header">
                            <h3 class="modal-title" style="display:flex; align-items:center; gap:8px; color:var(--warning, #d97706);">
                                <span>⚠️</span> Existing Files Detected
                            </h3>
                            <button class="modal-close-btn" id="closeConflictModalBtn" type="button" title="Close">✕</button>
                        </div>
                        <div class="modal-body" style="padding: 20px 24px; display:flex; flex-direction:column; gap:16px;">
                            <p style="margin:0; font-size:13.5px; line-height:1.5; color:var(--text-secondary);">
                                The following <strong id="conflictCountLabel">file(s)</strong> already exist in <code id="conflictFolderLabel" style="font-family:var(--font-mono); font-size:12px; color:var(--primary); background:var(--bg-card); padding:2px 6px; border-radius:4px; border:1px solid var(--border);"></code>:
                            </p>
                            <div id="conflictFilesList" style="background:var(--bg-main); border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px 14px; max-height:110px; overflow-y:auto; font-family:var(--font-mono); font-size:12.5px; color:var(--text-primary); display:flex; flex-direction:column; gap:4px;"></div>
                            <div style="font-size:13px; font-weight:600; color:var(--text-primary);">
                                Choose how you want to save these 4 trimmed panels:
                            </div>
                            <div style="display:flex; flex-direction:column; gap:10px;">
                                <button type="button" class="btn btn-primary" id="conflictUniqueBtn" style="justify-content:flex-start; text-align:left; padding:10px 14px; gap:10px;">
                                    <span style="font-size:16px;">🛡️</span>
                                    <div>
                                        <div style="font-weight:600; font-size:13.5px;">Save with Unique Names (Recommended)</div>
                                        <div style="font-size:11.5px; opacity:0.85; font-weight:normal;">Keeps existing images intact and saves new panels as <span id="conflictUniquePreview" style="font-family:var(--font-mono); font-weight:600;">1_1.jpg</span></div>
                                    </div>
                                </button>
                                <button type="button" class="btn" id="conflictAutoAdvanceBtn" style="justify-content:flex-start; text-align:left; padding:10px 14px; gap:10px;">
                                    <span style="font-size:16px;">🔢</span>
                                    <div>
                                        <div style="font-weight:600; font-size:13.5px;">Auto-advance Sequence Number</div>
                                        <div style="font-size:11.5px; opacity:0.85; font-weight:normal;">Renumber sequence to next free numbers: <span id="conflictAdvancePreview" style="font-family:var(--font-mono); font-weight:600;">5.jpg - 8.jpg</span></div>
                                    </div>
                                </button>
                                <button type="button" class="btn btn-danger" id="conflictOverwriteBtn" style="justify-content:flex-start; text-align:left; padding:10px 14px; gap:10px;">
                                    <span style="font-size:16px;">⚠️</span>
                                    <div>
                                        <div style="font-weight:600; font-size:13.5px;">Overwrite Existing Files</div>
                                        <div style="font-size:11.5px; opacity:0.85; font-weight:normal;">Replaces the existing files in the folder with the new panels</div>
                                    </div>
                                </button>
                            </div>
                        </div>
                        <div class="modal-footer" style="padding:12px 24px; border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                            <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-muted); cursor:pointer;">
                                <input type="checkbox" id="conflictRememberChoice">
                                <span>Remember choice for this session</span>
                            </label>
                            <button type="button" class="btn btn-sm" id="conflictCancelBtn">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    bindEvents() {
        const dropArea = this.container.querySelector("#trimmerDropArea");
        const fileInput = this.container.querySelector("#trimmerFileInput");
        const folderBtn = this.container.querySelector("#trimmerFolderBtn");
        const trimBtn = this.container.querySelector("#executeTrimBtn");
        const zipBtn = this.container.querySelector("#downloadZipBtn");
        const startNumInput = this.container.querySelector("#trimmerStartNum");

        dropArea.onclick = () => fileInput.click();

        dropArea.addEventListener("dragover", e => {
            e.preventDefault();
            dropArea.classList.add("dragover");
        });

        dropArea.addEventListener("dragleave", () => {
            dropArea.classList.remove("dragover");
        });

        dropArea.addEventListener("drop", e => {
            e.preventDefault();
            dropArea.classList.remove("dragover");
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                this.handleFilesSelected(e.dataTransfer.files);
            }
        });

        fileInput.addEventListener("change", () => {
            if (fileInput.files && fileInput.files.length > 0) {
                this.handleFilesSelected(fileInput.files);
            }
        });

        folderBtn.addEventListener("click", () => this.handleFolderPick());
        trimBtn.addEventListener("click", () => this.executeTrim());
        zipBtn.addEventListener("click", () => this.downloadAsZip());
        this.container.querySelector("#clearQueueBtn")?.addEventListener("click", () => this.clearQueue());

        startNumInput.addEventListener("input", () => {
            const val = parseInt(startNumInput.value, 10);
            this.state.startNumber = isNaN(val) ? 1 : val;
            if (this.state.selectedFiles.length === 1) {
                this.state.selectedFiles[0].startNumber = this.state.startNumber;
            }
            this.updateSequencePreview();
        });
    },

    parseFileInfo(file, fallbackStart = 1) {
        const extRaw = file.name.split(".").pop().toLowerCase();
        const extension = ["jpg", "jpeg"].includes(extRaw) ? "jpg" : "png";
        const match = file.name.match(/(\d+)-(\d+)\.(jpg|jpeg|png|webp|bmp)$/i);
        const startNumber = match ? parseInt(match[1], 10) : fallbackStart;
        return {
            id: crypto.randomUUID(),
            file,
            startNumber,
            hasExplicitRange: Boolean(match),
            extension,
            url: URL.createObjectURL(file),
            width: 0,
            height: 0,
            status: "pending"
        };
    },

    clearQueue() {
        this.state.selectedFiles.forEach(item => {
            if (item.url) URL.revokeObjectURL(item.url);
        });
        if (this.state.sourceUrl) {
            URL.revokeObjectURL(this.state.sourceUrl);
            this.state.sourceUrl = null;
        }
        this.state.selectedFiles = [];
        this.state.selectedFile = null;
        this.state.imageObject = null;
        this.state.croppedResults = [];

        this.container.querySelector("#trimmerFileInput").value = "";
        this.container.querySelector("#executeTrimBtn").disabled = true;
        this.container.querySelector("#executeTrimBtn").textContent = "⚡ Trim & Save 4 Panels";
        this.container.querySelector("#downloadZipBtn").style.display = "none";
        this.container.querySelector("#clearQueueBtn").style.display = "none";
        this.container.querySelector("#trimmerQueueSection").style.display = "none";
        this.container.querySelector("#trimmerPreviewSection").style.display = "none";
        this.container.querySelector("#panelResultsGrid").innerHTML = "";
        this.container.querySelector("#dropLabel").textContent = "Click or Drag & Drop 2×2 Image(s)";
        this.container.querySelector("#dropSub").textContent = "Select one or multiple images (e.g. 1-4.jpg, 5-8.jpg, 9-12.jpg)";
        this.container.querySelector("#trimmerStatus").textContent = "Select an image to begin.";
    },

    async handleFilesSelected(fileList) {
        const imageFiles = Array.from(fileList).filter(f => f.type.startsWith("image/"));
        if (imageFiles.length === 0) {
            this.app.showToast("Please select valid image files.", "error");
            return;
        }

        // Clean up previous URLs
        this.state.selectedFiles.forEach(item => {
            if (item.url) URL.revokeObjectURL(item.url);
        });
        if (this.state.sourceUrl) {
            URL.revokeObjectURL(this.state.sourceUrl);
            this.state.sourceUrl = null;
        }

        this.container.querySelector("#panelResultsGrid").innerHTML = "";
        this.container.querySelector("#downloadZipBtn").style.display = "none";
        this.state.croppedResults = [];

        let nextFallback = this.state.startNumber || 1;
        const parsed = imageFiles.map(file => {
            const info = this.parseFileInfo(file, nextFallback);
            nextFallback = info.startNumber + 4;
            return info;
        });

        // Sort sequentially by startNumber, then naturally by filename
        parsed.sort((a, b) => {
            if (a.startNumber !== b.startNumber) return a.startNumber - b.startNumber;
            return a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: "base" });
        });

        this.state.selectedFiles = parsed;

        if (parsed.length === 1) {
            // Single-image mode (retains original behavior)
            const single = parsed[0];
            this.state.selectedFile = single.file;
            this.state.extension = single.extension;
            this.state.startNumber = single.startNumber;
            this.container.querySelector("#trimmerStartNum").value = single.startNumber;
            this.container.querySelector("#trimmerStartNum").disabled = false;
            this.updateSequencePreview();

            this.container.querySelector("#trimmerQueueSection").style.display = "none";
            this.container.querySelector("#clearQueueBtn").style.display = "none";
            this.container.querySelector("#executeTrimBtn").disabled = false;
            this.container.querySelector("#executeTrimBtn").textContent = "⚡ Trim & Save 4 Panels";

            this.state.sourceUrl = URL.createObjectURL(single.file);
            const sourceImg = this.container.querySelector("#trimmerSourceImg");
            sourceImg.src = this.state.sourceUrl;

            this.state.imageObject = new Image();
            this.state.imageObject.src = this.state.sourceUrl;
            this.state.imageObject.onload = () => {
                const w = this.state.imageObject.naturalWidth;
                const h = this.state.imageObject.naturalHeight;
                single.width = w;
                single.height = h;
                this.container.querySelector("#sourceDimensions").textContent = `${w} × ${h}px`;
                this.container.querySelector("#dropLabel").textContent = single.file.name;
                this.container.querySelector("#dropSub").textContent = `${w} × ${h}px • ${(single.file.size / 1024).toFixed(1)} KB`;
                this.container.querySelector("#trimmerStatus").textContent = `Loaded ${single.file.name}. Ready to trim!`;
                this.container.querySelector("#trimmerPreviewSection").style.display = "grid";
                this.app.log(this.id, `Loaded 2x2 image "${single.file.name}"`, { dimensions: `${w}x${h}`, startNumber: this.state.startNumber });
            };
        } else {
            // Multi-image batch mode
            this.state.selectedFile = parsed[0].file;
            this.state.extension = parsed[0].extension;
            this.state.startNumber = parsed[0].startNumber;
            this.container.querySelector("#trimmerStartNum").value = parsed[0].startNumber;
            this.container.querySelector("#trimmerStartNum").disabled = true;

            this.container.querySelector("#dropLabel").textContent = `${parsed.length} Images Selected for Batch Trim`;
            this.container.querySelector("#dropSub").textContent = parsed.map(p => p.file.name).join(", ");
            this.container.querySelector("#executeTrimBtn").disabled = false;
            this.container.querySelector("#executeTrimBtn").textContent = `⚡ Trim & Save All (${parsed.length} Images / ${parsed.length * 4} Panels)`;
            this.container.querySelector("#clearQueueBtn").style.display = "inline-flex";
            this.container.querySelector("#trimmerPreviewSection").style.display = "none";
            this.container.querySelector("#trimmerStatus").textContent = `Queued ${parsed.length} images (${parsed.length * 4} total panels). Ready to trim!`;

            this.renderQueue();
            this.app.log(this.id, `Queued ${parsed.length} images for batch trim`, parsed.map(p => ({ name: p.file.name, start: p.startNumber })));
        }
    },

    renderQueue() {
        const section = this.container.querySelector("#trimmerQueueSection");
        const list = this.container.querySelector("#trimmerQueueList");
        const pill = this.container.querySelector("#queueCountPill");
        if (!section || !list) return;

        const files = this.state.selectedFiles;
        if (files.length <= 1) {
            section.style.display = "none";
            return;
        }

        section.style.display = "block";
        pill.textContent = `${files.length} images • ${files.length * 4} panels`;
        list.innerHTML = "";

        files.forEach((item, idx) => {
            const row = document.createElement("div");
            row.className = `trimmer-queue-item status-${item.status}`;
            const s = item.startNumber;
            const ext = item.extension;
            const outputPreview = `${s}.${ext} – ${s + 3}.${ext}`;

            let statusHtml = `<span class="queue-status-badge pending">Pending</span>`;
            if (item.status === "processing") statusHtml = `<span class="queue-status-badge processing">Trimming...</span>`;
            else if (item.status === "done") statusHtml = `<span class="queue-status-badge done">✓ Saved</span>`;
            else if (item.status === "cancelled") statusHtml = `<span class="queue-status-badge pending">Skipped</span>`;
            else if (item.status === "error") statusHtml = `<span class="queue-status-badge error">✕ Error</span>`;

            row.innerHTML = `
                <img class="queue-thumb" src="${item.url}" alt="">
                <div class="queue-info">
                    <div class="queue-filename">${idx + 1}. ${this.escapeHtml(item.file.name)}</div>
                    <div class="queue-meta">Output: <code>${outputPreview}</code> • ${(item.file.size / 1024).toFixed(1)} KB</div>
                </div>
                <div class="queue-start-wrap" title="Sequence start number for this image">
                    <label>Start #</label>
                    <input type="number" class="form-input queue-start-input" min="0" value="${item.startNumber}">
                </div>
                ${statusHtml}
                <button type="button" class="btn btn-sm btn-icon-only queue-remove-btn" title="Remove from queue">✕</button>
            `;

            const startInput = row.querySelector(".queue-start-input");
            startInput.addEventListener("input", () => {
                const v = parseInt(startInput.value, 10);
                item.startNumber = isNaN(v) ? 1 : v;
                row.querySelector(".queue-meta code").textContent = `${item.startNumber}.${ext} – ${item.startNumber + 3}.${ext}`;
            });

            row.querySelector(".queue-remove-btn").onclick = () => {
                if (item.url) URL.revokeObjectURL(item.url);
                this.state.selectedFiles = this.state.selectedFiles.filter(f => f.id !== item.id);
                if (this.state.selectedFiles.length === 0) {
                    this.clearQueue();
                } else if (this.state.selectedFiles.length === 1) {
                    const remaining = this.state.selectedFiles[0];
                    this.handleFilesSelected([remaining.file]);
                } else {
                    this.container.querySelector("#executeTrimBtn").textContent =
                        `⚡ Trim & Save All (${this.state.selectedFiles.length} Images / ${this.state.selectedFiles.length * 4} Panels)`;
                    this.renderQueue();
                }
            };

            list.appendChild(row);
        });
    },

    updateSequencePreview() {
        const s = this.state.startNumber;
        const ext = this.state.extension;
        const preview = `${s}.${ext}, ${s + 1}.${ext}, ${s + 2}.${ext}, ${s + 3}.${ext}`;
        this.container.querySelector("#sequencePreview").textContent = `Output files: ${preview}`;
    },

    initConflictPolicy() {
        const saved = localStorage.getItem("panda_trimmer_conflict_policy") || "ask";
        const select = this.container.querySelector("#trimmerConflictPolicy");
        if (select) {
            select.value = saved;
            select.addEventListener("change", () => {
                localStorage.setItem("panda_trimmer_conflict_policy", select.value);
                this.app.log(this.id, `Conflict policy set to "${select.value}"`);
            });
        }
    },

    async fileExistsInDir(dirHandle, fileName) {
        if (!dirHandle) return false;
        try {
            await dirHandle.getFileHandle(fileName, { create: false });
            return true;
        } catch (e) {
            return false;
        }
    },

    async findUniqueFileName(dirHandle, desiredName) {
        if (!dirHandle) return desiredName;
        const lastDot = desiredName.lastIndexOf(".");
        const stem = lastDot !== -1 ? desiredName.slice(0, lastDot) : desiredName;
        const ext = lastDot !== -1 ? desiredName.slice(lastDot) : "";

        let candidate = desiredName;
        let counter = 1;
        while (await this.fileExistsInDir(dirHandle, candidate)) {
            candidate = `${stem}_${counter}${ext}`;
            counter++;
        }
        return candidate;
    },

    async findNextAvailableSequenceStart(dirHandle, ext, count = 4) {
        if (!dirHandle) return 1;
        let maxFound = 0;
        try {
            if (typeof dirHandle.values === "function") {
                for await (const entry of dirHandle.values()) {
                    if (entry.kind === "file") {
                        const m = entry.name.match(/^(\d+)\.(jpg|jpeg|png|webp|bmp)$/i);
                        if (m) {
                            const val = parseInt(m[1], 10);
                            if (val > maxFound) maxFound = val;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("[Trimmer] Directory iteration fallback:", e);
        }

        if (maxFound > 0) {
            return maxFound + 1;
        }

        let probe = 1;
        while (await this.fileExistsInDir(dirHandle, `${probe}.${ext}`)) {
            probe++;
        }
        return probe;
    },

    promptConflictModal(existingCollisions, folderName, currentFirst, nextAvailableFirst, ext) {
        return new Promise((resolve) => {
            const modal = this.container.querySelector("#trimmerConflictModal");
            if (!modal) {
                resolve("unique");
                return;
            }

            const countLabel = modal.querySelector("#conflictCountLabel");
            const folderLabel = modal.querySelector("#conflictFolderLabel");
            const listContainer = modal.querySelector("#conflictFilesList");
            const uniquePreview = modal.querySelector("#conflictUniquePreview");
            const advancePreview = modal.querySelector("#conflictAdvancePreview");
            const rememberCheckbox = modal.querySelector("#conflictRememberChoice");

            if (countLabel) countLabel.textContent = `${existingCollisions.length} file${existingCollisions.length > 1 ? "s" : ""}`;
            if (folderLabel) folderLabel.textContent = folderName || "Folder";
            if (uniquePreview) {
                const sampleStem = existingCollisions[0].replace(/\.[^.]+$/, "");
                uniquePreview.textContent = `${sampleStem}_1.${ext}`;
            }
            if (advancePreview) {
                advancePreview.textContent = `${nextAvailableFirst}.${ext} - ${nextAvailableFirst + 3}.${ext}`;
            }

            if (listContainer) {
                listContainer.innerHTML = existingCollisions.map(f => `<div>📄 ${f}</div>`).join("");
            }

            modal.classList.add("show");

            const cleanup = () => {
                modal.classList.remove("show");
                modal.querySelector("#conflictUniqueBtn").onclick = null;
                modal.querySelector("#conflictAutoAdvanceBtn").onclick = null;
                modal.querySelector("#conflictOverwriteBtn").onclick = null;
                modal.querySelector("#conflictCancelBtn").onclick = null;
                modal.querySelector("#closeConflictModalBtn").onclick = null;
            };

            const handleChoice = (choice) => {
                if (rememberCheckbox && rememberCheckbox.checked && choice !== "cancel") {
                    const select = this.container.querySelector("#trimmerConflictPolicy");
                    if (select) {
                        select.value = choice;
                        localStorage.setItem("panda_trimmer_conflict_policy", choice);
                    }
                }
                cleanup();
                resolve(choice);
            };

            modal.querySelector("#conflictUniqueBtn").onclick = () => handleChoice("unique");
            modal.querySelector("#conflictAutoAdvanceBtn").onclick = () => handleChoice("advance");
            modal.querySelector("#conflictOverwriteBtn").onclick = () => handleChoice("overwrite");
            modal.querySelector("#conflictCancelBtn").onclick = () => handleChoice("cancel");
            modal.querySelector("#closeConflictModalBtn").onclick = () => handleChoice("cancel");
        });
    },

    async handleFolderPick() {
        if (!("showDirectoryPicker" in window)) {
            this.app.showToast("Folder selection is not supported in this browser. Downloads will proceed via browser.", "info");
            return;
        }

        try {
            this.state.outputDirectory = await window.showDirectoryPicker({ mode: "readwrite" });
            const nextSeq = await this.findNextAvailableSequenceStart(this.state.outputDirectory, this.state.extension, 4);

            let labelText = `Selected: ${this.state.outputDirectory.name}`;
            if (nextSeq > 1) {
                labelText += ` (contains images up to #${nextSeq - 1})`;
                if (this.state.startNumber === 1) {
                    this.state.startNumber = nextSeq;
                    this.container.querySelector("#trimmerStartNum").value = nextSeq;
                    this.updateSequencePreview();
                    this.app.showToast(`Folder has existing images. Next sequence start number auto-set to ${nextSeq}`, "info");
                }
            }
            this.container.querySelector("#folderLabel").textContent = labelText;
            this.app.log(this.id, `Output folder selected: "${this.state.outputDirectory.name}"`, { nextSequenceStart: nextSeq });
            this.app.showToast(`Output folder set to: ${this.state.outputDirectory.name}`, "success");
        } catch (err) {
            if (err.name !== "AbortError") {
                this.app.showToast("Could not access chosen folder.", "error");
            }
        }
    },

    /* =========================================================
       Computer Vision / Divider & Edge Trimming Algorithm
       ========================================================= */

    findDivider(data, w, h, horizontal) {
        const len = horizontal ? h : w;
        const span = horizontal ? w : h;
        const c = Math.floor(len / 2);
        const r = Math.max(12, Math.floor(len * 0.08));
        const s = Math.max(0, c - r);
        const e = Math.min(len - 1, c + r);
        const scores = [];

        for (let p = s; p <= e; p++) {
            let n = 0;
            for (let q = 0; q < span; q++) {
                const x = horizontal ? q : p;
                const y = horizontal ? p : q;
                const i = (y * w + x) * 4;
                const R = data[i], G = data[i + 1], B = data[i + 2];
                if (R > 232 && G > 232 && B > 232 && Math.max(R, G, B) - Math.min(R, G, B) < 24) {
                    n++;
                }
            }
            scores.push({ p, v: n / span });
        }

        const best = scores.reduce((a, b) => (b.v > a.v ? b : a));
        if (best.v < 0.52) return Math.floor(len / 2);

        let lo = best.p, hi = best.p;
        while (lo > s && (scores.find(z => z.p === lo - 1)?.v || 0) >= 0.52) lo--;
        while (hi < e && (scores.find(z => z.p === hi + 1)?.v || 0) >= 0.52) hi++;
        return { before: lo, after: hi + 1 };
    },

    trimEdges(ctx, canvas) {
        const w = canvas.width;
        const h = canvas.height;
        const d = ctx.getImageData(0, 0, w, h).data;

        const white = (x, y) => {
            const i = (y * w + x) * 4;
            const r = d[i], g = d[i + 1], b = d[i + 2];
            return r > 238 && g > 238 && b > 238 && Math.max(r, g, b) - Math.min(r, g, b) < 18;
        };

        const row = y => {
            let n = 0;
            for (let x = 0; x < w; x++) if (white(x, y)) n++;
            return n / w;
        };

        const col = x => {
            let n = 0;
            for (let y = 0; y < h; y++) if (white(x, y)) n++;
            return n / h;
        };

        let t = 0, b = h, l = 0, r = w;
        while (t < Math.floor(h * 0.08) && row(t) > 0.94) t++;
        while (b > h - Math.floor(h * 0.08) && row(b - 1) > 0.94) b--;
        while (l < Math.floor(w * 0.08) && col(l) > 0.94) l++;
        while (r > w - Math.floor(w * 0.08) && col(r - 1) > 0.94) r--;

        return { left: l, top: t, width: r - l, height: b - t };
    },

    async canvasToBlob(canvas, type, quality = 0.94) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error("Could not encode canvas to blob"));
            }, type, quality);
        });
    },

    loadImageFromUrl(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Could not load image"));
            img.src = url;
        });
    },

    async sliceAndTrimImage(imgElement, mime) {
        const w = imgElement.naturalWidth;
        const h = imgElement.naturalHeight;

        const base = document.createElement("canvas");
        base.width = w;
        base.height = h;
        const ctx = base.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(imgElement, 0, 0);

        const data = ctx.getImageData(0, 0, w, h).data;
        const v = this.findDivider(data, w, h, false);
        const hh = this.findDivider(data, w, h, true);

        const x1 = typeof v === "number" ? v : v.before;
        const x2 = typeof v === "number" ? v : v.after;
        const y1 = typeof hh === "number" ? hh : hh.before;
        const y2 = typeof hh === "number" ? hh : hh.after;

        const boxes = [
            { x: 0, y: 0, width: x1, height: y1 },             // Top-Left
            { x: x2, y: 0, width: w - x2, height: y1 },         // Top-Right
            { x: 0, y: y2, width: x1, height: h - y2 },         // Bottom-Left
            { x: x2, y: y2, width: w - x2, height: h - y2 }      // Bottom-Right
        ];

        const slices = [];
        for (let i = 0; i < 4; i++) {
            const b = boxes[i];
            const part = document.createElement("canvas");
            part.width = b.width;
            part.height = b.height;

            const pc = part.getContext("2d", { willReadFrequently: true });
            pc.drawImage(base, b.x, b.y, b.width, b.height, 0, 0, b.width, b.height);

            const t = this.trimEdges(pc, part);
            const out = document.createElement("canvas");
            out.width = t.width;
            out.height = t.height;
            out.getContext("2d").drawImage(part, t.left, t.top, t.width, t.height, 0, 0, t.width, t.height);

            const blob = await this.canvasToBlob(out, mime);
            slices.push({
                blob,
                width: out.width,
                height: out.height
            });
        }
        return slices;
    },

    async processSingleTrimItem(item, imgElement, resultsGrid) {
        const first = item.startNumber;
        const ext = item.extension;
        const mime = ext === "jpg" ? "image/jpeg" : "image/png";

        const slices = await this.sliceAndTrimImage(imgElement, mime);

        let effectiveFirst = first;
        let resolutionChoice = "default";

        if (this.state.outputDirectory) {
            const plannedNames = [0, 1, 2, 3].map(i => `${first + i}.${ext}`);
            const existingCollisions = [];
            for (const name of plannedNames) {
                if (await this.fileExistsInDir(this.state.outputDirectory, name)) {
                    existingCollisions.push(name);
                }
            }

            if (existingCollisions.length > 0) {
                const policy = this.container.querySelector("#trimmerConflictPolicy")?.value || "ask";

                if (policy === "ask") {
                    const nextSeq = await this.findNextAvailableSequenceStart(this.state.outputDirectory, ext, 4);
                    const userChoice = await this.promptConflictModal(
                        existingCollisions,
                        this.state.outputDirectory.name,
                        first,
                        nextSeq,
                        ext
                    );

                    if (userChoice === "cancel") {
                        return { cancelled: true, savedNames: [], resolutionChoice };
                    }
                    resolutionChoice = userChoice;
                } else {
                    resolutionChoice = policy;
                }

                if (resolutionChoice === "advance") {
                    effectiveFirst = await this.findNextAvailableSequenceStart(this.state.outputDirectory, ext, 4);
                    item.startNumber = effectiveFirst;
                    if (this.state.selectedFiles.length === 1) {
                        this.state.startNumber = effectiveFirst;
                        this.container.querySelector("#trimmerStartNum").value = effectiveFirst;
                        this.updateSequencePreview();
                    }
                }
            }
        }

        const savedNames = [];
        for (let i = 0; i < 4; i++) {
            const slice = slices[i];
            let fileName = `${effectiveFirst + i}.${ext}`;

            if (this.state.outputDirectory) {
                if (resolutionChoice === "unique") {
                    fileName = await this.findUniqueFileName(this.state.outputDirectory, fileName);
                }
                const handle = await this.state.outputDirectory.getFileHandle(fileName, { create: true });
                const writer = await handle.createWritable();
                await writer.write(slice.blob);
                await writer.close();
            } else {
                const blobUrl = URL.createObjectURL(slice.blob);
                const a = document.createElement("a");
                a.href = blobUrl;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                a.remove();
            }

            savedNames.push(fileName);
            const blobUrl = URL.createObjectURL(slice.blob);

            this.state.croppedResults.push({
                blob: slice.blob,
                name: fileName,
                width: slice.width,
                height: slice.height,
                url: blobUrl
            });

            const card = document.createElement("div");
            card.className = "panel-item-card";
            card.innerHTML = `
                <div class="panel-img-preview">
                    <img src="${blobUrl}" alt="${fileName}">
                </div>
                <div class="panel-item-meta">
                    <div>
                        <div class="panel-item-title">${fileName}</div>
                        <div class="panel-item-dim">${slice.width} × ${slice.height}px</div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <a class="btn btn-sm" href="${blobUrl}" download="${fileName}" title="Download individual file">⬇️ Save</a>
                    </div>
                </div>
            `;
            resultsGrid.appendChild(card);
        }

        return { cancelled: false, savedNames, resolutionChoice, effectiveFirst };
    },

    async executeTrim() {
        const isBatch = this.state.selectedFiles.length > 1;
        if (this.state.selectedFiles.length === 0 && (!this.state.selectedFile || !this.state.imageObject)) return;

        const trimBtn = this.container.querySelector("#executeTrimBtn");
        const status = this.container.querySelector("#trimmerStatus");
        const resultsGrid = this.container.querySelector("#panelResultsGrid");
        const previewSection = this.container.querySelector("#trimmerPreviewSection");
        const panelsBadge = this.container.querySelector("#panelsCountBadge");

        trimBtn.disabled = true;
        resultsGrid.innerHTML = "";
        this.state.croppedResults = [];

        try {
            if (!isBatch) {
                // Single-image flow (retains exact original behavior)
                const item = this.state.selectedFiles[0] || {
                    file: this.state.selectedFile,
                    startNumber: this.state.startNumber,
                    extension: this.state.extension
                };
                item.startNumber = this.state.startNumber;
                status.textContent = "Processing and trimming image...";

                const res = await this.processSingleTrimItem(item, this.state.imageObject, resultsGrid);
                if (res.cancelled) {
                    status.textContent = "Trim cancelled by user — existing files preserved.";
                    this.app.showToast("Save cancelled to protect existing files", "info");
                    this.app.log(this.id, "Trim cancelled by user to prevent file overwrite");
                    return;
                }

                if (panelsBadge) panelsBadge.textContent = "4 panels";
                this.container.querySelector("#downloadZipBtn").style.display = "inline-flex";

                if (this.state.outputDirectory) {
                    let note = "";
                    if (res.resolutionChoice === "unique") note = " (unique names generated to prevent overwriting existing files)";
                    else if (res.resolutionChoice === "advance") note = ` (sequence auto-advanced to ${res.effectiveFirst}..${res.effectiveFirst + 3})`;
                    status.textContent = `✓ Saved ${res.savedNames.join(", ")} in "${this.state.outputDirectory.name}"!`;
                    this.app.showToast(`Saved 4 files to ${this.state.outputDirectory.name}${note}`, "success");
                    this.app.log(this.id, `Saved 4 files in "${this.state.outputDirectory.name}": ${res.savedNames.join(", ")}`, { mode: res.resolutionChoice });
                } else {
                    status.textContent = `✓ Downloaded ${res.savedNames.join(", ")}.`;
                    this.app.showToast(`Downloaded 4 trimmed files successfully`, "success");
                    this.app.log(this.id, `Downloaded 4 trimmed files: ${res.savedNames.join(", ")}`);
                }
            } else {
                // Multi-image batch flow
                const total = this.state.selectedFiles.length;
                let completedFiles = 0;
                const allSavedNames = [];

                // Show panels card full-width for batch results
                previewSection.style.display = "grid";
                previewSection.classList.add("batch-results-mode");

                for (let idx = 0; idx < total; idx++) {
                    const item = this.state.selectedFiles[idx];
                    item.status = "processing";
                    this.renderQueue();
                    status.textContent = `Trimming image ${idx + 1} of ${total}: ${item.file.name}...`;

                    try {
                        const imgEl = await this.loadImageFromUrl(item.url);
                        const sourceImg = this.container.querySelector("#trimmerSourceImg");
                        if (sourceImg) sourceImg.src = item.url;
                        this.container.querySelector("#sourceDimensions").textContent = `${imgEl.naturalWidth} × ${imgEl.naturalHeight}px (${item.file.name})`;

                        const res = await this.processSingleTrimItem(item, imgEl, resultsGrid);
                        if (res.cancelled) {
                            item.status = "cancelled";
                            this.renderQueue();
                            continue;
                        }
                        item.status = "done";
                        completedFiles++;
                        allSavedNames.push(...res.savedNames);
                        this.renderQueue();
                    } catch (fileErr) {
                        console.error(`[Trimmer Batch] Failed on ${item.file.name}:`, fileErr);
                        item.status = "error";
                        this.renderQueue();
                    }
                }

                if (panelsBadge) panelsBadge.textContent = `${this.state.croppedResults.length} panels (${completedFiles}/${total} images)`;
                if (this.state.croppedResults.length > 0) {
                    this.container.querySelector("#downloadZipBtn").style.display = "inline-flex";
                }

                if (this.state.outputDirectory) {
                    status.textContent = `✓ Batch complete: saved ${allSavedNames.length} panels from ${completedFiles}/${total} images in "${this.state.outputDirectory.name}"!`;
                    this.app.showToast(`Saved ${allSavedNames.length} panels from ${completedFiles} images!`, "success");
                } else {
                    status.textContent = `✓ Batch complete: trimmed ${allSavedNames.length} panels from ${completedFiles}/${total} images.`;
                    this.app.showToast(`Trimmed ${allSavedNames.length} panels from ${completedFiles} images!`, "success");
                }
                this.app.log(this.id, `Batch trim finished: ${completedFiles}/${total} images, ${allSavedNames.length} panels`, allSavedNames);
            }
        } catch (err) {
            console.error(err);
            status.textContent = `Error: ${err.message || "Failed to trim image"}`;
            this.app.showToast("Image trim failed", "error");
        } finally {
            trimBtn.disabled = false;
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
    },

    async downloadAsZip() {
        if (!this.state.croppedResults.length) return;

        // Load JSZip dynamically if not already loaded
        if (!window.JSZip) {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
            document.head.appendChild(script);
            await new Promise(r => script.onload = r);
        }

        const zip = new window.JSZip();
        for (const item of this.state.croppedResults) {
            zip.file(item.name, item.blob);
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const zipUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = zipUrl;
        const first = this.state.startNumber;
        a.download = this.state.croppedResults.length > 4
            ? `trimmed_panels_batch_${this.state.croppedResults.length}_files.zip`
            : `trimmed_panels_${first}-${first + 3}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(zipUrl);
        this.app.log(this.id, `Downloaded ZIP archive of trimmed panels`);
        this.app.showToast("Downloaded ZIP archive", "success");
    }
};
