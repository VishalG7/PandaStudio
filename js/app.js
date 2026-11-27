/**
 * Local Image & Text Studio - Core Application Kernel
 * Manages modular architecture, tool registration, tabs, notifications and modals.
 */

class AppKernel {
    constructor() {
        this.modules = new Map();
        this.activeModuleId = null;
        this._initialized = false;
    }

    /**
     * Register a new module in the application
     * @param {Object} moduleConfig
     * @param {string} moduleConfig.id Unique identifier (e.g. 'trimmer', 'library')
     * @param {string} moduleConfig.name Display name
     * @param {string} [moduleConfig.icon] Icon or emoji
     * @param {string} [moduleConfig.badge] Optional badge text
     * @param {Function} moduleConfig.init Called when module is mounted: init(containerElement, app)
     * @param {Function} [moduleConfig.destroy] Called when module is unmounted
     */
    registerModule(moduleConfig) {
        if (!moduleConfig || !moduleConfig.id) {
            console.error("Module registration failed: missing ID", moduleConfig);
            return;
        }

        if (this.modules.has(moduleConfig.id)) {
            console.warn(`Module '${moduleConfig.id}' is already registered. Overwriting.`);
        }

        this.modules.set(moduleConfig.id, {
            ...moduleConfig,
            initialized: false,
            container: null
        });

        // If app is already initialized, immediately render navigation and ensure active tab exists
        if (this._initialized) {
            this.renderNavigation();
            if (!this.activeModuleId) {
                const hash = window.location.hash.replace("#", "");
                const target = (hash && this.modules.has(hash)) ? hash : moduleConfig.id;
                this.switchModule(target);
            }
        }
    }

    initApp() {
        if (this._initialized) return;  // Guard against double-call
        this._initialized = true;
        this.initTheme();
        this.renderNavigation();
        this.setupGlobalEvents();
        this.checkServerStatus();
        this.log("app", "🐼 Panda Studio application started");

        // Check hash or default to first module
        const hash = window.location.hash.replace("#", "");
        if (hash && this.modules.has(hash)) {
            this.switchModule(hash);
        } else if (this.modules.size > 0 && !this.activeModuleId) {
            const firstId = this.modules.keys().next().value;
            this.switchModule(firstId);
        }
    }

    renderNavigation() {
        const navContainer = document.getElementById("moduleNav");
        if (!navContainer) return;

        navContainer.innerHTML = "";

        this.modules.forEach(mod => {
            const tabBtn = document.createElement("button");
            tabBtn.className = `nav-tab ${this.activeModuleId === mod.id ? "active" : ""}`;
            tabBtn.id = `tab-${mod.id}`;
            tabBtn.setAttribute("data-target", mod.id);

            const iconHtml = mod.icon ? `<span class="tab-icon">${mod.icon}</span>` : "";

            tabBtn.innerHTML = `${iconHtml}<span>${mod.name}</span>`;
            tabBtn.onclick = () => this.switchModule(mod.id);

            navContainer.appendChild(tabBtn);
        });

        // Create overflow "More ▾" wrapper inside navContainer
        const moreWrap = document.createElement("div");
        moreWrap.className = "nav-more-wrap";
        moreWrap.id = "navMoreWrap";
        moreWrap.style.display = "none";
        moreWrap.innerHTML = `
            <button type="button" class="nav-tab nav-more-btn" id="navMoreBtn" title="More tools">
                <span id="navMoreLabel">More ▾</span>
            </button>
            <div class="nav-more-menu" id="navMoreMenu"></div>
        `;
        navContainer.appendChild(moreWrap);

        const moreBtn = moreWrap.querySelector("#navMoreBtn");
        const moreMenu = moreWrap.querySelector("#navMoreMenu");
        moreBtn.onclick = e => {
            e.stopPropagation();
            moreMenu.classList.toggle("open");
        };

        if (!this._navClickOutsideBound) {
            this._navClickOutsideBound = true;
            document.addEventListener("click", () => {
                document.getElementById("navMoreMenu")?.classList.remove("open");
            });
            window.addEventListener("resize", () => this.layoutNavigation());
        }

        requestAnimationFrame(() => this.layoutNavigation());
    }

