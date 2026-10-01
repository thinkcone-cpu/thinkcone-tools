import './style.css';
import { createIcons, icons } from 'lucide';
import confetti from 'canvas-confetti';
import { TOOLS, TOOL_CATEGORIES } from './toolsData.js';
import { accessManager } from './accessManager.js';
import {
  createSamplePdf,
  createSampleImage,
  renderPdfThumbnails,
  mergePdfs,
  splitPdf,
  compressPdf,
  rotatePdf,
  organizePdf,
  pdfToImages,
  imagesToPdf,
  pdfToText,
  watermarkPdf,
  addPageNumbers,
  protectPdf,
  unlockPdf,
  convertPngToJpg,
  convertJpgToPng,
  applyPdfEdits,
  downloadFile,
} from './pdfEngine.js';
import { PdfEditor } from './pdfEditor.js';

// Application State
const state = {
  currentView: 'home', // 'home' | 'tool'
  activeToolId: null,
  activeCategory: 'all',
  searchQuery: '',
  theme: localStorage.getItem('tc_theme') || 'light',
  access: accessManager.getState(),
  
  // Tool Studio state
  selectedFiles: [],
  thumbnails: [],
  totalPages: 0,
  isProcessing: false,
  progress: 0,
  progressText: '',
  result: null,

  // Tool Specific Options
  toolOptions: {
    // split
    splitMode: 'all',
    splitRange: '1',
    // compress
    compressLevel: 'recommended',
    // rotate
    rotateAngle: 90,
    rotateScope: 'all',
    // organize
    pageOrder: [],
    // pdf-to-jpg / pdf-to-png
    imgScale: 1.5,
    // jpg-to-pdf
    orientation: 'portrait',
    imgMargin: 20,
    // watermark
    watermarkText: 'THINKCONE TOOLS',
    watermarkSize: 42,
    watermarkColor: '#dcbd54',
    watermarkOpacity: 0.35,
    watermarkRotation: 45,
    watermarkPosition: 'center',
    // page-numbers
    pageNumberFormat: 'page_of_total',
    pageNumberPosition: 'bottom-center',
    pageNumberStart: 1,
    // protect / unlock
    password: '',
    confirmPassword: '',
    // png-to-jpg & jpg-to-png
    pngQuality: 0.92,
    pngBgColor: '#ffffff',
    // edit-pdf (Sejda-style PDF Editor)
    editorPagesEdits: {},
  },

  // Navigation Drawers
  mobileMenuOpen: false,
};

// Apply initial theme
document.documentElement.setAttribute('data-theme', state.theme);

// Subscribe to access manager changes
accessManager.subscribe((newAccess) => {
  state.access = newAccess;
  renderHeaderActions();
});

/**
 * Toast Notification Helper
 */
function showToast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <i data-lucide="${type === 'success' ? 'check-circle' : 'info'}" style="color: ${type === 'success' ? 'var(--accent-green)' : 'var(--accent-gold)'}"></i>
    <span>${message}</span>
  `;
  root.appendChild(toast);
  createIcons({ icons, root: toast });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/**
 * Format bytes to readable string
 */
function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Mobile Drawer Controls
 */
function toggleMobileMenu() {
  state.mobileMenuOpen = !state.mobileMenuOpen;
  const drawer = document.getElementById('mobile-nav-drawer');
  const backdrop = document.getElementById('mobile-nav-backdrop');
  if (drawer && backdrop) {
    if (state.mobileMenuOpen) {
      drawer.classList.add('open');
      backdrop.classList.add('open');
      document.body.style.overflow = 'hidden';
    } else {
      drawer.classList.remove('open');
      backdrop.classList.remove('open');
      document.body.style.overflow = '';
    }
  }
}

function closeMobileMenu() {
  state.mobileMenuOpen = false;
  const drawer = document.getElementById('mobile-nav-drawer');
  const backdrop = document.getElementById('mobile-nav-backdrop');
  if (drawer && backdrop) {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }
}

/**
 * Render Main App Shell
 */
function renderApp() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <!-- Top Navigation Header -->
    <header class="app-header">
      <div class="header-container">
        <!-- Professional Logo Lockup: [Logo Icon] Thinkcone Tools -->
        <a class="brand-logo" id="logo-home-btn" title="Thinkcone Tools — Centre of thinking">
          <div class="logo-icon-wrap">
            <img src="/thinkcone-icon.png" alt="Thinkcone Tools Logo" />
          </div>
          <div class="brand-titles-col">
            <div class="brand-title-main">
              <span>Thinkcone</span> <span class="brand-gold">Tools</span>
            </div>
            <div class="brand-tagline-sub">Centre of thinking</div>
          </div>
        </a>

        <!-- Desktop & Laptop Navigation Bar -->
        <nav class="header-nav">
          <a class="nav-link ${state.activeToolId === 'edit-pdf' ? 'active' : ''}" data-nav-tool="edit-pdf">
            <span style="display: inline-flex; align-items: center; gap: 4px;">
              <span style="color: var(--accent-gold); font-size: 0.9em;">★</span> PDF Editor
            </span>
          </a>
          <a class="nav-link ${state.activeToolId === 'merge' ? 'active' : ''}" data-nav-tool="merge">Merge PDF</a>
          <a class="nav-link ${state.activeToolId === 'split' ? 'active' : ''}" data-nav-tool="split">Split PDF</a>
          <a class="nav-link ${state.activeToolId === 'compress' ? 'active' : ''}" data-nav-tool="compress">Compress PDF</a>
          <a class="nav-link ${state.activeToolId === 'pdf-to-jpg' ? 'active' : ''}" data-nav-tool="pdf-to-jpg">PDF to JPG</a>
          <a class="nav-link ${state.activeToolId === 'png-to-jpg' ? 'active' : ''}" data-nav-tool="png-to-jpg">PNG to JPG</a>
          <a class="nav-link ${state.activeToolId === 'jpg-to-png' ? 'active' : ''}" data-nav-tool="jpg-to-png">JPG to PNG</a>
          <a class="nav-link ${state.currentView === 'home' ? 'active' : ''}" id="nav-all-tools">All Tools</a>
        </nav>

        <div class="header-actions" id="header-actions-slot">
          <!-- Populated by renderHeaderActions() -->
        </div>
      </div>
    </header>

    <!-- Mobile Drawer Navigation -->
    <div class="mobile-nav-backdrop ${state.mobileMenuOpen ? 'open' : ''}" id="mobile-nav-backdrop"></div>
    <div class="mobile-nav-drawer ${state.mobileMenuOpen ? 'open' : ''}" id="mobile-nav-drawer">
      <div class="mobile-nav-header">
        <div class="brand-logo">
          <div class="logo-icon-wrap" style="width: 34px; height: 34px;">
            <img src="/thinkcone-icon.png" alt="Thinkcone Tools" />
          </div>
          <div class="brand-titles-col">
            <div class="brand-title-main" style="font-size: 1.15rem;">
              <span>Thinkcone</span> <span class="brand-gold">Tools</span>
            </div>
            <div class="brand-tagline-sub">Centre of thinking</div>
          </div>
        </div>
        <button class="mobile-nav-close" id="mobile-nav-close-btn" aria-label="Close menu">
          <i data-lucide="x" style="width: 20px; height: 20px;"></i>
        </button>
      </div>

      <div class="mobile-nav-body">
        <div class="mobile-nav-section-title">Popular Tools</div>
        <div class="mobile-nav-links">
          <a class="mobile-nav-item ${state.activeToolId === 'edit-pdf' ? 'active' : ''}" data-mobile-tool="edit-pdf">
            <i data-lucide="file-edit" style="width: 18px; height: 18px; color: var(--accent-gold);"></i>
            <span>PDF Editor (Sejda-Style)</span>
          </a>
          <a class="mobile-nav-item ${state.activeToolId === 'merge' ? 'active' : ''}" data-mobile-tool="merge">
            <i data-lucide="layers" style="width: 18px; height: 18px; color: #005043;"></i>
            <span>Merge PDF</span>
          </a>
          <a class="mobile-nav-item ${state.activeToolId === 'split' ? 'active' : ''}" data-mobile-tool="split">
            <i data-lucide="scissors" style="width: 18px; height: 18px; color: #0d7462;"></i>
            <span>Split PDF</span>
          </a>
          <a class="mobile-nav-item ${state.activeToolId === 'compress' ? 'active' : ''}" data-mobile-tool="compress">
            <i data-lucide="minimize-2" style="width: 18px; height: 18px; color: #10b981;"></i>
            <span>Compress PDF</span>
          </a>
          <a class="mobile-nav-item ${state.activeToolId === 'png-to-jpg' ? 'active' : ''}" data-mobile-tool="png-to-jpg">
            <i data-lucide="image" style="width: 18px; height: 18px; color: #0284c7;"></i>
            <span>PNG to JPG</span>
          </a>
          <a class="mobile-nav-item ${state.activeToolId === 'jpg-to-png' ? 'active' : ''}" data-mobile-tool="jpg-to-png">
            <i data-lucide="file-image" style="width: 18px; height: 18px; color: #10b981;"></i>
            <span>JPG to PNG</span>
          </a>
          <a class="mobile-nav-item ${state.activeToolId === 'pdf-to-jpg' ? 'active' : ''}" data-mobile-tool="pdf-to-jpg">
            <i data-lucide="image" style="width: 18px; height: 18px; color: #0284c7;"></i>
            <span>PDF to JPG</span>
          </a>
          <a class="mobile-nav-item" id="mobile-all-tools-btn">
            <i data-lucide="grid" style="width: 18px; height: 18px; color: var(--accent-gold);"></i>
            <span>All 14+ Tools</span>
          </a>
        </div>

        <div class="mobile-nav-section-title" style="margin-top: 22px;">Tool Categories</div>
        <div class="mobile-cat-pills">
          ${TOOL_CATEGORIES.map(
            (c) => `
            <button class="mobile-cat-btn ${state.activeCategory === c.id ? 'active' : ''}" data-cat-id="${c.id}">
              ${c.name}
            </button>
          `
          ).join('')}
        </div>

        <div class="mobile-nav-footer">
          <div class="mobile-free-notice" style="padding: 12px; background: var(--bg-subtle); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div style="display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 0.92rem; color: #10b981;">
              <i data-lucide="check-circle" style="width: 17px; height: 17px;"></i>
              <span>100% Free Forever</span>
            </div>
            <p style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; line-height: 1.45;">
              Zero registration. Unlimited conversions and complete privacy right in your browser.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Main View Container -->
    <main id="main-content-view" style="flex: 1;">
      ${state.currentView === 'home' ? renderHomeView() : renderToolStudioView()}
    </main>

    <!-- Global Modals Slot -->
    <div id="modal-container-slot"></div>

    <!-- Redesigned Responsive Footer -->
    <footer class="app-footer">
      <div class="footer-inner">
        <div class="footer-top-grid">
          <div class="footer-brand-col">
            <div class="brand-logo" style="margin-bottom: 12px;">
              <div class="logo-icon-wrap" style="width: 40px; height: 40px;">
                <img src="/thinkcone-icon.png" alt="Thinkcone Logo" />
              </div>
              <div class="brand-titles-col">
                <div style="font-weight: 800; font-size: 1.2rem; color: #ffffff;">
                  <span>Thinkcone</span> <span class="brand-gold">Tools</span>
                </div>
                <div class="brand-tagline-sub" style="color: #cbd5e1;">Centre of thinking</div>
              </div>
            </div>
            <p class="footer-brand-desc">
              Professional, private, 100% client-side document and image processing suite. Engineered for students, researchers, academics, and professionals.
            </p>
            <div class="footer-badge-pill">
              <i data-lucide="shield-check" style="width: 15px; height: 15px; color: var(--accent-gold);"></i>
              <span>Zero Server Uploads • In-Browser Execution</span>
            </div>
          </div>

          <div class="footer-col">
            <h4>Organize & Optimize</h4>
            <a class="footer-link" data-footer-tool="merge">Merge PDF</a>
            <a class="footer-link" data-footer-tool="split">Split PDF</a>
            <a class="footer-link" data-footer-tool="compress">Compress PDF</a>
            <a class="footer-link" data-footer-tool="organize">Organize Pages</a>
            <a class="footer-link" data-footer-tool="rotate">Rotate PDF</a>
          </div>

          <div class="footer-col">
            <h4>Convert & Media</h4>
            <a class="footer-link" data-footer-tool="png-to-jpg">PNG to JPG Converter</a>
            <a class="footer-link" data-footer-tool="jpg-to-png">JPG to PNG Converter</a>
            <a class="footer-link" data-footer-tool="pdf-to-jpg">PDF to JPG Extraction</a>
            <a class="footer-link" data-footer-tool="pdf-to-png">PDF to PNG Extraction</a>
            <a class="footer-link" data-footer-tool="jpg-to-pdf">JPG to PDF</a>
            <a class="footer-link" data-footer-tool="pdf-to-text">PDF to Unicode Text</a>
          </div>

          <div class="footer-col">
            <h4>Security & Free Access</h4>
            <a class="footer-link" data-footer-tool="edit-pdf" style="color: var(--accent-gold); font-weight: 700;">PDF Editor (Sejda-Style)</a>
            <a class="footer-link" data-footer-tool="watermark">Watermark PDF</a>
            <a class="footer-link" data-footer-tool="page-numbers">Page Numbers</a>
            <a class="footer-link" data-footer-tool="protect">Protect with Password</a>
            <a class="footer-link" data-footer-tool="unlock">Unlock PDF</a>
            <span class="footer-link" style="color: var(--accent-gold); font-weight: 700; cursor: default;">★ 100% Free Forever</span>
          </div>
        </div>

        <div class="footer-bottom-bar">
          <div class="footer-copy">
            © 2026 Thinkcone Tools • Centre of thinking • 100% Local In-Browser Execution
          </div>
          <div class="footer-bottom-links">
            <a class="footer-link" id="footer-privacy-btn">Privacy Guarantee</a>
            <span style="color: var(--text-muted); font-size: 0.85rem;">•</span>
            <span style="color: var(--accent-gold); font-size: 0.85rem; font-weight: 700;">No Account Required</span>
            <span style="color: var(--text-muted); font-size: 0.85rem;">•</span>
            <span style="color: #10b981; font-size: 0.85rem; font-weight: 700;">Unlimited Free Use</span>
          </div>
        </div>
      </div>
    </footer>
  `;

  renderHeaderActions();
  attachGlobalListeners();
  createIcons({ icons });
}

