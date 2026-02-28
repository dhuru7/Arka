/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Arka – Main Application Logic v3.0 (Mermaid JS)
 *  Handles UI interactions, API calls, Firebase, 
 *  and Mermaid orchestration.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Firebase Config ─────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBxYkOQFnSuVEFZBOBnMbtB3OBBt0IgVuA",
    authDomain: "flowcraft-gen.firebaseapp.com",
    projectId: "flowcraft-gen",
    storageBucket: "flowcraft-gen.firebasestorage.app",
    databaseURL: "https://flowcraft-gen-default-rtdb.firebaseio.com"
};

// ── DOM Elements ────────────────────────────────────────────────────────────
const promptInput = document.getElementById('prompt-input');
const generateBtn = document.getElementById('generate-btn');
const canvasContainer = document.getElementById('canvas-container');
const emptyState = document.getElementById('empty-state');
const zoomLevelEl = document.getElementById('zoom-level');
const statusText = document.getElementById('status-text');
const statusDot = document.getElementById('status-dot');
const nodeCountEl = document.getElementById('node-count');
const edgeCountEl = document.getElementById('edge-count');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.getElementById('sidebar');
const refineInput = document.getElementById('refine-input');
const refineBtn = document.getElementById('refine-btn');

// ── State ───────────────────────────────────────────────────────────────
let currentMermaidCode = '';
let db = null; // Firebase Realtime DB reference
let currentMode = 'flowchart'; // 'flowchart' or 'block'
let currentScale = 1;
let selectedNodeOriginalText = '';
let selectedNodeElement = null;

const appState = {
    flowchart: { code: '', prompt: '' },
    block: { code: '', prompt: '' }
};

// ═══ Initialization ═════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
    setupEventListeners();
    setupModeToggle();
    updateStatus('ready', 'Ready');

    // Hide property panel since we don't use it initially
    document.getElementById('properties-panel').style.display = 'none';

    // Disable unneeded toolbars initially
    document.getElementById('btn-undo').disabled = true;
    document.getElementById('btn-redo').disabled = true;
    document.getElementById('btn-delete-selected').disabled = true;
    document.getElementById('btn-edit-text').disabled = true;
    document.getElementById('btn-auto-layout').disabled = true;
});

// ── Firebase Init ───────────────────────────────────────────────────────────
function initFirebase() {
    try {
        if (typeof firebase !== 'undefined') {
            firebase.initializeApp(FIREBASE_CONFIG);
            db = firebase.database();
            console.log('Firebase initialized');
        } else {
            console.warn('Firebase SDK not loaded — save/load disabled');
        }
    } catch (e) {
        console.warn('Firebase init error:', e.message);
    }
}

// ═══ Event Listeners ════════════════════════════════════════════════════════