    layoutNavigation() {
        const header = document.querySelector(".app-header");
        const navContainer = document.getElementById("moduleNav");
        const moreWrap = document.getElementById("navMoreWrap");
        const moreMenu = document.getElementById("navMoreMenu");
        const moreLabel = document.getElementById("navMoreLabel");
        const moreBtn = document.getElementById("navMoreBtn");
        if (!header || !navContainer || !moreWrap || !moreMenu) return;

        const tabs = Array.from(navContainer.querySelectorAll(":scope > .nav-tab"));
        // Reset all tabs visible to measure natural widths
        tabs.forEach(t => { t.style.display = "inline-flex"; });
        moreWrap.style.display = "none";
        moreMenu.innerHTML = "";
        moreBtn.classList.remove("active");

        const headerLeft = header.querySelector(".header-left");
        const headerRight = header.querySelector(".header-right");
        const reserved = (headerLeft?.offsetWidth || 0) + (headerRight?.offsetWidth || 0) + 96;
        const availableWidth = Math.max(220, header.clientWidth - reserved);

        const moreReserve = 105;
        let used = 0;
        const overflowTabs = [];

        tabs.forEach((tab, idx) => {
            const w = tab.offsetWidth + 4;
            // Always keep at least 2 tabs visible if possible, move rest if overflowing
            if (idx >= 2 && used + w > availableWidth - moreReserve) {
                overflowTabs.push(tab);
            } else {
                used += w;
            }
        });

        // If nothing overflowed within full availableWidth, show all
        if (overflowTabs.length === 0) return;

        // Re-check if all tabs actually fit without the moreReserve
        const totalWidth = tabs.reduce((sum, t) => sum + t.offsetWidth + 4, 0);
        if (totalWidth <= availableWidth) return;

        let activeInOverflow = null;
        overflowTabs.forEach(tab => {
            tab.style.display = "none";
            const targetId = tab.getAttribute("data-target");
            const mod = this.modules.get(targetId);
            if (!mod) return;

            const menuItem = document.createElement("button");
            menuItem.type = "button";
            menuItem.className = `nav-more-item ${this.activeModuleId === mod.id ? "active" : ""}`;
            menuItem.innerHTML = `${mod.icon ? `<span class="tab-icon">${mod.icon}</span>` : ""}<span>${mod.name}</span>`;
            menuItem.onclick = e => {
                e.stopPropagation();
                moreMenu.classList.remove("open");
                this.switchModule(mod.id);
            };
            moreMenu.appendChild(menuItem);

            if (this.activeModuleId === mod.id) {
                activeInOverflow = mod;
            }
        });

        moreWrap.style.display = "inline-flex";
        if (activeInOverflow) {
            moreBtn.classList.add("active");
            moreLabel.textContent = `${activeInOverflow.icon || ""} ${activeInOverflow.name} ▾`;
        } else {
            moreLabel.textContent = `More (${overflowTabs.length}) ▾`;
        }
    }

    getTabInfo(moduleIdentifier) {
        const moduleEntries = Array.from(this.modules.entries());
        let tabIndex = -1;
        let tabId = "";
        let tabName = "";

        if (typeof moduleIdentifier === "number") {
            tabIndex = moduleIdentifier;
            if (moduleEntries[tabIndex - 1]) {
                tabId = moduleEntries[tabIndex - 1][0];
                tabName = moduleEntries[tabIndex - 1][1].name;
            }
        } else if (typeof moduleIdentifier === "string") {
            tabId = moduleIdentifier;
            const idx = moduleEntries.findIndex(([id]) => id === moduleIdentifier);
            tabIndex = idx >= 0 ? idx + 1 : "?";
            if (idx >= 0) {
                tabName = moduleEntries[idx][1].name;
            }
        }

        return { tabNo: tabIndex, tabId, tabName };
    }