/**
 * Render Header Actions (Theme, Free Badge, Mobile Menu)
 */
function renderHeaderActions() {
  const slot = document.getElementById('header-actions-slot');
  if (!slot) return;

  slot.innerHTML = `
    <div class="free-forever-badge" title="100% Free & Unlimited • No Login Required">
      <i data-lucide="sparkles" style="width: 14px; height: 14px; color: var(--accent-gold);"></i>
      <span class="free-badge-text">100% Free • No Login</span>
    </div>

    <button class="theme-toggle-btn" id="theme-toggle-btn" title="Toggle Theme" aria-label="Toggle theme">
      <i data-lucide="${state.theme === 'dark' ? 'sun' : 'moon'}" style="width: 18px; height: 18px;"></i>
    </button>

    <button class="mobile-menu-btn" id="mobile-menu-toggle-btn" aria-label="Toggle navigation menu">
      <i data-lucide="menu" style="width: 22px; height: 22px;"></i>
    </button>
  `;

  createIcons({ icons, root: slot });

  // Attach button events
  slot.querySelector('#theme-toggle-btn')?.addEventListener('click', toggleTheme);
  slot.querySelector('#mobile-menu-toggle-btn')?.addEventListener('click', toggleMobileMenu);
}

/**
 * Toggle Dark / Light Theme
 */
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('tc_theme', state.theme);
  document.documentElement.setAttribute('data-theme', state.theme);
  renderHeaderActions();
}

/**
 * Render Home View (Hero, Search, Category Tabs, Tool Cards)
 */
