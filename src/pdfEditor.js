import * as pdfjsLib from 'pdfjs-dist';
import { createIcons, icons } from 'lucide';
import { readFileAsArrayBuffer } from './pdfEngine.js';

/**
 * THINKCONE PDF EDITOR (Sejda-style PDF Editor)
 * Centre of thinking
 *
 * Full-featured in-browser PDF editor with:
 * - Text tool (add & edit text, font sizes, colors, bold, italic)
 * - Whiteout tool (erase / redact content with whiteout boxes)
 * - Freehand drawing / pen tool (custom colors and stroke width)
 * - Signatures (Draw signature pad, Type cursive calligraphy, Upload signature image)
 * - Shapes (Rectangle, Circle/Ellipse, Line with custom stroke & fill)
 * - Highlight tool (semi-transparent markers in multiple colors)
 * - Forms & Checkmarks (Checkmarks, Crosses, Checkboxes)
 * - Image insertion (Upload and place logos/photos)
 * - Undo / Redo history
 * - Zoom controls
 * - Vector-accurate embedding via pdf-lib
 */

export class PdfEditor {
  constructor(containerEl, file, options = {}) {
    this.container = containerEl;
    this.file = file;
    this.onApplyChanges = options.onApplyChanges || (() => {});
    this.onBack = options.onBack || (() => {});

    // Editor state
    this.activeTool = 'text'; // 'text' | 'whiteout' | 'draw' | 'sign' | 'shape' | 'highlight' | 'forms' | 'image'
    this.activeShape = 'rect'; // 'rect' | 'circle' | 'line'
    this.activeForm = 'check'; // 'check' | 'cross' | 'box'
    
    // Properties
    this.textColor = '#000000';
    this.fontSize = 16;
    this.fontFamily = 'helvetica';
    this.isBold = false;
    this.isItalic = false;
    this.drawColor = '#000000';
    this.drawWidth = 3;
    this.whiteoutColor = '#ffffff';
    this.highlightColor = '#fef08a';
    this.shapeStrokeColor = '#005043';
    this.shapeFillColor = 'transparent';
    this.shapeStrokeWidth = 2;
    this.formColor = '#005043';
    this.formSize = 24;

    this.zoom = 1.0;
    this.baseScale = 1.33; // crisp rendering scale
    this.pdfDoc = null;
    this.numPages = 0;
    this.pageViewports = []; // { width, height }
    
    // Edits stored per page index: { [pageIndex]: [ { id, type, x, y, width, height, ... } ] }
    this.pagesEdits = {};
    this.history = [];
    this.historyIdx = -1;

    // Interaction states
    this.selectedAnnotationId = null;
    this.selectedPageIndex = null;
    this.isDrawing = false;
    this.currentDrawPoints = [];
    this.isDragging = false;
    this.isResizing = false;
    this.dragStart = { x: 0, y: 0 };
    this.activeSignatureDataUrl = null;

    // Drag-to-create box states (for whiteout, highlight, shapes)
    this.isCreatingBox = false;
    this.boxStart = { x: 0, y: 0 };

    this.init();
  }

  async init() {
    this.renderSkeleton();
    await this.loadPdf();
    this.pushHistory();
    this.renderAllPages();
    this.attachEvents();
  }

  /**
   * Render Editor Chrome / Toolbar / Stage
   */
  renderSkeleton() {
    this.container.innerHTML = `
      <div class="pdf-editor-workspace">
        <!-- Top Sticky Toolbar -->
        <header class="editor-top-ribbon">
          <div class="ribbon-left">
            <button class="editor-btn-secondary" id="editor-back-btn" title="Back to Tools">
              <i data-lucide="arrow-left" style="width: 16px; height: 16px;"></i>
              <span class="btn-text">Back</span>
            </button>
            <div class="editor-doc-meta">
              <span class="editor-doc-title" title="${this.file.name}">${this.file.name}</span>
              <span class="editor-page-counter" id="editor-page-counter">Loading...</span>
            </div>
          </div>

          <!-- Central Tool Selection Ribbon -->
          <div class="ribbon-center">
            <div class="editor-tool-group" role="tablist">
              <button class="tool-btn ${this.activeTool === 'text' ? 'active' : ''}" data-tool="text" title="Text (Click anywhere on page to type)">
                <i data-lucide="type" style="width: 17px; height: 17px;"></i>
                <span>Text</span>
              </button>
              <button class="tool-btn ${this.activeTool === 'whiteout' ? 'active' : ''}" data-tool="whiteout" title="Whiteout (Erase or redact content)">
                <i data-lucide="eraser" style="width: 17px; height: 17px;"></i>
                <span>Whiteout</span>
              </button>
              <button class="tool-btn ${this.activeTool === 'draw' ? 'active' : ''}" data-tool="draw" title="Draw / Annotate (Freehand pencil)">
                <i data-lucide="pen-tool" style="width: 17px; height: 17px;"></i>
                <span>Draw</span>
              </button>
              <button class="tool-btn ${this.activeTool === 'sign' ? 'active' : ''}" data-tool="sign" title="Sign (Add signature)">
                <i data-lucide="signature" style="width: 17px; height: 17px;"></i>
                <span>Sign</span>
              </button>
              <button class="tool-btn ${this.activeTool === 'shape' ? 'active' : ''}" data-tool="shape" title="Shapes (Rectangle, Circle, Line)">
                <i data-lucide="square" style="width: 17px; height: 17px;"></i>
                <span>Shapes</span>
              </button>
              <button class="tool-btn ${this.activeTool === 'highlight' ? 'active' : ''}" data-tool="highlight" title="Highlight (Semi-transparent marker)">
                <i data-lucide="highlighter" style="width: 17px; height: 17px;"></i>
                <span>Highlight</span>
              </button>
              <button class="tool-btn ${this.activeTool === 'forms' ? 'active' : ''}" data-tool="forms" title="Forms (Checkmark, Cross, Box)">
                <i data-lucide="check-square" style="width: 17px; height: 17px;"></i>
                <span>Forms</span>
              </button>
              <button class="tool-btn ${this.activeTool === 'image' ? 'active' : ''}" data-tool="image" title="Images (Upload & place logo or photo)">
                <i data-lucide="image" style="width: 17px; height: 17px;"></i>
                <span>Images</span>
              </button>
            </div>
          </div>

          <!-- Right Ribbon (History, Zoom, Apply) -->
          <div class="ribbon-right">
            <div class="editor-action-group">
              <button class="icon-tool-btn" id="editor-undo-btn" title="Undo (Ctrl+Z)" disabled>
                <i data-lucide="undo" style="width: 16px; height: 16px;"></i>
              </button>
              <button class="icon-tool-btn" id="editor-redo-btn" title="Redo (Ctrl+Y)" disabled>
                <i data-lucide="redo" style="width: 16px; height: 16px;"></i>
              </button>
            </div>

            <div class="editor-action-group zoom-group">
              <button class="icon-tool-btn" id="editor-zoom-out" title="Zoom Out">
                <i data-lucide="zoom-out" style="width: 16px; height: 16px;"></i>
              </button>
              <span class="zoom-level-text" id="editor-zoom-text">100%</span>
              <button class="icon-tool-btn" id="editor-zoom-in" title="Zoom In">
                <i data-lucide="zoom-in" style="width: 16px; height: 16px;"></i>
              </button>
            </div>

            <button class="editor-apply-btn" id="editor-apply-btn" title="Save and download edited PDF">
              <i data-lucide="check" style="width: 18px; height: 18px;"></i>
              <span>Apply Changes</span>
            </button>
          </div>
        </header>

        <!-- Secondary Sub-toolbar (Dynamic Controls for Active Tool) -->
        <div class="editor-sub-ribbon" id="editor-sub-ribbon">
          ${this.renderSubRibbon()}
        </div>

        <!-- Scrollable Document Viewport -->
        <main class="editor-pages-scroll-area" id="editor-pages-viewport">
          <div class="editor-pages-container" id="editor-pages-container">
            <div class="editor-loading-spinner">
              <div class="spinner-ring"></div>
              <span>Rendering PDF pages...</span>
            </div>
          </div>
        </main>

        <!-- Hidden Image Picker for 'Images' Tool -->
        <input type="file" id="editor-image-picker" accept="image/png,image/jpeg,image/webp" style="display: none;" />

        <!-- Signature Dialog Modal Container -->
        <div class="signature-modal-backdrop" id="signature-modal-backdrop" style="display: none;">
          ${this.renderSignatureModal()}
        </div>
      </div>
    `;

    createIcons({ icons, root: this.container });
  }