function setupEventListeners() {
    // Generate button
    generateBtn.addEventListener('click', handleGenerate);

    // Enter key in prompt (Ctrl+Enter)
    promptInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            handleGenerate();
        }
    });

    // Zoom controls
    document.getElementById('zoom-in').addEventListener('click', () => {
        if (panZoomInstance) { panZoomInstance.zoomIn(); applyZoom(); }
    });
    document.getElementById('zoom-out').addEventListener('click', () => {
        if (panZoomInstance) { panZoomInstance.zoomOut(); applyZoom(); }
    });
    document.getElementById('zoom-fit').addEventListener('click', () => {
        if (panZoomInstance) { panZoomInstance.fit(); panZoomInstance.center(); applyZoom(); }
    });

    // Toolbar buttons — download dropdown
    setupDownloadDropdown();
    document.getElementById('btn-export-svg').addEventListener('click', () => { closeDownloadDropdown(); handleExportSVG(); });
    document.getElementById('btn-export-png').addEventListener('click', () => { closeDownloadDropdown(); handleExportPNG(); });
    // Disable JSON export as it is irrelevant for raw Mermaid
    document.getElementById('btn-export-json').style.display = 'none';

    // Code viewer
    document.getElementById('btn-code-view').addEventListener('click', handleOpenCodeEditor);
    document.getElementById('code-editor-apply').addEventListener('click', handleApplyCodeEdit);

    document.getElementById('btn-save').addEventListener('click', () => openModal('save-modal'));
    document.getElementById('btn-load').addEventListener('click', handleOpenLoad);

    // Clear canvas
    const btnClearCanvas = document.getElementById('btn-clear-canvas');
    if (btnClearCanvas) btnClearCanvas.addEventListener('click', handleClearCode);

    // Sidebar toggle (mobile)
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    // Example chips
    document.querySelectorAll('.example-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            promptInput.value = chip.dataset.prompt;
            promptInput.focus();
        });
    });

    // Custom Edit Modal Binding
    document.getElementById('btn-edit-text').addEventListener('click', () => {
        if (!selectedNodeOriginalText || !selectedNodeElement) return;

        showInlineEdit(selectedNodeElement, selectedNodeOriginalText, (newText) => {
            if (newText && newText !== selectedNodeOriginalText) {
                if (currentMermaidCode.includes(selectedNodeOriginalText)) {
                    // Direct code replacement
                    currentMermaidCode = currentMermaidCode.replace(selectedNodeOriginalText, newText);
                    renderFromCode(currentMermaidCode);
                } else {
                    // Fallback to AI Refine
                    refineInput.value = `Change "${selectedNodeOriginalText}" to "${newText}"`;
                    handleRefine();
                }
                resetSelection();
            }
        });
    });

    // Refine
    refineBtn.addEventListener('click', handleRefine);
    refineInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleRefine();
        }
    });

    // Modal close
    document.querySelectorAll('.modal-close, .modal-cancel').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        });
    });

    // Save confirm
    document.getElementById('save-confirm').addEventListener('click', handleSave);
}

let panZoomInstance = null;

function applyZoom() {
    if (panZoomInstance) {
        // svg-pan-zoom handles zooming internally now. We just update the label correctly.
        zoomLevelEl.textContent = Math.round(panZoomInstance.getZoom() * 100) + '%';
    } else {
        zoomLevelEl.textContent = Math.round(currentScale * 100) + '%';
    }
}

// Modify the initial zoom controls logic replacing currentScale

// ═══ Mode Toggle ════════════════════════════════════════════════════════════

function setupModeToggle() {
    const modeFlowchartBtn = document.getElementById('mode-flowchart');
    const modeBlockBtn = document.getElementById('mode-block');
    const indicator = document.getElementById('mode-indicator');

    modeFlowchartBtn.addEventListener('click', () => switchMode('flowchart'));
    modeBlockBtn.addEventListener('click', () => switchMode('block'));
}

function switchMode(mode) {
    if (mode === currentMode) return;
    currentMode = mode;

    const modeFlowchartBtn = document.getElementById('mode-flowchart');
    const modeBlockBtn = document.getElementById('mode-block');
    const indicator = document.getElementById('mode-indicator');
    const subtitleText = document.getElementById('subtitle-text');
    const promptLabel = document.getElementById('prompt-label');
    const generateBtnText = document.getElementById('generate-btn-text');
    const emptyIcon = document.getElementById('empty-icon');
    const emptyTitle = document.getElementById('empty-title');
    const emptyDesc = document.getElementById('empty-desc');
    const examplesFlowchart = document.getElementById('examples-flowchart');
    const examplesBlock = document.getElementById('examples-block');

    if (mode === 'block') {
        modeFlowchartBtn.classList.remove('active');
        modeBlockBtn.classList.add('active');
        indicator.classList.add('right');

        subtitleText.textContent = 'AI Block Diagram Generator';
        promptLabel.textContent = 'Describe your system';
        generateBtnText.textContent = 'Generate Block Diagram';
        promptInput.placeholder = 'e.g. A microservice architecture...';
        emptyIcon.textContent = '[ □ ]';
        emptyTitle.textContent = 'AWAITING SYSTEM DESCRIPTION';
        emptyDesc.textContent = 'Describe your system architecture in the sidebar to generate a block diagram.';
        examplesFlowchart.style.display = 'none';
        examplesBlock.style.display = 'block';
    } else {
        modeBlockBtn.classList.remove('active');
        modeFlowchartBtn.classList.add('active');
        indicator.classList.remove('right');

        subtitleText.textContent = 'AI Flowchart Generator';
        promptLabel.textContent = 'Describe your flow';
        generateBtnText.textContent = 'Generate Flowchart';
        promptInput.placeholder = 'e.g. A user login flow...';
        emptyIcon.textContent = '[ ]';
        emptyTitle.textContent = 'AWAITING PROMPT';
        emptyDesc.textContent = 'Describe what you need in the sidebar to initialize rendering.';
        examplesFlowchart.style.display = 'block';
        examplesBlock.style.display = 'none';
    }

    bindExampleChips();

    // Save previous state
    const previousMode = mode === 'block' ? 'flowchart' : 'block';
    appState[previousMode].code = currentMermaidCode;
    appState[previousMode].prompt = promptInput.value;

    // Load new state
    currentMermaidCode = appState[mode].code || '';
    promptInput.value = appState[mode].prompt || '';

    if (currentMermaidCode) {
        renderFromCode(currentMermaidCode);
    } else {
        showEmptyState();
    }

    resetSelection();
    updateStatus('ready', 'Ready');
}