function renderHomeView() {
  const filteredTools = TOOLS.filter((tool) => {
    const matchesCategory = state.activeCategory === 'all' || tool.category === state.activeCategory;
    const matchesSearch =
      !state.searchQuery ||
      tool.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
      tool.shortDesc.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
      tool.category.toLowerCase().includes(state.searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Category counts
  const categoryCounts = TOOL_CATEGORIES.reduce((acc, cat) => {
    if (cat.id === 'all') {
      acc[cat.id] = TOOLS.length;
    } else {
      acc[cat.id] = TOOLS.filter((t) => t.category === cat.id).length;
    }
    return acc;
  }, {});

  const isBrowsingAll = state.activeCategory === 'all' && !state.searchQuery;
  const currentCatObj = TOOL_CATEGORIES.find((c) => c.id === state.activeCategory);
  const activeTitle = state.searchQuery
    ? `Search Results for "${state.searchQuery}"`
    : currentCatObj
    ? currentCatObj.name
    : 'All Document Tools';

  return `
    <!-- Responsive Hero Section -->
    <section class="hero-section">
      <div class="hero-brand-card">
        <img src="/thinkcone-emblem-transparent.png" alt="Thinkcone Emblem" />
        <div class="hero-brand-card-text">
          <span>THINKCONE TOOLS</span>
          <span class="gold-dot">•</span>
          <span style="color: var(--accent-gold);">CENTRE OF THINKING</span>
        </div>
      </div>

      <h1 class="hero-title">
        Every tool you need to work with PDFs & Images, <span class="accent-highlight">in one place</span>
      </h1>
      <p class="hero-subtitle">
        100% Free, Private & Instant. Merge, split, compress, convert, rotate, and secure documents directly inside your browser with zero server uploads.
      </p>

      <!-- Trust Badges Row -->
      <div class="hero-trust-row">
        <div class="hero-trust-pill">
          <i data-lucide="shield-check" style="width: 14px; height: 14px; color: var(--accent-green);"></i>
          <span>100% Private (Zero Uploads)</span>
        </div>
        <div class="hero-trust-pill">
          <i data-lucide="zap" style="width: 14px; height: 14px; color: var(--accent-gold);"></i>
          <span>Instant In-Browser Speed</span>
        </div>
        <div class="hero-trust-pill">
          <i data-lucide="sparkles" style="width: 14px; height: 14px; color: #0284c7;"></i>
          <span>14+ Essential Tools</span>
        </div>
        <div class="hero-trust-pill">
          <i data-lucide="monitor-smartphone" style="width: 14px; height: 14px; color: #10b981;"></i>
          <span>Desktop, Laptop & Mobile</span>
        </div>
      </div>

      <!-- Responsive Search Box -->
      <div class="search-box-container">
        <div class="search-input-wrapper">
          <i data-lucide="search" class="search-input-icon" style="width: 20px; height: 20px;"></i>
          <input
            type="text"
            id="tool-search-input"
            class="search-tools-input"
            placeholder="Search tools (e.g. merge, compress, PNG to JPG, watermark...)"
            value="${state.searchQuery}"
            autocomplete="off"
          />
          ${
            state.searchQuery
              ? `<button class="search-clear-btn" id="search-clear-btn" title="Clear search" aria-label="Clear search"><i data-lucide="x" style="width: 16px; height: 16px;"></i></button>`
              : `<span class="search-shortcut-badge"><kbd>/</kbd></span>`
          }
        </div>

        <!-- Quick Trending Search Tags -->
        <div class="search-quick-tags">
          <span class="quick-tags-label">Quick find:</span>
          ${['Merge', 'Compress', 'PNG to JPG', 'JPG to PNG', 'PDF to JPG', 'Split', 'Watermark']
            .map(
              (tag) => `
            <button class="quick-tag-chip" data-quick-search="${tag}">${tag}</button>
          `
            )
            .join('')}
        </div>
      </div>

      <!-- Responsive Category Filter Tabs with Counts -->
      <div class="category-tabs-wrapper">
        <div class="category-tabs" id="category-tabs-scroll">
          ${TOOL_CATEGORIES.map(
            (cat) => `
            <button class="cat-tab-btn ${state.activeCategory === cat.id ? 'active' : ''}" data-cat-id="${cat.id}">
              <span>${cat.name}</span>
              <span class="cat-count-badge">${categoryCounts[cat.id] || 0}</span>
            </button>
          `
          ).join('')}
        </div>
      </div>
    </section>

    <!-- Popular Featured Workflows (Desktop & Mobile) -->
    ${
      isBrowsingAll
        ? `
      <section class="popular-workflows-section">
        <div class="section-inner">
        <div class="section-header-row">
          <div class="section-header-row-title">
            <i data-lucide="flame" style="width: 20px; height: 20px; color: var(--accent-gold);"></i>
            <h2 class="section-title-md">Most Popular Workflows</h2>
          </div>
          <span class="section-tag-pill">Instant 1-Click Launch</span>
        </div>

        <div class="popular-workflows-grid">
          <div class="workflow-card" data-workflow-launch="merge">
            <div class="workflow-icon-wrap" style="background: rgba(0, 80, 67, 0.12); color: #005043;">
              <i data-lucide="layers" style="width: 24px; height: 24px;"></i>
            </div>
            <div class="workflow-content">
              <h4>Merge PDF Files</h4>
              <p>Combine multiple lecture notes, dissertations, and reports into a single unified PDF.</p>
              <div class="workflow-action">
                <span>Start Merge</span>
                <i data-lucide="arrow-right" style="width: 14px; height: 14px;"></i>
              </div>
            </div>
          </div>

          <div class="workflow-card" data-workflow-launch="compress">
            <div class="workflow-icon-wrap" style="background: rgba(16, 185, 129, 0.12); color: #10b981;">
              <i data-lucide="minimize-2" style="width: 24px; height: 24px;"></i>
            </div>
            <div class="workflow-content">
              <h4>Compress PDF</h4>
              <p>Reduce document file size up to 85% while keeping maximal visual clarity for uploads.</p>
              <div class="workflow-action">
                <span>Compress Now</span>
                <i data-lucide="arrow-right" style="width: 14px; height: 14px;"></i>
              </div>
            </div>
          </div>

          <div class="workflow-card" data-workflow-launch="png-to-jpg">
            <div class="workflow-icon-wrap" style="background: rgba(2, 132, 199, 0.12); color: #0284c7;">
              <i data-lucide="image" style="width: 24px; height: 24px;"></i>
            </div>
            <div class="workflow-content">
              <h4>PNG to JPG Converter</h4>
              <p>Batch convert transparent PNGs to JPG with custom quality control and background fill.</p>
              <div class="workflow-action">
                <span>Convert Images</span>
                <i data-lucide="arrow-right" style="width: 14px; height: 14px;"></i>
              </div>
            </div>
          </div>

          <div class="workflow-card" data-workflow-launch="pdf-to-jpg">
            <div class="workflow-icon-wrap" style="background: rgba(220, 189, 84, 0.16); color: #b89828;">
              <i data-lucide="file-image" style="width: 24px; height: 24px;"></i>
            </div>
            <div class="workflow-content">
              <h4>PDF to JPG Extraction</h4>
              <p>Extract high-resolution diagram pages and slides into crisp JPG images or ZIP.</p>
              <div class="workflow-action">
                <span>Extract Pages</span>
                <i data-lucide="arrow-right" style="width: 14px; height: 14px;"></i>
              </div>
            </div>
          </div>
        </div>
        </div>
      </section>
      `
        : ''
    }

    <!-- Tools Catalog Grid -->
    <section class="tools-grid-section">
      <div class="tools-grid-header">
        <div>
          <h2 class="tools-grid-title">${activeTitle}</h2>
          <p class="tools-grid-subtitle">
            ${
              state.searchQuery
                ? `Found ${filteredTools.length} matching tools for your search query.`
                : 'Select any tool to start processing files privately in your browser.'
            }
          </p>
        </div>
        <div class="tools-count-pill">
          ${filteredTools.length} ${filteredTools.length === 1 ? 'Tool' : 'Tools'}
        </div>
      </div>

      <div class="tools-grid">
        ${
          filteredTools.length > 0
            ? filteredTools
                .map(
                  (tool) => `
            <div class="tool-card" data-tool-card-id="${tool.id}" style="--card-theme-color: ${tool.color}">
              <div class="tool-card-accent-bar" style="background: ${tool.color};"></div>
              <div class="tool-card-top">
                <div class="tool-icon-wrapper" style="background: ${tool.bgColor}; color: ${tool.color};">
                  <i data-lucide="${tool.icon}" style="width: 26px; height: 26px;"></i>
                </div>
                ${
                  tool.badge
                    ? `<span class="tool-badge ${
                        tool.badge.includes('Popular') || tool.badge.includes('Seal') || tool.badge.includes('Lossless')
                          ? 'popular'
                          : ''
                      }">${tool.badge}</span>`
                    : ''
                }
              </div>
              <h3 class="tool-name">${tool.name}</h3>
              <p class="tool-description">${tool.shortDesc}</p>
              <div class="tool-card-footer">
                <span class="tool-action-label">
                  Launch Tool <i data-lucide="arrow-right" style="width: 14px; height: 14px;"></i>
                </span>
                <span class="tool-format-indicator">${tool.accept.replace('application/', '').replace('image/', '')}</span>
              </div>
            </div>
          `
                )
                .join('')
            : `
            <div class="empty-tools-state">
              <div class="empty-icon-circle">
                <i data-lucide="search-x" style="width: 44px; height: 44px; color: var(--text-muted);"></i>
              </div>
              <h3>No matching tools found</h3>
              <p>We couldn't find any tool matching "${state.searchQuery}". Try a different keyword or reset filters.</p>
              <button class="btn-primary" id="reset-search-btn" style="margin-top: 14px;">
                <i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i>
                <span>Reset All Filters</span>
              </button>
            </div>
          `
        }
      </div>
    </section>

    <!-- Why Thinkcone Tools Feature Showcase Section -->
    <section class="features-showcase-section">
      <div class="section-inner">
      <div class="section-subheading-group">
        <span class="section-eyebrow">Why Thinkcone Tools</span>
        <h2 class="section-main-heading">Engineered for Absolute Privacy & High-Speed Productivity</h2>
        <p class="section-desc">
          No cloud uploads. No registration barriers. All tools run 100% locally in your browser memory with professional precision.
        </p>
      </div>

      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon-box" style="background: rgba(0, 80, 67, 0.12); color: #005043;">
            <i data-lucide="shield-check" style="width: 28px; height: 28px;"></i>
          </div>
          <h3>100% Client-Side Privacy</h3>
          <p>
            Your documents and images are never transmitted to any external server or cloud storage. Files are processed entirely inside your browser's private memory sandbox.
          </p>
          <div class="feature-badge">
            <i data-lucide="lock" style="width: 13px; height: 13px;"></i> Zero Cloud Logging
          </div>
        </div>

        <div class="feature-card">
          <div class="feature-icon-box" style="background: rgba(220, 189, 84, 0.16); color: #b89828;">
            <i data-lucide="zap" style="width: 28px; height: 28px;"></i>
          </div>
          <h3>Zero Wait Queue Latency</h3>
          <p>
            Avoid painful upload progress bars and server queue waits. Powered by WebAssembly and Canvas vector graphics, conversions finish in milliseconds.
          </p>
          <div class="feature-badge">
            <i data-lucide="gauge" style="width: 13px; height: 13px;"></i> Native Browser Speed
          </div>
        </div>

        <div class="feature-card">
          <div class="feature-icon-box" style="background: rgba(2, 132, 199, 0.12); color: #0284c7;">
            <i data-lucide="monitor-smartphone" style="width: 28px; height: 28px;"></i>
          </div>
          <h3>Desktop, Laptop & Mobile Ready</h3>
          <p>
            Designed with fluid responsiveness. Work on your 4K workstation, 13" laptop, iPad tablet, or smartphone without installing bulky software or apps.
          </p>
          <div class="feature-badge">
            <i data-lucide="sparkles" style="width: 13px; height: 13px;"></i> Full Multi-Screen Support
          </div>
        </div>
      </div>
      </div>
    </section>

    <!-- 3-Step Workflow Guide -->
    <section class="steps-section">
      <div class="section-subheading-group">
        <span class="section-eyebrow">How It Works</span>
        <h2 class="section-main-heading">Simple 3-Step Workflow</h2>
        <p class="section-desc">Process any document or image in under 5 seconds.</p>
      </div>

      <div class="steps-grid">
        <div class="step-card">
          <div class="step-num">01</div>
          <h4>Select or Drop Files</h4>
          <p>Drag and drop your PDF or image files directly onto the stage, or click to browse from your device.</p>
        </div>
        <div class="step-card">
          <div class="step-num">02</div>
          <h4>Configure Parameters</h4>
          <p>Adjust compression levels, rotation angles, watermarks, page ordering, or image quality sliders.</p>
        </div>
        <div class="step-card">
          <div class="step-num">03</div>
          <h4>Instant Local Download</h4>
          <p>Download the optimized output file directly, or grab a convenient ZIP bundle for multi-file batches.</p>
        </div>
      </div>
    </section>
  `;
}

/**
 * Render Tool Studio View (Stage + Controls Sidebar)
 */
function renderToolStudioView() {
  const tool = TOOLS.find((t) => t.id === state.activeToolId);
  if (!tool) return '<div>Tool not found</div>';

  const isEditor = tool.id === 'edit-pdf' && state.selectedFiles.length > 0 && !state.result && !state.isProcessing;

  return `
    <div class="tool-studio ${isEditor ? 'editor-full-studio' : ''}">
      <div class="studio-header" ${isEditor ? 'style="display: none;"' : ''}>
        <div class="studio-title-area">
          <button class="back-btn" id="studio-back-btn">
            <i data-lucide="arrow-left" style="width: 16px; height: 16px;"></i>
            <span>All Tools</span>
          </button>
          <div class="studio-title-text">
            <h1>${tool.name}</h1>
            <p>${tool.detailedDesc}</p>
          </div>
        </div>

        <div style="display: flex; gap: 10px; align-items: center;">
          <div class="free-forever-badge" title="100% Free & Unlimited">
            <i data-lucide="check-circle" style="width: 14px; height: 14px; color: #10b981;"></i>
            <span>100% Free & Unlimited</span>
          </div>
        </div>
      </div>

      <div class="studio-layout ${isEditor ? 'editor-full-mode' : ''}" style="${isEditor ? 'grid-template-columns: 1fr; gap: 0;' : ''}">
        <!-- Interactive Stage -->
        <div class="studio-stage ${isEditor ? 'editor-stage-full' : ''}" id="studio-stage-container" style="${isEditor ? 'padding: 0; background: transparent; border: none; box-shadow: none;' : ''}">
          ${renderStudioStageContent(tool)}
        </div>

        <!-- Sidebar Configuration Options (Hidden in editor mode since editor has its own top ribbon) -->
        ${
          !isEditor
            ? `
          <div class="studio-sidebar" id="studio-sidebar-container">
            ${renderStudioSidebarContent(tool)}
          </div>
        `
            : ''
        }
      </div>
    </div>
  `;
}

/**
 * Render Studio Stage Content (Dropzone / Thumbnails / Progress / Success)
 */
function renderStudioStageContent(tool) {
  // 1. Success state
  if (state.result) {
    const hasMultipleItems = state.result.items && state.result.items.length > 1;
    const downloadLabel = state.result.type === 'zip'
      ? 'Download All Images (ZIP)'
      : state.result.type === 'png'
      ? 'Download PNG Image'
      : state.result.type === 'jpg'
      ? 'Download JPG Image'
      : state.result.type === 'txt'
      ? 'Download Text File'
      : 'Download PDF Document';

    return `
      <div class="success-card">
        <div class="success-check-icon">
          <i data-lucide="check" style="width: 44px; height: 44px;"></i>
        </div>
        <h2 class="success-title">Processing completed successfully!</h2>
        <p class="success-subtitle">
          Executed 100% in your local browser session. Ready for download.
        </p>

        <div class="stats-pill-row">
          <div class="metric-pill">
            <i data-lucide="file" style="width: 14px; height: 14px; display: inline; vertical-align: middle; margin-right: 4px;"></i>
            ${state.result.filename}
          </div>
          ${
            state.result.originalSize && state.result.compressedSize
              ? `<div class="metric-pill" style="color: var(--accent-green); font-weight: 800;">
                   Saved ${state.result.savedPercent}% (${formatBytes(state.result.originalSize - state.result.compressedSize)})
                 </div>`
              : ''
          }
          ${
            state.result.size
              ? `<div class="metric-pill">${formatBytes(state.result.size)}</div>`
              : ''
          }
          ${
            state.result.stats
              ? `<div class="metric-pill">${state.result.stats.words} words • ${state.result.stats.pages} pages</div>`
              : ''
          }
        </div>

        <button class="download-cta-btn" id="result-download-btn">
          <i data-lucide="download" style="width: 22px; height: 22px;"></i>
          <span>${downloadLabel}</span>
        </button>

        ${
          state.result.singleImage
            ? `
          <div style="max-width: 320px; width: 100%; border-radius: 12px; overflow: hidden; border: 1px solid var(--border-subtle); background: var(--bg-subtle); box-shadow: var(--shadow-sm); margin-top: 8px;">
            <img src="${state.result.singleImage}" alt="${state.result.filename}" style="width: 100%; height: auto; display: block;" />
          </div>
          `
            : ''
        }

        ${
          hasMultipleItems
            ? `
          <div class="converted-images-section">
            <div class="converted-images-header">
              <h4>Converted Images (${state.result.items.length})</h4>
              <p>Download individual files below or get everything bundled in the ZIP archive above.</p>
            </div>
            <div class="converted-images-grid">
              ${state.result.items
                .map(
                  (item, idx) => `
                <div class="converted-image-card">
                  <div class="converted-img-preview">
                    <img src="${item.dataUrl}" alt="${item.filename}" />
                  </div>
                  <div class="converted-img-details">
                    <div class="converted-img-name" title="${item.filename}">${item.filename}</div>
                    <div class="converted-img-size">${formatBytes(item.size)}</div>
                  </div>
                  <button class="btn-download-single" data-download-single-img="${idx}">
                    <i data-lucide="download" style="width: 14px; height: 14px;"></i>
                    <span>Download</span>
                  </button>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
          `
            : ''
        }

        ${
          state.result.text
            ? `
          <div style="width: 100%; margin-top: 16px; text-align: left;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-weight: 700; font-size: 0.9rem;">Extracted Content Preview:</span>
              <button class="btn-outline" id="copy-extracted-text-btn" style="padding: 4px 10px; font-size: 0.8rem;">
                <i data-lucide="copy" style="width: 13px; height: 13px;"></i> Copy Text
              </button>
            </div>
            <textarea readonly style="width: 100%; height: 180px; padding: 12px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-subtle); font-family: monospace; font-size: 0.85rem; resize: vertical;">${state.result.text}</textarea>
          </div>
          `
            : ''
        }

        <div style="display: flex; gap: 12px; margin-top: 14px; flex-wrap: wrap;">
          <button class="btn-outline" id="process-another-btn">
            <i data-lucide="refresh-cw" style="width: 15px; height: 15px;"></i>
            <span>Process more files</span>
          </button>
          <button class="btn-outline" id="result-back-tools-btn">
            <i data-lucide="grid" style="width: 15px; height: 15px;"></i>
            <span>Back to All Tools</span>
          </button>
        </div>
      </div>
    `;
  }

  // 2. Processing state
  if (state.isProcessing) {
    return `
      <div class="processing-overlay">
        <div class="spinner-ring"></div>
        <h3 style="font-size: 1.4rem; font-weight: 800; color: var(--text-main); margin-top: 10px;">
          Processing Document...
        </h3>
        <p style="color: var(--text-muted); font-size: 0.95rem;">${state.progressText || 'Optimizing document streams...'}</p>
        
        <div class="progress-track">
          <div class="progress-bar-fill" style="width: ${state.progress}%;"></div>
        </div>
        <span style="font-size: 0.88rem; font-weight: 800; color: var(--primary);">${state.progress}%</span>
      </div>
    `;
  }

  // 3. No files selected yet -> Dropzone
  if (state.selectedFiles.length === 0) {
    const isPngToJpg = tool.id === 'png-to-jpg';
    const isJpgToPng = tool.id === 'jpg-to-png';
    let dropTitle = 'Select PDF files';
    let dropSubtitle = 'Drag and drop your files here, or click to browse';
    let dropBtnText = `Select ${tool.multiple ? 'Files' : 'File'}`;
    let sampleBtnText = '⚡ Try with Sample PDF';
    let dropIcon = 'upload-cloud';

    if (isPngToJpg) {
      dropTitle = 'Select PNG images';
      dropSubtitle = 'Drop PNG images here (up to 20 files), or click to browse';
      dropBtnText = 'Select PNG Files';
      sampleBtnText = '⚡ Try with Sample PNG';
      dropIcon = 'image';
    } else if (isJpgToPng) {
      dropTitle = 'Select JPG images';
      dropSubtitle = 'Drop JPG/JPEG photos here (up to 20 files), or click to browse';
      dropBtnText = 'Select JPG Files';
      sampleBtnText = '⚡ Try with Sample JPG';
      dropIcon = 'file-image';
    } else if (tool.id === 'jpg-to-pdf') {
      dropTitle = 'Select Images';
      dropSubtitle = 'Drop images here to compile into a PDF';
      dropBtnText = 'Select Images';
      sampleBtnText = '⚡ Try with Sample Image';
      dropIcon = 'image';
    }

    return `
      <div class="drop-zone" id="file-drop-zone">
        <input type="file" id="file-picker-input" class="hidden-file-input" ${tool.multiple ? 'multiple' : ''} accept="${tool.accept}" />
        <div class="drop-icon-cloud">
          <i data-lucide="${dropIcon}" style="width: 38px; height: 38px;"></i>
        </div>
        <h3>${dropTitle}</h3>
        <p>${dropSubtitle}</p>
        
        <div class="drop-zone-actions">
          <button class="btn-primary" id="trigger-file-select-btn">
            <i data-lucide="folder-plus" style="width: 18px; height: 18px;"></i>
            <span>${dropBtnText}</span>
          </button>
          
          <button class="sample-doc-btn" id="try-sample-doc-btn" title="Instantly load sample asset">
            <i data-lucide="sparkles" style="width: 15px; height: 15px; color: var(--accent-gold);"></i>
            <span>${sampleBtnText}</span>
          </button>
        </div>
      </div>
    `;
  }

  // 4. Files selected -> Preview Stage
  // Case A: Image Converter Tools (PNG to JPG, JPG to PNG) - Grid style like png2jpg.com
  if (tool.id === 'png-to-jpg' || tool.id === 'jpg-to-png') {
    return `
      <div class="stage-preview-header">
        <div class="file-info-badge">
          <span style="font-weight: 800; font-size: 1.1rem; color: var(--text-main);">
            ${state.selectedFiles.length} ${state.selectedFiles.length === 1 ? 'Image' : 'Images'} Selected
          </span>
          <span class="file-size-badge">
            ${formatBytes(state.selectedFiles.reduce((acc, f) => acc + f.size, 0))}
          </span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn-outline" id="add-more-files-btn" style="padding: 6px 12px; font-size: 0.85rem;">
            <i data-lucide="plus" style="width: 14px; height: 14px;"></i> Add more images
          </button>
          <button class="btn-outline" id="clear-files-btn" style="padding: 6px 12px; font-size: 0.85rem;">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> Clear all
          </button>
        </div>
      </div>

      <div class="image-queue-grid">
        ${state.thumbnails
          .map(
            (thumb, idx) => `
          <div class="image-queue-card">
            <div class="image-queue-thumb">
              ${thumb.dataUrl ? `<img src="${thumb.dataUrl}" alt="${thumb.name || `Image ${idx + 1}`}" />` : `<i data-lucide="image" style="width: 32px; height: 32px; color: var(--text-muted);"></i>`}
            </div>
            <div class="image-queue-meta">
              <div class="image-queue-name" title="${thumb.name || state.selectedFiles[idx]?.name || ''}">
                ${thumb.name || state.selectedFiles[idx]?.name || `Image ${idx + 1}`}
              </div>
              <div class="image-queue-size">${formatBytes(thumb.size || state.selectedFiles[idx]?.size || 0)}</div>
            </div>
            <button class="image-queue-remove" data-remove-file="${idx}" title="Remove image">
              <i data-lucide="x" style="width: 14px; height: 14px;"></i>
            </button>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  // Case B: Merge PDF (multiple files list)
  if (tool.id === 'merge') {
    return `
      <div class="stage-preview-header">
        <div class="file-info-badge">
          <span style="font-weight: 800; font-size: 1.1rem; color: var(--text-main);">
            ${state.selectedFiles.length} Documents Selected
          </span>
          <span class="file-size-badge">
            ${formatBytes(state.selectedFiles.reduce((acc, f) => acc + f.size, 0))}
          </span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn-outline" id="add-more-files-btn" style="padding: 6px 12px; font-size: 0.85rem;">
            <i data-lucide="plus" style="width: 14px; height: 14px;"></i> Add more files
          </button>
          <button class="btn-outline" id="clear-files-btn" style="padding: 6px 12px; font-size: 0.85rem;">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> Clear all
          </button>
        </div>
      </div>

      <div class="merge-files-list">
        ${state.selectedFiles
          .map(
            (file, idx) => `
          <div class="merge-file-row">
            <div class="merge-file-info">
              <span style="font-weight: 800; color: var(--primary); font-size: 0.95rem; width: 24px;">#${idx + 1}</span>
              <i data-lucide="file-text" style="width: 22px; height: 22px; color: var(--text-muted);"></i>
              <div>
                <div class="file-name-text">${file.name}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${formatBytes(file.size)}</div>
              </div>
            </div>
            <div class="merge-file-actions">
              <button class="icon-btn" data-move-up="${idx}" title="Move up" ${idx === 0 ? 'disabled style="opacity: 0.3;"' : ''}>
                <i data-lucide="arrow-up" style="width: 16px; height: 16px;"></i>
              </button>
              <button class="icon-btn" data-move-down="${idx}" title="Move down" ${idx === state.selectedFiles.length - 1 ? 'disabled style="opacity: 0.3;"' : ''}>
                <i data-lucide="arrow-down" style="width: 16px; height: 16px;"></i>
              </button>
              <button class="icon-btn delete" data-remove-file="${idx}" title="Remove file">
                <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
              </button>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  // Case C: Interactive PDF Editor (Sejda-Style)
  if (tool.id === 'edit-pdf') {
    return `
      <div id="interactive-pdf-editor-container" style="width: 100%;"></div>
    `;
  }

  // Case D: Single PDF or Images with thumbnails
  const firstFile = state.selectedFiles[0];
  return `
    <div class="stage-preview-header">
      <div class="file-info-badge">
        <i data-lucide="file" style="width: 20px; height: 20px; color: var(--primary);"></i>
        <div class="file-name-text" title="${firstFile.name}">${firstFile.name}</div>
        <span class="file-size-badge">${formatBytes(firstFile.size)}</span>
        ${state.totalPages ? `<span class="file-size-badge">${state.totalPages} Pages</span>` : ''}
      </div>
      <div>
        <button class="btn-outline" id="change-file-btn" style="padding: 6px 12px; font-size: 0.85rem;">
          <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i> Choose another file
        </button>
      </div>
    </div>

    <!-- Thumbnails Gallery -->
    ${
      state.thumbnails.length > 0
        ? `
      <div class="thumbnails-grid">
        ${state.thumbnails
          .map(
            (thumb, idx) => `
          <div class="thumbnail-item" data-thumb-page="${thumb.pageNumber}" ${
              tool.id === 'organize' ? `data-thumb-idx="${idx}" draggable="true"` : ''
            }>
            ${tool.id === 'organize' ? `<div class="thumbnail-order-badge">${idx + 1}</div>` : ''}
            <div class="thumbnail-img-wrap">
              <img src="${thumb.dataUrl}" alt="Page ${thumb.pageNumber}" />
            </div>
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
              <span class="page-badge">Page ${thumb.pageNumber}</span>
              ${
                tool.id === 'organize'
                  ? `<div style="display: flex; gap: 4px;">
                       <button class="icon-btn" data-move-page-up="${idx}" title="Move earlier" ${
                         idx === 0 ? 'disabled style="opacity: 0.3;"' : ''
                       } style="width: 24px; height: 24px;">
                         <i data-lucide="arrow-up" style="width: 12px; height: 12px;"></i>
                       </button>
                       <button class="icon-btn" data-move-page-down="${idx}" title="Move later" ${
                         idx === state.thumbnails.length - 1 ? 'disabled style="opacity: 0.3;"' : ''
                       } style="width: 24px; height: 24px;">
                         <i data-lucide="arrow-down" style="width: 12px; height: 12px;"></i>
                       </button>
                       <button class="icon-btn delete" data-delete-page="${idx}" title="Remove page" style="width: 24px; height: 24px;">
                         <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
                       </button>
                     </div>`
                  : ''
              }
            </div>
          </div>
        `
          )
          .join('')}
      </div>
      `
        : `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <i data-lucide="file-check" style="width: 48px; height: 48px; color: var(--primary); margin-bottom: 12px;"></i>
        <p>File loaded successfully. Configure options on the right and click <strong>${tool.actionButtonText}</strong>.</p>
      </div>
      `
    }
  `;
}

/**
 * Render Studio Sidebar Options
 */
function renderStudioSidebarContent(tool) {
  const hasFiles = state.selectedFiles.length > 0;
  const opts = state.toolOptions;

  return `
    <h3 class="sidebar-title">${tool.name} Settings</h3>

    <!-- Dynamic options per tool -->
    ${renderToolSpecificControls(tool, opts)}

    <!-- 100% Free Guarantee Card -->
    <div style="padding: 14px; background: var(--bg-subtle); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="font-size: 0.82rem; font-weight: 700; color: var(--text-main);">Access Status</span>
        <span style="font-size: 0.82rem; font-weight: 800; color: #10b981; display: flex; align-items: center; gap: 4px;">
          <i data-lucide="check-circle" style="width: 14px; height: 14px;"></i> 100% Free
        </span>
      </div>
      <p style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.45;">
        Unlimited document and image operations. Zero account, sign-up, or login needed.
      </p>
    </div>

    <!-- Main Execution Button -->
    <button class="execute-action-btn" id="execute-tool-action-btn" ${!hasFiles || state.isProcessing ? 'disabled' : ''}>
      <span>${tool.actionButtonText}</span>
      <i data-lucide="arrow-right" style="width: 18px; height: 18px;"></i>
    </button>
  `;
}

/**
 * Tool specific sidebar control inputs
 */
function renderToolSpecificControls(tool, opts) {
  switch (tool.id) {
    case 'edit-pdf':
      return `
        <div class="form-group">
          <span class="form-label">Full Interactive Editor</span>
          <p class="form-sublabel">Edit your document directly on the interactive canvas with Sejda-style power:</p>
          <ul style="font-size: 0.82rem; color: var(--text-muted); padding-left: 18px; margin-top: 8px; line-height: 1.6;">
            <li><strong>Text:</strong> Click anywhere on page to type</li>
            <li><strong>Whiteout:</strong> Drag to erase/redact text</li>
            <li><strong>Draw:</strong> Freehand pencil annotations</li>
            <li><strong>Sign:</strong> Draw, type cursive, or upload</li>
            <li><strong>Shapes:</strong> Rectangles, circles, lines</li>
            <li><strong>Highlight:</strong> Semi-transparent marker</li>
            <li><strong>Forms:</strong> Checkmarks, crosses, boxes</li>
            <li><strong>Images:</strong> Insert pictures and logos</li>
          </ul>
        </div>
        <div class="form-group" style="margin-top: 10px;">
          <div style="background: var(--bg-subtle); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); font-size: 0.8rem; color: var(--text-main);">
            <strong style="color: var(--primary);">Vector Native Embedding:</strong> All edits are baked directly into the native PDF layer when you click <strong>Apply Changes</strong>!
          </div>
        </div>
      `;

    case 'merge':
      return `
        <div class="form-group">
          <span class="form-label">Order of Assembly</span>
          <p class="form-sublabel">Documents will be combined from top to bottom. Use the arrow buttons on the left to reorder.</p>
        </div>
      `;

    case 'split':
      return `
        <div class="form-group">
          <label class="form-label">Split Method</label>
          <div class="radio-group-cards">
            <div class="radio-card ${opts.splitMode === 'all' ? 'active' : ''}" data-set-opt="splitMode" data-opt-val="all">
              <div class="radio-card-content">
                <h4>Extract all pages</h4>
                <p>Splits every page into a separate PDF file (bundled into a ZIP)</p>
              </div>
            </div>
            <div class="radio-card ${opts.splitMode === 'range' ? 'active' : ''}" data-set-opt="splitMode" data-opt-val="range">
              <div class="radio-card-content">
                <h4>Custom page range</h4>
                <p>Extract only specific pages into a single document</p>
              </div>
            </div>
          </div>
        </div>

        ${
          opts.splitMode === 'range'
            ? `
          <div class="form-group">
            <label class="form-label">Pages to extract</label>
            <input type="text" class="form-input" id="split-range-input" placeholder="e.g. 1-2, 3" value="${opts.splitRange}" />
            <span class="form-sublabel">Example: 1-2, 3 will extract pages 1, 2, and 3</span>
          </div>
        `
            : ''
        }
      `;

    case 'compress':
      return `
        <div class="form-group">
          <label class="form-label">Compression Level</label>
          <div class="radio-group-cards">
            <div class="radio-card ${opts.compressLevel === 'extreme' ? 'active' : ''}" data-set-opt="compressLevel" data-opt-val="extreme">
              <div class="radio-card-content">
                <h4>Extreme Compression</h4>
                <p>Maximum file size reduction with optimized raster rendering</p>
              </div>
            </div>
            <div class="radio-card ${opts.compressLevel === 'recommended' ? 'active' : ''}" data-set-opt="compressLevel" data-opt-val="recommended">
              <div class="radio-card-content">
                <h4>Recommended</h4>
                <p>Balanced quality and reduction. Perfect for email attachments & uploads.</p>
              </div>
            </div>
            <div class="radio-card ${opts.compressLevel === 'less' ? 'active' : ''}" data-set-opt="compressLevel" data-opt-val="less">
              <div class="radio-card-content">
                <h4>Less Compression</h4>
                <p>High quality maintained, moderate stream optimization</p>
              </div>
            </div>
          </div>
        </div>
      `;

    case 'rotate':
      return `
        <div class="form-group">
          <label class="form-label">Rotation Angle</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
            <button class="btn-outline ${opts.rotateAngle === 90 ? 'active' : ''}" data-set-rotate="90" style="padding: 10px; font-size: 0.85rem;">
              <i data-lucide="rotate-cw" style="width: 14px; height: 14px;"></i> 90° Right
            </button>
            <button class="btn-outline ${opts.rotateAngle === 270 ? 'active' : ''}" data-set-rotate="270" style="padding: 10px; font-size: 0.85rem;">
              <i data-lucide="rotate-ccw" style="width: 14px; height: 14px;"></i> 90° Left
            </button>
            <button class="btn-outline ${opts.rotateAngle === 180 ? 'active' : ''}" data-set-rotate="180" style="padding: 10px; font-size: 0.85rem;">
              180° Flip
            </button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Scope</label>
          <select class="form-select" id="rotate-scope-select">
            <option value="all" ${opts.rotateScope === 'all' ? 'selected' : ''}>Rotate all pages</option>
            <option value="first" ${opts.rotateScope === 'first' ? 'selected' : ''}>Rotate first page only</option>
          </select>
        </div>
      `;

    case 'organize':
      return `
        <div class="form-group">
          <span class="form-label">Interactive Page Grid</span>
          <p class="form-sublabel">Drag any page thumbnail to move it, or use the arrow buttons to shift it earlier or later. The numbered badge shows its new position. Delete unwanted pages with the trash icon.</p>
        </div>
      `;

    case 'pdf-to-jpg':
      return `
        <div class="form-group">
          <label class="form-label">Image Format</label>
          <div style="display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 2px solid #0284c7; border-radius: var(--radius-md); background: rgba(2, 132, 199, 0.1); font-weight: 700; font-size: 0.85rem; color: #0284c7;">
            <i data-lucide="image" style="width: 16px; height: 16px;"></i> JPG Output
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Resolution / Quality</label>
          <select class="form-select" id="img-scale-select">
            <option value="1.0" ${opts.imgScale === 1.0 ? 'selected' : ''}>Standard (1x - Fast)</option>
            <option value="1.5" ${opts.imgScale === 1.5 ? 'selected' : ''}>High Definition (1.5x - Recommended)</option>
            <option value="2.0" ${opts.imgScale === 2.0 ? 'selected' : ''}>Ultra HD (2x - Crisp Diagrams)</option>
          </select>
        </div>
      `;

    case 'pdf-to-png':
      return `
        <div class="form-group">
          <label class="form-label">Image Format</label>
          <div style="display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 2px solid #10b981; border-radius: var(--radius-md); background: rgba(16, 185, 129, 0.1); font-weight: 700; font-size: 0.85rem; color: #10b981;">
            <i data-lucide="file-image" style="width: 16px; height: 16px;"></i> PNG Output
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Resolution / Quality</label>
          <select class="form-select" id="img-scale-select">
            <option value="1.0" ${opts.imgScale === 1.0 ? 'selected' : ''}>Standard (1x - Fast)</option>
            <option value="1.5" ${opts.imgScale === 1.5 ? 'selected' : ''}>High Definition (1.5x - Recommended)</option>
            <option value="2.0" ${opts.imgScale === 2.0 ? 'selected' : ''}>Ultra HD (2x - Crisp Diagrams)</option>
          </select>
        </div>
      `;

    case 'jpg-to-pdf':
      return `
        <div class="form-group">
          <label class="form-label">Page Orientation</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button class="btn-outline ${opts.orientation === 'portrait' ? 'active' : ''}" data-set-opt="orientation" data-opt-val="portrait" style="padding: 10px;">Portrait</button>
            <button class="btn-outline ${opts.orientation === 'landscape' ? 'active' : ''}" data-set-opt="orientation" data-opt-val="landscape" style="padding: 10px;">Landscape</button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Page Margins</label>
          <select class="form-select" id="img-margin-select">
            <option value="0" ${opts.imgMargin === 0 ? 'selected' : ''}>No Margin (Full Bleed)</option>
            <option value="20" ${opts.imgMargin === 20 ? 'selected' : ''}>Small Margin (20pt)</option>
            <option value="40" ${opts.imgMargin === 40 ? 'selected' : ''}>Large Margin (40pt)</option>
          </select>
        </div>
      `;

    case 'pdf-to-text':
      return `
        <div class="form-group">
          <span class="form-label">Text Extraction Mode</span>
          <p class="form-sublabel">Extracts pure Unicode text from documents for citation analysis, search, and copy-pasting.</p>
        </div>
      `;

    case 'watermark':
      return `
        <div class="form-group">
          <label class="form-label">Watermark Text</label>
          <input type="text" class="form-input" id="watermark-text-input" value="${opts.watermarkText}" />
        </div>

        <div class="form-group">
          <label class="form-label">Font Size (${opts.watermarkSize}px)</label>
          <input type="range" min="20" max="80" value="${opts.watermarkSize}" id="watermark-size-slider" style="width: 100%; accent-color: var(--primary);" />
        </div>

        <div class="form-group">
          <label class="form-label">Opacity (${Math.round(opts.watermarkOpacity * 100)}%)</label>
          <input type="range" min="0.1" max="1" step="0.05" value="${opts.watermarkOpacity}" id="watermark-opacity-slider" style="width: 100%; accent-color: var(--primary);" />
        </div>

        <div class="form-group">
          <label class="form-label">Rotation Angle (${opts.watermarkRotation}°)</label>
          <input type="range" min="-90" max="90" step="5" value="${opts.watermarkRotation}" id="watermark-rotation-slider" style="width: 100%; accent-color: var(--primary);" />
        </div>

        <div class="form-group">
          <label class="form-label">Stamp Color</label>
          <div style="display: flex; gap: 8px;">
            ${['#dcbd54', '#005043', '#0984e3', '#2d3436']
              .map(
                (color) => `
              <div
                class="color-pick-circle"
                data-set-watermark-color="${color}"
                style="width: 32px; height: 32px; border-radius: 50%; background: ${color}; cursor: pointer; border: 2.5px solid ${opts.watermarkColor === color ? 'var(--text-main)' : 'transparent'};"
              ></div>
            `
              )
              .join('')}
          </div>
        </div>
      `;

    case 'page-numbers':
      return `
        <div class="form-group">
          <label class="form-label">Numbering Format</label>
          <select class="form-select" id="page-num-format-select">
            <option value="page_of_total" ${opts.pageNumberFormat === 'page_of_total' ? 'selected' : ''}>Page 1 of {total}</option>
            <option value="page_x" ${opts.pageNumberFormat === 'page_x' ? 'selected' : ''}>Page 1</option>
            <option value="number" ${opts.pageNumberFormat === 'number' ? 'selected' : ''}>1 (Just number)</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Position</label>
          <select class="form-select" id="page-num-pos-select">
            <option value="bottom-center" ${opts.pageNumberPosition === 'bottom-center' ? 'selected' : ''}>Bottom Center</option>
            <option value="bottom-right" ${opts.pageNumberPosition === 'bottom-right' ? 'selected' : ''}>Bottom Right</option>
            <option value="bottom-left" ${opts.pageNumberPosition === 'bottom-left' ? 'selected' : ''}>Bottom Left</option>
            <option value="top-center" ${opts.pageNumberPosition === 'top-center' ? 'selected' : ''}>Top Center</option>
            <option value="top-right" ${opts.pageNumberPosition === 'top-right' ? 'selected' : ''}>Top Right</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">First Page Number</label>
          <input type="number" class="form-input" id="page-num-start-input" min="1" value="${opts.pageNumberStart}" />
        </div>
      `;

    case 'protect':
      return `
        <div class="form-group">
          <label class="form-label">Set Password</label>
          <input type="password" class="form-input" id="protect-password-input" placeholder="Enter secure password" value="${opts.password}" />
        </div>
        <div class="form-group">
          <label class="form-label">Confirm Password</label>
          <input type="password" class="form-input" id="protect-confirm-input" placeholder="Confirm password" value="${opts.confirmPassword}" />
        </div>
      `;

    case 'unlock':
      return `
        <div class="form-group">
          <label class="form-label">Enter Document Password</label>
          <input type="password" class="form-input" id="unlock-password-input" placeholder="Password to decrypt" value="${opts.password}" />
        </div>
      `;

    case 'png-to-jpg':
      return `
        <div class="form-group">
          <label class="form-label">JPG Image Quality (${Math.round(opts.pngQuality * 100)}%)</label>
          <input
            type="range"
            min="0.10"
            max="1.0"
            step="0.02"
            value="${opts.pngQuality}"
            id="png-quality-slider"
            style="width: 100%; accent-color: var(--primary);"
          />
          <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted);">
            <span>Smaller File (10%)</span>
            <span>Balanced (80%)</span>
            <span>Best Quality (100%)</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Background Fill for Transparency</label>
          <p class="form-sublabel">JPG format cannot store transparent pixels. Select background fill color:</p>
          <div style="display: flex; gap: 8px; margin-top: 4px;">
            ${[
              { color: '#ffffff', label: 'White' },
              { color: '#000000', label: 'Black' },
              { color: '#005043', label: 'Brand Pine' },
              { color: '#f8fafc', label: 'Light Slate' },
            ]
              .map(
                (c) => `
              <div
                class="color-pick-circle ${opts.pngBgColor === c.color ? 'active' : ''}"
                data-set-png-bg="${c.color}"
                title="${c.label}"
                style="width: 32px; height: 32px; border-radius: 50%; background: ${c.color}; cursor: pointer; border: 2.5px solid ${opts.pngBgColor === c.color ? 'var(--accent-gold)' : 'var(--border-subtle)'}; box-shadow: 0 2px 6px rgba(0,0,0,0.1);"
              ></div>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="form-group" style="padding: 12px; background: var(--bg-subtle); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
          <div style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem; font-weight: 700; color: var(--text-main);">
            <i data-lucide="layers" style="width: 16px; height: 16px; color: var(--accent-gold);"></i>
            <span>Batch Processing Ready</span>
          </div>
          <p class="form-sublabel" style="margin-top: 4px;">
            Converts each image at full native resolution with high-speed client-side canvas rasterization.
          </p>
        </div>
      `;

    case 'jpg-to-png':
      return `
        <div class="form-group" style="padding: 14px; background: var(--bg-subtle); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
          <div style="display: flex; align-items: center; gap: 8px; font-size: 0.88rem; font-weight: 700; color: var(--primary);">
            <i data-lucide="sparkles" style="width: 18px; height: 18px; color: var(--accent-gold);"></i>
            <span>Lossless PNG Output</span>
          </div>
          <p class="form-sublabel" style="margin-top: 6px; line-height: 1.5;">
            JPEG images will be converted into uncompressed, lossless PNG graphics with exact 24-bit RGB pixel fidelity and no re-compression artifacts.
          </p>
        </div>

        <div class="form-group">
          <label class="form-label">Batch Download Mode</label>
          <p class="form-sublabel">
            Single images are downloaded directly as .png. Multiple images are packaged in a ZIP archive with individual download options.
          </p>
        </div>
      `;

    default:
      return '';
  }
}

/**
 * Handle Tool Selection
 */
function openTool(toolId) {
  state.currentView = 'tool';
  state.activeToolId = toolId;
  state.selectedFiles = [];
  state.thumbnails = [];
  state.totalPages = 0;
  state.result = null;
  state.isProcessing = false;
  state.progress = 0;
  state.progressText = '';
  renderApp();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Go Back to Home View
 */
function goHome() {
  state.currentView = 'home';
  state.activeToolId = null;
  state.result = null;
  state.selectedFiles = [];
  renderApp();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Load Sample Asset (PDF or Sample Image depending on active tool)
 */
async function loadSamplePdf() {
  try {
    const isImageTool = state.activeToolId === 'png-to-jpg' || state.activeToolId === 'jpg-to-png';
    if (isImageTool) {
      const format = state.activeToolId === 'png-to-jpg' ? 'png' : 'jpg';
      showToast(`Generating sample ${format.toUpperCase()} image...`, 'info');
      const sampleFile = await createSampleImage(format);
      await handleFilesSelected([sampleFile]);
      showToast(`Thinkcone sample ${format.toUpperCase()} loaded! Ready for conversion.`, 'success');
    } else {
      showToast('Generating Thinkcone test document...', 'info');
      const sampleFile = await createSamplePdf();
      await handleFilesSelected([sampleFile]);
      showToast('Thinkcone sample document loaded! Ready for testing.', 'success');
    }
  } catch (err) {
    console.error('Error generating sample asset', err);
    showToast('Failed to generate sample asset', 'error');
  }
}

/**
 * Handle File Selection
 */
async function handleFilesSelected(fileList) {
  const tool = TOOLS.find((t) => t.id === state.activeToolId);
  const files = Array.from(fileList);

  if (files.length === 0) return;

  if (tool && tool.multiple) {
    state.selectedFiles = [...state.selectedFiles, ...files];
  } else {
    state.selectedFiles = [files[0]];
  }

  renderApp();

  // If Image Tool (PNG to JPG, JPG to PNG, or JPG to PDF), generate thumbnails for all images
  if (tool && (tool.id === 'png-to-jpg' || tool.id === 'jpg-to-png' || tool.id === 'jpg-to-pdf')) {
    try {
      const imageThumbs = await Promise.all(
        state.selectedFiles.map((f, i) => {
          return new Promise((res) => {
            const reader = new FileReader();
            reader.onload = () =>
              res({
                pageNumber: i + 1,
                dataUrl: reader.result,
                name: f.name,
                size: f.size,
              });
            reader.onerror = () =>
              res({
                pageNumber: i + 1,
                dataUrl: '',
                name: f.name,
                size: f.size,
              });
            reader.readAsDataURL(f);
          });
        })
      );
      state.thumbnails = imageThumbs;
      renderApp();
    } catch (e) {
      console.warn('Could not render image thumbnails', e);
    }
    return;
  }

  // If PDF, render thumbnails
  const firstFile = state.selectedFiles[0];
  if (firstFile && firstFile.type === 'application/pdf') {
    try {
      const { totalPages, thumbnails } = await renderPdfThumbnails(firstFile, 6);
      state.totalPages = totalPages;
      state.thumbnails = thumbnails;
      state.toolOptions.pageOrder = Array.from({ length: totalPages }, (_, i) => i);
      renderApp();
    } catch (e) {
      console.warn('Could not render thumbnail', e);
    }
  }
}

/**
 * Execute Current Tool
 */
async function executeTool() {
  const tool = TOOLS.find((t) => t.id === state.activeToolId);
  if (!tool || state.selectedFiles.length === 0) return;

  state.isProcessing = true;
  state.progress = 10;
  state.progressText = 'Starting operation...';
  renderApp();

  const onProgress = (percent, text) => {
    state.progress = percent;
    state.progressText = text;
    const bar = document.querySelector('.progress-bar-fill');
    if (bar) bar.style.width = `${percent}%`;
    const label = document.querySelector('.processing-overlay p');
    if (label) label.textContent = text;
    const numLabel = document.querySelector('.processing-overlay span');
    if (numLabel) numLabel.textContent = `${percent}%`;
  };

  try {
    let result = null;
    const file = state.selectedFiles[0];

    switch (tool.id) {
      case 'edit-pdf':
        result = await applyPdfEdits(
          file,
          state.toolOptions.editorPagesEdits || {},
          onProgress
        );
        break;

      case 'merge':
        result = await mergePdfs(state.selectedFiles, onProgress);
        break;

      case 'split':
        result = await splitPdf(
          file,
          {
            mode: state.toolOptions.splitMode,
            range: state.toolOptions.splitRange,
          },
          onProgress
        );
        break;

      case 'compress':
        result = await compressPdf(file, state.toolOptions.compressLevel, onProgress);
        break;

      case 'rotate':
        result = await rotatePdf(
          file,
          state.toolOptions.rotateAngle,
          state.toolOptions.rotateScope === 'all' ? 'all' : '1',
          onProgress
        );
        break;

      case 'organize':
        result = await organizePdf(file, state.toolOptions.pageOrder, onProgress);
        break;

      case 'pdf-to-jpg':
        result = await pdfToImages(file, 'jpg', state.toolOptions.imgScale, onProgress);
        break;

      case 'pdf-to-png':
        result = await pdfToImages(file, 'png', state.toolOptions.imgScale, onProgress);
        break;

      case 'jpg-to-pdf':
        result = await imagesToPdf(
          state.selectedFiles,
          {
            orientation: state.toolOptions.orientation,
            margin: parseInt(state.toolOptions.imgMargin, 10),
          },
          onProgress
        );
        break;

      case 'pdf-to-text':
        result = await pdfToText(file, onProgress);
        break;

      case 'watermark':
        result = await watermarkPdf(
          file,
          {
            text: state.toolOptions.watermarkText,
            fontSize: parseInt(state.toolOptions.watermarkSize, 10),
            colorHex: state.toolOptions.watermarkColor,
            opacity: parseFloat(state.toolOptions.watermarkOpacity),
            rotation: parseFloat(state.toolOptions.watermarkRotation),
            position: state.toolOptions.watermarkPosition,
          },
          onProgress
        );
        break;

      case 'page-numbers':
        result = await addPageNumbers(
          file,
          {
            format: state.toolOptions.pageNumberFormat,
            position: state.toolOptions.pageNumberPosition,
            fontSize: 11,
            startNum: state.toolOptions.pageNumberStart,
          },
          onProgress
        );
        break;

      case 'protect':
        result = await protectPdf(file, state.toolOptions.password, onProgress);
        break;

      case 'unlock':
        result = await unlockPdf(file, state.toolOptions.password, onProgress);
        break;

      case 'png-to-jpg':
        result = await convertPngToJpg(
          state.selectedFiles,
          {
            quality: state.toolOptions.pngQuality,
            bgColor: state.toolOptions.pngBgColor,
          },
          onProgress
        );
        break;

      case 'jpg-to-png':
        result = await convertJpgToPng(
          state.selectedFiles,
          {},
          onProgress
        );
        break;
    }

    state.isProcessing = false;
    state.result = result;
    renderApp();

    // Trigger celebration confetti in Thinkcone Gold and Green!
    confetti({
      particleCount: 85,
      spread: 75,
      origin: { y: 0.6 },
      colors: ['#005043', '#dcbd54', '#10b981', '#ffffff'],
    });

    showToast('Success! File ready for download.', 'success');
  } catch (err) {
    console.error('Operation error:', err);
    state.isProcessing = false;
    renderApp();
    showToast(`Error: ${err.message || 'Failed to process document'}`, 'error');
  }
}

/**
 * Open Access & Token Modal (Informational Only - 100% Free)
 */
function openAccessModal() {
  showToast('Thinkcone Tools is 100% free with unlimited local processing!', 'info');
}

/**
 * Open Auth Modal (Informational Only - No Login Needed)
 */
function openAuthModal() {
  showToast('No sign-in or account needed! Full unlimited access is open.', 'info');
}

function closeModal() {
  const container = document.getElementById('modal-container-slot');
  if (container) container.innerHTML = '';
}

/**
 * Attach Global DOM Listeners
 */
function attachGlobalListeners() {
  // Navigation: Home Logo
  document.getElementById('logo-home-btn')?.addEventListener('click', () => {
    closeMobileMenu();
    goHome();
  });
  document.getElementById('nav-all-tools')?.addEventListener('click', () => {
    closeMobileMenu();
    goHome();
  });

  // Mobile Drawer Event Handlers
  document.getElementById('mobile-nav-backdrop')?.addEventListener('click', closeMobileMenu);
  document.getElementById('mobile-nav-close-btn')?.addEventListener('click', closeMobileMenu);
  document.getElementById('mobile-all-tools-btn')?.addEventListener('click', () => {
    closeMobileMenu();
    goHome();
  });

  // Mobile tool items
  document.querySelectorAll('[data-mobile-tool]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      closeMobileMenu();
      openTool(el.getAttribute('data-mobile-tool'));
    });
  });

  // Quick nav links
  document.querySelectorAll('[data-nav-tool]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      closeMobileMenu();
      openTool(el.getAttribute('data-nav-tool'));
    });
  });

  // Footer tool links
  document.querySelectorAll('[data-footer-tool]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openTool(el.getAttribute('data-footer-tool'));
    });
  });

  // Footer links
  document.getElementById('footer-privacy-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    showToast('Your files are processed 100% locally on your machine. Zero cloud uploads.', 'success');
  });

  // Global Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMobileMenu();
      closeModal();
    } else if (
      e.key === '/' &&
      document.activeElement.tagName !== 'INPUT' &&
      document.activeElement.tagName !== 'TEXTAREA' &&
      state.currentView === 'home'
    ) {
      e.preventDefault();
      document.getElementById('tool-search-input')?.focus();
    }
  });

  // Home view listeners
  attachHomeListeners();

  // Studio listeners
  attachStudioListeners();
}