  /**
   * Render dynamic tool options for the active tool
   */
  renderSubRibbon() {
    switch (this.activeTool) {
      case 'text':
        return `
          <div class="sub-ribbon-content">
            <div class="control-item">
              <label>Font:</label>
              <select id="sub-text-font" class="sub-select">
                <option value="helvetica" ${this.fontFamily === 'helvetica' ? 'selected' : ''}>Helvetica</option>
                <option value="times" ${this.fontFamily === 'times' ? 'selected' : ''}>Times New Roman</option>
                <option value="courier" ${this.fontFamily === 'courier' ? 'selected' : ''}>Courier</option>
              </select>
            </div>

            <div class="control-item">
              <label>Size:</label>
              <select id="sub-text-size" class="sub-select">
                ${[10, 12, 14, 16, 18, 20, 24, 28, 32, 40].map(s => `
                  <option value="${s}" ${this.fontSize === s ? 'selected' : ''}>${s}px</option>
                `).join('')}
              </select>
            </div>

            <div class="control-item btn-toggle-group">
              <button class="sub-toggle-btn ${this.isBold ? 'active' : ''}" id="sub-text-bold" title="Bold">
                <strong>B</strong>
              </button>
              <button class="sub-toggle-btn ${this.isItalic ? 'active' : ''}" id="sub-text-italic" title="Italic">
                <em>I</em>
              </button>
            </div>

            <div class="control-item color-control">
              <label>Color:</label>
              <input type="color" id="sub-text-color" value="${this.textColor}" class="sub-color-input" title="Text Color" />
              <div class="color-presets">
                ${['#000000', '#005043', '#1e293b', '#2563eb', '#dc2626', '#dcbd54'].map(c => `
                  <span class="color-swatch ${this.textColor === c ? 'active' : ''}" data-color="${c}" style="background-color: ${c}"></span>
                `).join('')}
              </div>
            </div>

            <div class="acrobat-mode-pill" title="Adobe Acrobat style: click any existing text in the PDF to edit it directly">
              <i data-lucide="sparkles" style="width: 14px; height: 14px; color: var(--accent-gold);"></i>
              <span><strong>Acrobat Edit:</strong> Click existing text to edit</span>
            </div>

            <div class="sub-ribbon-tip">
              <i data-lucide="info" style="width: 14px; height: 14px;"></i>
              <span>Click existing text to edit, or click empty space to add new text</span>
            </div>
          </div>
        `;

      case 'whiteout':
        return `
          <div class="sub-ribbon-content">
            <div class="control-item color-control">
              <label>Cover Color:</label>
              <input type="color" id="sub-whiteout-color" value="${this.whiteoutColor}" class="sub-color-input" />
              <div class="color-presets">
                ${['#ffffff', '#f8faf9', '#edf3f1', '#000000'].map(c => `
                  <span class="color-swatch ${this.whiteoutColor === c ? 'active' : ''}" data-whiteout-color="${c}" style="background-color: ${c}; border: 1px solid #cbd5e1;"></span>
                `).join('')}
              </div>
            </div>
            <div class="sub-ribbon-tip">
              <i data-lucide="info" style="width: 14px; height: 14px;"></i>
              <span>Click and drag over any existing text or area to redact/erase it with whiteout</span>
            </div>
          </div>
        `;

      case 'draw':
        return `
          <div class="sub-ribbon-content">
            <div class="control-item color-control">
              <label>Pen Color:</label>
              <input type="color" id="sub-draw-color" value="${this.drawColor}" class="sub-color-input" />
              <div class="color-presets">
                ${['#000000', '#005043', '#2563eb', '#dc2626', '#dcbd54', '#ffffff'].map(c => `
                  <span class="color-swatch ${this.drawColor === c ? 'active' : ''}" data-draw-color="${c}" style="background-color: ${c}"></span>
                `).join('')}
              </div>
            </div>

            <div class="control-item">
              <label>Stroke Width:</label>
              <div class="sub-pill-selector">
                <button class="sub-pill ${this.drawWidth === 2 ? 'active' : ''}" data-draw-width="2">Thin (2px)</button>
                <button class="sub-pill ${this.drawWidth === 4 ? 'active' : ''}" data-draw-width="4">Medium (4px)</button>
                <button class="sub-pill ${this.drawWidth === 7 ? 'active' : ''}" data-draw-width="7">Thick (7px)</button>
              </div>
            </div>

            <div class="sub-ribbon-tip">
              <i data-lucide="info" style="width: 14px; height: 14px;"></i>
              <span>Draw annotations or signatures freehand anywhere on the document</span>
            </div>
          </div>
        `;

      case 'sign':
        return `
          <div class="sub-ribbon-content">
            <button class="btn-sub-primary" id="sub-open-signature-modal">
              <i data-lucide="pen-tool" style="width: 15px; height: 15px;"></i>
              <span>${this.activeSignatureDataUrl ? 'Change Signature' : 'Create / Choose Signature'}</span>
            </button>
            
            ${this.activeSignatureDataUrl ? `
              <div class="signature-active-preview">
                <img src="${this.activeSignatureDataUrl}" alt="Signature" />
                <span class="active-badge">Ready to Place</span>
              </div>
            ` : ''}

            <div class="sub-ribbon-tip">
              <i data-lucide="info" style="width: 14px; height: 14px;"></i>
              <span>${this.activeSignatureDataUrl ? 'Click anywhere on the PDF to place your signature' : 'Click the button to draw, type, or upload your signature'}</span>
            </div>
          </div>
        `;

      case 'shape':
        return `
          <div class="sub-ribbon-content">
            <div class="control-item">
              <label>Shape:</label>
              <div class="sub-pill-selector">
                <button class="sub-pill ${this.activeShape === 'rect' ? 'active' : ''}" data-shape="rect">Rectangle</button>
                <button class="sub-pill ${this.activeShape === 'circle' ? 'active' : ''}" data-shape="circle">Circle / Ellipse</button>
                <button class="sub-pill ${this.activeShape === 'line' ? 'active' : ''}" data-shape="line">Line</button>
              </div>
            </div>

            <div class="control-item color-control">
              <label>Border:</label>
              <input type="color" id="sub-shape-stroke-color" value="${this.shapeStrokeColor}" class="sub-color-input" />
            </div>

            <div class="control-item">
              <label>Fill:</label>
              <div class="sub-pill-selector">
                <button class="sub-pill ${this.shapeFillColor === 'transparent' ? 'active' : ''}" data-shape-fill="transparent">None</button>
                <button class="sub-pill ${this.shapeFillColor === '#ffffff' ? 'active' : ''}" data-shape-fill="#ffffff">White</button>
                <button class="sub-pill ${this.shapeFillColor === '#dcbd54' ? 'active' : ''}" data-shape-fill="#dcbd54">Gold</button>
                <button class="sub-pill ${this.shapeFillColor === '#005043' ? 'active' : ''}" data-shape-fill="#005043">Green</button>
              </div>
            </div>

            <div class="sub-ribbon-tip">
              <i data-lucide="info" style="width: 14px; height: 14px;"></i>
              <span>Click and drag on any page to draw the chosen shape</span>
            </div>
          </div>
        `;

      case 'highlight':
        return `
          <div class="sub-ribbon-content">
            <div class="control-item color-control">
              <label>Highlight Color:</label>
              <div class="color-presets">
                ${[
                  { color: '#fef08a', name: 'Yellow' },
                  { color: '#bbf7d0', name: 'Green' },
                  { color: '#a5f3fc', name: 'Cyan' },
                  { color: '#fbcfe8', name: 'Pink' }
                ].map(item => `
                  <span class="color-swatch highlight-swatch ${this.highlightColor === item.color ? 'active' : ''}" data-highlight-color="${item.color}" style="background-color: ${item.color}" title="${item.name}"></span>
                `).join('')}
              </div>
            </div>
            <div class="sub-ribbon-tip">
              <i data-lucide="info" style="width: 14px; height: 14px;"></i>
              <span>Click and drag across text to highlight with translucent color</span>
            </div>
          </div>
        `;

      case 'forms':
        return `
          <div class="sub-ribbon-content">
            <div class="control-item">
              <label>Symbol:</label>
              <div class="sub-pill-selector">
                <button class="sub-pill ${this.activeForm === 'check' ? 'active' : ''}" data-form-kind="check">✔ Checkmark</button>
                <button class="sub-pill ${this.activeForm === 'cross' ? 'active' : ''}" data-form-kind="cross">✖ Cross</button>
                <button class="sub-pill ${this.activeForm === 'box' ? 'active' : ''}" data-form-kind="box">☐ Checkbox</button>
              </div>
            </div>

            <div class="control-item color-control">
              <label>Color:</label>
              <input type="color" id="sub-form-color" value="${this.formColor}" class="sub-color-input" />
            </div>

            <div class="sub-ribbon-tip">
              <i data-lucide="info" style="width: 14px; height: 14px;"></i>
              <span>Click on any checkbox or form line to stamp the symbol</span>
            </div>
          </div>
        `;

      case 'image':
        return `
          <div class="sub-ribbon-content">
            <button class="btn-sub-primary" id="sub-trigger-image-upload">
              <i data-lucide="upload" style="width: 15px; height: 15px;"></i>
              <span>Choose Image to Insert</span>
            </button>
            <div class="sub-ribbon-tip">
              <i data-lucide="info" style="width: 14px; height: 14px;"></i>
              <span>Upload a logo, stamp, or photo to place onto your PDF document</span>
            </div>
          </div>
        `;

      default:
        return '';
    }
  }