function bindExampleChips() {
    document.querySelectorAll('.example-chip').forEach(chip => {
        const newChip = chip.cloneNode(true);
        chip.parentNode.replaceChild(newChip, chip);
        newChip.addEventListener('click', () => {
            promptInput.value = newChip.dataset.prompt;
            promptInput.focus();
        });
    });
}

// ═══ Core: Generate Flowchart ═══════════════════════════════════════════════

async function handleGenerate() {
    const prompt = promptInput.value.trim();
    if (!prompt) {
        showToast(`Please describe the ${currentMode === 'block' ? 'block diagram' : 'flowchart'} you want to create.`, 'error');
        return;
    }

    generateBtn.classList.add('loading');
    generateBtn.disabled = true;
    updateStatus('loading', 'Generating...');

    const generateEndpoint = currentMode === 'block'
        ? 'http://127.0.0.1:5000/api/generate-block'
        : 'http://127.0.0.1:5000/api/generate';

    try {
        const response = await fetch(generateEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Generation failed');
        }

        currentMermaidCode = data.code;
        await renderFromCode(currentMermaidCode);
        updateStatus('ready', 'Generated');
        showToast(`${currentMode === 'block' ? 'Block diagram' : 'Flowchart'} generated successfully!`, 'success');

    } catch (err) {
        console.error('Generate error:', err);
        updateStatus('error', 'Error');
        showToast(err.message, 'error');
    } finally {
        generateBtn.classList.remove('loading');
        generateBtn.disabled = false;
    }
}

// ═══ Core: Refine Flowchart ═════════════════════════════════════════════════

async function handleRefine() {
    const instruction = refineInput.value.trim();
    if (!instruction) {
        showToast('Enter a refinement instruction.', 'error');
        return;
    }
    if (!currentMermaidCode) {
        showToast(`Generate a ${currentMode === 'block' ? 'block diagram' : 'flowchart'} first.`, 'error');
        return;
    }

    refineBtn.disabled = true;
    refineBtn.textContent = 'Refining...';
    updateStatus('loading', 'Refining...');

    const refineEndpoint = currentMode === 'block'
        ? 'http://127.0.0.1:5000/api/refine-block'
        : 'http://127.0.0.1:5000/api/refine';

    try {
        const response = await fetch(refineEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current_code: currentMermaidCode, instruction })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Refinement failed');

        currentMermaidCode = data.code;
        await renderFromCode(currentMermaidCode);
        refineInput.value = '';
        updateStatus('ready', 'Refined');
        showToast(`${currentMode === 'block' ? 'Block diagram' : 'Flowchart'} refined!`, 'success');

    } catch (err) {
        showToast(err.message, 'error');
        updateStatus('error', 'Error');
    } finally {
        refineBtn.disabled = false;
        refineBtn.textContent = 'Refine';
    }
}