function attachHomeListeners() {
  // Search input
  const searchInput = document.getElementById('tool-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      reRenderHome();
    });
  }

  // Clear search button
  document.getElementById('search-clear-btn')?.addEventListener('click', () => {
    state.searchQuery = '';
    reRenderHome();
    document.getElementById('tool-search-input')?.focus();
  });

  // Quick search tags
  document.querySelectorAll('[data-quick-search]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.searchQuery = btn.getAttribute('data-quick-search');
      reRenderHome();
    });
  });

  // Category filter tabs (desktop & mobile)
  document.querySelectorAll('[data-cat-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeCategory = btn.getAttribute('data-cat-id');
      closeMobileMenu();
      reRenderHome();
    });
  });

  // Workflow cards (Popular Workflows)
  document.querySelectorAll('[data-workflow-launch]').forEach((card) => {
    card.addEventListener('click', () => {
      const toolId = card.getAttribute('data-workflow-launch');
      openTool(toolId);
    });
  });

  // Tool cards
  document.querySelectorAll('.tool-card').forEach((card) => {
    card.addEventListener('click', () => {
      const toolId = card.getAttribute('data-tool-card-id');
      openTool(toolId);
    });
  });

  // Reset search button (empty state)
  document.getElementById('reset-search-btn')?.addEventListener('click', () => {
    state.searchQuery = '';
    state.activeCategory = 'all';
    reRenderHome();
  });
}

