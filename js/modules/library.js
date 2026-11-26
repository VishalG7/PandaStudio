/**
 * Module 2: Local Image & Text Library
 * Complete restoration of the existing index.html functionality:
 * IndexedDB storage, paired image+text cards, clipboard actions,
 * tagging, grouping, search, backup/export and import.
 */

import { openDatabase, dbPut, dbGetAll, dbDelete } from "../utils/db.js";
import { App } from "../app.js";

export const LibraryModule = {
    id: "library",
    name: "Image & Text Library",
    icon: "📋",

    state: {
        items: [],
        groups: [],
        currentFilter: { type: "all", value: null },
        editingItemId: null,
        detailItemId: null,
        pendingImageBlob: null,
        pendingImageRemoved: false,
        selectedItemIds: new Set(),
        itemModalBaseline: null,
        groupModalBaseline: ""
    },

    async init(container, app) {
        this.container = container;
        this.app = app;
        this.renderShell();
        this.bindEvents();

        try {
            await openDatabase();
            await this.loadData();
        } catch (err) {
            console.error("IndexedDB initialization error:", err);
            this.app.showToast("Could not load local database.", "error");
        }
    },

    async onActivate() {
        // Automatically reload data from IndexedDB whenever user switches to this tab
        try {
            await this.loadData();
        } catch (err) {
            console.error("[LibraryModule] onActivate reload error:", err);
        }
    },

    renderShell() {
        this.container.innerHTML = `
            <div class="library-layout">
                <!-- Toolbar -->
                <div class="library-toolbar">
                    <div class="library-search-wrap">
                        <span class="search-icon-svg">🔍</span>
                        <input id="libSearchInput" class="library-search-input" type="text" placeholder="Search title, text, or tags...">
                    </div>

                    <div class="library-actions">
                        <button class="btn btn-sm" id="libImportBtn">📥 Import JSON</button>
                        <button class="btn btn-sm" id="libExportBtn">📤 Export / Backup</button>
                        <button class="btn btn-sm btn-primary" id="libNewItemBtn">＋ New Item</button>
                        <input type="file" id="libImportFileInput" accept=".json" style="display:none;">
                    </div>
                </div>

                <!-- Main Content Area -->
                <div class="library-workspace">
                    <!-- Sidebar -->
                    <aside class="library-sidebar">
                        <div class="sidebar-heading">Navigation</div>
                        <button class="sidebar-nav-item active" id="filterAllBtn">
                            <span>📚 All Items</span>
                            <span class="sidebar-count-badge" id="allCountBadge">0</span>
                        </button>
                        <button class="sidebar-nav-item" id="filterPendingBtn">
                            <span>⏳ Pending / Todo</span>
                            <span class="sidebar-count-badge" id="pendingCountBadge">0</span>
                        </button>
                        <button class="sidebar-nav-item" id="filterDoneBtn">
                            <span>✅ Done</span>
                            <span class="sidebar-count-badge" id="doneCountBadge">0</span>
                        </button>
                        <button class="sidebar-nav-item" id="filterFavBtn">
                            <span>⭐ Favorites</span>
                            <span class="sidebar-count-badge" id="favCountBadge">0</span>
                        </button>

                        <div class="sidebar-heading" style="display:flex; justify-content:space-between; align-items:center;">
                            <span>Groups</span>
                            <button id="sidebarNewGroupBtn" class="btn btn-sm" style="padding:1px 6px; font-size:11px;" title="New Group">＋</button>
                        </div>
                        <div id="groupsListContainer" style="display:flex; flex-direction:column; gap:2px;"></div>

                        <div class="sidebar-heading">Tags</div>
                        <div class="tag-cloud" id="tagsListContainer"></div>
                    </aside>

                    <!-- Gallery Main -->
                    <main class="library-main">
                        <div class="gallery-header">
                            <div class="gallery-title-box">
                                <h2 id="galleryTitle">All Items</h2>
                                <div class="gallery-subtitle" id="galleryCountLabel">0 items</div>
                            </div>
                            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                                <button class="btn btn-sm btn-success" id="libBulkDoneBtn" style="display:none;">✓ Mark Done</button>
                                <button class="btn btn-sm" id="libBulkUndoneBtn" style="display:none;">↩ Mark Incomplete</button>
                                <button class="btn btn-sm btn-danger" id="libBulkDeleteBtn" style="display:none;">🗑️ Delete Selected (<span id="libSelectedCount">0</span>)</button>
                                <button class="btn btn-sm" id="libSelectAllBtn">Select All</button>
                                <button class="btn btn-sm" id="libClearFilterBtn" style="display:none;">✕ Clear Filter</button>
                            </div>
                        </div>

                        <div class="cards-grid" id="cardsGridContainer"></div>
                    </main>
                </div>
            </div>

            <!-- MODAL: Item Create/Edit -->
            <div class="modal-backdrop" id="itemModal">
                <div class="modal-window">
                    <div class="modal-header">
                        <h3 class="modal-title" id="itemModalTitle">New Item</h3>
                        <button class="modal-close-btn" id="closeItemModalBtn">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label" for="itemTitleInput">Title</label>
                            <input type="text" id="itemTitleInput" class="form-input" placeholder="e.g. 1. Stick Insect or Scene Title">
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="itemGroupSelect">Group</label>
                            <select id="itemGroupSelect" class="form-select"></select>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Image (Paste, Drag & Drop, or Pick)</label>
                            <div class="paste-box" id="itemPasteBox" tabindex="0">
                                <div>🖼️ Paste (Ctrl+V) or Drop Image Here</div>
                                <div class="form-hint">Click here or select file below</div>
                            </div>
                            <div style="display:flex; gap:10px; margin-top:8px;">
                                <input type="file" id="itemFilePicker" accept="image/*" style="display:none;">
                                <button type="button" class="btn btn-sm" id="itemPickFileBtn">Choose Image File</button>
                                <button type="button" class="btn btn-sm btn-danger" id="itemRemoveImageBtn" style="display:none;">Remove Image</button>
                            </div>
                            <div class="paste-preview-wrap" id="itemImagePreviewWrap" style="display:none;">
                                <img id="itemImagePreviewImg" alt="Preview">
                            </div>
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="itemTextInput">Text / Prompt / Description</label>
                            <textarea id="itemTextInput" class="form-textarea" placeholder="Paste or type description, video prompt, or text content..."></textarea>
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="itemTagsInput">Tags (comma-separated)</label>
                            <input type="text" id="itemTagsInput" class="form-input" placeholder="macro, insect, nature">
                        </div>

                        <div class="form-group" style="display:flex; gap:24px; align-items:center; flex-wrap:wrap;">
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                <input type="checkbox" id="itemFavCheckbox">
                                <span style="font-size:13.5px; font-weight:600;">⭐ Mark as Favorite</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                <input type="checkbox" id="itemDoneCheckbox">
                                <span style="font-size:13.5px; font-weight:600;">✓ Mark as Done</span>
                            </label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn" id="cancelItemModalBtn">Cancel</button>
                        <button class="btn btn-primary" id="saveItemModalBtn">Save Item</button>
                    </div>
                </div>
            </div>

            <!-- MODAL: Item Detail -->
            <div class="modal-backdrop" id="detailModal">
                <div class="modal-window" style="max-width:850px;">
                    <div class="modal-header">
                        <h3 class="modal-title" id="detailModalTitle">Item Details</h3>
                        <button class="modal-close-btn" id="closeDetailModalBtn">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="detail-grid">
                            <div class="detail-media" id="detailMediaWrap">
                                <img id="detailImg" alt="Preview" style="display:none;">
                                <div id="detailNoImg" style="color:var(--text-muted); font-size:40px;">📋</div>
                            </div>
                            <div class="detail-info">
                                <h2 class="detail-title" id="detailTitleText"></h2>
                                
                                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                                    <span class="type-badge" id="detailTypeBadge"></span>
                                    <span class="sidebar-count-badge" id="detailGroupBadge"></span>
                                    <button class="btn btn-sm" id="detailToggleFavBtn">⭐ Favorite</button>
                                    <button class="btn btn-sm" id="detailToggleDoneBtn">✓ Mark as Done</button>
                                </div>

                                <div>
                                    <label class="form-label">Content Text</label>
                                    <div class="detail-text-card" id="detailContentText"></div>
                                </div>

                                <div>
                                    <label class="form-label">Tags</label>
                                    <div class="card-tags" id="detailTagsWrap"></div>
                                </div>

                                <div style="font-size:11px; color:var(--text-muted);" id="detailTimestamps"></div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer" style="justify-content:space-between;">
                        <button class="btn btn-danger btn-sm" id="detailDeleteBtn">🗑️ Delete</button>
                        <div style="display:flex; gap:8px;">
                            <button class="btn btn-sm" id="detailCopyImageBtn">📋 Copy Image</button>
                            <button class="btn btn-sm" id="detailCopyTextBtn">📝 Copy Text</button>
                            <button class="btn btn-sm btn-primary" id="detailCopyBothBtn">✨ Copy Both</button>
                            <button class="btn btn-sm" id="detailEditBtn">✏️ Edit</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- MODAL: Group Management -->
            <div class="modal-backdrop" id="groupModal">
                <div class="modal-window" style="max-width:440px;">
                    <div class="modal-header">
                        <h3 class="modal-title" id="groupModalTitle">Create Group</h3>
                        <button class="modal-close-btn" id="closeGroupModalBtn">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label" for="groupNameInput">Group Name</label>
                            <input type="text" id="groupNameInput" class="form-input" placeholder="e.g. Poems or Video Clips">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn" id="cancelGroupModalBtn">Cancel</button>
                        <button class="btn btn-primary" id="saveGroupModalBtn">Save Group</button>
                    </div>
                </div>
            </div>
        `;
    },

    bindEvents() {
        const root = this.container;

        // Toolbar Events
        root.querySelector("#libSearchInput").addEventListener("input", () => this.renderItems());
        root.querySelector("#libNewItemBtn").onclick = () => this.openNewItem();
        root.querySelector("#sidebarNewGroupBtn").onclick = () => this.openGroupModal();
        root.querySelector("#libClearFilterBtn").onclick = () => this.setFilter("all", null);
        root.querySelector("#libBulkDoneBtn").onclick = () => this.bulkSetDone(true);
        root.querySelector("#libBulkUndoneBtn").onclick = () => this.bulkSetDone(false);
        root.querySelector("#libBulkDeleteBtn").onclick = () => this.deleteSelectedItems();
        root.querySelector("#libSelectAllBtn").onclick = () => this.toggleSelectAll();
        root.querySelector("#libExportBtn").onclick = () => this.exportBackup();
        root.querySelector("#libImportBtn").onclick = () => root.querySelector("#libImportFileInput").click();
        root.querySelector("#libImportFileInput").onchange = e => this.handleImportFile(e);

        // Sidebar Navigation
        root.querySelector("#filterAllBtn").onclick = () => this.setFilter("all", null);
        root.querySelector("#filterPendingBtn").onclick = () => this.setFilter("pending", null);
        root.querySelector("#filterDoneBtn").onclick = () => this.setFilter("done", null);
        root.querySelector("#filterFavBtn").onclick = () => this.setFilter("favorites", null);

        // Item Modal
        root.querySelector("#closeItemModalBtn").onclick = () => this.closeItemModal();
        root.querySelector("#cancelItemModalBtn").onclick = () => this.closeItemModal();
        root.querySelector("#saveItemModalBtn").onclick = () => this.saveItem();

        // Image Paste & File Pick
        const pasteBox = root.querySelector("#itemPasteBox");
        const filePicker = root.querySelector("#itemFilePicker");
        const pickBtn = root.querySelector("#itemPickFileBtn");
        const removeImgBtn = root.querySelector("#itemRemoveImageBtn");

        pickBtn.onclick = () => filePicker.click();
        filePicker.onchange = () => {
            if (filePicker.files && filePicker.files[0]) {
                this.handleImageBlob(filePicker.files[0]);
            }
        };

        removeImgBtn.onclick = () => {
            this.state.pendingImageBlob = null;
            this.state.pendingImageRemoved = true;
            root.querySelector("#itemImagePreviewWrap").style.display = "none";
            root.querySelector("#itemImagePreviewImg").src = "";
            removeImgBtn.style.display = "none";
        };

        pasteBox.addEventListener("paste", e => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (const item of items) {
                if (item.type.indexOf("image") === 0) {
                    const blob = item.getAsFile();
                    this.handleImageBlob(blob);
                    e.preventDefault();
                    break;
                }
            }
        });

        pasteBox.addEventListener("dragover", e => {
            e.preventDefault();
            pasteBox.classList.add("dragover");
        });

        pasteBox.addEventListener("dragleave", () => pasteBox.classList.remove("dragover"));

        pasteBox.addEventListener("drop", e => {
            e.preventDefault();
            pasteBox.classList.remove("dragover");
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                this.handleImageBlob(e.dataTransfer.files[0]);
            }
        });

        // Detail Modal
        root.querySelector("#closeDetailModalBtn").onclick = () => this.closeDetailModal();
        root.querySelector("#detailDeleteBtn").onclick = () => this.deleteDetailItem();
        root.querySelector("#detailEditBtn").onclick = () => {
            const id = this.state.detailItemId;
            this.closeDetailModal();
            this.openEditItem(id);
        };
        root.querySelector("#detailToggleFavBtn").onclick = () => this.toggleFavorite(this.state.detailItemId);
        root.querySelector("#detailToggleDoneBtn").onclick = () => this.toggleDone(this.state.detailItemId);
        root.querySelector("#detailCopyImageBtn").onclick = () => {
            const item = this.state.items.find(i => i.id === this.state.detailItemId);
            this.copyImage(item);
        };
        root.querySelector("#detailCopyTextBtn").onclick = () => {
            const item = this.state.items.find(i => i.id === this.state.detailItemId);
            this.copyText(item);
        };
        root.querySelector("#detailCopyBothBtn").onclick = () => {
            const item = this.state.items.find(i => i.id === this.state.detailItemId);
            this.copyBoth(item);
        };

        // Group Modal
        root.querySelector("#closeGroupModalBtn").onclick = () => root.querySelector("#groupModal").classList.remove("show");
        root.querySelector("#cancelGroupModalBtn").onclick = () => root.querySelector("#groupModal").classList.remove("show");
        root.querySelector("#saveGroupModalBtn").onclick = () => this.saveGroup();

        // Backdrop Click-Outside Handlers
        const itemModal = root.querySelector("#itemModal");
        if (itemModal) {
            itemModal.addEventListener("click", e => {
                if (e.target === itemModal) {
                    if (this.hasItemModalUnsavedChanges()) {
                        this.shakeModal(itemModal);
                        this.app.showToast("Unsaved changes: click Save or Cancel to exit", "warning", 2000);
                    } else {
                        this.closeItemModal();
                    }
                }
            });
        }

        const detailModal = root.querySelector("#detailModal");
        if (detailModal) {
            detailModal.addEventListener("click", e => {
                if (e.target === detailModal) {
                    this.closeDetailModal();
                }
            });
        }

        const groupModal = root.querySelector("#groupModal");
        if (groupModal) {
            groupModal.addEventListener("click", e => {
                if (e.target === groupModal) {
                    const val = (root.querySelector("#groupNameInput")?.value || "").trim();
                    if (val && val !== (this.state.groupModalBaseline || "")) {
                        this.shakeModal(groupModal);
                    } else {
                        groupModal.classList.remove("show");
                    }
                }
            });
        }
    },

    onKeyDown(event) {
        if (event.ctrlKey && event.key.toLowerCase() === "n") {
            event.preventDefault();
            this.openNewItem();
        }
    },

    onEscape(event) {
        const root = this.container;
        const itemModal = root.querySelector("#itemModal");
        const detailModal = root.querySelector("#detailModal");
        const groupModal = root.querySelector("#groupModal");

        // 1. Item Create / Edit Modal: if unsaved changes exist, stay open; otherwise close
        if (itemModal && itemModal.classList.contains("show")) {
            if (this.hasItemModalUnsavedChanges()) {
                this.shakeModal(itemModal);
                this.app.showToast("Unsaved changes: click Save or Cancel to exit", "warning", 2000);
                return true; // Prevent close, stay on dialog
            }
            this.closeItemModal();
            return true; // Handled clean close
        }

        // 2. Item Detail View Modal: saved item details with no changes -> close on escape
        if (detailModal && detailModal.classList.contains("show")) {
            this.closeDetailModal();
            return true;
        }

        // 3. Group Management Modal
        if (groupModal && groupModal.classList.contains("show")) {
            const val = (root.querySelector("#groupNameInput")?.value || "").trim();
            if (val && val !== (this.state.groupModalBaseline || "")) {
                this.shakeModal(groupModal);
                return true; // Prevent close
            }
            groupModal.classList.remove("show");
            return true;
        }

        return false;
    },

    async loadData() {
        this.state.groups = ((await dbGetAll("groups")) || []).sort(
            (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
        );
        this.state.items = (await dbGetAll("items")) || [];

        // Clean up orphan items if their assigned group was deleted and no longer exists
        const validGroupIds = new Set(this.state.groups.map(g => g.id));
        const validGroupNames = new Set(this.state.groups.map(g => String(g.name).toLowerCase()));

        const itemsToKeep = [];
        for (const it of this.state.items) {
            if (it.group) {
                const isValid = validGroupIds.has(it.group) || validGroupNames.has(String(it.group).toLowerCase());
                if (!isValid) {
                    await dbDelete("items", it.id);
                    continue;
                }
            } else if (!it.image) {
                // Clean up orphan item with no group and no image
                await dbDelete("items", it.id);
                continue;
            }
            itemsToKeep.push(it);
        }
        this.state.items = itemsToKeep;

        this.renderGroups();
        this.renderTags();
        this.renderItems();
        this.app.log(this.id, `Loaded library data`, { items: this.state.items.length, groups: this.state.groups.length });
    },

    setFilter(type, value) {
        this.state.currentFilter = { type, value };
        this.app.log(this.id, `Filter changed to "${type}"`, { value });

        const root = this.container;
        root.querySelectorAll(".sidebar-nav-item").forEach(btn => btn.classList.remove("active"));
        root.querySelectorAll(".tag-pill").forEach(p => p.classList.remove("active"));

        const clearBtn = root.querySelector("#libClearFilterBtn");
        const galleryTitle = root.querySelector("#galleryTitle");

        if (type === "all") {
            root.querySelector("#filterAllBtn").classList.add("active");
            galleryTitle.textContent = "All Items";
            clearBtn.style.display = "none";
        } else if (type === "pending") {
            const btn = root.querySelector("#filterPendingBtn");
            if (btn) btn.classList.add("active");
            galleryTitle.textContent = "⏳ Pending / Todo";
            clearBtn.style.display = "inline-flex";
        } else if (type === "done") {
            const btn = root.querySelector("#filterDoneBtn");
            if (btn) btn.classList.add("active");
            galleryTitle.textContent = "✅ Done Items";
            clearBtn.style.display = "inline-flex";
        } else if (type === "favorites") {
            root.querySelector("#filterFavBtn").classList.add("active");
            galleryTitle.textContent = "⭐ Favorites";
            clearBtn.style.display = "inline-flex";
        } else if (type === "group") {
            const grp = this.state.groups.find(g => g.id === value);
            galleryTitle.textContent = `Group: ${grp ? grp.name : "Unknown"}`;
            clearBtn.style.display = "inline-flex";
            const grpBtn = root.querySelector(`[data-group-id="${value}"]`);
            if (grpBtn) grpBtn.classList.add("active");
        } else if (type === "tag") {
            galleryTitle.textContent = `Tag: #${value}`;
            clearBtn.style.display = "inline-flex";
            const tagPill = root.querySelector(`[data-tag="${value}"]`);
            if (tagPill) tagPill.classList.add("active");
        }

        this.renderItems();
    },

    getFilteredItems() {
        const query = (this.container.querySelector("#libSearchInput").value || "").trim().toLowerCase();
        const { type, value } = this.state.currentFilter;

        return this.state.items.filter(item => {
            // Filter by type
            if (type === "pending" && item.done) return false;
            if (type === "done" && !item.done) return false;
            if (type === "favorites" && !item.favorite) return false;
            if (type === "group" && item.group !== value) return false;
            if (type === "tag" && (!item.tags || !item.tags.includes(value))) return false;

            // Search query
            if (query) {
                const matchTitle = (item.title || "").toLowerCase().includes(query);
                const matchText = (item.text || "").toLowerCase().includes(query);
                const matchTag = (item.tags || []).some(t => t.toLowerCase().includes(query));
                if (!matchTitle && !matchText && !matchTag) return false;
            }

            return true;
        });
    },

    renderItems() {
        const result = this.getFilteredItems().sort((a, b) => {
            // Natural numerical title sort (e.g. 1., 2., 28. Stick Insect)
            const numA = parseInt(String(a.title || "").match(/^\d+/)?.[0] || "999999", 10);
            const numB = parseInt(String(b.title || "").match(/^\d+/)?.[0] || "999999", 10);
            if (numA !== 999999 && numB !== 999999) return numA - numB;
            return (a.createdAt || 0) - (b.createdAt || 0);
        });

        const grid = this.container.querySelector("#cardsGridContainer");
        grid.innerHTML = "";

        const allCount = this.state.items.length;
        const favCount = this.state.items.filter(i => i.favorite).length;
        const doneCount = this.state.items.filter(i => !!i.done).length;
        const pendingCount = allCount - doneCount;

        this.container.querySelector("#allCountBadge").textContent = allCount;
        this.container.querySelector("#favCountBadge").textContent = favCount;
        const doneBadge = this.container.querySelector("#doneCountBadge");
        if (doneBadge) doneBadge.textContent = doneCount;
        const pendingBadge = this.container.querySelector("#pendingCountBadge");
        if (pendingBadge) pendingBadge.textContent = pendingCount;
        this.container.querySelector("#galleryCountLabel").textContent = `${result.length} item${result.length === 1 ? "" : "s"}`;

        if (result.length === 0) {
            grid.innerHTML = `
                <div style="grid-column:1/-1; padding:48px 20px; text-align:center; background:white; border-radius:var(--radius-lg); border:1px dashed var(--border);">
                    <div style="font-size:40px; margin-bottom:12px;">📭</div>
                    <h3 style="margin:0 0 6px;">No items match this view</h3>
                    <p style="color:var(--text-muted); font-size:13.5px; margin:0 0 16px;">Create a new item or clear active search and filters.</p>
                    <button type="button" class="btn btn-sm btn-primary" id="libEmptyCreateBtn">＋ Create Item</button>
                </div>
            `;
            const emptyBtn = grid.querySelector("#libEmptyCreateBtn");
            if (emptyBtn) {
                emptyBtn.onclick = () => this.openNewItem();
            }
            this.updateBulkActionUI(result);
            return;
        }

        result.forEach(item => {
            const card = document.createElement("div");
            card.className = "library-card";
            const isSelected = this.state.selectedItemIds.has(item.id);
            if (isSelected) card.classList.add("selected");
            if (item.done) card.classList.add("is-done");

            let imgSrc = "";
            if (item.image) {
                if (item.image instanceof Blob) {
                    imgSrc = URL.createObjectURL(item.image);
                } else if (typeof item.image === "string") {
                    imgSrc = item.image; // data-URL or regular URL
                }
            }
            const imgHtml = imgSrc
                ? `<div class="card-thumb-wrap"><img src="${imgSrc}" alt=""></div>`
                : `<div class="card-thumb-wrap"><span class="no-image-thumb">📄</span></div>`;

            const tagsHtml = (item.tags || []).slice(0, 3)
                .map(t => `<span class="card-tag">#${this.escapeHtml(t)}</span>`)
                .join("");

            const typeLabel = item.image && item.text ? "IMAGE + TEXT" : item.image ? "IMAGE" : "TEXT";
            const grp = this.state.groups.find(g => g.id === item.group);
            const grpName = grp ? grp.name : "";

            card.innerHTML = `
                <div class="card-select-wrap" title="Select item">
                    <input type="checkbox" class="card-select-chk" data-item-id="${this.escapeHtml(item.id)}" ${isSelected ? "checked" : ""}>
                </div>
                <div class="card-top-right-btns">
                    <button class="card-done-btn ${item.done ? "is-done" : ""}" title="${item.done ? "Done ✓ (Click to mark incomplete)" : "Click to mark as Done"}">
                        ${item.done ? "✓" : "○"}
                    </button>
                    <button class="card-delete-btn" title="Delete item">×</button>
                </div>
                ${imgHtml}
                <div class="card-content">
                    <div class="card-title">${this.escapeHtml(item.title || "Untitled")}</div>
                    <div class="card-snippet">${this.escapeHtml(item.text || "No description")}</div>
                    <div class="card-tags">${tagsHtml}</div>
                    <div class="card-quick-actions">
                        <button type="button" class="card-copy-btn card-copy-img-btn" title="${item.image ? "Copy image to clipboard" : "No image available"}" ${item.image ? "" : "disabled"}>📋 Image</button>
                        <button type="button" class="card-copy-btn card-copy-txt-btn" title="${item.text ? "Copy text to clipboard" : "No text available"}" ${item.text ? "" : "disabled"}>📝 Text</button>
                    </div>
                    <div class="card-footer">
                        <span class="type-badge">${typeLabel}</span>
                        ${item.done ? '<span class="done-pill">✓ Done</span>' : ''}
                        <span style="color:var(--text-muted); font-size:11px;">${this.escapeHtml(grpName)}</span>
                        <span class="card-fav-star">${item.favorite ? "★" : ""}</span>
                    </div>
                </div>
            `;

            const doneBtn = card.querySelector(".card-done-btn");
            if (doneBtn) {
                doneBtn.onclick = async (e) => {
                    e.stopPropagation();
                    await this.toggleDone(item.id);
                };
            }

            const copyImgBtn = card.querySelector(".card-copy-img-btn");
            if (copyImgBtn) {
                copyImgBtn.onclick = async (e) => {
                    e.stopPropagation();
                    await this.copyImage(item);
                    if (item.image) {
                        const orig = copyImgBtn.textContent;
                        copyImgBtn.textContent = "✓ Copied";
                        copyImgBtn.classList.add("copied");
                        setTimeout(() => {
                            copyImgBtn.textContent = orig;
                            copyImgBtn.classList.remove("copied");
                        }, 1200);
                    }
                };
            }

            const copyTxtBtn = card.querySelector(".card-copy-txt-btn");
            if (copyTxtBtn) {
                copyTxtBtn.onclick = async (e) => {
                    e.stopPropagation();
                    await this.copyText(item);
                    if (item.text) {
                        const orig = copyTxtBtn.textContent;
                        copyTxtBtn.textContent = "✓ Copied";
                        copyTxtBtn.classList.add("copied");
                        setTimeout(() => {
                            copyTxtBtn.textContent = orig;
                            copyTxtBtn.classList.remove("copied");
                        }, 1200);
                    }
                };
            }

            const selectWrap = card.querySelector(".card-select-wrap");
            const selectChk = card.querySelector(".card-select-chk");
            const onToggleSelect = (e) => {
                e.stopPropagation();
                if (selectChk.checked) {
                    this.state.selectedItemIds.add(item.id);
                    card.classList.add("selected");
                } else {
                    this.state.selectedItemIds.delete(item.id);
                    card.classList.remove("selected");
                }
                this.updateBulkActionUI(result);
            };

            selectChk.onclick = onToggleSelect;
            selectWrap.onclick = (e) => {
                e.stopPropagation();
                if (e.target !== selectChk) {
                    selectChk.checked = !selectChk.checked;
                    onToggleSelect(e);
                }
            };

            card.querySelector(".card-delete-btn").onclick = async e => {
                e.stopPropagation();
                if (confirm(`Delete "${item.title || "Untitled"}"?`)) {
                    await this.deleteItem(item.id);
                }
            };

            card.onclick = () => this.openDetail(item.id);
            grid.appendChild(card);
        });

        this.updateBulkActionUI(result);
    },

    renderGroups() {
        const container = this.container.querySelector("#groupsListContainer");
        container.innerHTML = "";

        this.state.groups.forEach(g => {
            const count = this.state.items.filter(i => i.group === g.id).length;
            const row = document.createElement("div");
            row.className = "sidebar-group-row";
            row.draggable = true;
            row.setAttribute("data-group-id", g.id);

            const btn = document.createElement("button");
            btn.className = "sidebar-nav-item";
            if (this.state.currentFilter.type === "group" && this.state.currentFilter.value === g.id) {
                btn.classList.add("active");
            }
            btn.setAttribute("data-group-id", g.id);
            btn.innerHTML = `
                <span class="sidebar-group-label-wrap">
                    <span class="group-drag-handle" title="Drag to reorder">⋮⋮</span>
                    <span class="sidebar-group-name">📁 ${this.escapeHtml(g.name)}</span>
                </span>
                <span class="sidebar-count-badge">${count}</span>
            `;
            btn.onclick = () => this.setFilter("group", g.id);

            const actions = document.createElement("div");
            actions.className = "group-row-actions";
            actions.innerHTML = `
                <button class="btn btn-sm btn-icon-only" title="Rename Group" style="width:24px; height:24px; font-size:11px;">✏️</button>
                <button class="btn btn-sm btn-icon-only btn-danger" title="Delete Group" style="width:24px; height:24px; font-size:11px;">🗑️</button>
            `;

            actions.children[0].onclick = e => {
                e.stopPropagation();
                this.renameGroup(g.id);
            };
            actions.children[1].onclick = e => {
                e.stopPropagation();
                this.deleteGroup(g.id);
            };

            // Drag & drop reordering handlers
            row.addEventListener("dragstart", e => {
                this._draggedGroupId = g.id;
                row.classList.add("dragging");
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", g.id);
                }
            });

            row.addEventListener("dragover", e => {
                if (!this._draggedGroupId || this._draggedGroupId === g.id) return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                const rect = row.getBoundingClientRect();
                const insertAfter = e.clientY > rect.top + rect.height / 2;
                row.classList.toggle("drag-over-top", !insertAfter);
                row.classList.toggle("drag-over-bottom", insertAfter);
            });

            row.addEventListener("dragleave", () => {
                row.classList.remove("drag-over-top", "drag-over-bottom");
            });

            row.addEventListener("drop", async e => {
                e.preventDefault();
                const rect = row.getBoundingClientRect();
                const insertAfter = e.clientY > rect.top + rect.height / 2;
                row.classList.remove("drag-over-top", "drag-over-bottom");
                const draggedId = this._draggedGroupId;
                this._draggedGroupId = null;
                if (draggedId && draggedId !== g.id) {
                    await this.reorderGroup(draggedId, g.id, insertAfter);
                }
            });

            row.addEventListener("dragend", () => {
                this._draggedGroupId = null;
                container.querySelectorAll(".sidebar-group-row").forEach(el => {
                    el.classList.remove("dragging", "drag-over-top", "drag-over-bottom");
                });
            });

            row.appendChild(btn);
            row.appendChild(actions);
            container.appendChild(row);
        });

        this.renderGroupSelect();
    },

    async reorderGroup(draggedId, targetId, insertAfter = false) {
        const fromIdx = this.state.groups.findIndex(g => g.id === draggedId);
        const toIdxRaw = this.state.groups.findIndex(g => g.id === targetId);
        if (fromIdx < 0 || toIdxRaw < 0 || fromIdx === toIdxRaw) return;

        const [moved] = this.state.groups.splice(fromIdx, 1);
        let targetIdx = this.state.groups.findIndex(g => g.id === targetId);
        if (insertAfter) targetIdx += 1;
        this.state.groups.splice(targetIdx, 0, moved);

        for (let i = 0; i < this.state.groups.length; i++) {
            this.state.groups[i].order = i;
            await dbPut("groups", this.state.groups[i]);
        }

        this.renderGroups();
        this.scheduleAutoBackup();
        this.app.log(this.id, `Reordered group "${moved.name}" to position ${targetIdx + 1}`);
    },

    renderGroupSelect() {
        const select = this.container.querySelector("#itemGroupSelect");
        if (!select) return;
        select.innerHTML = `<option value="">(No Group)</option>`;
        this.state.groups.forEach(g => {
            const opt = document.createElement("option");
            opt.value = g.id;
            opt.textContent = g.name;
            select.appendChild(opt);
        });
    },

    renderTags() {
        const container = this.container.querySelector("#tagsListContainer");
        container.innerHTML = "";

        const map = new Map();
        this.state.items.forEach(i => {
            (i.tags || []).forEach(t => {
                const key = t.trim().toLowerCase();
                if (key) map.set(key, (map.get(key) || 0) + 1);
            });
        });

        if (map.size === 0) {
            container.innerHTML = `<span style="font-size:11.5px; color:var(--text-muted); padding:4px 6px;">No tags yet</span>`;
            return;
        }

        Array.from(map.entries()).sort((a, b) => b[1] - a[1]).forEach(([tag, count]) => {
            const pill = document.createElement("span");
            pill.className = "tag-pill";
            pill.setAttribute("data-tag", tag);
            pill.textContent = `#${tag} (${count})`;
            pill.onclick = () => this.setFilter("tag", tag);
            container.appendChild(pill);
        });
    },

    handleImageBlob(blob) {
        if (!blob || !blob.type.startsWith("image/")) {
            this.app.showToast("Please choose an image file", "error");
            return;
        }
        this.state.pendingImageBlob = blob;
        this.state.pendingImageRemoved = false;

        const previewImg = this.container.querySelector("#itemImagePreviewImg");
        const previewWrap = this.container.querySelector("#itemImagePreviewWrap");
        const removeBtn = this.container.querySelector("#itemRemoveImageBtn");

        previewImg.src = URL.createObjectURL(blob);
        previewWrap.style.display = "block";
        removeBtn.style.display = "inline-flex";
        this.app.showToast("Image attached", "success");
    },

    openNewItem() {
        this.state.editingItemId = null;
        this.state.pendingImageBlob = null;
        this.state.pendingImageRemoved = false;

        const root = this.container;
        const defaultGroup = this.state.currentFilter.type === "group" ? (this.state.currentFilter.value || "") : "";

        root.querySelector("#itemModalTitle").textContent = "New Library Item";
        root.querySelector("#itemTitleInput").value = "";
        root.querySelector("#itemTextInput").value = "";
        root.querySelector("#itemTagsInput").value = "";
        root.querySelector("#itemFavCheckbox").checked = false;
        root.querySelector("#itemDoneCheckbox").checked = false;
        root.querySelector("#itemGroupSelect").value = defaultGroup;
        root.querySelector("#itemImagePreviewWrap").style.display = "none";
        root.querySelector("#itemImagePreviewImg").src = "";
        root.querySelector("#itemRemoveImageBtn").style.display = "none";

        this.state.itemModalBaseline = {
            title: "",
            text: "",
            tags: "",
            favorite: false,
            done: false,
            group: defaultGroup,
            hasImage: false
        };

        root.querySelector("#itemModal").classList.add("show");
        root.querySelector("#itemTitleInput").focus();
    },

    openEditItem(id) {
        const item = this.state.items.find(i => i.id === id);
        if (!item) return;

        this.state.editingItemId = id;
        this.state.pendingImageBlob = null;
        this.state.pendingImageRemoved = false;

        const root = this.container;
        const tagsStr = (item.tags || []).join(", ");
        const groupVal = item.group || "";

        root.querySelector("#itemModalTitle").textContent = "Edit Item";
        root.querySelector("#itemTitleInput").value = item.title || "";
        root.querySelector("#itemTextInput").value = item.text || "";
        root.querySelector("#itemTagsInput").value = tagsStr;
        root.querySelector("#itemFavCheckbox").checked = !!item.favorite;
        root.querySelector("#itemDoneCheckbox").checked = !!item.done;
        root.querySelector("#itemGroupSelect").value = groupVal;

        if (item.image) {
            const src = item.image instanceof Blob ? URL.createObjectURL(item.image) : item.image;
            root.querySelector("#itemImagePreviewImg").src = src;
            root.querySelector("#itemImagePreviewWrap").style.display = "block";
            root.querySelector("#itemRemoveImageBtn").style.display = "inline-flex";
        } else {
            root.querySelector("#itemImagePreviewWrap").style.display = "none";
            root.querySelector("#itemRemoveImageBtn").style.display = "none";
        }

        this.state.itemModalBaseline = {
            title: item.title || "",
            text: item.text || "",
            tags: tagsStr,
            favorite: !!item.favorite,
            done: !!item.done,
            group: groupVal,
            hasImage: !!item.image
        };

        root.querySelector("#itemModal").classList.add("show");
    },

    closeItemModal() {
        this.container.querySelector("#itemModal").classList.remove("show");
        this.state.pendingImageBlob = null;
        this.state.pendingImageRemoved = false;
        this.state.itemModalBaseline = null;
    },

    closeDetailModal() {
        const modal = this.container.querySelector("#detailModal");
        if (modal) modal.classList.remove("show");
        this.state.detailItemId = null;
    },

    hasItemModalUnsavedChanges() {
        const root = this.container;
        const modal = root.querySelector("#itemModal");
        if (!modal || !modal.classList.contains("show")) return false;

        const base = this.state.itemModalBaseline;
        if (!base) return false;

        const currTitle = (root.querySelector("#itemTitleInput")?.value || "").trim();
        const currText = (root.querySelector("#itemTextInput")?.value || "").trim();
        const currTags = (root.querySelector("#itemTagsInput")?.value || "").trim();
        const currGroup = root.querySelector("#itemGroupSelect")?.value || "";
        const currFav = !!root.querySelector("#itemFavCheckbox")?.checked;
        const currDone = !!root.querySelector("#itemDoneCheckbox")?.checked;

        const baseTitle = (base.title || "").trim();
        const baseText = (base.text || "").trim();
        const baseTags = (base.tags || "").trim();
        const baseGroup = base.group || "";
        const baseFav = !!base.favorite;
        const baseDone = !!base.done;

        if (currTitle !== baseTitle) return true;
        if (currText !== baseText) return true;
        if (currTags !== baseTags) return true;
        if (currGroup !== baseGroup) return true;
        if (currFav !== baseFav) return true;
        if (currDone !== baseDone) return true;

        if (this.state.pendingImageBlob !== null) return true;
        if (this.state.pendingImageRemoved) return true;

        return false;
    },

    shakeModal(modalEl) {
        if (!modalEl) return;
        const win = modalEl.querySelector(".modal-window");
        if (win) {
            win.classList.remove("shake");
            void win.offsetWidth;
            win.classList.add("shake");
            setTimeout(() => win.classList.remove("shake"), 350);
        }
    },

    async saveItem() {
        const root = this.container;
        const title = root.querySelector("#itemTitleInput").value.trim();
        const text = root.querySelector("#itemTextInput").value.trim();
        const group = root.querySelector("#itemGroupSelect").value || null;
        const favorite = root.querySelector("#itemFavCheckbox").checked;
        const done = root.querySelector("#itemDoneCheckbox").checked;
        const rawTags = root.querySelector("#itemTagsInput").value;
        const tags = Array.from(new Set(rawTags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean)));

        let imageBlob = null;
        if (this.state.editingItemId) {
            const existing = this.state.items.find(i => i.id === this.state.editingItemId);
            if (this.state.pendingImageRemoved) imageBlob = null;
            else if (this.state.pendingImageBlob) imageBlob = this.state.pendingImageBlob;
            else imageBlob = existing ? existing.image : null;
        } else {
            imageBlob = this.state.pendingImageBlob;
        }

        if (!title && !text && !imageBlob) {
            this.app.showToast("Please provide a title, description, or image.", "error");
            return;
        }

        const now = Date.now();
        const itemRecord = {
            id: this.state.editingItemId || crypto.randomUUID(),
            title: title || "Untitled",
            text,
            group,
            favorite,
            done,
            tags,
            image: imageBlob,
            updatedAt: now,
            createdAt: this.state.editingItemId
                ? (this.state.items.find(i => i.id === this.state.editingItemId)?.createdAt || now)
                : now
        };

        try {
            await dbPut("items", itemRecord);

            const idx = this.state.items.findIndex(i => i.id === itemRecord.id);
            if (idx >= 0) this.state.items[idx] = itemRecord;
            else this.state.items.push(itemRecord);

            this.closeItemModal();
            this.renderTags();
            this.renderItems();
            this.scheduleAutoBackup();
            this.app.log(this.id, `Item saved: "${itemRecord.title}"`, { id: itemRecord.id, group: itemRecord.group, tags: itemRecord.tags });
            this.app.showToast("Item saved successfully", "success");
        } catch (err) {
            console.error(err);
            this.app.showToast("Failed to save item", "error");
        }
    },

    updateBulkActionUI(visibleItems) {
        const root = this.container;
        const bulkBtn = root.querySelector("#libBulkDeleteBtn");
        const bulkDoneBtn = root.querySelector("#libBulkDoneBtn");
        const bulkUndoneBtn = root.querySelector("#libBulkUndoneBtn");
        const countSpan = root.querySelector("#libSelectedCount");
        const selectAllBtn = root.querySelector("#libSelectAllBtn");

        if (!bulkBtn || !countSpan || !selectAllBtn) return;

        const selectedCount = this.state.selectedItemIds.size;
        if (selectedCount > 0) {
            bulkBtn.style.display = "inline-flex";
            if (bulkDoneBtn) bulkDoneBtn.style.display = "inline-flex";
            if (bulkUndoneBtn) bulkUndoneBtn.style.display = "inline-flex";
            countSpan.textContent = selectedCount;
        } else {
            bulkBtn.style.display = "none";
            if (bulkDoneBtn) bulkDoneBtn.style.display = "none";
            if (bulkUndoneBtn) bulkUndoneBtn.style.display = "none";
            countSpan.textContent = "0";
        }

        const items = visibleItems || this.getFilteredItems();
        if (items.length > 0 && items.every(i => this.state.selectedItemIds.has(i.id))) {
            selectAllBtn.textContent = "Deselect All";
        } else {
            selectAllBtn.textContent = "Select All";
        }
    },

    async bulkSetDone(isDone) {
        const selectedIds = Array.from(this.state.selectedItemIds);
        if (selectedIds.length === 0) return;

        for (const id of selectedIds) {
            const item = this.state.items.find(i => i.id === id);
            if (item) {
                item.done = isDone;
                item.updatedAt = Date.now();
                await dbPut("items", item);
            }
        }
        this.renderItems();
        this.scheduleAutoBackup();
        this.app.log(this.id, `Bulk marked ${selectedIds.length} item(s) as ${isDone ? "done" : "incomplete"}`);
        this.app.showToast(`Marked ${selectedIds.length} item(s) as ${isDone ? "done" : "incomplete"}`, "success");
    },

    toggleSelectAll() {
        const visible = this.getFilteredItems();
        if (visible.length === 0) return;

        const allSelected = visible.every(i => this.state.selectedItemIds.has(i.id));
        if (allSelected) {
            visible.forEach(i => this.state.selectedItemIds.delete(i.id));
        } else {
            visible.forEach(i => this.state.selectedItemIds.add(i.id));
        }
        this.renderItems();
    },

    async deleteSelectedItems() {
        const count = this.state.selectedItemIds.size;
        if (count === 0) return;

        if (!confirm(`Delete ${count} selected item(s)? This cannot be undone.`)) return;

        try {
            for (const id of this.state.selectedItemIds) {
                await dbDelete("items", id);
            }
            this.state.items = this.state.items.filter(i => !this.state.selectedItemIds.has(i.id));
            this.state.selectedItemIds.clear();
            this.renderTags();
            this.renderGroups();
            this.renderItems();
            this.scheduleAutoBackup();
            this.app.log(this.id, `Bulk deleted ${count} selected item(s)`);
            this.app.showToast(`Deleted ${count} item(s)`, "info");
        } catch (err) {
            console.error(err);
            this.app.showToast("Failed to delete some items", "error");
        }
    },

    async deleteItem(id) {
        try {
            await dbDelete("items", id);
            this.state.selectedItemIds.delete(id);
            this.state.items = this.state.items.filter(i => i.id !== id);
            this.renderTags();
            this.renderGroups();
            this.renderItems();
            this.scheduleAutoBackup();
            this.app.log(this.id, `Deleted item`, { id });
            this.app.showToast("Item deleted", "info");
        } catch (err) {
            console.error(err);
            this.app.showToast("Could not delete item", "error");
        }
    },

    openDetail(id) {
        const item = this.state.items.find(i => i.id === id);
        if (!item) return;

        this.state.detailItemId = id;
        const root = this.container;

        root.querySelector("#detailTitleText").textContent = item.title || "Untitled";
        root.querySelector("#detailContentText").textContent = item.text || "No text description.";

        const typeBadge = root.querySelector("#detailTypeBadge");
        typeBadge.textContent = item.image && item.text ? "IMAGE + TEXT" : item.image ? "IMAGE" : "TEXT";

        const grp = this.state.groups.find(g => g.id === item.group);
        root.querySelector("#detailGroupBadge").textContent = grp ? `📁 ${grp.name}` : "No group";

        const favBtn = root.querySelector("#detailToggleFavBtn");
        favBtn.textContent = item.favorite ? "★ Favorited" : "☆ Add Favorite";
        this.updateDetailDoneBtn(item);

        const imgEl = root.querySelector("#detailImg");
        const noImg = root.querySelector("#detailNoImg");
        if (item.image) {
            imgEl.src = item.image instanceof Blob ? URL.createObjectURL(item.image) : item.image;
            imgEl.style.display = "block";
            noImg.style.display = "none";
        } else {
            imgEl.style.display = "none";
            noImg.style.display = "block";
        }

        const tagsWrap = root.querySelector("#detailTagsWrap");
        tagsWrap.innerHTML = (item.tags || []).map(t => `<span class="card-tag">#${this.escapeHtml(t)}</span>`).join("");

        const createdStr = item.createdAt ? new Date(item.createdAt).toLocaleString() : "";
        root.querySelector("#detailTimestamps").textContent = `Created: ${createdStr}`;

        root.querySelector("#detailModal").classList.add("show");
    },

    async deleteDetailItem() {
        if (!this.state.detailItemId) return;
        if (confirm("Delete this item permanently?")) {
            await this.deleteItem(this.state.detailItemId);
            this.container.querySelector("#detailModal").classList.remove("show");
        }
    },

    updateDetailDoneBtn(item) {
        const doneBtn = this.container.querySelector("#detailToggleDoneBtn");
        if (!doneBtn) return;
        if (item.done) {
            doneBtn.textContent = "✓ Completed (Mark Incomplete)";
            doneBtn.className = "btn btn-sm btn-success";
        } else {
            doneBtn.textContent = "✓ Mark as Done";
            doneBtn.className = "btn btn-sm";
        }
    },

    async toggleFavorite(id) {
        const item = this.state.items.find(i => i.id === id);
        if (!item) return;

        item.favorite = !item.favorite;
        item.updatedAt = Date.now();
        await dbPut("items", item);
        this.renderItems();
        this.scheduleAutoBackup();

        if (this.state.detailItemId === id) {
            this.container.querySelector("#detailToggleFavBtn").textContent = item.favorite ? "★ Favorited" : "☆ Add Favorite";
        }
    },

    async toggleDone(id) {
        const item = this.state.items.find(i => i.id === id);
        if (!item) return;

        item.done = !item.done;
        item.updatedAt = Date.now();
        await dbPut("items", item);
        this.renderItems();
        this.scheduleAutoBackup();

        if (this.state.detailItemId === id) {
            this.updateDetailDoneBtn(item);
        }
        this.app.log(this.id, `Item "${item.title || "Untitled"}" marked as ${item.done ? "done" : "incomplete"}`, { id: item.id, done: item.done });
        this.app.showToast(item.done ? `Marked "${item.title || "Item"}" as done` : `Marked "${item.title || "Item"}" as incomplete`, "info", 1800);
    },

    /* =========================================================
       Clipboard Actions
       ========================================================= */

    async copyImage(item) {
        if (!item || !item.image) {
            this.app.showToast("This item has no image to copy", "info");
            return;
        }

        try {
            let clipboardBlob = item.image;
            if (typeof clipboardBlob === "string") {
                clipboardBlob = await (await fetch(clipboardBlob)).blob();
            }

            // Normalize non-PNG blobs to PNG on an off-screen canvas for OS clipboard support
            if (clipboardBlob.type !== "image/png") {
                const bitmap = await createImageBitmap(clipboardBlob);
                const canvas = document.createElement("canvas");
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(bitmap, 0, 0);
                clipboardBlob = await new Promise(r => canvas.toBlob(r, "image/png"));
            }

            await navigator.clipboard.write([
                new ClipboardItem({ "image/png": clipboardBlob })
            ]);
            this.app.showToast("Image copied to clipboard (PNG)", "success");
        } catch (err) {
            console.error(err);
            this.app.showToast("Could not copy image. Check browser permissions.", "error");
        }
    },

    async copyText(item) {
        if (!item || !item.text) {
            this.app.showToast("This item has no text content", "info");
            return;
        }

        try {
            await navigator.clipboard.writeText(item.text);
            this.app.showToast("Text copied to clipboard", "success");
        } catch (err) {
            console.error(err);
            this.app.showToast("Could not copy text", "error");
        }
    },

    async copyBoth(item) {
        if (!item) return;
        if (item.text) await this.copyText(item);
        if (item.image) await this.copyImage(item);
        this.app.showToast("Text and image copied", "success");
    },

    /* =========================================================
       Group Management
       ========================================================= */

    openGroupModal() {
        this.container.querySelector("#groupNameInput").value = "";
        this.state.groupModalBaseline = "";
        this.container.querySelector("#groupModal").classList.add("show");
        this.container.querySelector("#groupNameInput").focus();
    },

    async saveGroup() {
        const name = this.container.querySelector("#groupNameInput").value.trim();
        if (!name) return;

        if (this.state.groups.some(g => g.name.toLowerCase() === name.toLowerCase())) {
            this.app.showToast("A group with this name already exists", "error");
            return;
        }

        const newGrp = { id: crypto.randomUUID(), name, order: this.state.groups.length };
        await dbPut("groups", newGrp);
        this.state.groups.push(newGrp);
        this.renderGroups();
        this.scheduleAutoBackup();
        this.container.querySelector("#groupModal").classList.remove("show");
        this.app.log(this.id, `Created group "${name}"`, { id: newGrp.id });
        this.app.showToast(`Group "${name}" created`, "success");
    },

    async renameGroup(id) {
        const grp = this.state.groups.find(g => g.id === id);
        if (!grp) return;

        const next = prompt(`Rename group "${grp.name}":`, grp.name);
        if (!next || !next.trim() || next.trim() === grp.name) return;

        grp.name = next.trim();
        await dbPut("groups", grp);
        this.renderGroups();
        this.renderItems();
        this.scheduleAutoBackup();
        this.app.log(this.id, `Renamed group "${grp.name}" to "${next.trim()}"`, { id });
        this.app.showToast("Group renamed", "success");
    },

    async deleteGroup(id) {
        const grp = this.state.groups.find(g => g.id === id);
        if (!grp) return;

        // Count items belonging to this group (by id or by name)
        const itemsInGroup = this.state.items.filter(
            i => i.group === id || (grp.name && String(i.group).toLowerCase() === grp.name.toLowerCase())
        );
        const count = itemsInGroup.length;

        const confirmMsg = count > 0
            ? `Delete group "${grp.name}" and all ${count} item(s) inside it? This cannot be undone.`
            : `Delete group "${grp.name}"?`;

        if (!confirm(confirmMsg)) return;

        try {
            // 1. Delete all items belonging to this group from IndexedDB
            for (const item of itemsInGroup) {
                await dbDelete("items", item.id);
            }
            const itemIdsToDelete = new Set(itemsInGroup.map(i => i.id));
            this.state.items = this.state.items.filter(i => !itemIdsToDelete.has(i.id));

            // 2. Delete group from IndexedDB
            await dbDelete("groups", id);
            this.state.groups = this.state.groups.filter(g => g.id !== id);

            // 3. Clean up selections
            if (this.state.selectedItemIds) {
                itemsInGroup.forEach(i => this.state.selectedItemIds.delete(i.id));
            }

            if (this.state.currentFilter.type === "group" && (this.state.currentFilter.value === id || this.state.currentFilter.value === grp.name)) {
                this.setFilter("all", null);
            } else {
                this.renderGroups();
                this.renderTags();
                this.renderItems();
            }
            this.scheduleAutoBackup();
            this.app.log(this.id, `Deleted group "${grp.name}" and ${count} item(s)`, { id, deletedItemsCount: count });
            this.app.showToast(`Deleted group "${grp.name}" and ${count} item(s)`, "info");
        } catch (err) {
            console.error(err);
            this.app.showToast("Failed to delete group", "error");
        }
    },

    /* =========================================================
       Export & Import Snapshots
       ========================================================= */

    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },

    base64ToBlob(dataUrl) {
        const [meta, base64] = dataUrl.split(",");
        const mime = meta.match(/:(.*?);/)?.[1] || "image/png";
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
        return new Blob([array], { type: mime });
    },

    async buildBackupPayload() {
        const exportedItems = [];
        for (const item of this.state.items) {
            let imageBase64 = null;
            if (item.image) {
                imageBase64 = await this.blobToBase64(item.image);
            }

            // Resolve group name instead of cryptic group UUID
            const grp = this.state.groups.find(g => g.id === item.group);
            const groupName = grp ? grp.name : null;

            exportedItems.push({
                ...item,
                group: groupName,
                image: imageBase64
            });
        }

        const exportedGroups = this.state.groups.map(g => g.name);

        return {
            version: 2,
            exportedAt: new Date().toISOString(),
            groups: exportedGroups,
            items: exportedItems
        };
    },

    scheduleAutoBackup(delayMs = 5000) {
        if (this._autoBackupTimer) {
            clearTimeout(this._autoBackupTimer);
        }
        this._autoBackupTimer = setTimeout(() => {
            this._autoBackupTimer = null;
            this.runAutoBackup();
        }, delayMs);
    },

    async runAutoBackup() {
        if (this._isAutoBackingUp) {
            this.scheduleAutoBackup(3000);
            return;
        }
        this._isAutoBackingUp = true;
        try {
            const data = await this.buildBackupPayload();
            const res = await fetch("/save-backup?auto=1", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                const resData = await res.json();
                if (resData.success) {
                    const cleanedMsg = resData.cleanedUp?.length ? ` (cleaned ${resData.cleanedUp.length} old backup(s))` : "";
                    this.app.log(this.id, `Auto-backup saved: ${resData.filename}${cleanedMsg}`, { items: data.items.length });
                }
            }
        } catch {
            // Silently ignore if server is offline
        } finally {
            this._isAutoBackingUp = false;
        }
    },

    async exportBackup() {
        this.app.showToast("Preparing backup package...", "info");

        try {
            const data = await this.buildBackupPayload();

            // Attempt save to local Python server
            let serverSaved = false;
            try {
                const res = await fetch("/save-backup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data)
                });
                const resData = await res.json();
                if (res.ok && resData.success) {
                    serverSaved = true;
                    const cleanedMsg = resData.cleanedUp?.length ? ` (cleaned ${resData.cleanedUp.length} old)` : "";
                    this.app.showToast(`Backup saved to server: ${resData.filename}${cleanedMsg}`, "success");
                }
            } catch {
                serverSaved = false;
            }

            // Fallback: direct browser download
            if (!serverSaved) {
                const jsonBlob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(jsonBlob);
                const a = document.createElement("a");
                a.href = url;
                const ts = new Date().toISOString().replace(/[:.]/g, "-");
                a.download = `library-backup-${ts}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                this.app.showToast("Backup downloaded via browser", "success");
            }
            this.app.log(this.id, "Backup exported successfully", { items: data.items.length, groups: data.groups.length });
        } catch (err) {
            console.error(err);
            this.app.showToast("Backup failed", "error");
        }
    },

    async handleImportFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (!data.items || !Array.isArray(data.items)) {
                throw new Error("Invalid backup JSON format");
            }

            this.app.log(this.id, `Import backup file selected: "${file.name}"`, { itemsInBackup: data.items.length });

            if (!confirm(`Import ${data.items.length} items from backup?\nExisting library items will be preserved.`)) {
                return;
            }

            // Map for backward-compatibility with older UUID-based group backups
            const legacyIdToName = new Map();
            if (Array.isArray(data.groups)) {
                for (const g of data.groups) {
                    if (typeof g === "object" && g !== null && g.name) {
                        if (g.id) legacyIdToName.set(g.id, g.name.trim());
                    }
                }
            }

            // 1. Ensure any groups explicitly listed in the backup exist
            if (Array.isArray(data.groups)) {
                for (const g of data.groups) {
                    const gName = (typeof g === "string" ? g : g?.name || "").trim();
                    if (!gName) continue;

                    const exists = this.state.groups.some(
                        existing => existing.name.toLowerCase() === gName.toLowerCase()
                    );
                    if (!exists) {
                        const newGroup = { id: crypto.randomUUID(), name: gName, order: this.state.groups.length };
                        this.state.groups.push(newGroup);
                        await dbPut("groups", newGroup);
                    }
                }
            }

            // 2. Import items and auto-create any missing groups mentioned in items
            for (const raw of data.items) {
                const item = { ...raw };

                // Resolve group name from item
                let targetGroupName = null;
                if (item.group && typeof item.group === "string") {
                    const rawGroupStr = item.group.trim();
                    if (legacyIdToName.has(rawGroupStr)) {
                        // Legacy UUID mapped to group name
                        targetGroupName = legacyIdToName.get(rawGroupStr);
                    } else {
                        // Group is already the group name string!
                        targetGroupName = rawGroupStr;
                    }
                }

                if (targetGroupName) {
                    // Check if group exists (case-insensitive)
                    let matchedGroup = this.state.groups.find(
                        g => g.name.toLowerCase() === targetGroupName.toLowerCase()
                    );

                    // If group does not exist, automatically add it with the name from JSON!
                    if (!matchedGroup) {
                        matchedGroup = { id: crypto.randomUUID(), name: targetGroupName, order: this.state.groups.length };
                        this.state.groups.push(matchedGroup);
                        await dbPut("groups", matchedGroup);
                    }

                    item.group = matchedGroup.id;
                } else {
                    item.group = null;
                }

                // Decode base64 image if present
                if (item.image && typeof item.image === "string") {
                    item.image = this.base64ToBlob(item.image);
                }

                // Prevent collision with existing item IDs
                if (this.state.items.some(i => i.id === item.id)) {
                    item.id = crypto.randomUUID();
                }

                this.state.items.push(item);
                await dbPut("items", item);
            }

            this.renderGroups();
            this.renderTags();
            this.renderItems();
            this.scheduleAutoBackup();
            this.app.showToast(`Imported ${data.items.length} items successfully`, "success");
        } catch (err) {
            console.error(err);
            this.app.showToast(`Import failed: ${err.message}`, "error");
        } finally {
            event.target.value = "";
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

window.LibraryModule = LibraryModule;