// ═══ Render Mermaid Code ═════════════════════════════════════════════════════

function showEmptyState() {
    canvasContainer.innerHTML = '';
    canvasContainer.appendChild(emptyState);
    emptyState.style.display = 'block';
    nodeCountEl.textContent = 'NODES: 0';
    edgeCountEl.textContent = 'EDGES: 0';
}

async function renderFromCode(code) {
    if (!code || !code.trim()) {
        showEmptyState();
        return;
    }

    try {
        const { svg } = await mermaid.render('mermaid-svg-graph', code);
        canvasContainer.innerHTML = svg;
        canvasContainer.appendChild(emptyState); // Re-append it so it's not destroyed
        emptyState.style.display = 'none';

        // Count rough metrics
        const matchesNodes = code.match(/\[|\]|\(|\)|\{|\}/g);
        const matchesEdges = code.match(/--|==|-\.>|-->|==>|\.-/g);
        nodeCountEl.textContent = 'NODES: ' + (matchesNodes ? Math.floor(matchesNodes.length / 2) : '?');
        edgeCountEl.textContent = 'EDGES: ' + (matchesEdges ? matchesEdges.length : '?');

        // Initialize svg-pan-zoom
        const svgEl = canvasContainer.querySelector('svg');
        if (svgEl) {
            // Strip Mermaid's intrinsic limits so svg-pan-zoom doesn't get boxed/cut off.
            svgEl.style.maxWidth = 'none';
            svgEl.style.width = '100%';
            svgEl.style.height = '100%';

            // Add click-to-edit capability
            const nodesAndEdges = canvasContainer.querySelectorAll('.node, .edgeLabel');

            canvasContainer.addEventListener('click', () => {
                resetSelection(nodesAndEdges);
            });

            nodesAndEdges.forEach(element => {
                element.style.cursor = 'pointer';
                element.title = 'Select to Edit';
                element.addEventListener('click', (e) => {
                    e.stopPropagation();
                    resetSelection(nodesAndEdges);

                    selectedNodeOriginalText = element.textContent.trim();
                    selectedNodeElement = element;
                    if (!selectedNodeOriginalText) return;

                    const isEdge = element.classList.contains('edgeLabel');
                    if (isEdge) {
                        element.style.filter = 'drop-shadow(0 0 8px #ffffff)';
                    } else {
                        // dotted cyan neon light
                        const shapes = element.querySelectorAll('rect, circle, polygon, path');
                        shapes.forEach(shape => {
                            shape.dataset.origStroke = shape.style.stroke || shape.getAttribute('stroke') || '';
                            shape.dataset.origDash = shape.style.strokeDasharray || shape.getAttribute('stroke-dasharray') || '';
                            shape.dataset.origFilter = shape.style.filter || shape.getAttribute('filter') || '';
                            shape.style.stroke = '#00ffff';
                            shape.style.strokeDasharray = '5, 5';
                            shape.style.filter = 'drop-shadow(0 0 8px #00ffff)';
                        });
                        // Fallback
                        if (shapes.length === 0) {
                            element.style.filter = 'drop-shadow(0 0 10px #00ffff)';
                        }
                    }

                    const editBtn = document.getElementById('btn-edit-text');
                    if (editBtn) {
                        editBtn.disabled = false;
                        editBtn.style.color = '#ffffff';
                        editBtn.style.borderColor = '#ffffff';
                    }

                    const propPanel = document.getElementById('properties-panel');
                    const propContent = document.getElementById('prop-content');
                    if (propPanel && propContent) {
                        propPanel.style.display = 'block';
                        propContent.innerHTML = `
                            <div class="prop-group">
                                <div class="prop-label">Block Color</div>
                                <div class="prop-color-row">
                                    <button class="prop-color-swatch" style="background:#222;" data-color="#222222"></button>
                                    <button class="prop-color-swatch" style="background:#555;" data-color="#555555"></button>
                                    <button class="prop-color-swatch" style="background:#E52E2E;" data-color="#E52E2E"></button>
                                    <button class="prop-color-swatch" style="background:#3b82f6;" data-color="#3b82f6"></button>
                                    <button class="prop-color-swatch" style="background:#10b981;" data-color="#10b981"></button>
                                    <button class="prop-color-swatch" style="background:#f59e0b;" data-color="#f59e0b"></button>
                                </div>
                            </div>
                        `;

                        propContent.querySelectorAll('.prop-color-swatch').forEach(swtch => {
                            swtch.addEventListener('click', () => {
                                const color = swtch.getAttribute('data-color');
                                refineInput.value = `Change the color of "${selectedNodeOriginalText}" to ${color}`;
                                handleRefine();
                            });
                        });
                    }
                });
            });

            if (panZoomInstance) {
                panZoomInstance.destroy();
            }
            panZoomInstance = svgPanZoom(svgEl, {
                zoomEnabled: true,
                controlIconsEnabled: false,
                fit: true,
                center: true,
                minZoom: 0.1,
                maxZoom: 10,
                onZoom: function () { applyZoom(); }
            });
        }

        currentScale = 1;
        applyZoom();

    } catch (err) {
        console.error('Parse/render error:', err);
        showToast('Error parsing the Mermaid code: ' + err.message, 'error');
    }
}