function reRenderHome() {
  const main = document.getElementById('main-content-view');
  if (main && state.currentView === 'home') {
    main.innerHTML = renderHomeView();
    createIcons({ icons });
    attachHomeListeners();
  }
}

function attachStudioListeners() {
  // Back button
  document.getElementById('studio-back-btn')?.addEventListener('click', goHome);

  // Trigger file selection
  const fileInput = document.getElementById('file-picker-input');
  document.getElementById('trigger-file-select-btn')?.addEventListener('click', () => {
    fileInput?.click();
  });

  fileInput?.addEventListener('change', (e) => {
    handleFilesSelected(e.target.files);
  });

  // Try sample document button
  document.getElementById('try-sample-doc-btn')?.addEventListener('click', loadSamplePdf);

  // Drag and drop zone
  const dropZone = document.getElementById('file-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      handleFilesSelected(e.dataTransfer.files);
    });
  }

  // Change file / Clear
  document.getElementById('change-file-btn')?.addEventListener('click', () => {
    state.selectedFiles = [];
    state.thumbnails = [];
    state.result = null;
    renderApp();
  });
  document.getElementById('clear-files-btn')?.addEventListener('click', () => {
    state.selectedFiles = [];
    state.thumbnails = [];
    state.result = null;
    renderApp();
  });

  // Add more files (merge or image converter)
  document.getElementById('add-more-files-btn')?.addEventListener('click', () => {
    const tool = TOOLS.find((t) => t.id === state.activeToolId);
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = tool ? tool.accept : '*';
    input.onchange = (e) => handleFilesSelected(e.target.files);
    input.click();
  });

  // Merge reorder actions
  document.querySelectorAll('[data-move-up]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-move-up'), 10);
      if (idx > 0) {
        const temp = state.selectedFiles[idx];
        state.selectedFiles[idx] = state.selectedFiles[idx - 1];
        state.selectedFiles[idx - 1] = temp;
        if (state.thumbnails.length > idx) {
          const tTemp = state.thumbnails[idx];
          state.thumbnails[idx] = state.thumbnails[idx - 1];
          state.thumbnails[idx - 1] = tTemp;
        }
        renderApp();
      }
    });
  });

  document.querySelectorAll('[data-move-down]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-move-down'), 10);
      if (idx < state.selectedFiles.length - 1) {
        const temp = state.selectedFiles[idx];
        state.selectedFiles[idx] = state.selectedFiles[idx + 1];
        state.selectedFiles[idx + 1] = temp;
        if (state.thumbnails.length > idx) {
          const tTemp = state.thumbnails[idx];
          state.thumbnails[idx] = state.thumbnails[idx + 1];
          state.thumbnails[idx + 1] = tTemp;
        }
        renderApp();
      }
    });
  });

  document.querySelectorAll('[data-remove-file]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-remove-file'), 10);
      state.selectedFiles.splice(idx, 1);
      if (state.thumbnails.length > idx) {
        state.thumbnails.splice(idx, 1);
      }
      renderApp();
    });
  });

  // Individual image download button (png2jpg style)
  document.querySelectorAll('[data-download-single-img]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-download-single-img'), 10);
      const item = state.result?.items?.[idx];
      if (item) {
        const mime = item.filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
        const buf = await item.blob.arrayBuffer();
        downloadFile(buf, item.filename, mime);
        showToast(`Downloading ${item.filename}...`, 'success');
      }
    });
  });

  // PNG to JPG options
  const pngQualitySlider = document.getElementById('png-quality-slider');
  if (pngQualitySlider) {
    pngQualitySlider.addEventListener('input', (e) => {
      state.toolOptions.pngQuality = parseFloat(e.target.value);
      const label = pngQualitySlider.parentElement.querySelector('.form-label');
      if (label) {
        label.textContent = `JPG Image Quality (${Math.round(state.toolOptions.pngQuality * 100)}%)`;
      }
    });
  }

  document.querySelectorAll('[data-set-png-bg]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.toolOptions.pngBgColor = btn.getAttribute('data-set-png-bg');
      renderApp();
    });
  });

  // Organize: delete page
  document.querySelectorAll('[data-delete-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-delete-page'), 10);
      state.toolOptions.pageOrder.splice(idx, 1);
      state.thumbnails.splice(idx, 1);
      renderApp();
    });
  });

  // Organize: reorder page (move earlier / later)
  function movePage(fromIdx, toIdx) {
    if (
      fromIdx === toIdx ||
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= state.thumbnails.length ||
      toIdx >= state.thumbnails.length
    ) {
      return;
    }
    const [movedThumb] = state.thumbnails.splice(fromIdx, 1);
    state.thumbnails.splice(toIdx, 0, movedThumb);
    const [movedPage] = state.toolOptions.pageOrder.splice(fromIdx, 1);
    state.toolOptions.pageOrder.splice(toIdx, 0, movedPage);
    renderApp();
  }

  document.querySelectorAll('[data-move-page-up]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-move-page-up'), 10);
      movePage(idx, idx - 1);
    });
  });

  document.querySelectorAll('[data-move-page-down]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-move-page-down'), 10);
      movePage(idx, idx + 1);
    });
  });

  // Organize: drag & drop to reorder pages
  if (state.activeToolId === 'organize') {
    let dragSrcIdx = null;
    document.querySelectorAll('.thumbnail-item[draggable="true"]').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        dragSrcIdx = parseInt(el.getAttribute('data-thumb-idx'), 10);
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(dragSrcIdx));
      });

      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        document.querySelectorAll('.thumbnail-item.drag-over-target').forEach((t) => {
          t.classList.remove('drag-over-target');
        });
        dragSrcIdx = null;
      });

      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over-target');
      });

      el.addEventListener('dragleave', () => {
        el.classList.remove('drag-over-target');
      });

      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over-target');
        const targetIdx = parseInt(el.getAttribute('data-thumb-idx'), 10);
        const srcIdx = dragSrcIdx !== null ? dragSrcIdx : parseInt(e.dataTransfer.getData('text/plain'), 10);
        movePage(srcIdx, targetIdx);
      });
    });
  }

  // Generic option set buttons (data-set-opt)
  document.querySelectorAll('[data-set-opt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const optKey = btn.getAttribute('data-set-opt');
      const val = btn.getAttribute('data-opt-val');
      state.toolOptions[optKey] = val;
      renderApp();
    });
  });

  // Rotate angle buttons
  document.querySelectorAll('[data-set-rotate]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.toolOptions.rotateAngle = parseInt(btn.getAttribute('data-set-rotate'), 10);
      renderApp();
    });
  });

  // Watermark color picker
  document.querySelectorAll('[data-set-watermark-color]').forEach((el) => {
    el.addEventListener('click', () => {
      state.toolOptions.watermarkColor = el.getAttribute('data-set-watermark-color');
      renderApp();
    });
  });

  // Sliders and inputs
  const watermarkInput = document.getElementById('watermark-text-input');
  if (watermarkInput) {
    watermarkInput.addEventListener('input', (e) => {
      state.toolOptions.watermarkText = e.target.value;
    });
  }

  const watermarkSize = document.getElementById('watermark-size-slider');
  if (watermarkSize) {
    watermarkSize.addEventListener('input', (e) => {
      state.toolOptions.watermarkSize = e.target.value;
      const label = watermarkSize.parentElement.querySelector('.form-label');
      if (label) label.textContent = `Font Size (${e.target.value}px)`;
    });
  }

  const watermarkOpacity = document.getElementById('watermark-opacity-slider');
  if (watermarkOpacity) {
    watermarkOpacity.addEventListener('input', (e) => {
      state.toolOptions.watermarkOpacity = e.target.value;
      const label = watermarkOpacity.parentElement.querySelector('.form-label');
      if (label) label.textContent = `Opacity (${Math.round(e.target.value * 100)}%)`;
    });
  }

  const watermarkRot = document.getElementById('watermark-rotation-slider');
  if (watermarkRot) {
    watermarkRot.addEventListener('input', (e) => {
      state.toolOptions.watermarkRotation = e.target.value;
      const label = watermarkRot.parentElement.querySelector('.form-label');
      if (label) label.textContent = `Rotation Angle (${e.target.value}°)`;
    });
  }

  const splitRangeInput = document.getElementById('split-range-input');
  if (splitRangeInput) {
    splitRangeInput.addEventListener('input', (e) => {
      state.toolOptions.splitRange = e.target.value;
    });
  }

  const protectPass = document.getElementById('protect-password-input');
  if (protectPass) {
    protectPass.addEventListener('input', (e) => {
      state.toolOptions.password = e.target.value;
    });
  }

  const unlockPass = document.getElementById('unlock-password-input');
  if (unlockPass) {
    unlockPass.addEventListener('input', (e) => {
      state.toolOptions.password = e.target.value;
    });
  }

  const pageNumFormat = document.getElementById('page-num-format-select');
  if (pageNumFormat) {
    pageNumFormat.addEventListener('change', (e) => {
      state.toolOptions.pageNumberFormat = e.target.value;
    });
  }

  const pageNumPos = document.getElementById('page-num-pos-select');
  if (pageNumPos) {
    pageNumPos.addEventListener('change', (e) => {
      state.toolOptions.pageNumberPosition = e.target.value;
    });
  }

  const imgScaleSelect = document.getElementById('img-scale-select');
  if (imgScaleSelect) {
    imgScaleSelect.addEventListener('change', (e) => {
      state.toolOptions.imgScale = parseFloat(e.target.value);
    });
  }

  // Execute Action Button
  document.getElementById('execute-tool-action-btn')?.addEventListener('click', executeTool);

  // Initialize PDF Editor (Sejda-Style) if active
  const editorContainer = document.getElementById('interactive-pdf-editor-container');
  if (editorContainer && state.activeToolId === 'edit-pdf' && state.selectedFiles[0] && !state.result && !state.isProcessing) {
    new PdfEditor(editorContainer, state.selectedFiles[0], {
      onApplyChanges: (pagesEdits) => {
        state.toolOptions.editorPagesEdits = pagesEdits;
        executeTool();
      },
      onBack: () => {
        goHome();
      },
    });
  }

  // Result actions
  document.getElementById('result-download-btn')?.addEventListener('click', () => {
    if (state.result) {
      const mime =
        state.result.type === 'zip'
          ? 'application/zip'
          : state.result.type === 'txt'
          ? 'text/plain'
          : state.result.type === 'png'
          ? 'image/png'
          : state.result.type === 'jpg'
          ? 'image/jpeg'
          : 'application/pdf';
      downloadFile(state.result.data, state.result.filename, mime);
      showToast('Download started!', 'success');
    }
  });

  document.getElementById('copy-extracted-text-btn')?.addEventListener('click', () => {
    if (state.result && state.result.text) {
      navigator.clipboard.writeText(state.result.text);
      showToast('Text copied to clipboard!', 'success');
    }
  });

  document.getElementById('process-another-btn')?.addEventListener('click', () => {
    state.result = null;
    state.selectedFiles = [];
    state.thumbnails = [];
    renderApp();
  });

  document.getElementById('result-back-tools-btn')?.addEventListener('click', goHome);
}

// Initial render
renderApp();
