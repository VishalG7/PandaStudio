/**
 * Module 6: Offline SRT Subtitle Generator
 * Generates timestamped .srt subtitle files from finalized videos or audio
 * completely offline using ffmpeg + faster-whisper.
 */

import { App } from "../app.js";

export const SrtModule = {
    id: "srt",
    name: "SRT Subtitles",
    icon: "💬",

    state: {
        selectedFile: null,
        mediaUrl: null,
        isGenerating: false,
        currentFilename: null,
        currentSrtText: "",
        history: []
    },

    async init(container, app) {
        this.container = container;
        this.app = app;
        this.render();
        this.bindEvents();
        await this.loadHistory();
    },

    async onActivate() {
        await this.loadHistory();
    },

    render() {
        this.container.innerHTML = `
            <div class="srt-container">
                <div class="srt-header">
                    <h2><span>💬 Offline SRT Subtitle Generator</span></h2>
                    <p>Extract audio and generate timestamped <code>.srt</code> subtitles from finalized videos completely offline using local <code>ffmpeg</code> + <code>faster-whisper</code>.</p>
                </div>

                <div class="srt-grid">
                    <!-- LEFT COLUMN: Media Upload & Whisper Settings -->
                    <div class="srt-card">
                        <div class="srt-card-title-row">
                            <h3><span>🎬 1. Video / Audio Input</span></h3>
                            <button type="button" class="btn btn-sm" id="srtClearMediaBtn" style="display:none;">✕ Clear</button>
                        </div>

                        <div class="srt-drop-area" id="srtDropArea">
                            <span class="srt-drop-icon">🎞️</span>
                            <div class="srt-drop-text" id="srtDropLabel">Click or Drag & Drop Finalized Video / Audio</div>
                            <div class="srt-drop-sub" id="srtDropSub">Supports .mp4, .mkv, .mov, .webm, .mp3, .wav</div>
                            <input type="file" id="srtFileInput" accept="video/*,audio/*,.mp4,.mkv,.mov,.webm,.mp3,.wav,.m4a" style="display:none;">
                        </div>

                        <div class="srt-media-preview-wrap" id="srtMediaPreviewWrap" style="display:none;">
                            <video id="srtVideoPreview" class="srt-video-preview" controls preload="metadata"></video>
                        </div>

                        <div class="srt-settings-grid">
                            <div class="form-group" style="margin-bottom:0;">
                                <label class="form-label" for="srtModelSelect">Whisper Model (Local Cache)</label>
                                <select id="srtModelSelect" class="form-select">
                                    <option value="tiny">Tiny (~75 MB • Fastest, English only)</option>
                                    <option value="base">Base (~145 MB • Fast)</option>
                                    <option value="small" selected>Small (~465 MB • Cached • Balanced)</option>
                                    <option value="medium">Medium (~1.5 GB • Better Hindi)</option>
                                    <option value="large-v3-turbo">Turbo (~1.6 GB • Fast & Best Hindi)</option>
                                    <option value="large-v3">Large-v3 (~3 GB • Max Accuracy)</option>
                                </select>
                            </div>

                            <div class="form-group" style="margin-bottom:0;">
                                <label class="form-label" for="srtLanguageSelect">Spoken Language</label>
                                <select id="srtLanguageSelect" class="form-select">
                                    <option value="auto" selected>🌐 Auto-Detect</option>
                                    <option value="en">🇺🇸 English</option>
                                    <option value="hi">🇮🇳 Hindi (हिन्दी)</option>
                                    <option value="es">🇪🇸 Spanish</option>
                                    <option value="fr">🇫🇷 French</option>
                                    <option value="de">🇩🇪 German</option>
                                    <option value="ja">🇯🇵 Japanese</option>
                                    <option value="ko">🇰🇷 Korean</option>
                                </select>
                            </div>
                        </div>

                        <div class="srt-settings-grid" style="margin-top:12px;">
                            <div class="form-group" style="margin-bottom:0;">
                                <label class="form-label" for="srtTaskSelect">Output Mode</label>
                                <select id="srtTaskSelect" class="form-select">
                                    <option value="transcribe" selected>📝 Transcribe (Original Language)</option>
                                    <option value="translate">🌍 Translate Speech → English SRT</option>
                                </select>
                            </div>

                            <div class="form-group" style="margin-bottom:0; display:flex; align-items:flex-end; padding-bottom:6px;">
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12.5px; font-weight:600; color:var(--text-primary);">
                                    <input type="checkbox" id="srtVadCheckbox" checked>
                                    <span>🔇 Filter Silence (VAD)</span>
                                </label>
                            </div>
                        </div>

                        <div class="form-group" style="margin-top:12px; margin-bottom:0;">
                            <label class="form-label" for="srtHintInput">Vocabulary / Script Hint (Optional)</label>
                            <input type="text" id="srtHintInput" class="form-input" placeholder="e.g. शुद्ध हिंदी देवनागरी, या विशेष नाम (लघुपतनक, हिरण्यक)">
                        </div>

                        <div class="form-hint" style="margin-top:10px;">
                            For accurate Hindi Devanagari, select <strong>Hindi</strong> + <strong>Small / Medium / Turbo</strong>. First run downloads the model once; future runs are 100% offline.
                        </div>

                        <div class="srt-progress-wrap" id="srtProgressWrap" style="display:none;">
                            <div class="srt-progress-header">
                                <span id="srtProgressStage">Preparing...</span>
                                <span class="srt-progress-pct" id="srtProgressPct">0%</span>
                            </div>
                            <div class="srt-progress-track">
                                <div class="srt-progress-fill" id="srtProgressFill" style="width:0%;"></div>
                            </div>
                            <div class="srt-progress-detail" id="srtProgressDetail">Starting offline transcription...</div>
                        </div>

                        <button type="button" class="btn btn-primary srt-generate-btn" id="srtGenerateBtn" disabled>
                            <span id="srtBtnIcon">⚡</span>
                            <span id="srtBtnLabel">Generate .SRT Offline</span>
                        </button>
                    </div>

                    <!-- RIGHT COLUMN: SRT Preview / Editor & History -->
                    <div class="srt-card">
                        <div class="srt-card-title-row">
                            <h3><span>📄 2. SRT Output & Editor</span></h3>
                            <button type="button" class="btn btn-sm" id="srtOpenFolderBtn" title="Open subtitles/ folder in Explorer">📁 Open Subtitles Folder</button>
                        </div>

                        <div class="srt-meta-bar" id="srtMetaBar" style="display:none;">
                            <span class="srt-meta-pill" id="srtActiveFilenamePill">-</span>
                            <span class="srt-meta-pill" id="srtLangPill">-</span>
                            <span class="srt-meta-pill" id="srtSegCountPill">-</span>
                        </div>

                        <textarea id="srtEditorTextarea" class="srt-editor-textarea" placeholder="Generated SRT subtitles will appear here. You can also edit timestamps or fix words before saving or downloading..."></textarea>

                        <div class="srt-output-actions">
                            <button type="button" class="btn btn-sm btn-primary" id="srtDownloadBtn" disabled>⬇️ Download .SRT</button>
                            <button type="button" class="btn btn-sm" id="srtCopyBtn" disabled>📋 Copy SRT</button>
                            <button type="button" class="btn btn-sm btn-success" id="srtSaveEditsBtn" disabled>💾 Save Edits to Disk</button>
                        </div>

                        <div class="srt-history-header">
                            <span>Saved Subtitle Files (<code>subtitles/</code>)</span>
                            <button type="button" class="btn btn-sm" id="srtRefreshHistoryBtn" style="padding:2px 8px; font-size:11.5px;">🔄 Refresh</button>
                        </div>

                        <div class="srt-history-list" id="srtHistoryList">
                            <div class="srt-empty-history">No .srt files generated yet.</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    bindEvents() {
        const root = this.container;
        const dropArea = root.querySelector("#srtDropArea");
        const fileInput = root.querySelector("#srtFileInput");

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
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                this.handleFileSelected(e.dataTransfer.files[0]);
            }
        });
        fileInput.addEventListener("change", () => {
            if (fileInput.files && fileInput.files[0]) {
                this.handleFileSelected(fileInput.files[0]);
            }
        });

        root.querySelector("#srtClearMediaBtn").onclick = () => this.clearMedia();
        root.querySelector("#srtGenerateBtn").onclick = () => this.generateSrt();
        root.querySelector("#srtDownloadBtn").onclick = () => this.downloadCurrentSrt();
        root.querySelector("#srtCopyBtn").onclick = () => this.copyCurrentSrt();
        root.querySelector("#srtSaveEditsBtn").onclick = () => this.saveEdits();
        root.querySelector("#srtRefreshHistoryBtn").onclick = () => this.loadHistory(true);
        root.querySelector("#srtOpenFolderBtn").onclick = () => this.openSubtitlesFolder();

        const editor = root.querySelector("#srtEditorTextarea");
        editor.addEventListener("input", () => {
            this.state.currentSrtText = editor.value;
            const hasText = Boolean(editor.value.trim());
            root.querySelector("#srtCopyBtn").disabled = !hasText;
            root.querySelector("#srtDownloadBtn").disabled = !hasText;
            root.querySelector("#srtSaveEditsBtn").disabled = !hasText || !this.state.currentFilename;
        });
    },

    handleFileSelected(file) {
        if (this.state.mediaUrl) {
            URL.revokeObjectURL(this.state.mediaUrl);
        }
        this.state.selectedFile = file;
        this.state.mediaUrl = URL.createObjectURL(file);

        const root = this.container;
        root.querySelector("#srtDropLabel").textContent = file.name;
        root.querySelector("#srtDropSub").textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB • Ready to transcribe offline`;
        root.querySelector("#srtClearMediaBtn").style.display = "inline-flex";
        root.querySelector("#srtGenerateBtn").disabled = false;

        const previewWrap = root.querySelector("#srtMediaPreviewWrap");
        const videoEl = root.querySelector("#srtVideoPreview");
        videoEl.src = this.state.mediaUrl;
        previewWrap.style.display = "block";

        this.app.log(this.id, `Selected media file "${file.name}"`, { size: file.size });
    },

    clearMedia() {
        if (this.state.mediaUrl) {
            URL.revokeObjectURL(this.state.mediaUrl);
            this.state.mediaUrl = null;
        }
        this.state.selectedFile = null;
        const root = this.container;
        root.querySelector("#srtFileInput").value = "";
        root.querySelector("#srtVideoPreview").src = "";
        root.querySelector("#srtMediaPreviewWrap").style.display = "none";
        root.querySelector("#srtClearMediaBtn").style.display = "none";
        root.querySelector("#srtGenerateBtn").disabled = true;
        root.querySelector("#srtDropLabel").textContent = "Click or Drag & Drop Finalized Video / Audio";
        root.querySelector("#srtDropSub").textContent = "Supports .mp4, .mkv, .mov, .webm, .mp3, .wav";
    },

    updateProgressUI(percent, stage, detail = "") {
        const wrap = this.container.querySelector("#srtProgressWrap");
        const stageEl = this.container.querySelector("#srtProgressStage");
        const pctEl = this.container.querySelector("#srtProgressPct");
        const fillEl = this.container.querySelector("#srtProgressFill");
        const detailEl = this.container.querySelector("#srtProgressDetail");
        if (!wrap) return;

        wrap.style.display = "block";
        const clamped = Math.max(0, Math.min(100, Math.round(percent)));
        if (stageEl) stageEl.textContent = stage;
        if (pctEl) pctEl.textContent = `${clamped}%`;
        if (fillEl) fillEl.style.width = `${clamped}%`;
        if (detailEl) detailEl.textContent = detail;
    },

    async generateSrt() {
        if (!this.state.selectedFile || this.state.isGenerating) return;

        const root = this.container;
        const btn = root.querySelector("#srtGenerateBtn");
        const btnIcon = root.querySelector("#srtBtnIcon");
        const btnLabel = root.querySelector("#srtBtnLabel");

        const model = root.querySelector("#srtModelSelect").value;
        const language = root.querySelector("#srtLanguageSelect").value;
        const task = root.querySelector("#srtTaskSelect").value;
        const vad = root.querySelector("#srtVadCheckbox").checked ? "1" : "0";
        const hint = (root.querySelector("#srtHintInput")?.value || "").trim();
        const file = this.state.selectedFile;
        const jobId = crypto.randomUUID();
        const startTime = Date.now();

        this.state.isGenerating = true;
        btn.disabled = true;
        btnIcon.innerHTML = `<span class="tts-spinner"></span>`;
        btnLabel.textContent = "Transcribing Offline...";
        this.updateProgressUI(2, "Uploading media to local server...", `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`);

        this.app.log(this.id, `Starting offline SRT generation for "${file.name}"`, { model, language, task, vad, hint });

        let pollTimer = null;
        try {
            const params = new URLSearchParams({
                filename: file.name,
                model,
                language,
                task,
                vad,
                hint,
                jobId
            });

            const data = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("POST", `/api/srt/generate?${params.toString()}`);

                xhr.upload.onprogress = e => {
                    if (e.lengthComputable) {
                        const uploadPct = Math.round((e.loaded / e.total) * 14);
                        this.updateProgressUI(uploadPct, "Sending media to local server...", `${Math.round((e.loaded / e.total) * 100)}% uploaded`);
                    }
                };

                xhr.upload.onload = () => {
                    this.updateProgressUI(15, "Processing audio...", "Starting ffmpeg & Whisper");
                    pollTimer = setInterval(async () => {
                        try {
                            const pRes = await fetch(`/api/srt/progress?jobId=${encodeURIComponent(jobId)}`);
                            if (!pRes.ok) return;
                            const pData = await pRes.json();
                            if (pData.success && pData.percent > 0) {
                                const elapsed = Math.round((Date.now() - startTime) / 1000);
                                const detailText = pData.detail ? `${pData.detail} • ${elapsed}s elapsed` : `${elapsed}s elapsed`;
                                this.updateProgressUI(pData.percent, pData.stage || "Transcribing...", detailText);
                            }
                        } catch {
                            // Ignore transient poll errors
                        }
                    }, 600);
                };

                xhr.onload = () => {
                    try {
                        const parsed = JSON.parse(xhr.responseText);
                        if (xhr.status >= 200 && xhr.status < 300 && parsed.success) {
                            resolve(parsed);
                        } else {
                            reject(new Error(parsed.error || `Server returned ${xhr.status}`));
                        }
                    } catch {
                        reject(new Error(`Invalid server response (${xhr.status})`));
                    }
                };

                xhr.onerror = () => reject(new Error("Network connection to local server failed"));
                xhr.send(file);
            });

            this.updateProgressUI(100, `Complete! Generated ${(data.segments || []).length} subtitle lines`, data.filename);

            this.state.currentFilename = data.filename;
            this.state.currentSrtText = data.srtText || "";

            root.querySelector("#srtEditorTextarea").value = this.state.currentSrtText;
            root.querySelector("#srtMetaBar").style.display = "flex";
            root.querySelector("#srtActiveFilenamePill").textContent = `📄 ${data.filename}`;
            root.querySelector("#srtLangPill").textContent = `🌐 ${data.detectedLanguage || language} (${Math.round((data.languageProbability || 0) * 100)}%)`;
            root.querySelector("#srtSegCountPill").textContent = `💬 ${(data.segments || []).length} lines • ${data.duration || 0}s`;

            const hasText = Boolean(this.state.currentSrtText.trim());
            root.querySelector("#srtDownloadBtn").disabled = !hasText;
            root.querySelector("#srtCopyBtn").disabled = !hasText;
            root.querySelector("#srtSaveEditsBtn").disabled = !hasText;

            this.app.showToast(`Generated ${data.filename} (${(data.segments || []).length} subtitle lines)`, "success");
            this.app.log(this.id, `SRT generated: ${data.filename}`, { segments: (data.segments || []).length, lang: data.detectedLanguage });
            await this.loadHistory();
        } catch (err) {
            console.error("[SRT Error]", err);
            this.updateProgressUI(0, "Failed", err.message);
            this.app.showToast(`SRT failed: ${err.message}`, "error", 5000);
            this.app.log(this.id, `SRT generation failed: ${err.message}`);
        } finally {
            if (pollTimer) clearInterval(pollTimer);
            this.state.isGenerating = false;
            btn.disabled = !this.state.selectedFile;
            btnIcon.textContent = "⚡";
            btnLabel.textContent = "Generate .SRT Offline";
        }
    },

    async loadHistory(notify = false) {
        try {
            const res = await fetch("/api/srt/history");
            const data = await res.json();
            if (res.ok && data.success && Array.isArray(data.files)) {
                this.state.history = data.files;
                this.renderHistory(data.files);
                if (notify) {
                    this.app.showToast(`Loaded ${data.files.length} subtitle file(s)`, "info");
                }
            }
        } catch (err) {
            console.warn("[SRT] Could not load history:", err);
        }
    },

    renderHistory(files) {
        const list = this.container.querySelector("#srtHistoryList");
        if (!list) return;
        if (!files || files.length === 0) {
            list.innerHTML = `<div class="srt-empty-history">No .srt files generated yet.</div>`;
            return;
        }
        list.innerHTML = "";
        files.forEach(item => {
            const row = document.createElement("div");
            row.className = `srt-history-item ${this.state.currentFilename === item.filename ? "active" : ""}`;
            const sizeKb = (item.size / 1024).toFixed(1) + " KB";
            const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

            row.innerHTML = `
                <div class="srt-history-info">
                    <div class="srt-history-name" title="${this.escapeHtml(item.filename)}">📄 ${this.escapeHtml(item.filename)}</div>
                    <div class="srt-history-meta">${dateStr} • ${sizeKb}</div>
                </div>
                <div class="srt-history-actions">
                    <button type="button" class="btn btn-sm srt-load-btn" title="Open in editor">✏️ Edit</button>
                    <button type="button" class="btn btn-sm btn-icon-only srt-dl-btn" title="Download .srt">⬇️</button>
                    <button type="button" class="btn btn-sm btn-icon-only btn-danger srt-del-btn" title="Delete">🗑️</button>
                </div>
            `;

            row.querySelector(".srt-load-btn").onclick = () => this.openHistoryFile(item);
            row.querySelector(".srt-dl-btn").onclick = () => this.downloadSrtUrl(item.url, item.filename);
            row.querySelector(".srt-del-btn").onclick = () => this.deleteSrt(item.filename);
            list.appendChild(row);
        });
    },

    async openHistoryFile(item) {
        try {
            const res = await fetch(item.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            this.state.currentFilename = item.filename;
            this.state.currentSrtText = text;

            const root = this.container;
            root.querySelector("#srtEditorTextarea").value = text;
            root.querySelector("#srtMetaBar").style.display = "flex";
            root.querySelector("#srtActiveFilenamePill").textContent = `📄 ${item.filename}`;
            root.querySelector("#srtLangPill").textContent = "💾 Loaded from disk";
            root.querySelector("#srtSegCountPill").textContent = `${(item.size / 1024).toFixed(1)} KB`;
            root.querySelector("#srtDownloadBtn").disabled = false;
            root.querySelector("#srtCopyBtn").disabled = false;
            root.querySelector("#srtSaveEditsBtn").disabled = false;

            this.renderHistory(this.state.history);
            this.app.showToast(`Loaded ${item.filename}`, "info");
        } catch (err) {
            this.app.showToast(`Could not load ${item.filename}: ${err.message}`, "error");
        }
    },

    downloadCurrentSrt() {
        const text = this.container.querySelector("#srtEditorTextarea").value;
        if (!text.trim()) return;
        const filename = this.state.currentFilename || "subtitles.srt";
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            a.remove();
            URL.revokeObjectURL(url);
        }, 1000);
        this.app.showToast(`Downloaded ${filename}`, "success");
        this.app.log(this.id, `Downloaded SRT: ${filename}`);
    },

    async downloadSrtUrl(url, filename) {
        try {
            const res = await fetch(url + "?download=1");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                a.remove();
                URL.revokeObjectURL(blobUrl);
            }, 1000);
            this.app.showToast(`Downloaded ${filename}`, "success");
        } catch (err) {
            this.app.showToast(`Download failed: ${err.message}`, "error");
        }
    },

    async copyCurrentSrt() {
        const text = this.container.querySelector("#srtEditorTextarea").value;
        if (!text.trim()) return;
        try {
            await navigator.clipboard.writeText(text);
            this.app.showToast("SRT copied to clipboard", "success");
        } catch {
            this.app.showToast("Could not copy SRT", "error");
        }
    },

    async saveEdits() {
        const filename = this.state.currentFilename;
        const srtText = this.container.querySelector("#srtEditorTextarea").value;
        if (!filename) return;
        try {
            const res = await fetch("/api/srt/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename, srtText })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                this.app.showToast(`Saved edits to ${filename}`, "success");
                this.app.log(this.id, `Saved edited SRT: ${filename}`);
                await this.loadHistory();
            } else {
                throw new Error(data.error || "Save failed");
            }
        } catch (err) {
            this.app.showToast(`Failed to save: ${err.message}`, "error");
        }
    },

    async deleteSrt(filename) {
        if (!confirm(`Delete "${filename}" from disk?`)) return;
        try {
            const res = await fetch("/api/srt/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                if (this.state.currentFilename === filename) {
                    this.state.currentFilename = null;
                    this.container.querySelector("#srtSaveEditsBtn").disabled = true;
                }
                this.app.showToast(`Deleted ${filename}`, "success");
                await this.loadHistory();
            }
        } catch (err) {
            this.app.showToast(`Delete failed: ${err.message}`, "error");
        }
    },

    async openSubtitlesFolder() {
        try {
            const res = await fetch("/api/open-folder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ folder: "subtitles" })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                this.app.showToast("Opened subtitles/ folder in Explorer", "success");
            } else {
                throw new Error(data.error || "Could not open folder");
            }
        } catch (err) {
            this.app.showToast(`Could not open folder: ${err.message}`, "error");
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

window.SrtModule = SrtModule;