// ═══ Export Functions ════════════════════════════════════════════════════════

function handleExportSVG() {
    const exportType = currentMode === 'block' ? 'block-diagram' : 'flowchart';
    if (!currentMermaidCode) {
        showToast(`Generate a ${currentMode === 'block' ? 'block diagram' : 'flowchart'} first.`, 'error');
        return;
    }

    const svgEl = canvasContainer.querySelector('svg');
    if (!svgEl) return;

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${exportType}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    showToast('SVG exported!', 'success');
}

async function handleExportPNG() {
    const exportType = currentMode === 'block' ? 'block-diagram' : 'flowchart';
    if (!currentMermaidCode) {
        showToast(`Generate a ${currentMode === 'block' ? 'block diagram' : 'flowchart'} first.`, 'error');
        return;
    }

    updateStatus('loading', 'Exporting PNG...');

    try {
        // Render a brand new clean invisible SVG to entirely bypass UI pan/zoom visual artifacts
        const { svg } = await mermaid.render('mermaid-export-graph', currentMermaidCode);

        // Parse it explicitly into DOM
        const parser = new DOMParser();
        const doc = parser.parseFromString(svg, 'image/svg+xml');
        const svgElement = doc.documentElement;

        // Extract native original proportions
        let width = 1200, height = 1200;
        if (svgElement.getAttribute('viewBox')) {
            const parts = svgElement.getAttribute('viewBox').split(' ');
            width = parseFloat(parts[2]);
            height = parseFloat(parts[3]);
        }

        // Force native sizes explicitly to bypass embedded intrinsic boundaries
        svgElement.style.maxWidth = 'none';
        svgElement.setAttribute('width', width);
        svgElement.setAttribute('height', height);

        const modSvgData = new XMLSerializer().serializeToString(svgElement);

        const canvas = document.createElement('canvas');
        canvas.width = width * 2; // High-res output
        canvas.height = height * 2;
        const ctx = canvas.getContext('2d');
        ctx.scale(2, 2);

        // Fill white background cleanly
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);

        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, width, height);
            const link = document.createElement('a');
            link.download = `${exportType}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            updateStatus('ready', 'Exported');
            showToast('High-Res PNG exported!', 'success');
        };
        img.onerror = () => {
            showToast('Image encoding failed. Trying SVG export instead.', 'error');
            handleExportSVG();
        };

        // Use Unicode-safe encoding to guarantee no text crashes
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(modSvgData);

    } catch (err) {
        showToast('PNG Export failed: ' + err.message, 'error');
        updateStatus('error', 'Error');
    }
}

// ═══ Code Actions ═══════════════════════════════════════════════════════════

function handleClearCode() {
    if (promptInput) promptInput.value = '';
    currentMermaidCode = '';
    showEmptyState();
    updateStatus('ready', 'Ready');
}

// ═══ Download Dropdown ══════════════════════════════════════════════════════

function setupDownloadDropdown() {
    const btn = document.getElementById('btn-download');
    const menu = document.getElementById('download-dropdown-menu');

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#download-dropdown-wrapper')) {
            menu.classList.remove('active');
        }
    });
}

function closeDownloadDropdown() {
    const menu = document.getElementById('download-dropdown-menu');
    if (menu) menu.classList.remove('active');
}

// ═══ Code Editor ════════════════════════════════════════════════════════════

function handleOpenCodeEditor() {
    const textarea = document.getElementById('code-editor-textarea');
    textarea.value = currentMermaidCode || '';
    openModal('code-editor-modal');

    if (!textarea._liveHandler) {
        textarea._liveHandler = debounce(() => {
            const code = textarea.value.trim();
            if (code) {
                currentMermaidCode = code;
                renderFromCode(currentMermaidCode);
            }
        }, 600);
        textarea.addEventListener('input', textarea._liveHandler);
    }
}

async function handleApplyCodeEdit() {
    const textarea = document.getElementById('code-editor-textarea');
    const code = textarea.value.trim();
    if (!code) {
        showToast('Code is empty.', 'error');
        return;
    }
    currentMermaidCode = code;
    await renderFromCode(currentMermaidCode);
    closeAllModals();
    showToast('Code applied to diagram!', 'success');
}

// ═══ Firebase Save & Load ═══════════════════════════════════════════════════

function handleSave() {
    const nameInput = document.getElementById('save-name');
    const name = nameInput.value.trim();

    if (!name) {
        showToast(`Enter a name for the ${currentMode === 'block' ? 'block diagram' : 'flowchart'}.`, 'error');
        return;
    }
    if (!currentMermaidCode) {
        showToast(`Generate a ${currentMode === 'block' ? 'block diagram' : 'flowchart'} first.`, 'error');
        return;
    }
    if (!db) {
        showToast('Firebase not initialized.', 'error');
        return;
    }

    const flowchartData = {
        name,
        code: currentMermaidCode,
        prompt: promptInput.value,
        mode: currentMode,
        createdAt: Date.now()
    };

    const newRef = db.ref('flowcharts').push();
    newRef.set(flowchartData)
        .then(() => {
            showToast(`Saved "${name}" successfully!`, 'success');
            closeAllModals();
            nameInput.value = '';
        })
        .catch(err => {
            showToast('Save failed: ' + err.message, 'error');
        });
}

function handleOpenLoad() {
    if (!db) {
        showToast('Firebase not initialized.', 'error');
        return;
    }

    openModal('load-modal');
    const listEl = document.getElementById('saved-list');
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">Loading...</div>';

    db.ref('flowcharts').orderByChild('createdAt').limitToLast(20).once('value')
        .then(snapshot => {
            const items = [];
            snapshot.forEach(child => {
                items.push({ id: child.key, ...child.val() });
            });
            items.reverse();

            if (items.length === 0) {
                listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">No saved flowcharts.</div>';
                return;
            }

            listEl.innerHTML = '';
            items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'saved-item';
                div.innerHTML = `
                        < div >
                        <div class="saved-item-name">${escapeHtml(item.name)}</div>
                        <div class="saved-item-date">${new Date(item.createdAt).toLocaleDateString()}</div>
                    </div >
                            <div class="saved-item-actions">
                                <button class="saved-item-btn load-item" data-id="${item.id}">Load</button>
                                <button class="saved-item-btn delete" data-id="${item.id}">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                `;
                listEl.appendChild(div);
            });

            listEl.querySelectorAll('.load-item').forEach(btn => {
                btn.addEventListener('click', () => loadFlowchart(btn.dataset.id));
            });

            listEl.querySelectorAll('.delete').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteFlowchart(btn.dataset.id);
                });
            });
        })
        .catch(err => {
            listEl.innerHTML = `<div style="text-align:center;padding:20px;color:var(--error);">Error: ${err.message}</div>`;
        });
}

function loadFlowchart(id) {
    db.ref('flowcharts/' + id).once('value')
        .then(snapshot => {
            const data = snapshot.val();
            if (data) {
                if (data.mode && data.mode !== currentMode) {
                    switchMode(data.mode);
                }
                currentMermaidCode = data.code;
                promptInput.value = data.prompt || '';
                renderFromCode(currentMermaidCode);
                closeAllModals();
                showToast(`Loaded "${data.name}"`, 'success');
            }
        });
}

function deleteFlowchart(id) {
    if (confirm('Delete this flowchart?')) {
        db.ref('flowcharts/' + id).remove()
            .then(() => {
                showToast('Deleted.', 'info');
                handleOpenLoad();
            });
    }
}

// ═══ UI Helpers ══════════════════════════════════════════════════════════════

function updateStatus(state, text) {
    statusDot.className = 'status-dot ' + (state === 'loading' ? 'loading' : state === 'error' ? 'error' : '');
    statusText.textContent = text;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconSvg = '';
    if (type === 'success') {
        iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (type === 'error') {
        iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    } else {
        iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `<span class="toast-icon">${iconSvg}</span> ${escapeHtml(message)}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ═══ Custom Modal Logic ═════════════════════════════════════════════════════