  /**
   * Signature Creation Modal (Draw / Type / Upload)
   */
  renderSignatureModal() {
    return `
      <div class="signature-modal-dialog">
        <div class="modal-header">
          <div class="modal-title-row">
            <i data-lucide="pen-tool" style="width: 20px; height: 20px; color: var(--primary);"></i>
            <h3>Create Signature</h3>
          </div>
          <button class="modal-close-btn" id="signature-modal-close" title="Close">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <!-- Tabs: Draw | Type | Upload -->
        <div class="signature-modal-tabs" role="tablist">
          <button class="sig-tab active" data-sig-tab="draw">
            <i data-lucide="pen-tool" style="width: 15px; height: 15px;"></i>
            <span>Draw</span>
          </button>
          <button class="sig-tab" data-sig-tab="type">
            <i data-lucide="type" style="width: 15px; height: 15px;"></i>
            <span>Type</span>
          </button>
          <button class="sig-tab" data-sig-tab="upload">
            <i data-lucide="upload" style="width: 15px; height: 15px;"></i>
            <span>Upload</span>
          </button>
        </div>

        <div class="modal-body">
          <!-- Tab 1: Draw Pad -->
          <div class="sig-tab-panel active" id="sig-panel-draw">
            <div class="sig-pad-wrapper">
              <canvas id="sig-draw-canvas" width="520" height="190"></canvas>
              <div class="sig-pad-baseline"></div>
              <button class="sig-pad-clear-btn" id="sig-draw-clear" title="Clear pad">Clear</button>
            </div>
            <div class="sig-pad-colors">
              <span>Ink Color:</span>
              <button class="sig-color-dot active" data-sig-ink="#000000" style="background: #000000;"></button>
              <button class="sig-color-dot" data-sig-ink="#005043" style="background: #005043;"></button>
              <button class="sig-color-dot" data-sig-ink="#1e3a8a" style="background: #1e3a8a;"></button>
            </div>
          </div>

          <!-- Tab 2: Type Cursive Signature -->
          <div class="sig-tab-panel" id="sig-panel-type">
            <div class="sig-type-input-group">
              <input type="text" id="sig-type-name" class="sig-type-input" placeholder="Type your full name..." value="Your Signature" maxlength="40" />
            </div>
            <div class="sig-type-styles">
              <div class="sig-style-card active" data-sig-font="'Dancing Script', cursive">
                <span class="sig-style-preview preview-dancing" id="preview-sig-1">Your Signature</span>
                <span class="sig-style-name">Classic Script</span>
              </div>
              <div class="sig-style-card" data-sig-font="'Caveat', cursive">
                <span class="sig-style-preview preview-caveat" id="preview-sig-2">Your Signature</span>
                <span class="sig-style-name">Handwritten Casual</span>
              </div>
            </div>
          </div>

          <!-- Tab 3: Upload Image -->
          <div class="sig-tab-panel" id="sig-panel-upload">
            <div class="sig-upload-dropzone" id="sig-upload-dropzone">
              <input type="file" id="sig-upload-input" accept="image/png,image/jpeg,image/webp" style="display: none;" />
              <i data-lucide="image" style="width: 38px; height: 38px; color: var(--text-muted);"></i>
              <p>Drag signature image here or <strong style="color: var(--primary); cursor: pointer;">browse</strong></p>
              <span style="font-size: 0.8rem; color: var(--text-muted);">PNG with transparent background recommended</span>
            </div>
            <div class="sig-upload-preview" id="sig-upload-preview" style="display: none;">
              <img id="sig-upload-img" src="" alt="Uploaded signature" />
              <button class="btn-sub-text" id="sig-upload-remove">Remove</button>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="editor-btn-secondary" id="signature-modal-cancel">Cancel</button>
          <button class="editor-apply-btn" id="signature-modal-save">
            <i data-lucide="check" style="width: 16px; height: 16px;"></i>
            <span>Use Signature</span>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Load PDF into PDF.js
   */
  async loadPdf() {
    try {
      const buffer = await readFileAsArrayBuffer(this.file);
      const loadingTask = pdfjsLib.getDocument({ data: buffer });
      this.pdfDoc = await loadingTask.promise;
      this.numPages = this.pdfDoc.numPages;

      const counter = this.container.querySelector('#editor-page-counter');
      if (counter) counter.textContent = `${this.numPages} ${this.numPages === 1 ? 'Page' : 'Pages'}`;

      // Initialize empty edits array for each page
      for (let i = 0; i < this.numPages; i++) {
        if (!this.pagesEdits[i]) {
          this.pagesEdits[i] = [];
        }
      }
    } catch (err) {
      console.error('Failed to load PDF in editor:', err);
      const container = this.container.querySelector('#editor-pages-container');
      if (container) {
        container.innerHTML = `<div class="editor-error">Failed to load PDF document: ${err.message}</div>`;
      }
    }
  }

  /**
   * Render all PDF pages with their interactive overlay layer
   */
  async renderAllPages() {
    const pagesContainer = this.container.querySelector('#editor-pages-container');
    if (!pagesContainer || !this.pdfDoc) return;
    pagesContainer.innerHTML = '';

    for (let pageNum = 1; pageNum <= this.numPages; pageNum++) {
      const pageIdx = pageNum - 1;
      const page = await this.pdfDoc.getPage(pageNum);
      const effectiveScale = this.baseScale * this.zoom;
      const viewport = page.getViewport({ scale: effectiveScale });

      this.pageViewports[pageIdx] = {
        width: viewport.width,
        height: viewport.height,
        scale: effectiveScale,
      };

      const pageCard = document.createElement('div');
      pageCard.className = 'editor-page-card';
      pageCard.dataset.pageIndex = pageIdx;
      pageCard.style.width = `${viewport.width}px`;

      pageCard.innerHTML = `
        <div class="editor-page-card-header">
          <span class="editor-page-number-pill">Page ${pageNum} of ${this.numPages}</span>
          <button class="editor-page-clear-btn" data-clear-page="${pageIdx}" title="Clear annotations on this page">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
            <span>Clear Page</span>
          </button>
        </div>

        <div class="editor-page-viewport" style="width: ${viewport.width}px; height: ${viewport.height}px;">
          <canvas class="editor-page-canvas" width="${viewport.width}" height="${viewport.height}"></canvas>
          <!-- Existing Document Text Layer for Adobe Acrobat / Sejda In-Place Text Editing -->
          <div class="editor-existing-text-layer ${this.activeTool === 'text' ? 'text-mode-active' : ''}" data-existing-page-idx="${pageIdx}" style="width: ${viewport.width}px; height: ${viewport.height}px;"></div>
          <div class="editor-annotation-layer" data-page-idx="${pageIdx}" style="width: ${viewport.width}px; height: ${viewport.height}px;"></div>
          <!-- Live Drawing Canvas Layer -->
          <canvas class="editor-drawing-layer" data-draw-page-idx="${pageIdx}" width="${viewport.width}" height="${viewport.height}"></canvas>
        </div>
      `;

      pagesContainer.appendChild(pageCard);

      // Render PDF onto page canvas
      const canvas = pageCard.querySelector('.editor-page-canvas');
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      // Extract existing PDF text items and render interactive Acrobat-style text edit overlay
      try {
        const textContent = await page.getTextContent();
        this.renderExistingTextLayer(pageCard, pageIdx, textContent, viewport);
      } catch (err) {
        console.warn('Could not extract text content for page', pageNum, err);
      }

      // Render existing annotations for this page
      this.renderPageAnnotations(pageIdx);
    }

    createIcons({ icons, root: pagesContainer });
    this.attachPageEvents();
  }

  /**
   * Group raw PDF text runs into natural, coherent lines and phrases
   */
  clusterTextItems(items, viewport) {
    if (!items || items.length === 0) return [];

    const valid = items.filter(it => it.str && it.str.trim().length > 0);
    if (valid.length === 0) return [];

    // Sort by vertical position (top to bottom), then horizontal (left to right)
    valid.sort((a, b) => {
      const dy = b.transform[5] - a.transform[5];
      if (Math.abs(dy) > 4) return dy;
      return a.transform[4] - b.transform[4];
    });

    const lines = [];
    let currentLine = null;

    for (const item of valid) {
      const tx = item.transform[4];
      const ty = item.transform[5];
      const fontSize = Math.hypot(item.transform[0], item.transform[1]) || item.height || 12;
      const width = item.width;
      const height = item.height || fontSize;

      if (!currentLine) {
        currentLine = {
          tx,
          ty,
          fontSize,
          width,
          height,
          str: item.str,
        };
        continue;
      }

      const sameLineY = Math.abs(ty - currentLine.ty) < (currentLine.fontSize * 0.45);
      const adjacentX = (tx - (currentLine.tx + currentLine.width)) < (currentLine.fontSize * 2.5);

      if (sameLineY && adjacentX && tx >= currentLine.tx) {
        const gap = tx - (currentLine.tx + currentLine.width);
        const needsSpace = gap > (currentLine.fontSize * 0.12) && !currentLine.str.endsWith(' ') && !item.str.startsWith(' ');
        currentLine.str += (needsSpace ? ' ' : '') + item.str;
        currentLine.width = (tx + width) - currentLine.tx;
        currentLine.height = Math.max(currentLine.height, height);
      } else {
        lines.push(currentLine);
        currentLine = {
          tx,
          ty,
          fontSize,
          width,
          height,
          str: item.str,
        };
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.map(line => {
      const [x1, y1] = viewport.convertToViewportPoint(line.tx, line.ty + line.fontSize);
      const [x2, y2] = viewport.convertToViewportPoint(line.tx + line.width, line.ty);

      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const w = Math.max(16, Math.abs(x2 - x1));
      const h = Math.max(14, Math.abs(y2 - y1));

      return {
        str: line.str,
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(w),
        height: Math.round(h),
        fontSize: Math.round(line.fontSize * (viewport.scale || 1.33)),
      };
    });
  }

  /**
   * Render existing document text items on a page for Acrobat-style in-place editing
   */
  renderExistingTextLayer(pageCard, pageIdx, textContent, viewport) {
    const layer = pageCard.querySelector(`.editor-existing-text-layer[data-existing-page-idx="${pageIdx}"]`);
    if (!layer || !textContent || !textContent.items) return;
    layer.innerHTML = '';

    const clustered = this.clusterTextItems(textContent.items, viewport);

    clustered.forEach((block, bIdx) => {
      // Don't render if this area has already been replaced by a text edit on this page
      const hasReplacement = (this.pagesEdits[pageIdx] || []).some(
        e => e.type === 'text' && Math.abs(e.x - block.left) < 15 && Math.abs(e.y - block.top) < 10
      );
      if (hasReplacement) return;

      const itemEl = document.createElement('div');
      itemEl.className = 'existing-pdf-text-item';
      itemEl.dataset.blockIdx = bIdx;
      itemEl.dataset.pageIdx = pageIdx;
      itemEl.style.left = `${block.left}px`;
      itemEl.style.top = `${block.top}px`;
      itemEl.style.width = `${block.width}px`;
      itemEl.style.height = `${block.height}px`;
      itemEl.setAttribute('data-preview-text', block.str.slice(0, 32));
      itemEl.title = `Click to edit text: "${block.str}"`;

      itemEl.addEventListener('click', (e) => {
        if (this.activeTool !== 'text') return;
        e.stopPropagation();
        this.convertExistingTextToEditable(pageCard, pageIdx, block, itemEl);
      });

      layer.appendChild(itemEl);
    });
  }

  /**
   * Convert clicked existing document text into an in-place editable text annotation
   * with clean whiteout masking of the original text
   */
  convertExistingTextToEditable(pageCard, pageIdx, block, itemEl) {
    // 1. Sample background color behind this text from the page canvas
    let bgColor = '#ffffff';
    try {
      const canvas = pageCard.querySelector('.editor-page-canvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const sampleX = Math.max(0, Math.min(canvas.width - 1, block.left - 2));
        const sampleY = Math.max(0, Math.min(canvas.height - 1, block.top + block.height / 2));
        const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
        if (pixel[3] > 50) {
          const r = pixel[0], g = pixel[1], b = pixel[2];
          bgColor = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
        }
      }
    } catch (e) {
      console.warn('Canvas pixel sample fallback:', e);
    }

    // 2. Insert clean whiteout rectangle covering the original text
    const whiteoutId = 'whiteout_orig_' + Date.now() + Math.random().toString(36).substr(2, 4);
    if (!this.pagesEdits[pageIdx]) this.pagesEdits[pageIdx] = [];

    this.pagesEdits[pageIdx].push({
      id: whiteoutId,
      type: 'whiteout',
      x: Math.max(0, block.left - 2),
      y: Math.max(0, block.top - 2),
      width: block.width + 4,
      height: block.height + 4,
      color: bgColor,
    });

    // 3. Insert active editable text annotation in place
    const textId = 'text_edit_' + Date.now() + Math.random().toString(36).substr(2, 4);
    const newText = {
      id: textId,
      type: 'text',
      x: block.left,
      y: block.top,
      width: Math.max(block.width + 16, 120),
      height: Math.max(block.height, 26),
      text: block.str,
      fontSize: block.fontSize,
      fontColor: this.textColor || '#000000',
      fontFamily: this.fontFamily || 'helvetica',
      isBold: this.isBold,
      isItalic: this.isItalic,
      isReplacement: true,
    };

    this.pagesEdits[pageIdx].push(newText);
    this.pushHistory();

    // Remove the hover block so it cannot be double-clicked
    itemEl.remove();

    // Re-render annotations for this page
    this.renderPageAnnotations(pageIdx);
    this.selectAnnotation(textId, pageIdx);

    // Focus the text box immediately
    setTimeout(() => {
      const box = this.container.querySelector(`.editor-annotation-item[data-id="${textId}"] .text-content-box`);
      if (box) {
        box.focus();
        const range = document.createRange();
        range.selectNodeContents(box);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, 40);
  }

  /**
   * Render annotations for a specific page onto its annotation layer
   */
  renderPageAnnotations(pageIdx) {
    const layer = this.container.querySelector(`.editor-annotation-layer[data-page-idx="${pageIdx}"]`);
    if (!layer) return;
    layer.innerHTML = '';

    const edits = this.pagesEdits[pageIdx] || [];

    edits.forEach((item) => {
      const el = document.createElement('div');
      el.className = `editor-annotation-item item-${item.type} ${this.selectedAnnotationId === item.id ? 'selected' : ''}`;
      el.dataset.id = item.id;
      el.dataset.pageIdx = pageIdx;

      el.style.left = `${item.x}px`;
      el.style.top = `${item.y}px`;
      el.style.width = `${item.width}px`;
      el.style.height = `${item.height}px`;

      let innerContent = '';

      switch (item.type) {
        case 'text':
          el.style.fontSize = `${item.fontSize}px`;
          el.style.color = item.fontColor || '#000000';
          el.style.fontFamily = item.fontFamily === 'times' ? '"Times New Roman", serif' : item.fontFamily === 'courier' ? '"Courier New", monospace' : 'Helvetica, Arial, sans-serif';
          el.style.fontWeight = item.isBold ? 'bold' : 'normal';
          el.style.fontStyle = item.isItalic ? 'italic' : 'normal';

          innerContent = `
            <div class="text-content-box" contenteditable="true" spellcheck="false">${item.text || ''}</div>
          `;
          break;

        case 'whiteout':
          el.style.backgroundColor = item.color || '#ffffff';
          innerContent = `<div class="whiteout-fill"></div>`;
          break;

        case 'highlight':
          el.style.backgroundColor = item.color || '#fef08a';
          innerContent = `<div class="highlight-fill"></div>`;
          break;

        case 'shape':
          if (item.shapeType === 'circle') {
            el.style.borderRadius = '50%';
          }
          if (item.shapeType === 'line') {
            innerContent = `
              <svg width="100%" height="100%" style="overflow: visible;">
                <line x1="0" y1="0" x2="100%" y2="100%" stroke="${item.strokeColor || '#005043'}" stroke-width="${item.strokeWidth || 2}" />
              </svg>
            `;
          } else {
            el.style.border = `${item.strokeWidth || 2}px solid ${item.strokeColor || '#005043'}`;
            el.style.backgroundColor = item.fillColor || 'transparent';
          }
          break;

        case 'image':
        case 'signature':
          innerContent = `<img src="${item.dataUrl}" alt="Signature or Image" style="width: 100%; height: 100%; object-fit: contain; pointer-events: none; user-select: none;" />`;
          break;

        case 'checkmark':
          const strokeCol = item.color || '#005043';
          if (item.kind === 'check') {
            innerContent = `
              <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="${strokeCol}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            `;
          } else if (item.kind === 'cross') {
            innerContent = `
              <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="${strokeCol}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            `;
          } else {
            innerContent = `
              <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="${strokeCol}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              </svg>
            `;
          }
          break;
      }

      el.innerHTML = `
        ${innerContent}
        <div class="annotation-action-bar">
          <button class="annotation-del-btn" data-delete-id="${item.id}" title="Delete annotation">
            <i data-lucide="x" style="width: 12px; height: 12px;"></i>
          </button>
        </div>
        <div class="annotation-resize-handle" data-resize-id="${item.id}"></div>
      `;

      layer.appendChild(el);
    });

    createIcons({ icons, root: layer });
    this.redrawDrawingLayer(pageIdx);
  }

  /**
   * Redraw all freehand drawing paths for a page onto its dedicated drawing canvas
   */
  redrawDrawingLayer(pageIdx) {
    const canvas = this.container.querySelector(`.editor-drawing-layer[data-draw-page-idx="${pageIdx}"]`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const edits = this.pagesEdits[pageIdx] || [];
    const drawEdits = edits.filter(e => e.type === 'draw');

    drawEdits.forEach(drawItem => {
      const pts = drawItem.points || [];
      if (pts.length < 2) return;

      ctx.save();
      ctx.strokeStyle = drawItem.strokeColor || '#000000';
      ctx.lineWidth = drawItem.strokeWidth || 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
      ctx.restore();
    });
  }

  /**
   * Attach Global Toolbar & Workspace Event Listeners
   */
  attachEvents() {
    // 1. Tool selection buttons in ribbon
    const toolBtns = this.container.querySelectorAll('.tool-btn');
    toolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        this.setActiveTool(tool);
      });
    });

    // 2. Undo / Redo buttons
    this.container.querySelector('#editor-undo-btn')?.addEventListener('click', () => this.undo());
    this.container.querySelector('#editor-redo-btn')?.addEventListener('click', () => this.redo());

    // 3. Zoom buttons
    this.container.querySelector('#editor-zoom-in')?.addEventListener('click', () => this.setZoom(this.zoom + 0.15));
    this.container.querySelector('#editor-zoom-out')?.addEventListener('click', () => this.setZoom(this.zoom - 0.15));

    // 4. Back button
    this.container.querySelector('#editor-back-btn')?.addEventListener('click', () => this.onBack());

    // 5. Apply Changes Button
    this.container.querySelector('#editor-apply-btn')?.addEventListener('click', () => this.handleApply());

    // 6. Sub-ribbon dynamic controls delegation
    this.attachSubRibbonListeners();

    // 7. Signature modal events
    this.attachSignatureModalEvents();

    // 8. Image Picker input change
    const imgInput = this.container.querySelector('#editor-image-picker');
    imgInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
          this.insertImageOnCurrentPage(ev.target.result);
        };
        reader.readAsDataURL(file);
        imgInput.value = '';
      }
    });

    // Keyboard shortcuts: Ctrl+Z (Undo), Ctrl+Y (Redo), Delete / Backspace (delete selected)
    window.addEventListener('keydown', (e) => {
      if (e.target.isContentEditable || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        this.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        e.preventDefault();
        this.redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedAnnotationId) {
        e.preventDefault();
        this.deleteAnnotation(this.selectedAnnotationId);
      }
    });
  }

  /**
   * Set the active editing tool and re-render sub-ribbon
   */
  setActiveTool(tool) {
    this.activeTool = tool;
    
    // Update active class on toolbar
    this.container.querySelectorAll('.tool-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tool === tool);
    });

    // Toggle active state on existing text layers for Acrobat-style editing
    this.container.querySelectorAll('.editor-existing-text-layer').forEach(layer => {
      layer.classList.toggle('text-mode-active', tool === 'text');
    });

    // Update sub ribbon
    const sub = this.container.querySelector('#editor-sub-ribbon');
    if (sub) {
      sub.innerHTML = this.renderSubRibbon();
      createIcons({ icons, root: sub });
      this.attachSubRibbonListeners();
    }

    // If Sign tool and no active signature, auto open modal
    if (tool === 'sign' && !this.activeSignatureDataUrl) {
      this.openSignatureModal();
    }

    // If Image tool, trigger file picker
    if (tool === 'image') {
      const picker = this.container.querySelector('#editor-image-picker');
      picker?.click();
    }
  }

  /**
   * Attach listeners for dynamic sub-ribbon items
   */
  attachSubRibbonListeners() {
    const sub = this.container.querySelector('#editor-sub-ribbon');
    if (!sub) return;

    // Text controls
    sub.querySelector('#sub-text-font')?.addEventListener('change', (e) => {
      this.fontFamily = e.target.value;
      this.updateSelectedAnnotationProperties();
    });

    sub.querySelector('#sub-text-size')?.addEventListener('change', (e) => {
      this.fontSize = parseInt(e.target.value, 10);
      this.updateSelectedAnnotationProperties();
    });

    sub.querySelector('#sub-text-bold')?.addEventListener('click', (e) => {
      this.isBold = !this.isBold;
      e.currentTarget.classList.toggle('active', this.isBold);
      this.updateSelectedAnnotationProperties();
    });

    sub.querySelector('#sub-text-italic')?.addEventListener('click', (e) => {
      this.isItalic = !this.isItalic;
      e.currentTarget.classList.toggle('active', this.isItalic);
      this.updateSelectedAnnotationProperties();
    });

    sub.querySelector('#sub-text-color')?.addEventListener('input', (e) => {
      this.textColor = e.target.value;
      this.updateSelectedAnnotationProperties();
    });

    sub.querySelectorAll('.color-swatch[data-color]').forEach(swatch => {
      swatch.addEventListener('click', () => {
        this.textColor = swatch.dataset.color;
        const colorInput = sub.querySelector('#sub-text-color');
        if (colorInput) colorInput.value = this.textColor;
        sub.querySelectorAll('.color-swatch[data-color]').forEach(s => s.classList.toggle('active', s === swatch));
        this.updateSelectedAnnotationProperties();
      });
    });

    // Whiteout controls
    sub.querySelector('#sub-whiteout-color')?.addEventListener('input', (e) => {
      this.whiteoutColor = e.target.value;
    });
    sub.querySelectorAll('.color-swatch[data-whiteout-color]').forEach(swatch => {
      swatch.addEventListener('click', () => {
        this.whiteoutColor = swatch.dataset.whiteoutColor;
        const colorInput = sub.querySelector('#sub-whiteout-color');
        if (colorInput) colorInput.value = this.whiteoutColor;
        sub.querySelectorAll('.color-swatch[data-whiteout-color]').forEach(s => s.classList.toggle('active', s === swatch));
      });
    });

    // Draw controls
    sub.querySelector('#sub-draw-color')?.addEventListener('input', (e) => {
      this.drawColor = e.target.value;
    });
    sub.querySelectorAll('.color-swatch[data-draw-color]').forEach(swatch => {
      swatch.addEventListener('click', () => {
        this.drawColor = swatch.dataset.drawColor;
        const colorInput = sub.querySelector('#sub-draw-color');
        if (colorInput) colorInput.value = this.drawColor;
        sub.querySelectorAll('.color-swatch[data-draw-color]').forEach(s => s.classList.toggle('active', s === swatch));
      });
    });
    sub.querySelectorAll('.sub-pill[data-draw-width]').forEach(pill => {
      pill.addEventListener('click', () => {
        this.drawWidth = parseInt(pill.dataset.drawWidth, 10);
        sub.querySelectorAll('.sub-pill[data-draw-width]').forEach(p => p.classList.toggle('active', p === pill));
      });
    });

    // Shapes controls
    sub.querySelectorAll('.sub-pill[data-shape]').forEach(pill => {
      pill.addEventListener('click', () => {
        this.activeShape = pill.dataset.shape;
        sub.querySelectorAll('.sub-pill[data-shape]').forEach(p => p.classList.toggle('active', p === pill));
      });
    });
    sub.querySelector('#sub-shape-stroke-color')?.addEventListener('input', (e) => {
      this.shapeStrokeColor = e.target.value;
    });
    sub.querySelectorAll('.sub-pill[data-shape-fill]').forEach(pill => {
      pill.addEventListener('click', () => {
        this.shapeFillColor = pill.dataset.shapeFill;
        sub.querySelectorAll('.sub-pill[data-shape-fill]').forEach(p => p.classList.toggle('active', p === pill));
      });
    });

    // Highlight controls
    sub.querySelectorAll('.color-swatch[data-highlight-color]').forEach(swatch => {
      swatch.addEventListener('click', () => {
        this.highlightColor = swatch.dataset.highlightColor;
        sub.querySelectorAll('.color-swatch[data-highlight-color]').forEach(s => s.classList.toggle('active', s === swatch));
      });
    });

    // Forms controls
    sub.querySelectorAll('.sub-pill[data-form-kind]').forEach(pill => {
      pill.addEventListener('click', () => {
        this.activeForm = pill.dataset.formKind;
        sub.querySelectorAll('.sub-pill[data-form-kind]').forEach(p => p.classList.toggle('active', p === pill));
      });
    });
    sub.querySelector('#sub-form-color')?.addEventListener('input', (e) => {
      this.formColor = e.target.value;
    });

    // Signature buttons
    sub.querySelector('#sub-open-signature-modal')?.addEventListener('click', () => {
      this.openSignatureModal();
    });

    // Image Upload button
    sub.querySelector('#sub-trigger-image-upload')?.addEventListener('click', () => {
      this.container.querySelector('#editor-image-picker')?.click();
    });
  }

  /**
   * Attach interaction events to all page card viewports
   */
  attachPageEvents() {
    const pageCards = this.container.querySelectorAll('.editor-page-card');

    pageCards.forEach(card => {
      const pageIdx = parseInt(card.dataset.pageIndex, 10);
      const viewport = card.querySelector('.editor-page-viewport');
      const drawCanvas = card.querySelector('.editor-drawing-layer');
      const drawCtx = drawCanvas.getContext('2d');

      // Clear Page button
      card.querySelector('.editor-page-clear-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearPageAnnotations(pageIdx);
      });

      // Viewport Mouse Down
      viewport.addEventListener('mousedown', (e) => {
        // If clicking on existing annotation item or handle, let item handlers handle it
        if (e.target.closest('.editor-annotation-item')) {
          const itemEl = e.target.closest('.editor-annotation-item');
          const id = itemEl.dataset.id;
          this.selectAnnotation(id, pageIdx);
          
          if (e.target.closest('.annotation-del-btn')) {
            e.stopPropagation();
            this.deleteAnnotation(id);
            return;
          }

          if (e.target.closest('.annotation-resize-handle')) {
            e.stopPropagation();
            this.startResizing(e, id, pageIdx);
            return;
          }

          // If clicking contenteditable inside text, do not drag
          if (e.target.classList.contains('text-content-box')) {
            return;
          }

          // Start dragging the annotation
          this.startDragging(e, id, pageIdx);
          return;
        }

        // Clicked on blank viewport space
        this.deselectAnnotation();
        const rect = viewport.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // Perform action according to active tool
        switch (this.activeTool) {
          case 'text':
            this.createNewTextAnnotation(pageIdx, clickX, clickY);
            break;

          case 'whiteout':
          case 'highlight':
          case 'shape':
            this.startBoxCreation(e, pageIdx, clickX, clickY, rect);
            break;

          case 'draw':
            this.isDrawing = true;
            this.currentDrawPoints = [{ x: clickX, y: clickY }];
            drawCtx.save();
            drawCtx.strokeStyle = this.drawColor;
            drawCtx.lineWidth = this.drawWidth;
            drawCtx.lineCap = 'round';
            drawCtx.lineJoin = 'round';
            drawCtx.beginPath();
            drawCtx.moveTo(clickX, clickY);
            break;

          case 'sign':
            if (this.activeSignatureDataUrl) {
              this.placeSignature(pageIdx, clickX, clickY);
            } else {
              this.openSignatureModal();
            }
            break;

          case 'forms':
            this.placeFormMark(pageIdx, clickX, clickY);
            break;
        }
      });

      // Viewport Mouse Move
      viewport.addEventListener('mousemove', (e) => {
        const rect = viewport.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        // 1. Freehand drawing
        if (this.isDrawing && this.activeTool === 'draw') {
          this.currentDrawPoints.push({ x: currentX, y: currentY });
          drawCtx.lineTo(currentX, currentY);
          drawCtx.stroke();
        }

        // 2. Drag-to-create box (Whiteout / Highlight / Shape)
        if (this.isCreatingBox) {
          const w = Math.abs(currentX - this.boxStart.x);
          const h = Math.abs(currentY - this.boxStart.y);
          const x = Math.min(this.boxStart.x, currentX);
          const y = Math.min(this.boxStart.y, currentY);

          let previewEl = viewport.querySelector('.box-creation-preview');
          if (!previewEl) {
            previewEl = document.createElement('div');
            previewEl.className = 'box-creation-preview';
            viewport.appendChild(previewEl);
          }

          previewEl.style.left = `${x}px`;
          previewEl.style.top = `${y}px`;
          previewEl.style.width = `${w}px`;
          previewEl.style.height = `${h}px`;

          if (this.activeTool === 'whiteout') {
            previewEl.style.background = this.whiteoutColor;
            previewEl.style.border = '1px dashed #94a3b8';
          } else if (this.activeTool === 'highlight') {
            previewEl.style.background = this.highlightColor;
            previewEl.style.opacity = '0.5';
          } else if (this.activeTool === 'shape') {
            previewEl.style.border = `${this.shapeStrokeWidth}px solid ${this.shapeStrokeColor}`;
            previewEl.style.background = this.shapeFillColor;
            if (this.activeShape === 'circle') previewEl.style.borderRadius = '50%';
          }
        }
      });

      // Viewport Mouse Up
      const finishAction = () => {
        // Finish freehand drawing
        if (this.isDrawing && this.activeTool === 'draw') {
          this.isDrawing = false;
          drawCtx.restore();
          if (this.currentDrawPoints.length > 1) {
            this.pagesEdits[pageIdx].push({
              id: 'draw_' + Date.now() + Math.random().toString(36).substr(2, 4),
              type: 'draw',
              points: [...this.currentDrawPoints],
              strokeColor: this.drawColor,
              strokeWidth: this.drawWidth,
            });
            this.pushHistory();
            this.redrawDrawingLayer(pageIdx);
          }
          this.currentDrawPoints = [];
        }

        // Finish drag-to-create box
        if (this.isCreatingBox) {
          this.isCreatingBox = false;
          const previewEl = viewport.querySelector('.box-creation-preview');
          if (previewEl) {
            const w = parseFloat(previewEl.style.width);
            const h = parseFloat(previewEl.style.height);
            const x = parseFloat(previewEl.style.left);
            const y = parseFloat(previewEl.style.top);
            previewEl.remove();

            // Minimum threshold: at least 10x10px, else default size
            const finalW = w > 10 ? w : (this.activeTool === 'whiteout' ? 120 : 100);
            const finalH = h > 10 ? h : (this.activeTool === 'whiteout' ? 30 : 50);

            const newId = 'box_' + Date.now() + Math.random().toString(36).substr(2, 4);

            if (this.activeTool === 'whiteout') {
              this.pagesEdits[pageIdx].push({
                id: newId,
                type: 'whiteout',
                x,
                y,
                width: finalW,
                height: finalH,
                color: this.whiteoutColor,
              });
            } else if (this.activeTool === 'highlight') {
              this.pagesEdits[pageIdx].push({
                id: newId,
                type: 'highlight',
                x,
                y,
                width: finalW,
                height: finalH,
                color: this.highlightColor,
              });
            } else if (this.activeTool === 'shape') {
              this.pagesEdits[pageIdx].push({
                id: newId,
                type: 'shape',
                shapeType: this.activeShape,
                x,
                y,
                width: finalW,
                height: finalH,
                strokeColor: this.shapeStrokeColor,
                fillColor: this.shapeFillColor,
                strokeWidth: this.shapeStrokeWidth,
              });
            }

            this.pushHistory();
            this.renderPageAnnotations(pageIdx);
            this.selectAnnotation(newId, pageIdx);
          }
        }
      };

      viewport.addEventListener('mouseup', finishAction);
      viewport.addEventListener('mouseleave', finishAction);
    });

    // Contenteditable input sync for text
    this.container.querySelectorAll('.text-content-box').forEach(box => {
      box.addEventListener('input', (e) => {
        const itemEl = box.closest('.editor-annotation-item');
        const id = itemEl.dataset.id;
        const pageIdx = parseInt(itemEl.dataset.pageIdx, 10);
        const item = (this.pagesEdits[pageIdx] || []).find(it => it.id === id);
        if (item) {
          item.text = box.innerText;
        }
      });
      box.addEventListener('blur', () => {
        this.pushHistory();
      });
    });
  }

  /**
   * Start drag-to-create box
   */
  startBoxCreation(e, pageIdx, clickX, clickY, rect) {
    this.isCreatingBox = true;
    this.boxStart = { x: clickX, y: clickY };
  }

  /**
   * Create and insert new text annotation on click
   */
  createNewTextAnnotation(pageIdx, clickX, clickY) {
    const id = 'text_' + Date.now() + Math.random().toString(36).substr(2, 4);
    const newText = {
      id,
      type: 'text',
      x: clickX,
      y: clickY,
      width: 180,
      height: 38,
      text: 'Type text here',
      fontSize: this.fontSize,
      fontColor: this.textColor,
      fontFamily: this.fontFamily,
      isBold: this.isBold,
      isItalic: this.isItalic,
    };

    if (!this.pagesEdits[pageIdx]) this.pagesEdits[pageIdx] = [];
    this.pagesEdits[pageIdx].push(newText);
    this.pushHistory();
    this.renderPageAnnotations(pageIdx);
    this.selectAnnotation(id, pageIdx);

    // Focus the text box
    setTimeout(() => {
      const box = this.container.querySelector(`.editor-annotation-item[data-id="${id}"] .text-content-box`);
      if (box) {
        box.focus();
        // Select all text inside
        const range = document.createRange();
        range.selectNodeContents(box);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, 50);
  }

  /**
   * Place active signature onto page
   */
  placeSignature(pageIdx, clickX, clickY) {
    const id = 'sig_' + Date.now() + Math.random().toString(36).substr(2, 4);
    const width = 160;
    const height = 70;

    const newSig = {
      id,
      type: 'signature',
      dataUrl: this.activeSignatureDataUrl,
      x: Math.max(0, clickX - width / 2),
      y: Math.max(0, clickY - height / 2),
      width,
      height,
    };

    if (!this.pagesEdits[pageIdx]) this.pagesEdits[pageIdx] = [];
    this.pagesEdits[pageIdx].push(newSig);
    this.pushHistory();
    this.renderPageAnnotations(pageIdx);
    this.selectAnnotation(id, pageIdx);
  }

  /**
   * Insert user uploaded image onto the first or currently visible page
   */
  insertImageOnCurrentPage(dataUrl) {
    // Find currently visible page or default to 0
    let targetPageIdx = this.selectedPageIndex !== null ? this.selectedPageIndex : 0;
    const viewport = this.pageViewports[targetPageIdx] || { width: 600, height: 800 };

    const id = 'img_' + Date.now() + Math.random().toString(36).substr(2, 4);
    const width = 180;
    const height = 120;

    const newImg = {
      id,
      type: 'image',
      dataUrl,
      x: (viewport.width - width) / 2,
      y: 120,
      width,
      height,
    };

    if (!this.pagesEdits[targetPageIdx]) this.pagesEdits[targetPageIdx] = [];
    this.pagesEdits[targetPageIdx].push(newImg);
    this.pushHistory();
    this.renderPageAnnotations(targetPageIdx);
    this.selectAnnotation(id, targetPageIdx);
  }

  /**
   * Place checkmark, cross, or form box
   */
  placeFormMark(pageIdx, clickX, clickY) {
    const id = 'form_' + Date.now() + Math.random().toString(36).substr(2, 4);
    const size = this.formSize || 24;

    const newMark = {
      id,
      type: 'checkmark',
      kind: this.activeForm,
      x: Math.max(0, clickX - size / 2),
      y: Math.max(0, clickY - size / 2),
      width: size,
      height: size,
      size,
      color: this.formColor,
    };

    if (!this.pagesEdits[pageIdx]) this.pagesEdits[pageIdx] = [];
    this.pagesEdits[pageIdx].push(newMark);
    this.pushHistory();
    this.renderPageAnnotations(pageIdx);
    this.selectAnnotation(id, pageIdx);
  }

  /**
   * Start moving an annotation item
   */
  startDragging(e, id, pageIdx) {
    const item = (this.pagesEdits[pageIdx] || []).find(it => it.id === id);
    if (!item) return;

    this.isDragging = true;
    this.dragStart = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      itemX: item.x,
      itemY: item.y,
    };

    const itemEl = this.container.querySelector(`.editor-annotation-item[data-id="${id}"]`);

    const onMove = (moveEv) => {
      if (!this.isDragging) return;
      const dx = moveEv.clientX - this.dragStart.mouseX;
      const dy = moveEv.clientY - this.dragStart.mouseY;
      item.x = Math.max(0, this.dragStart.itemX + dx);
      item.y = Math.max(0, this.dragStart.itemY + dy);
      if (itemEl) {
        itemEl.style.left = `${item.x}px`;
        itemEl.style.top = `${item.y}px`;
      }
    };

    const onUp = () => {
      this.isDragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      this.pushHistory();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  /**
   * Start resizing an annotation item via bottom-right handle
   */
  startResizing(e, id, pageIdx) {
    const item = (this.pagesEdits[pageIdx] || []).find(it => it.id === id);
    if (!item) return;

    this.isResizing = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = item.width;
    const startH = item.height;
    const itemEl = this.container.querySelector(`.editor-annotation-item[data-id="${id}"]`);

    const onMove = (moveEv) => {
      if (!this.isResizing) return;
      const dw = moveEv.clientX - startX;
      const dh = moveEv.clientY - startY;
      item.width = Math.max(20, startW + dw);
      item.height = Math.max(20, startH + dh);
      if (itemEl) {
        itemEl.style.width = `${item.width}px`;
        itemEl.style.height = `${item.height}px`;
      }
    };

    const onUp = () => {
      this.isResizing = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      this.pushHistory();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  /**
   * Select an annotation and mark active
   */
  selectAnnotation(id, pageIdx) {
    this.selectedAnnotationId = id;
    this.selectedPageIndex = pageIdx;

    this.container.querySelectorAll('.editor-annotation-item').forEach(el => {
      el.classList.toggle('selected', el.dataset.id === id);
    });

    // Sync sub-ribbon with this item's properties if text
    const item = (this.pagesEdits[pageIdx] || []).find(it => it.id === id);
    if (item && item.type === 'text') {
      this.fontSize = item.fontSize || this.fontSize;
      this.textColor = item.fontColor || this.textColor;
      this.fontFamily = item.fontFamily || this.fontFamily;
      this.isBold = Boolean(item.isBold);
      this.isItalic = Boolean(item.isItalic);
      const sub = this.container.querySelector('#editor-sub-ribbon');
      if (sub && this.activeTool === 'text') {
        sub.innerHTML = this.renderSubRibbon();
        createIcons({ icons, root: sub });
        this.attachSubRibbonListeners();
      }
    }
  }

  /**
   * Deselect any active annotation
   */
  deselectAnnotation() {
    this.selectedAnnotationId = null;
    this.container.querySelectorAll('.editor-annotation-item').forEach(el => {
      el.classList.remove('selected');
    });
  }

  /**
   * Update properties of currently selected annotation
   */
  updateSelectedAnnotationProperties() {
    if (!this.selectedAnnotationId || this.selectedPageIndex === null) return;
    const item = (this.pagesEdits[this.selectedPageIndex] || []).find(it => it.id === this.selectedAnnotationId);
    if (!item) return;

    if (item.type === 'text') {
      item.fontSize = this.fontSize;
      item.fontColor = this.textColor;
      item.fontFamily = this.fontFamily;
      item.isBold = this.isBold;
      item.isItalic = this.isItalic;
      this.renderPageAnnotations(this.selectedPageIndex);
      this.selectAnnotation(item.id, this.selectedPageIndex);
    }
  }

  /**
   * Delete an annotation
   */
  deleteAnnotation(id) {
    for (let pageIdx = 0; pageIdx < this.numPages; pageIdx++) {
      const idx = (this.pagesEdits[pageIdx] || []).findIndex(it => it.id === id);
      if (idx !== -1) {
        this.pagesEdits[pageIdx].splice(idx, 1);
        this.selectedAnnotationId = null;
        this.pushHistory();
        this.renderPageAnnotations(pageIdx);
        break;
      }
    }
  }

  /**
   * Clear all annotations on a page
   */
  clearPageAnnotations(pageIdx) {
    if (confirm(`Clear all edits on Page ${pageIdx + 1}?`)) {
      this.pagesEdits[pageIdx] = [];
      this.pushHistory();
      this.renderPageAnnotations(pageIdx);
    }
  }

  /**
   * History & Undo / Redo
   */
  pushHistory() {
    // Truncate future branch if in middle of stack
    if (this.historyIdx < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIdx + 1);
    }

    // Deep clone edits
    const snapshot = JSON.parse(JSON.stringify(this.pagesEdits));
    this.history.push(snapshot);
    this.historyIdx++;

    // Limit history stack size to 30
    if (this.history.length > 30) {
      this.history.shift();
      this.historyIdx--;
    }

    this.updateUndoRedoButtons();
  }

  undo() {
    if (this.historyIdx > 0) {
      this.historyIdx--;
      this.pagesEdits = JSON.parse(JSON.stringify(this.history[this.historyIdx]));
      this.selectedAnnotationId = null;
      for (let i = 0; i < this.numPages; i++) {
        this.renderPageAnnotations(i);
      }
      this.updateUndoRedoButtons();
    }
  }

  redo() {
    if (this.historyIdx < this.history.length - 1) {
      this.historyIdx++;
      this.pagesEdits = JSON.parse(JSON.stringify(this.history[this.historyIdx]));
      this.selectedAnnotationId = null;
      for (let i = 0; i < this.numPages; i++) {
        this.renderPageAnnotations(i);
      }
      this.updateUndoRedoButtons();
    }
  }

  updateUndoRedoButtons() {
    const undoBtn = this.container.querySelector('#editor-undo-btn');
    const redoBtn = this.container.querySelector('#editor-redo-btn');
    if (undoBtn) undoBtn.disabled = this.historyIdx <= 0;
    if (redoBtn) redoBtn.disabled = this.historyIdx >= this.history.length - 1;
  }

  /**
   * Zoom handling
   */
  setZoom(newZoom) {
    this.zoom = Math.min(1.8, Math.max(0.6, parseFloat(newZoom.toFixed(2))));
    const text = this.container.querySelector('#editor-zoom-text');
    if (text) text.textContent = `${Math.round(this.zoom * 100)}%`;
    this.renderAllPages();
  }

  /**
   * Open & Manage Signature Modal
   */
  openSignatureModal() {
    const backdrop = this.container.querySelector('#signature-modal-backdrop');
    if (!backdrop) return;
    backdrop.style.display = 'flex';

    // Init draw canvas in modal
    const canvas = backdrop.querySelector('#sig-draw-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      let drawing = false;

      // Mouse events
      canvas.onmousedown = (e) => {
        drawing = true;
        const rect = canvas.getBoundingClientRect();
        ctx.beginPath();
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
      };
      canvas.onmousemove = (e) => {
        if (!drawing) return;
        const rect = canvas.getBoundingClientRect();
        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
        ctx.stroke();
      };
      const stop = () => { drawing = false; };
      canvas.onmouseup = stop;
      canvas.onmouseleave = stop;

      // Touch events for mobile and tablets
      canvas.ontouchstart = (e) => {
        if (e.touches.length > 0) {
          e.preventDefault();
          drawing = true;
          const rect = canvas.getBoundingClientRect();
          ctx.beginPath();
          ctx.moveTo(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
        }
      };
      canvas.ontouchmove = (e) => {
        if (!drawing || e.touches.length === 0) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        ctx.lineTo(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
        ctx.stroke();
      };
      canvas.ontouchend = stop;
      canvas.ontouchcancel = stop;
    }
  }

  closeSignatureModal() {
    const backdrop = this.container.querySelector('#signature-modal-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  }

  attachSignatureModalEvents() {
    const backdrop = this.container.querySelector('#signature-modal-backdrop');
    if (!backdrop) return;

    // Close on clicking backdrop outside dialog
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        this.closeSignatureModal();
      }
    });

    // Close buttons
    backdrop.querySelector('#signature-modal-close')?.addEventListener('click', () => this.closeSignatureModal());
    backdrop.querySelector('#signature-modal-cancel')?.addEventListener('click', () => this.closeSignatureModal());

    // Tabs
    const tabs = backdrop.querySelectorAll('.sig-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.sigTab;
        backdrop.querySelectorAll('.sig-tab-panel').forEach(p => p.classList.remove('active'));
        backdrop.querySelector(`#sig-panel-${target}`)?.classList.add('active');
      });
    });

    // Clear Pad
    backdrop.querySelector('#sig-draw-clear')?.addEventListener('click', () => {
      const canvas = backdrop.querySelector('#sig-draw-canvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    });

    // Color Dots in Draw Pad
    backdrop.querySelectorAll('.sig-color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        backdrop.querySelectorAll('.sig-color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        const color = dot.dataset.sigInk;
        const canvas = backdrop.querySelector('#sig-draw-canvas');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx.strokeStyle = color;
        }
      });
    });

    // Type live sync
    const typeInput = backdrop.querySelector('#sig-type-name');
    typeInput?.addEventListener('input', (e) => {
      const val = e.target.value || 'Your Signature';
      const p1 = backdrop.querySelector('#preview-sig-1');
      const p2 = backdrop.querySelector('#preview-sig-2');
      if (p1) p1.textContent = val;
      if (p2) p2.textContent = val;
    });

    // Type style cards selection
    backdrop.querySelectorAll('.sig-style-card').forEach(card => {
      card.addEventListener('click', () => {
        backdrop.querySelectorAll('.sig-style-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });
    });

    // Upload signature image
    const dropzone = backdrop.querySelector('#sig-upload-dropzone');
    const uploadInput = backdrop.querySelector('#sig-upload-input');
    const previewWrap = backdrop.querySelector('#sig-upload-preview');
    const previewImg = backdrop.querySelector('#sig-upload-img');

    dropzone?.addEventListener('click', () => uploadInput?.click());
    uploadInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
          previewImg.src = ev.target.result;
          dropzone.style.display = 'none';
          previewWrap.style.display = 'flex';
        };
        reader.readAsDataURL(file);
      }
    });
    backdrop.querySelector('#sig-upload-remove')?.addEventListener('click', () => {
      uploadInput.value = '';
      previewImg.src = '';
      dropzone.style.display = 'flex';
      previewWrap.style.display = 'none';
    });

    // Save & Use Signature
    backdrop.querySelector('#signature-modal-save')?.addEventListener('click', async () => {
      const activeTab = backdrop.querySelector('.sig-tab.active')?.dataset.sigTab || 'draw';
      let dataUrl = null;

      if (activeTab === 'draw') {
        const canvas = backdrop.querySelector('#sig-draw-canvas');
        if (canvas) {
          dataUrl = canvas.toDataURL('image/png');
        }
      } else if (activeTab === 'type') {
        const activeCard = backdrop.querySelector('.sig-style-card.active');
        const font = activeCard?.dataset.sigFont || "'Dancing Script', cursive";
        const text = backdrop.querySelector('#sig-type-name')?.value || 'Your Signature';

        // Render text to canvas to get crisp transparent PNG
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 480;
        tempCanvas.height = 160;
        const ctx = tempCanvas.getContext('2d');
        ctx.font = `64px ${font}`;
        ctx.fillStyle = '#005043';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 240, 80);
        dataUrl = tempCanvas.toDataURL('image/png');
      } else if (activeTab === 'upload') {
        dataUrl = previewImg?.src;
      }

      if (dataUrl) {
        this.activeSignatureDataUrl = dataUrl;
        this.closeSignatureModal();
        this.setActiveTool('sign');
      }
    });
  }

  /**
   * Handle Apply Changes: compile all page edits and trigger export
   */
  handleApply() {
    // Gather all page edits with their reference viewport dimensions
    const compiledPageEdits = {};

    for (let i = 0; i < this.numPages; i++) {
      const vp = this.pageViewports[i] || { width: 595, height: 842 };
      compiledPageEdits[i] = {
        viewportWidth: vp.width,
        viewportHeight: vp.height,
        edits: this.pagesEdits[i] || [],
      };
    }

    this.onApplyChanges(compiledPageEdits);
  }
}
