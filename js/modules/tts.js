/**
 * Module 5: Text to Speech (TTS) Studio
 * Generates natural neural speech from text using freely available AI voice models.
 * Backed by Python edge-tts server endpoints.
 * Plays generated audio directly and saves locally as MP3.
 */

import { App } from "../app.js";

export const TtsModule = {
    id: "tts",
    name: "Text to Speech",
    icon: "🎙️",

    state: {
        voices: [],
        selectedVoice: "en-US-JennyNeural",
        rate: "+0%",
        pitch: "+0Hz",
        isGenerating: false,
        history: [],
        currentAudio: null,
        activeHistoryFilename: null
    },

    async init(container, app) {
        this.container = container;
        this.app = app;
        this.render();
        this.bindEvents();
        await this.loadVoices();
        await this.loadHistory();
    },

    async onActivate() {
        // Refresh history whenever user switches to this tab
        await this.loadHistory();
    },

    render() {
        this.container.innerHTML = `
            <div class="tts-container">
                <!-- Header -->
                <div class="tts-header">
                    <h2><span>🎙️ Text to Speech Studio</span></h2>
                    <p>Convert text and video prompts into natural neural speech using freely available voice models. Plays in-browser and saves locally as MP3.</p>
                </div>

                <!-- Main Grid -->
                <div class="tts-grid">
                    <!-- LEFT COLUMN: Input & Voice Settings -->
                    <div class="tts-card">
                        <div class="tts-card-title-row">
                            <h3><span>📝 Text Input & Settings</span></h3>
                            <div style="display:flex; gap:6px;">
                                <button class="btn btn-sm" id="ttsSampleBtn" title="Insert a sample cinematic narration prompt">📋 Sample Prompt</button>
                                <button class="btn btn-sm" id="ttsClearBtn" title="Clear text input">✕ Clear</button>
                            </div>
                        </div>

                        <!-- Textarea with live counter -->
                        <div class="form-group" style="margin-bottom:14px;">
                            <div class="tts-input-toolbar">
                                <label class="form-label" for="ttsTextInput" style="margin-bottom:0;">Narration / Prompt Text:</label>
                                <span class="tts-stat-pill" id="ttsTextCountPill">0 chars • 0 words</span>
                            </div>
                            <textarea id="ttsTextInput" class="tts-textarea" placeholder="Type or paste text, video prompt, or story narration here..."></textarea>
                        </div>

                        <!-- Voice Model Selector -->
                        <div class="form-group" style="margin-bottom:14px;">
                            <label class="form-label" for="ttsVoiceSelect">Voice Model (Freely Available Neural Voices):</label>
                            <select id="ttsVoiceSelect" class="form-select">
                                <option value="en-US-JennyNeural">Loading voice models...</option>
                            </select>
                            <div class="form-hint" id="ttsVoiceHint">High-fidelity natural neural voice. No API key required.</div>
                        </div>

                        <!-- Speed & Pitch Controls -->
                        <div class="tts-controls-row">
                            <!-- Speed / Rate -->
                            <div class="tts-slider-wrap">
                                <div class="tts-slider-header">
                                    <span>Speaking Speed:</span>
                                    <span class="tts-slider-val" id="ttsRateLabel">1.0x Normal</span>
                                </div>
                                <input type="range" id="ttsRateSlider" class="tts-slider" min="-50" max="100" step="5" value="0">
                                <div class="tts-preset-row">
                                    <button type="button" class="tts-preset-btn" data-rate="-25">0.75x</button>
                                    <button type="button" class="tts-preset-btn active" data-rate="0">1.0x</button>
                                    <button type="button" class="tts-preset-btn" data-rate="25">1.25x</button>
                                    <button type="button" class="tts-preset-btn" data-rate="50">1.5x</button>
                                </div>
                            </div>

                            <!-- Pitch -->
                            <div class="tts-slider-wrap">
                                <div class="tts-slider-header">
                                    <span>Voice Pitch:</span>
                                    <span class="tts-slider-val" id="ttsPitchLabel">Default</span>
                                </div>
                                <input type="range" id="ttsPitchSlider" class="tts-slider" min="-20" max="20" step="2" value="0">
                                <div class="tts-preset-row">
                                    <button type="button" class="tts-preset-btn" data-pitch="-10">Low</button>
                                    <button type="button" class="tts-preset-btn active" data-pitch="0">Default</button>
                                    <button type="button" class="tts-preset-btn" data-pitch="10">High</button>
                                </div>
                            </div>
                        </div>

                        <!-- Custom Output Filename (Optional) -->
                        <div class="form-group" style="margin-top:14px; margin-bottom:4px;">
                            <label class="form-label" for="ttsCustomFilename">Custom File Name (Optional):</label>
                            <input type="text" id="ttsCustomFilename" class="form-input" placeholder="e.g. scene_01_narration (auto-timestamped if blank)">
                            <div class="form-hint">Audio files are automatically saved as MP3 inside the local <code>audio/</code> directory.</div>
                        </div>

                        <!-- Generate Button -->
                        <button class="btn btn-primary tts-generate-btn" id="ttsGenerateBtn">
                            <span id="ttsBtnIcon">⚡</span>
                            <span id="ttsBtnLabel">Generate Speech & Play</span>
                        </button>
                    </div>

                    <!-- RIGHT COLUMN: Active Player & Local Audio Hub -->
                    <div class="tts-card">
                        <div class="tts-card-title-row">
                            <h3><span>🎧 Audio Player & History</span></h3>
                            <button class="btn btn-sm" id="ttsOpenFolderBtn" title="Open audio/ folder in Windows Explorer">📁 Open Audio Folder</button>
                        </div>

                        <!-- Active Audio Player Panel -->
                        <div class="tts-player-panel" id="ttsPlayerPanel">
                            <div class="tts-player-banner">
                                <div class="tts-player-avatar" id="ttsPlayerAvatar">🐼</div>
                                <div class="tts-player-info">
                                    <div class="tts-player-filename" id="ttsActiveTitle">No audio generated yet</div>
                                    <div class="tts-player-meta" id="ttsActiveMeta">Enter text on the left and click Generate Speech</div>
                                </div>
                            </div>

                            <audio id="ttsAudioPlayer" class="tts-audio-element" controls preload="metadata"></audio>

                            <div class="tts-player-actions" id="ttsPlayerActions" style="display:none;">
                                <button class="btn btn-sm btn-primary" id="ttsDownloadActiveBtn">⬇️ Download MP3</button>
                                <button class="btn btn-sm" id="ttsCopyLinkBtn">📋 Copy Link</button>
                                <button class="btn btn-sm" id="ttsReplayBtn">▶️ Play Again</button>
                            </div>
                        </div>

                        <!-- Local Audio History List -->
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <span style="font-size:13px; font-weight:700; color:var(--text-secondary);">Saved Audio Files (Local MP3s):</span>
                            <button class="btn btn-sm" id="ttsRefreshHistoryBtn" style="padding:2px 8px; font-size:11.5px;" title="Refresh local files">🔄 Refresh</button>
                        </div>

                        <div class="tts-history-list" id="ttsHistoryList">
                            <div class="tts-empty-history">
                                <span class="tts-empty-icon">📁</span>
                                <span>No local audio generated yet. Your generated MP3s will appear here.</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    bindEvents() {
        const root = this.container;

        // Text input character and word counters
        const textarea = root.querySelector("#ttsTextInput");
        textarea.oninput = () => this.updateTextStats();

        // Sample Prompt & Clear
        root.querySelector("#ttsSampleBtn").onclick = () => this.insertSamplePrompt();
        root.querySelector("#ttsClearBtn").onclick = () => {
            textarea.value = "";
            this.updateTextStats();
        };

        // Voice selection change
        const voiceSelect = root.querySelector("#ttsVoiceSelect");
        voiceSelect.onchange = () => {
            this.state.selectedVoice = voiceSelect.value;
            this.updateVoiceHint();
            this.app.log(this.id, `Selected voice: ${voiceSelect.value}`);
        };

        // Speed / Rate slider & presets
        const rateSlider = root.querySelector("#ttsRateSlider");
        const rateLabel = root.querySelector("#ttsRateLabel");
        rateSlider.oninput = () => {
            this.applyRate(parseInt(rateSlider.value, 10));
        };
        root.querySelectorAll(".tts-preset-btn[data-rate]").forEach(btn => {
            btn.onclick = () => {
                const val = parseInt(btn.getAttribute("data-rate"), 10);
                rateSlider.value = val;
                this.applyRate(val);
            };
        });

        // Pitch slider & presets
        const pitchSlider = root.querySelector("#ttsPitchSlider");
        pitchSlider.oninput = () => {
            this.applyPitch(parseInt(pitchSlider.value, 10));
        };
        root.querySelectorAll(".tts-preset-btn[data-pitch]").forEach(btn => {
            btn.onclick = () => {
                const val = parseInt(btn.getAttribute("data-pitch"), 10);
                pitchSlider.value = val;
                this.applyPitch(val);
            };
        });

        // Generate button
        root.querySelector("#ttsGenerateBtn").onclick = () => this.generateSpeech();

        // Open audio folder button
        root.querySelector("#ttsOpenFolderBtn").onclick = () => this.openAudioFolder();

        // Refresh history
        root.querySelector("#ttsRefreshHistoryBtn").onclick = () => this.loadHistory(true);

        // Active Player buttons
        root.querySelector("#ttsDownloadActiveBtn").onclick = () => {
            if (this.state.currentAudio) {
                this.downloadAudio(this.state.currentAudio.url, this.state.currentAudio.filename);
            }
        };

        root.querySelector("#ttsCopyLinkBtn").onclick = () => {
            if (this.state.currentAudio) {
                const fullUrl = window.location.origin + this.state.currentAudio.url;
                navigator.clipboard.writeText(fullUrl).then(() => {
                    this.app.showToast("Audio link copied to clipboard!", "success");
                });
            }
        };

        root.querySelector("#ttsReplayBtn").onclick = () => {
            const player = root.querySelector("#ttsAudioPlayer");
            if (player) {
                player.currentTime = 0;
                player.play();
            }
        };
    },

    updateTextStats() {
        const text = this.container.querySelector("#ttsTextInput").value;
        const charCount = text.length;
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        this.container.querySelector("#ttsTextCountPill").textContent = `${charCount} chars • ${words} words`;
    },

    applyRate(val) {
        const rateLabel = this.container.querySelector("#ttsRateLabel");
        const formatted = val >= 0 ? `+${val}%` : `${val}%`;
        this.state.rate = formatted;

        // Display multiplier label (e.g. 1.0x, 1.25x)
        const mult = (1 + val / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.[1-9])0$/, "$1");
        rateLabel.textContent = `${mult}x (${formatted})`;

        // Update active preset buttons
        this.container.querySelectorAll(".tts-preset-btn[data-rate]").forEach(b => {
            b.classList.toggle("active", parseInt(b.getAttribute("data-rate"), 10) === val);
        });
    },

    applyPitch(val) {
        const pitchLabel = this.container.querySelector("#ttsPitchLabel");
        const formatted = val >= 0 ? `+${val}Hz` : `${val}Hz`;
        this.state.pitch = formatted;

        pitchLabel.textContent = val === 0 ? "Default" : formatted;

        // Update active preset buttons
        this.container.querySelectorAll(".tts-preset-btn[data-pitch]").forEach(b => {
            b.classList.toggle("active", parseInt(b.getAttribute("data-pitch"), 10) === val);
        });
    },

    updateVoiceHint() {
        const voiceSelect = this.container.querySelector("#ttsVoiceSelect");
        const hint = this.container.querySelector("#ttsVoiceHint");
        const opt = voiceSelect.selectedOptions[0];
        if (opt) {
            hint.textContent = `Selected: ${opt.textContent}`;
        }
    },

    insertSamplePrompt() {
        const samples = [
            "SCENE 01 — THE SECRET ANTHILL\n\nUnderneath the great oak tree lies a thriving microscopic metropolis. Thousands of industrious worker ants move in synchrony, safeguarding tiny white larvae deep within the subterranean tunnels.",
            "Welcome to Panda Studio. You can now transform any script, video prompt, or story narration into crystal clear speech and save it directly as an MP3 file on your computer.",
            "SCENE 04 — THE DANGER IN THE RAINFOREST\n\nRain drops begin crashing like mortar shells onto the giant leaves. The golden beetle shields its fragile wings, calculating its next rapid sprint toward shelter."
        ];
        const chosen = samples[Math.floor(Math.random() * samples.length)];
        const input = this.container.querySelector("#ttsTextInput");
        input.value = chosen;
        this.updateTextStats();
        input.focus();
        this.app.showToast("Sample narration prompt inserted", "info");
    },

    async loadVoices() {
        const select = this.container.querySelector("#ttsVoiceSelect");
        try {
            const res = await fetch("/api/tts/voices");
            const data = await this.parseJsonResponse(res, "/api/tts/voices");

            if (res.ok && data.success && Array.isArray(data.voices)) {
                this.state.voices = data.voices;
                this.renderVoiceOptions(data.voices);
            } else {
                throw new Error(data.error || "Could not fetch voices");
            }
        } catch (err) {
            console.warn("[TTS] Error loading voices from server:", err);
            // Fallback list of top voices
            const fallbackVoices = [
                { id: "en-US-JennyNeural", name: "Jenny (US English, Female)", category: "Featured" },
                { id: "en-US-GuyNeural", name: "Guy (US English, Male)", category: "Featured" },
                { id: "en-US-AriaNeural", name: "Aria (US English, Female)", category: "Featured" },
                { id: "en-GB-SoniaNeural", name: "Sonia (British English, Female)", category: "Featured" },
                { id: "en-GB-RyanNeural", name: "Ryan (British English, Male)", category: "Featured" },
                { id: "en-IN-NeerjaNeural", name: "Neerja (Indian English, Female)", category: "Featured" },
                { id: "hi-IN-SwaraNeural", name: "Swara (Hindi, Female)", category: "Featured" }
            ];
            this.state.voices = fallbackVoices;
            this.renderVoiceOptions(fallbackVoices);
        }
    },

    renderVoiceOptions(voices) {
        const select = this.container.querySelector("#ttsVoiceSelect");
        if (!select) return;

        select.innerHTML = "";

        // Group voices by category
        const groups = {};
        for (const v of voices) {
            const cat = v.category || "Other Voices";
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(v);
        }

        for (const [category, voiceList] of Object.entries(groups)) {
            const optgroup = document.createElement("optgroup");
            optgroup.label = category;
            for (const v of voiceList) {
                const opt = document.createElement("option");
                opt.value = v.id;
                opt.textContent = `${v.name}${v.gender ? ` [${v.gender}]` : ""}`;
                optgroup.appendChild(opt);
            }
            select.appendChild(optgroup);
        }

        // Set default or previous selected
        if (this.state.selectedVoice) {
            select.value = this.state.selectedVoice;
        }
        this.updateVoiceHint();
    },

    async loadHistory(notify = false) {
        try {
            const res = await fetch("/api/tts/history");
            const data = await this.parseJsonResponse(res, "/api/tts/history");

            if (res.ok && data.success && Array.isArray(data.files)) {
                this.state.history = data.files;
                this.renderHistory(data.files);
                if (notify) {
                    this.app.showToast(`Loaded ${data.files.length} saved audio file(s)`, "info");
                }
            }
        } catch (err) {
            console.warn("[TTS] Error loading history:", err);
        }
    },

    renderHistory(files) {
        const container = this.container.querySelector("#ttsHistoryList");
        if (!container) return;

        if (!files || files.length === 0) {
            container.innerHTML = `
                <div class="tts-empty-history">
                    <span class="tts-empty-icon">📁</span>
                    <span>No local audio generated yet. Your generated MP3s will appear here.</span>
                </div>
            `;
            return;
        }

        container.innerHTML = "";
        files.forEach(item => {
            const el = document.createElement("div");
            el.className = `tts-history-item ${this.state.activeHistoryFilename === item.filename ? "playing" : ""}`;
            el.id = `history-item-${item.filename.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

            const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "";
            const timeStr = item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
            const sizeKb = item.size ? (item.size / 1024).toFixed(1) + " KB" : "";
            const voiceShort = (item.voice || "").replace("Neural", "").split("-").pop() || item.voice || "Voice";
            const snippet = item.text ? item.text.replace(/\n+/g, " ") : "Generated Audio";

            el.innerHTML = `
                <button class="tts-history-play-btn ${this.state.activeHistoryFilename === item.filename ? "is-active" : ""}" title="Play Audio">
                    ${this.state.activeHistoryFilename === item.filename ? "⏸" : "▶"}
                </button>
                <div class="tts-history-details">
                    <div class="tts-history-title-row">
                        <span class="tts-history-name" title="${this.escapeHtml(item.filename)}">${this.escapeHtml(item.filename)}</span>
                        <span class="tts-voice-badge">${this.escapeHtml(voiceShort)}</span>
                    </div>
                    <div class="tts-history-snippet" title="${this.escapeHtml(snippet)}">${this.escapeHtml(snippet)}</div>
                    <div class="tts-history-footer">
                        <span>${timeStr} ${dateStr}</span>
                        <span>•</span>
                        <span>${sizeKb}</span>
                    </div>
                </div>
                <div class="tts-history-actions">
                    <button class="btn btn-sm btn-icon-only tts-download-file-btn" title="Download MP3">⬇️</button>
                    <button class="btn btn-sm btn-icon-only btn-danger tts-delete-file-btn" title="Delete from disk">🗑️</button>
                </div>
            `;

            // Play / pause click
            el.querySelector(".tts-history-play-btn").onclick = () => this.togglePlayHistory(item);

            // Download click
            el.querySelector(".tts-download-file-btn").onclick = (e) => {
                e.stopPropagation();
                this.downloadAudio(item.url, item.filename);
            };

            // Delete click
            el.querySelector(".tts-delete-file-btn").onclick = (e) => {
                e.stopPropagation();
                this.deleteHistory(item.filename);
            };

            container.appendChild(el);
        });
    },

    togglePlayHistory(item) {
        const player = this.container.querySelector("#ttsAudioPlayer");
        if (this.state.activeHistoryFilename === item.filename && !player.paused) {
            player.pause();
            this.state.activeHistoryFilename = null;
            this.renderHistory(this.state.history);
        } else {
            this.playAudioItem(item);
        }
    },

    playAudioItem(item) {
        const player = this.container.querySelector("#ttsAudioPlayer");
        if (!player) return;

        this.state.currentAudio = item;
        this.state.activeHistoryFilename = item.filename;

        // Update player info banner
        const titleEl = this.container.querySelector("#ttsActiveTitle");
        const metaEl = this.container.querySelector("#ttsActiveMeta");
        const actionsEl = this.container.querySelector("#ttsPlayerActions");

        titleEl.textContent = item.filename;
        titleEl.title = item.filename;
        const voiceShort = (item.voice || "").replace("Neural", "");
        const sizeKb = item.size ? (item.size / 1024).toFixed(1) + " KB" : "";
        metaEl.textContent = `Voice: ${voiceShort} • Size: ${sizeKb} • Saved locally`;
        actionsEl.style.display = "flex";

        player.src = item.url;
        player.play().catch(e => {
            console.debug("[TTS] Auto-play prevented or interrupted:", e);
        });

        this.renderHistory(this.state.history);
        this.app.log(this.id, `Playing audio: ${item.filename}`);
    },

    async generateSpeech() {
        const textarea = this.container.querySelector("#ttsTextInput");
        const text = textarea.value.trim();

        if (!text) {
            this.app.showToast("Please enter narration or prompt text to generate speech.", "error");
            textarea.focus();
            return;
        }

        const voiceSelect = this.container.querySelector("#ttsVoiceSelect");
        const voice = voiceSelect.value || "en-US-JennyNeural";
        const customFilename = this.container.querySelector("#ttsCustomFilename").value.trim();

        const btn = this.container.querySelector("#ttsGenerateBtn");
        const btnIcon = this.container.querySelector("#ttsBtnIcon");
        const btnLabel = this.container.querySelector("#ttsBtnLabel");

        this.state.isGenerating = true;
        btn.disabled = true;
        btnIcon.innerHTML = `<span class="tts-spinner"></span>`;
        btnLabel.textContent = "Synthesizing Speech with Python...";

        this.app.log(this.id, "Generating speech...", { voice, length: text.length, rate: this.state.rate, pitch: this.state.pitch });

        try {
            const res = await fetch("/api/tts/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: text,
                    voice: voice,
                    rate: this.state.rate,
                    pitch: this.state.pitch,
                    filename: customFilename
                })
            });

            const result = await this.parseJsonResponse(res, "/api/tts/generate");

            if (res.ok && result.success) {
                this.app.log(this.id, `Speech generated successfully: ${result.filename}`, { size: result.size });
                this.app.showToast(`Generated: ${result.filename} (${(result.size / 1024).toFixed(1)} KB)`, "success");

                // Immediately load into active player and auto-play
                this.playAudioItem(result);

                // Reload history from server
                await this.loadHistory();
            } else {
                throw new Error(result.error || "Generation failed on server");
            }
        } catch (err) {
            console.error("[TTS Error]", err);
            this.app.showToast(`Generation failed: ${err.message}`, "error");
            this.app.log(this.id, `TTS generation failed: ${err.message}`);
        } finally {
            this.state.isGenerating = false;
            btn.disabled = false;
            btnIcon.textContent = "⚡";
            btnLabel.textContent = "Generate Speech & Play";
        }
    },

    async downloadAudio(url, filename) {
        this.app.showToast(`Downloading ${filename}...`, "info");
        try {
            const downloadUrl = url + (url.includes("?") ? "&" : "?") + "download=1";
            const res = await fetch(downloadUrl);
            if (!res.ok) {
                throw new Error(`Server returned HTTP ${res.status}`);
            }
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = filename || "speech.mp3";
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
            }, 2000);

            this.app.showToast(`Saved to Downloads: ${filename}`, "success");
            this.app.log(this.id, `Downloaded audio file: ${filename}`);
        } catch (err) {
            console.warn("[TTS Download] Blob fetch failed, falling back to direct anchor link:", err);
            const a = document.createElement("a");
            a.href = url + (url.includes("?") ? "&" : "?") + "download=1";
            a.download = filename || "speech.mp3";
            document.body.appendChild(a);
            a.click();
            setTimeout(() => document.body.removeChild(a), 500);
            this.app.showToast(`Downloading via browser: ${filename}`, "info");
        }
    },

    async deleteHistory(filename) {
        if (!confirm(`Are you sure you want to delete "${filename}" from your local disk?`)) {
            return;
        }

        try {
            const res = await fetch("/api/tts/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename })
            });

            const result = await this.parseJsonResponse(res, "/api/tts/delete");
            if (res.ok && result.success) {
                this.app.showToast(`Deleted ${filename}`, "success");
                this.app.log(this.id, `Deleted audio file: ${filename}`);

                // If currently playing, reset player
                if (this.state.currentAudio && this.state.currentAudio.filename === filename) {
                    const player = this.container.querySelector("#ttsAudioPlayer");
                    player.pause();
                    player.src = "";
                    this.state.currentAudio = null;
                    this.state.activeHistoryFilename = null;
                    this.container.querySelector("#ttsActiveTitle").textContent = "No audio selected";
                    this.container.querySelector("#ttsActiveMeta").textContent = "";
                    this.container.querySelector("#ttsPlayerActions").style.display = "none";
                }

                await this.loadHistory();
            } else {
                throw new Error(result.error || "Could not delete file");
            }
        } catch (err) {
            this.app.showToast(`Failed to delete: ${err.message}`, "error");
        }
    },

    async openAudioFolder() {
        try {
            const res = await fetch("/api/open-folder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ folder: "audio" })
            });
            const data = await this.parseJsonResponse(res, "/api/open-folder");
            if (res.ok && data.success) {
                this.app.showToast("Opened audio/ folder in Windows Explorer", "success");
                this.app.log(this.id, "Opened audio folder in file explorer");
            } else {
                throw new Error(data.error || "Could not open folder");
            }
        } catch (err) {
            this.app.showToast(`Could not open audio folder: ${err.message}`, "error");
        }
    },

    async parseJsonResponse(res, endpointName = "request") {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            try {
                return await res.json();
            } catch (e) {
                throw new Error(`Malformed JSON response from server: ${e.message}`);
            }
        }
        const text = await res.text();
        if (res.status === 404) {
            throw new Error(`Endpoint ${endpointName} returned 404 (Not Found). Please restart python server.py or PandaStudio.exe so it runs the latest server code.`);
        }
        throw new Error(`Server returned status ${res.status}: ${text.slice(0, 150)}`);
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

window.TtsModule = TtsModule;