function resetSelection(nodesAndEdges = null) {
    if (!nodesAndEdges && canvasContainer) {
        nodesAndEdges = canvasContainer.querySelectorAll('.node, .edgeLabel');
    }
    if (nodesAndEdges) {
        nodesAndEdges.forEach(n => {
            n.style.filter = '';
            const shapes = n.querySelectorAll('rect, circle, polygon, path');
            shapes.forEach(shape => {
                if (shape.dataset.origStroke !== undefined) {
                    shape.style.stroke = shape.dataset.origStroke;
                    shape.style.strokeDasharray = shape.dataset.origDash;
                    shape.style.filter = shape.dataset.origFilter;
                }
            });
        });
    }

    selectedNodeOriginalText = '';
    selectedNodeElement = null;

    const editBtn = document.getElementById('btn-edit-text');
    if (editBtn) {
        editBtn.disabled = true;
        editBtn.style.color = '';
        editBtn.style.filter = '';
        editBtn.style.borderColor = '';
    }

    const propPanel = document.getElementById('properties-panel');
    if (propPanel) propPanel.style.display = 'none';
}

function showInlineEdit(svgElement, defaultText, onSave) {
    if (!svgElement) return;
    const rect = svgElement.getBoundingClientRect();

    // Create an absolute positioned input over the SVG text
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = defaultText;
    inp.style.position = 'fixed';
    inp.style.left = rect.left + 'px';
    inp.style.top = rect.top + 'px';
    inp.style.width = Math.max(rect.width, 100) + 'px';
    inp.style.height = Math.max(rect.height, 30) + 'px';
    inp.style.zIndex = '9999';
    inp.style.background = 'rgba(0, 0, 0, 0.8)';
    inp.style.color = '#fff';
    inp.style.border = '2px solid #00ffff';
    inp.style.outline = 'none';
    inp.style.textAlign = 'center';
    inp.style.fontFamily = 'var(--font-body), sans-serif';
    inp.style.fontSize = '14px';
    inp.style.borderRadius = '4px';
    inp.style.boxShadow = '0 0 10px #00ffff';

    // Auto-hide the actual SVG element visually to avoid overlap while typing
    const oldOpacity = svgElement.style.opacity;
    svgElement.style.opacity = '0';

    if (typeof panZoomInstance !== 'undefined' && panZoomInstance) {
        panZoomInstance.disablePan();
        panZoomInstance.disableZoom();
    }

    document.body.appendChild(inp);
    inp.focus();
    inp.select();

    const finish = (save) => {
        if (!inp.parentNode) return; // Prevent duplicate execution
        svgElement.style.opacity = oldOpacity;
        document.body.removeChild(inp);

        if (typeof panZoomInstance !== 'undefined' && panZoomInstance) {
            panZoomInstance.enablePan();
            panZoomInstance.enableZoom();
        }

        if (save) onSave(inp.value.trim());
    };

    inp.addEventListener('blur', () => finish(true));
    inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            inp.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            finish(false);
        }
    });
}