    log(moduleIdentifier, action, details = null) {
        const { tabNo, tabId, tabName } = this.getTabInfo(moduleIdentifier);
        const time = new Date().toLocaleTimeString();
        const tabLabel = tabNo !== "?" ? `Tab ${tabNo}: ${tabId || moduleIdentifier}` : (tabId || moduleIdentifier);
        const prefix = `[${time}] [${tabLabel}]`;

        if (details !== null && details !== undefined) {
            console.log(`%c${prefix}%c ${action}`, "color: #2563eb; font-weight: bold;", "color: inherit;", details);
        } else {
            console.log(`%c${prefix}%c ${action}`, "color: #2563eb; font-weight: bold;", "color: inherit;");
        }

        // Persist action log to server in backups/logs/ folder
        try {
            fetch("/api/log", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tab: tabLabel,
                    action: String(action),
                    details: details
                })
            }).then(res => {
                if (!res.ok) {
                    console.warn(`[AppKernel] /api/log returned status ${res.status}`);
                }
            }).catch(err => {
                // If offline or fetch failed, report in console
                console.debug("[AppKernel] Could not send log to server (server offline):", err?.message || err);
            });
        } catch (err) {
            console.debug("[AppKernel] Log dispatch error:", err);
        }
    }

    initTheme() {
        const savedTheme = localStorage.getItem("panda_studio_theme") || "light";
        this.setTheme(savedTheme, false);
    }

    setTheme(theme, logChange = true) {
        const activeTheme = theme === "dark" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", activeTheme);
        localStorage.setItem("panda_studio_theme", activeTheme);

        const lightBtn = document.getElementById("themeLightBtn");
        const darkBtn = document.getElementById("themeDarkBtn");
        const subLabel = document.getElementById("themeModeSub");

        if (lightBtn && darkBtn) {
            if (activeTheme === "dark") {
                darkBtn.classList.add("btn-primary");
                lightBtn.classList.remove("btn-primary");
                if (subLabel) subLabel.textContent = "Dark theme active";
            } else {
                lightBtn.classList.add("btn-primary");
                darkBtn.classList.remove("btn-primary");
                if (subLabel) subLabel.textContent = "Light theme active";
            }
        }

        if (logChange) {
            this.log("app", `Theme changed to ${activeTheme} mode`);
        }
    }

    setupModuleActionLogging(container, moduleId) {
        if (!container || container._hasActionLogging) return;
        container._hasActionLogging = true;

        // Automatically log clicks on interactive elements inside this tab
        container.addEventListener("click", event => {
            const btn = event.target.closest("button, .btn, [role='button'], a");
            if (btn) {
                const label = btn.innerText?.trim() || btn.title || btn.id || btn.className || "button";
                this.log(moduleId, `Action: Clicked "${label.slice(0, 40)}"`, {
                    id: btn.id || null,
                    class: btn.className || null
                });
                return;
            }

            const chk = event.target.closest("input[type='checkbox'], input[type='radio']");
            if (chk) {
                this.log(moduleId, `Action: Toggled ${chk.type} #${chk.id || chk.name || chk.className}`, {
                    checked: chk.checked,
                    value: chk.value
                });
                return;
            }
        }, true);

        // Automatically log change events (inputs, dropdowns, file pickers)
        container.addEventListener("change", event => {
            const target = event.target;
            if (target.type === "file") {
                const fileList = Array.from(target.files || []).map(f => f.name);
                this.log(moduleId, `Action: File(s) chosen in #${target.id || 'file-picker'} (${fileList.length} files)`, fileList);
            } else if (target.tagName === "SELECT") {
                const selectedText = target.options[target.selectedIndex]?.text || target.value;
                this.log(moduleId, `Action: Dropdown #${target.id || target.name} changed to "${selectedText}"`, { value: target.value });
            } else if (target.type !== "checkbox" && target.type !== "radio") {
                this.log(moduleId, `Action: Changed #${target.id || target.name}`, { value: target.value });
            }
        }, true);
    }

    async switchModule(targetId) {
        if (!this.modules.has(targetId)) return;
        if (this.activeModuleId === targetId && this.modules.get(targetId).initialized) return;

        const viewportParent = document.getElementById("viewportParent");
        if (!viewportParent) return;

        // Deactivate previous
        if (this.activeModuleId && this.modules.has(this.activeModuleId)) {
            const prev = this.modules.get(this.activeModuleId);
            if (prev.container) {
                prev.container.classList.remove("active");
            }
            if (typeof prev.onDeactivate === "function") {
                prev.onDeactivate();
            }
        }

        // Hide all viewports to prevent any overlap or stacking
        document.querySelectorAll(".module-viewport").forEach(vp => {
            vp.classList.remove("active");
        });

        // Activate new
        this.activeModuleId = targetId;
        window.location.hash = targetId;

        // Update nav tabs
        document.querySelectorAll(".nav-tab").forEach(tab => {
            tab.classList.toggle("active", tab.getAttribute("data-target") === targetId);
        });
        this.layoutNavigation();

        const activeMod = this.modules.get(targetId);

        // Create container if not exists
        if (!activeMod.container) {
            const container = document.createElement("div");
            container.id = `view-${targetId}`;
            container.className = "module-viewport";
            viewportParent.appendChild(container);
            activeMod.container = container;
            this.setupModuleActionLogging(container, targetId);
        }

        activeMod.container.classList.add("active");
        this.log(targetId, `Switched to tab "${activeMod.name}"`);

        // Initialize once
        if (!activeMod.initialized) {
            try {
                await activeMod.init(activeMod.container, this);
                activeMod.initialized = true;
            } catch (err) {
                console.error(`Error initializing module '${targetId}':`, err);
                this.showToast(`Failed to load ${activeMod.name}`, "error");
            }
        } else if (typeof activeMod.onActivate === "function") {
            activeMod.onActivate();
        }
    }

    setupGlobalEvents() {
        // Global Keyboard Handler
        document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                // If active module provides onEscape, let it handle Escape first (e.g. guard unsaved changes)
                if (this.activeModuleId && this.modules.has(this.activeModuleId)) {
                    const mod = this.modules.get(this.activeModuleId);
                    if (typeof mod.onEscape === "function") {
                        const handled = mod.onEscape(event);
                        if (handled) return;
                    }
                }

                // Global fallback for Settings modal
                const settingsModal = document.getElementById("appSettingsModal");
                if (settingsModal && settingsModal.classList.contains("show")) {
                    settingsModal.classList.remove("show");
                    this.log("app", "Action: Closed Settings & About modal via Escape");
                    return;
                }

                // Close any other open generic modals
                document.querySelectorAll(".modal-backdrop.show").forEach(modal => {
                    modal.classList.remove("show");
                });
            }

            // Forward to active module if it provides onKeyDown
            if (this.activeModuleId && this.modules.has(this.activeModuleId)) {
                const mod = this.modules.get(this.activeModuleId);
                if (typeof mod.onKeyDown === "function") {
                    mod.onKeyDown(event);
                }
            }
        });

        // Settings & About Modal Handlers
        const settingsBtn = document.getElementById("appSettingsBtn");
        const settingsModal = document.getElementById("appSettingsModal");
        const closeSettingsBtn = document.getElementById("closeSettingsModalBtn");
        const doneSettingsBtn = document.getElementById("doneSettingsModalBtn");
        const ytShortcutBtn = document.getElementById("settingsYtStudioBtn");

        if (settingsBtn && settingsModal) {
            settingsBtn.onclick = () => {
                settingsModal.classList.add("show");
                this.log("app", "Action: Opened Settings & About modal");
            };

            const closeSettings = () => {
                settingsModal.classList.remove("show");
                this.log("app", "Action: Closed Settings & About modal");
            };

            if (closeSettingsBtn) closeSettingsBtn.onclick = closeSettings;
            if (doneSettingsBtn) doneSettingsBtn.onclick = closeSettings;

            // Theme toggle buttons in Settings
            const lightBtn = document.getElementById("themeLightBtn");
            const darkBtn = document.getElementById("themeDarkBtn");
            if (lightBtn) lightBtn.onclick = () => this.setTheme("light");
            if (darkBtn) darkBtn.onclick = () => this.setTheme("dark");

            // Auto-mark done on copy toggle
            const autoDoneToggle = document.getElementById("autoMarkDoneOnCopyToggle");
            if (autoDoneToggle) {
                autoDoneToggle.checked = this.isAutoMarkDoneOnCopy();
                autoDoneToggle.onchange = () => {
                    localStorage.setItem("panda_studio_auto_done_on_copy", String(autoDoneToggle.checked));
                    this.log("app", `Auto-Mark Done on Copy ${autoDoneToggle.checked ? "enabled" : "disabled"}`);
                    this.showToast(
                        autoDoneToggle.checked
                            ? "Auto-Mark Done on Copy enabled"
                            : "Auto-Mark Done on Copy disabled",
                        "info"
                    );
                };
            }

            settingsModal.addEventListener("click", e => {
                if (e.target === settingsModal) closeSettings();
            });

            if (ytShortcutBtn) {
                ytShortcutBtn.onclick = () => {
                    this.log("app", "Action: Clicked YouTube Studio shortcut link", { url: "https://studio.youtube.com/" });
                };
            }

            const openLogsBtn = document.getElementById("openLogsFolderBtn");
            if (openLogsBtn) {
                openLogsBtn.onclick = async () => {
                    try {
                        const res = await fetch("/api/open-folder", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ folder: "logs" })
                        });
                        const result = await res.json();
                        if (res.ok && result.success) {
                            this.showToast("Opened backups/logs/ in File Explorer", "success");
                            this.log("app", "Action: Opened logs folder in File Explorer", { path: result.path });
                        } else {
                            throw new Error(result.error || "Could not open folder");
                        }
                    } catch (err) {
                        this.showToast("Could not open folder directly. Check backups/logs/ manually.", "info");
                        this.log("app", "Action: Failed to open logs folder", { error: err.message });
                    }
                };
            }
        }
    }

    isAutoMarkDoneOnCopy() {
        return localStorage.getItem("panda_studio_auto_done_on_copy") === "true";
    }

    showToast(message, type = "info", duration = 3000) {
        let container = document.getElementById("toastContainer");
        if (!container) {
            container = document.createElement("div");
            container.id = "toastContainer";
            container.className = "toast-container";
            document.body.appendChild(container);
        }

        const toast = document.createElement("div");
        toast.className = `toast ${type}`;

        const iconMap = {
            success: "✓",
            error: "✕",
            info: "ℹ"
        };

        toast.innerHTML = `
            <span style="font-weight:bold; font-size:15px;">${iconMap[type] || "•"}</span>
            <div class="toast-message">${message}</div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(10px) scale(0.95)";
            setTimeout(() => toast.remove(), 250);
        }, duration);
    }

    async checkServerStatus() {
        const dot = document.getElementById("serverStatusDot");
        const label = document.getElementById("serverStatusLabel");
        if (!dot || !label) return;

        try {
            const res = await fetch("/api/status", { method: "GET" });
            if (res.ok) {
                dot.classList.remove("offline");
                label.textContent = "Server Online";
            } else {
                throw new Error();
            }
        } catch {
            dot.classList.add("offline");
            label.textContent = "Offline Mode";
        }
    }
}

export const App = new AppKernel();
window.App = App;
