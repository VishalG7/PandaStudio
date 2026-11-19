/**
 * Module 3 (Bonus): Grid Slicer (N-Tiles)
 * Splits an image into arbitrary N-tile grids (1x1, 2x2, 3x3, etc.)
 * with custom label naming and JSZip bulk download.
 */

export const GridSplitterModule = {
    id: "grid-splitter",
    name: "Grid Slicer (N-Tiles)",
    icon: "🪟",

    state: {
        selectedFile: null,
        imageObject: null,
        tilesCount: 4,
        croppedTiles: []
    },

    init(container, app) {
        this.container = container;
        this.app = app;
        this.render();
        this.bindEvents();
    },

    render() {
        this.container.innerHTML = `
            <div class="trimmer-container">
                <div class="trimmer-header">
                    <h2>🪟 General Grid Slicer</h2>
                    <p>Split any image into an arbitrary grid of tiles (e.g. 4 for 2×2, 9 for 3×3, 16 for 4×4) with custom per-tile naming arguments and batch ZIP packaging.</p>
                </div>

                <div class="trimmer-card">
                    <div class="trimmer-grid-setup">
                        <!-- Dropzone -->
                        <div class="drop-area" id="gridDropArea">
                            <span class="drop-icon">🖼️</span>
                            <div class="drop-text" id="gridDropLabel">Select or Drop Image</div>
                            <div class="drop-sub" id="gridDropSub">Supports JPG, PNG, WEBP</div>
                            <input type="file" id="gridFileInput" accept="image/*" style="display:none;">
                        </div>

                        <!-- Settings -->
                        <div class="settings-box">
                            <div class="form-group">
                                <label class="form-label" for="gridCountInput">Number of Tiles</label>
                                <input type="number" id="gridCountInput" class="form-input" min="1" max="100" value="4">
                                <div class="form-hint" id="gridCalcHint">Grid layout: 2 columns × 2 rows</div>
                            </div>

                            <div class="form-group">
                                <label class="form-label">Tile Name Suffixes / Arguments</label>
                                <div id="gridArgsRow" style="display:flex; gap:6px; flex-wrap:wrap; max-height:100px; overflow-y:auto; padding:4px 0;"></div>
                            </div>
                        </div>
                    </div>

                    <div class="trimmer-actions">
                        <button type="button" class="btn btn-primary" id="gridExecuteBtn" disabled>
                            ⚡ Slice Grid
                        </button>
                        <button type="button" class="btn btn-success" id="gridZipBtn" style="display:none;">
                            📦 Download All as ZIP
                        </button>
                        <span class="status-badge" id="gridStatus">Choose an image to begin.</span>
                    </div>
                </div>

                <!-- Results -->
                <div class="results-section" id="gridPreviewSection" style="display:none;">
                    <div class="source-card">
                        <h3>Original Image</h3>
                        <div class="source-img-wrap">
                            <img id="gridSourceImg" alt="Original">
                        </div>
                    </div>

                    <div class="panels-card">
                        <h3>Sliced Slices</h3>
                        <div class="panel-results-grid" id="gridResultsGrid"></div>
                    </div>
                </div>
            </div>
        `;
    },

    bindEvents() {
        const root = this.container;
        const dropArea = root.querySelector("#gridDropArea");
        const fileInput = root.querySelector("#gridFileInput");
        const countInput = root.querySelector("#gridCountInput");
        const executeBtn = root.querySelector("#gridExecuteBtn");
        const zipBtn = root.querySelector("#gridZipBtn");

        dropArea.onclick = () => fileInput.click();

        dropArea.addEventListener("dragover", e => {
            e.preventDefault();
            dropArea.classList.add("dragover");
        });
        dropArea.addEventListener("dragleave", () => dropArea.classList.remove("dragover"));
        dropArea.addEventListener("drop", e => {
            e.preventDefault();
            dropArea.classList.remove("dragover");
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                this.handleFile(e.dataTransfer.files[0]);
            }
        });

        fileInput.onchange = () => {
            if (fileInput.files && fileInput.files[0]) {
                this.handleFile(fileInput.files[0]);
            }
        };

        countInput.oninput = () => {
            const val = parseInt(countInput.value, 10);
            this.state.tilesCount = Math.max(1, isNaN(val) ? 1 : val);
            this.updateArgInputs();
        };

        executeBtn.onclick = () => this.executeSlice();
        zipBtn.onclick = () => this.downloadZip();

        this.updateArgInputs();
    },

    updateArgInputs() {
        const count = this.state.tilesCount;
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        this.container.querySelector("#gridCalcHint").textContent = `Grid layout: ${cols} columns × ${rows} rows`;

        const argsRow = this.container.querySelector("#gridArgsRow");
        argsRow.innerHTML = "";

        for (let i = 1; i <= count; i++) {
            const inp = document.createElement("input");
            inp.type = "text";
            inp.className = "form-input";
            inp.style.width = "48px";
            inp.style.padding = "4px 6px";
            inp.style.textAlign = "center";
            inp.style.fontSize = "12px";
            inp.value = String(i);
            inp.id = `grid-arg-${i}`;
            argsRow.appendChild(inp);
        }
    },

    handleFile(file) {
        this.state.selectedFile = file;
        this.container.querySelector("#gridExecuteBtn").disabled = false;
        this.container.querySelector("#gridResultsGrid").innerHTML = "";
        this.container.querySelector("#gridZipBtn").style.display = "none";

        const url = URL.createObjectURL(file);
        this.container.querySelector("#gridSourceImg").src = url;

        this.state.imageObject = new Image();
        this.state.imageObject.src = url;
        this.state.imageObject.onload = () => {
            const w = this.state.imageObject.naturalWidth;
            const h = this.state.imageObject.naturalHeight;
            this.container.querySelector("#gridDropLabel").textContent = file.name;
            this.container.querySelector("#gridDropSub").textContent = `${w} × ${h}px • ${(file.size / 1024).toFixed(1)} KB`;
            this.container.querySelector("#gridStatus").textContent = `Ready to slice ${this.state.tilesCount} tiles.`;
            this.container.querySelector("#gridPreviewSection").style.display = "grid";
            this.app.log(this.id, `Loaded image for grid slicing: "${file.name}"`, { dimensions: `${w}x${h}`, tilesCount: this.state.tilesCount });
        };
    },

    async executeSlice() {
        if (!this.state.selectedFile || !this.state.imageObject) return;

        const img = this.state.imageObject;
        const count = this.state.tilesCount;
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        const tileW = img.width / cols;
        const tileH = img.height / rows;

        const resultsGrid = this.container.querySelector("#gridResultsGrid");
        resultsGrid.innerHTML = "";
        this.state.croppedTiles = [];

        for (let i = 0; i < count; i++) {
            const argInp = this.container.querySelector(`#grid-arg-${i + 1}`);
            const label = argInp ? argInp.value.trim() || String(i + 1) : String(i + 1);

            const col = i % cols;
            const row = Math.floor(i / cols);

            const canvas = document.createElement("canvas");
            canvas.width = Math.round(tileW);
            canvas.height = Math.round(tileH);
            const ctx = canvas.getContext("2d");

            ctx.drawImage(img, col * tileW, row * tileH, tileW, tileH, 0, 0, canvas.width, canvas.height);

            const dataUrl = canvas.toDataURL("image/png");
            const fileName = `crop_${label}.png`;

            this.state.croppedTiles.push({
                name: fileName,
                dataUrl: dataUrl
            });

            const card = document.createElement("div");
            card.className = "panel-item-card";
            card.innerHTML = `
                <div class="panel-img-preview">
                    <img src="${dataUrl}" alt="${fileName}">
                </div>
                <div class="panel-item-meta">
                    <div>
                        <div class="panel-item-title">${fileName}</div>
                        <div class="panel-item-dim">${canvas.width} × ${canvas.height}px</div>
                    </div>
                    <a class="btn btn-sm" href="${dataUrl}" download="${fileName}">⬇️ Save</a>
                </div>
            `;
            resultsGrid.appendChild(card);
        }

        this.container.querySelector("#gridZipBtn").style.display = "inline-flex";
        this.container.querySelector("#gridStatus").textContent = `Sliced into ${count} tiles.`;
        this.app.log(this.id, `Executed grid slice into ${count} tiles`);
        this.app.showToast(`Sliced ${count} tiles successfully`, "success");
    },

    async downloadZip() {
        if (!this.state.croppedTiles.length) return;

        if (!window.JSZip) {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
            document.head.appendChild(script);
            await new Promise(r => script.onload = r);
        }

        const zip = new window.JSZip();
        for (const item of this.state.croppedTiles) {
            const base64 = item.dataUrl.split(",")[1];
            zip.file(item.name, base64, { base64: true });
        }

        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cropped_tiles.zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        this.app.log(this.id, `Downloaded ZIP archive of ${this.state.croppedTiles.length} grid tiles`);
        this.app.showToast("Downloaded ZIP archive", "success");
    }
};
