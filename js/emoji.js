/**
 * emoji.js — Unicode 16.0 Twemoji support for emessage
 *
 * Depends on:  EMOJI_MAP, EMOJI_DATA  from emoji-map.js
 *
 * Public API:
 *   replaceShortcodes(text)              → string
 *   setTextWithEmoji(el, text)           → void
 *   toggleEmojiPicker(triggerEl, cb)     → void
 *   openEmojiPicker(triggerEl, cb)       → void
 *   closeEmojiPicker()                   → void
 */

// ── Shortcode replacement ─────────────────────────────────────────────────────

function replaceShortcodes(text) {
    if (!text || typeof EMOJI_MAP === 'undefined') return text;
    return text.replace(/:([a-zA-Z0-9_+\-]+):/g, (match, code) => EMOJI_MAP[code] || match);
}

/**
 * Sets element's textContent with emoji shortcodes expanded.
 * Use everywhere instead of el.textContent = value.
 */
function setTextWithEmoji(el, text) {
    if (!el) return;
    el.textContent = replaceShortcodes(String(text ?? ''));
}

// ── Auto-replace shortcodes in inputs as user types ──────────────────────────

document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
    // Skip monospace / codeblock inputs
    if (/JetBrains|Mono|Monaco|Menlo|monospace/i.test(window.getComputedStyle(el).fontFamily || '')) return;

    const original = el.value;
    const replaced = replaceShortcodes(original);
    if (replaced !== original) {
        const start = el.selectionStart;
        const end   = el.selectionEnd;
        const diff  = original.length - replaced.length;
        el.value = replaced;
        el.setSelectionRange(Math.max(0, start - diff), Math.max(0, end - diff));
    }
});

// ── Custom Search Tags ────────────────────────────────────────────────────────

// You can add your own search tags here! This won't be overwritten if we rebuild the emoji map.
// Format: 'emoji': ['tag1', 'tag2']
const CUSTOM_SEARCH_TAGS = {
    '✨': ['star', 'stars', 'magic', 'sparkle'],
    '💫': ['star', 'stars', 'dizzy'],
    '💖': ['star', 'stars', 'sparkle', 'love'],
    '💯': ['100', 'hundred', 'perfect'],
    '🔥': ['fire', 'lit', 'hot'],
};

// Inject custom tags into the loaded data
if (typeof EMOJI_DATA !== 'undefined') {
    EMOJI_DATA.forEach(item => {
        const baseChar = item.c.replace(/\uFE0F/g, '');
        if (CUSTOM_SEARCH_TAGS[item.c]) {
            item.s.push(...CUSTOM_SEARCH_TAGS[item.c]);
        } else if (CUSTOM_SEARCH_TAGS[baseChar]) {
            item.s.push(...CUSTOM_SEARCH_TAGS[baseChar]);
        }
    });
}

// ── Skin-tone state ───────────────────────────────────────────────────────────

const SKIN_TONE_ORDER = ['1F3FB', '1F3FC', '1F3FD', '1F3FE', '1F3FF'];
const SKIN_TONE_LABELS = {
    '1F3FB': 'Light',
    '1F3FC': 'Medium-Light',
    '1F3FD': 'Medium',
    '1F3FE': 'Medium-Dark',
    '1F3FF': 'Dark',
};

let _selectedTone = null; // null = default (yellow)

function getStoredTone() {
    return localStorage.getItem('emessage_skin_tone') || null;
}
function setStoredTone(tone) {
    if (tone) localStorage.setItem('emessage_skin_tone', tone);
    else localStorage.removeItem('emessage_skin_tone');
    _selectedTone = tone;
}

function resolveEmoji(item) {
    // Return the best char for an item given current skin-tone preference
    const tone = _selectedTone || getStoredTone();
    if (tone && item.v && item.v.length > 0) {
        // If tone is single (e.g. 1F3FB) but item has multi-tones (e.g. 1F3FB,1F3FB), map it.
        const targetTone = tone.includes(',') ? tone : (item.v.some(x => x.t.includes(',')) ? `${tone},${tone}` : tone);
        const variant = item.v.find(v => v.t === targetTone || v.t === tone);
        if (variant) return variant.c;
    }
    return item.c;
}

// ── Category definitions (matching EMOJI_DATA .k exactly) ────────────────────

// ── Favorite Emojis ──────────────────────────────────────────────────────────

function getFavoriteEmojis() {
    try {
        return JSON.parse(localStorage.getItem('emessage_favorite_emojis')) || [];
    } catch {
        return [];
    }
}

function isFavoriteEmoji(char) {
    const favorites = getFavoriteEmojis();
    // Strip variation selector for comparison
    const target = char.replace(/\uFE0F/g, '');
    return favorites.some(f => f.c.replace(/\uFE0F/g, '') === target);
}

function addFavoriteEmoji(char, shortcode) {
    const favorites = getFavoriteEmojis();
    const target = char.replace(/\uFE0F/g, '');
    if (favorites.some(f => f.c.replace(/\uFE0F/g, '') === target)) return;
    favorites.unshift({ c: char, s: [shortcode] });
    localStorage.setItem('emessage_favorite_emojis', JSON.stringify(favorites.slice(0, 100)));
}

function removeFavoriteEmoji(char) {
    const favorites = getFavoriteEmojis();
    const target = char.replace(/\uFE0F/g, '');
    const filtered = favorites.filter(f => f.c.replace(/\uFE0F/g, '') !== target);
    localStorage.setItem('emessage_favorite_emojis', JSON.stringify(filtered));
}

// ── Global Context Menu Actions ───────────────────────────────────────────────

window.handleEmojiFavoriteAction = function(char, shortcode, currentlyFav) {
    if (currentlyFav) {
        removeFavoriteEmoji(char);
        showNotification('Removed from favorites', 'info');
    } else {
        addFavoriteEmoji(char, shortcode);
        showNotification('Added to favorites', 'success');
    }
    if (typeof hideContextMenu === 'function') hideContextMenu();
    // Refresh the grid if we're in the favorites category
    if (_activeCategory === 'favorites' || _activeCategory === 'recent') {
        renderCurrentCategory();
    }
};

window.copyEmojiToClipboard = function(char) {
    navigator.clipboard.writeText(char).then(() => {
        showNotification('Emoji copied to clipboard', 'success');
    });
    if (typeof hideContextMenu === 'function') hideContextMenu();
};

const EMOJI_CATEGORIES = [
    { id: 'recent',    label: 'Recently Used',  icon: 'history' },
    { id: 'favorites', label: 'Favorites',      icon: 'favorite' },
    { id: 'smileys',   label: 'Smileys & People', icon: 'sentiment_satisfied' },
    { id: 'nature',    label: 'Animals & Nature', icon: 'forest' },
    { id: 'food',      label: 'Food & Drink',     icon: 'lunch_dining' },
    { id: 'activities',label: 'Activities',       icon: 'sports_esports' },
    { id: 'travel',    label: 'Travel & Places',  icon: 'distance' },
    { id: 'objects',   label: 'Objects',          icon: 'lightbulb' },
    { id: 'symbols',   label: 'Symbols',          icon: 'terminal' },
    { id: 'flags',     label: 'Flags',            icon: 'flag' },
];

// ── Recent emojis ─────────────────────────────────────────────────────────────

const RECENT_KEY  = 'emessage_recent_emojis';
const MAX_RECENT  = 40;

function getRecentEmojis() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
    catch { return []; }
}

function addRecentEmoji(char, shortcode) {
    // Always store the BASE char (no skin tone) so it re-resolves correctly later
    let recent = getRecentEmojis().filter(e => e.c !== char);
    recent.unshift({ c: char, s: [shortcode] });
    if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}

// ── Category cache (built once) ───────────────────────────────────────────────

let _catMap = null;
function getCatMap() {
    if (_catMap) return _catMap;
    _catMap = {};
    EMOJI_CATEGORIES.forEach(c => { _catMap[c.id] = []; });
    
    const idMap = {
        'Smileys & People': 'smileys',
        'Animals & Nature': 'nature',
        'Food & Drink':     'food',
        'Activities':       'activities',
        'Travel & Places':  'travel',
        'Objects':          'objects',
        'Symbols':          'symbols',
        'Flags':            'flags'
    };

    if (typeof EMOJI_DATA !== 'undefined') {
        EMOJI_DATA.forEach(item => {
            const targetId = idMap[item.k];
            if (targetId && _catMap[targetId]) {
                _catMap[targetId].push(item);
            }
        });
    }
    return _catMap;
}

// ── Skin-tone popover ─────────────────────────────────────────────────────────

let _tonePopover = null;
let _toneTarget  = null;     // the emoji-btn that was long-pressed / right-clicked

function buildTonePopover() {
    if (_tonePopover) return _tonePopover;
    const el = document.createElement('div');
    el.id = 'emojiTonePopover';
    el.className = 'ep-tone-popover';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Choose skin tone');
    document.body.appendChild(el);
    _tonePopover = el;

    el.addEventListener('mousedown', e => e.stopPropagation());
    el.addEventListener('click',     e => e.stopPropagation());
    return el;
}

function showTonePopover(anchorBtn, baseItem, onChoose) {
    const pop = buildTonePopover();
    _toneTarget = anchorBtn;

    const isMulti = baseItem.v && baseItem.v.some(v => v.t.includes(','));
    pop.classList.toggle('multi-tone', isMulti);

    const options = [{ label: 'Default', char: baseItem.c, tone: null, isDefault: true }];
    
    if (baseItem.v) {
        if (isMulti) {
            // For multi-tone, just add all 25 variants.
            baseItem.v.forEach(v => {
                options.push({ label: 'Mixed Tone', char: v.c, tone: v.t });
            });
        } else {
            SKIN_TONE_ORDER.forEach(t => {
                const v = baseItem.v.find(x => x.t === t);
                if (v) options.push({ label: SKIN_TONE_LABELS[t], char: v.c, tone: t });
            });
        }
    }

    const currentTone = _selectedTone || getStoredTone();
    
    pop.innerHTML = options.map(o => {
        let active = false;
        if (isMulti && o.tone === currentTone) active = true;
        else if (isMulti && o.tone === `${currentTone},${currentTone}`) active = true;
        else if (!isMulti && o.tone === currentTone) active = true;
        
        return `<button class="ep-tone-btn${active ? ' active' : ''}${o.isDefault ? ' default' : ''}"
                 data-tone="${o.tone || ''}"
                 data-emoji="${o.char}"
                 title="${o.label}"
                 aria-label="${o.label}">${o.char}</button>`;
    }).join('');

    // Position near anchor
    const r  = anchorBtn.getBoundingClientRect();
    const pw = isMulti ? 202 : (options.length * 38 + 8);
    const ph = isMulti ? 240 : 46;
    
    let left = r.left + r.width / 2 - pw / 2;
    if (left < 8) left = 8;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    const top = r.top - ph - 6;

    pop.style.left = left + 'px';
    pop.style.top  = (top < 8 ? r.bottom + 8 : top) + 'px';
    pop.style.minWidth = pw + 'px';
    pop.classList.add('visible');

    pop.onclick = (e) => {
        const btn = e.target.closest('.ep-tone-btn');
        if (!btn) return;
        const tone  = btn.dataset.tone || null;
        const emoji = btn.dataset.emoji;
        setStoredTone(tone);
        hideTonePopover();
        // Refresh the grid to show updated tones
        renderCurrentCategory();
        onChoose(emoji);
    };

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('mousedown', hideTonePopover, { once: true });
    }, 0);
}

function hideTonePopover() {
    if (_tonePopover) _tonePopover.classList.remove('visible');
    _toneTarget = null;
}

// ── Picker singleton ──────────────────────────────────────────────────────────

let _pickerEl       = null;
let _pickerCallback = null;
let _pickerClose    = null;
let _activeCategory = 'recent';
let _searchTimer    = null;

function buildPicker() {
    if (_pickerEl) return _pickerEl;

    const el = document.createElement('div');
    el.id = 'emojiPicker';
    el.className = 'emoji-picker';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Emoji picker');

    el.innerHTML = `
        <div class="ep-search-wrap">
            <span class="ep-search-icon material-symbols-rounded">search</span>
            <input class="ep-search" type="text" placeholder="Search emojis…"
                   autocomplete="off" spellcheck="false" aria-label="Search emojis" />
        </div>
        <div class="ep-categories" role="tablist">
            ${EMOJI_CATEGORIES.map(c =>
                `<button class="ep-cat-btn" data-cat="${c.id}"
                         title="${c.label}" aria-label="${c.label}" role="tab"
                 ><span class="material-symbols-rounded">${c.icon}</span></button>`
            ).join('')}
        </div>
        <div class="ep-grid-wrap">
            <div class="ep-grid" role="listbox"></div>
        </div>
        <div class="ep-footer">
            <span class="ep-preview-emoji" aria-hidden="true"></span>
            <span class="ep-preview-name"></span>
            <button class="ep-skin-btn" id="epSkinBtn" title="Choose default skin tone">✋</button>
        </div>
    `;

    document.body.appendChild(el);
    _pickerEl = el;

    // Update skin button to reflect stored tone
    _refreshSkinBtn();

    // Category buttons
    el.querySelectorAll('.ep-cat-btn').forEach(btn =>
        btn.addEventListener('click', () => setPickerCategory(btn.dataset.cat))
    );

    // Search
    const searchInput = el.querySelector('.ep-search');
    searchInput.addEventListener('input', () => {
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => renderSearch(searchInput.value.trim()), 100);
    });

    // Skin-tone selector button (bottom-right of footer)
    const skinBtn = el.querySelector('#epSkinBtn');
    if (skinBtn) {
        skinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Use a dummy item with all 5 tones for the skin selector
            const dummyItem = {
                c: '✋',
                s: ['raised_hand'],
                v: SKIN_TONE_ORDER.map(t => ({
                    c: { '1F3FB':'✋🏻','1F3FC':'✋🏼','1F3FD':'✋🏽','1F3FE':'✋🏾','1F3FF':'✋🏿' }[t],
                    t
                }))
            };
            showTonePopover(skinBtn, dummyItem, () => {
                _refreshSkinBtn();
                renderCurrentCategory();
            });
        });
    }

    // Emoji grid — delegation
    const grid = el.querySelector('.ep-grid');

    let _menuOpened = false;

    grid.addEventListener('click', e => {
        if (_menuOpened) {
            _menuOpened = false;
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        const btn = e.target.closest('.ep-emoji-btn');
        if (!btn) return;
        _insertFromBtn(btn);
    });

    grid.addEventListener('contextmenu', e => {
        const btn = e.target.closest('.ep-emoji-btn');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        _menuOpened = true;
        // Reset _menuOpened after a short delay in case no click follows
        setTimeout(() => { _menuOpened = false; }, 500);
        showEmojiContextMenu(e, btn.dataset.emoji, btn.dataset.shortcode);
    });

    // Hover preview
    grid.addEventListener('mouseover', e => {
        const btn = e.target.closest('.ep-emoji-btn');
        if (!btn) return;
        el.querySelector('.ep-preview-emoji').textContent = btn.dataset.emoji;
        el.querySelector('.ep-preview-name').textContent  = ':' + btn.dataset.shortcode + ':';
    });
    grid.addEventListener('mouseleave', () => {
        el.querySelector('.ep-preview-emoji').textContent = '';
        el.querySelector('.ep-preview-name').textContent  = '';
    });

    // Don't stop propagation anymore to allow context menus to close
    // Picker closing is handled by _pickerClose which checks contains()
    
    return el;
}

function showEmojiContextMenu(event, emojiChar, shortcode) {
    if (typeof showContextMenu === 'undefined') return;
    
    event.preventDefault();
    event.stopPropagation();
    
    const isFav = isFavoriteEmoji(emojiChar);
    const isMobile = window.innerWidth <= 900;
    const menu = document.getElementById('contextMenu');
    if (!menu) return;

    const btn = event.target.closest('.ep-emoji-btn');
    const hasVariants = btn?.dataset.hasVariants === 'true';

    let menuContent = '';
    
    if (isMobile) {
        menuContent = `
            <div class="context-menu-drag-handle"></div>
            <div class="context-menu-header" style="padding: 16px; border-bottom: 1px solid #2a2a2a; display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 28px;">${emojiChar}</span>
                <span style="font-size: 14px; font-weight: 600; color: #fff;">:${shortcode}:</span>
            </div>
            <div class="context-menu-item" onclick="handleEmojiFavoriteAction('${emojiChar}', '${shortcode}', ${isFav})">
                <span class="material-symbols-rounded">${isFav ? 'heart_broken' : 'favorite'}</span>
                ${isFav ? 'Remove from Favorites' : 'Add to Favorites'}
            </div>
        `;
        if (hasVariants) {
            menuContent += `
                <div class="context-menu-item" onclick="openTonePopoverFromMenu('${btn.dataset.baseEmoji}')">
                    <span class="material-symbols-rounded">palette</span>
                    Skin Tones
                </div>
            `;
        }
    } else {
        menuContent = `
            <div class="context-menu-item" onclick="handleEmojiFavoriteAction('${emojiChar}', '${shortcode}', ${isFav})">
                <span class="material-symbols-rounded">${isFav ? 'heart_broken' : 'favorite'}</span>
                ${isFav ? 'Unfavorite' : 'Favorite'}
            </div>
            <div class="context-menu-item" onclick="copyEmojiToClipboard('${emojiChar}')">
                <span class="material-symbols-rounded">content_copy</span>
                Copy
            </div>
        `;
        if (hasVariants) {
            menuContent += `
                <div class="context-menu-separator"></div>
                <div class="context-menu-item" onclick="openTonePopoverFromMenu('${btn.dataset.baseEmoji}')">
                    <span class="material-symbols-rounded">palette</span>
                    Skin Tones
                </div>
            `;
        }
    }

    menu.innerHTML = menuContent;

    const overlay = document.getElementById('contextMenuOverlay');
    window.__contextMenuOpenType = 'emoji';
    
    menu.classList.remove('horizontal');
    if (overlay) overlay.classList.remove('horizontal-overlay');

    if (typeof positionContextMenu === 'function') {
        positionContextMenu(event, menu);
    }
    
    menu.classList.add('show');
    if (overlay) overlay.classList.add('active');
    document.body.classList.add('context-menu-open');
}

window.openTonePopoverFromMenu = function(baseEmoji) {
    if (typeof hideContextMenu === 'function') hideContextMenu();
    const picker = buildPicker();
    const grid = picker.querySelector('.ep-grid');
    const btn = Array.from(grid.querySelectorAll('.ep-emoji-btn')).find(b => b.dataset.baseEmoji === baseEmoji);
    if (!btn) return;
    
    const item = EMOJI_DATA && EMOJI_DATA.find(d => d.c === baseEmoji);
    if (!item) return;
    
    setTimeout(() => {
        showTonePopover(btn, item, (emoji) => {
            if (typeof _pickerCallback === 'function') _pickerCallback(emoji);
        });
    }, 100);
};

function _refreshSkinBtn() {
    const btn  = document.getElementById('epSkinBtn');
    if (!btn) return;
    const tone = getStoredTone();
    const toneEmojis = { '1F3FB':'✋🏻','1F3FC':'✋🏼','1F3FD':'✋🏽','1F3FE':'✋🏾','1F3FF':'✋🏿' };
    btn.textContent = tone ? (toneEmojis[tone] || '✋') : '✋';
    btn.title = tone ? ('Skin tone: ' + SKIN_TONE_LABELS[tone]) : 'Choose default skin tone';
}

function _insertFromBtn(btn) {
    const char      = btn.dataset.emoji;
    const shortcode = btn.dataset.shortcode;
    addRecentEmoji(char, shortcode);
    if (typeof _pickerCallback === 'function') _pickerCallback(char);
}

function renderGrid(items) {
    // items: EMOJI_DATA entries or recent-cache entries {c, s:[]}
    const grid = _pickerEl.querySelector('.ep-grid');
    if (!items || items.length === 0) {
        grid.innerHTML = '<div class="ep-empty">No emojis found</div>';
        return;
    }
    grid.innerHTML = items.map(item => {
        const resolved  = resolveEmoji(item);
        const sc        = Array.isArray(item.s) ? item.s[0] : (item.s || '');
        const hasVar    = item.v && item.v.length > 0;
        return `<button class="ep-emoji-btn${hasVar ? ' has-variants' : ''}"
                        data-emoji="${resolved}"
                        data-base-emoji="${item.c}"
                        data-shortcode="${sc}"
                        ${hasVar ? 'data-has-variants="1"' : ''}
                        title=":${sc}:"
                        aria-label=":${sc}:"
                        role="option">${resolved}</button>`;
    }).join('');
    grid.scrollTop = 0;
}

let _currentItems = [];

function renderCurrentCategory() {
    if (_activeCategory === 'recent') {
        renderGrid(getRecentEmojis());
    } else if (_activeCategory === 'favorites') {
        renderGrid(getFavoriteEmojis());
    } else {
        renderGrid(getCatMap()[_activeCategory] || []);
    }
}

function setPickerCategory(catId) {
    _activeCategory = catId;
    _pickerEl.querySelectorAll('.ep-cat-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.cat === catId)
    );
    _pickerEl.querySelector('.ep-search').value = '';
    renderCurrentCategory();
}

function renderSearch(query) {
    if (!query) { setPickerCategory(_activeCategory); return; }
    _pickerEl.querySelectorAll('.ep-cat-btn').forEach(b => b.classList.remove('active'));
    const lq = query.toLowerCase();
    const results = (typeof EMOJI_DATA !== 'undefined' ? EMOJI_DATA : [])
        .filter(item => item.s.some(sc => sc.includes(lq)))
        .slice(0, 200);
    renderGrid(results);
}

// ── Public API ────────────────────────────────────────────────────────────────

function openEmojiPicker(triggerEl, callback) {
    const picker = buildPicker();
    _pickerCallback = callback;
    _selectedTone   = getStoredTone();
    positionPicker(picker, triggerEl);
    picker.classList.add('visible');
    document.body.classList.add('emoji-picker-open');
    setPickerCategory(_activeCategory);
    _refreshSkinBtn();

    if (_pickerClose) document.removeEventListener('mousedown', _pickerClose);
    _pickerClose = (e) => {
        // Don't close the picker when interacting with the context menu or its overlay
        const ctxMenu    = document.getElementById('contextMenu');
        const ctxOverlay = document.getElementById('contextMenuOverlay');
        if (ctxMenu    && ctxMenu.contains(e.target))    return;
        if (ctxOverlay && ctxOverlay.contains(e.target)) return;
        if (!picker.contains(e.target) && !triggerEl.contains(e.target)) closeEmojiPicker();
    };
    setTimeout(() => document.addEventListener('mousedown', _pickerClose), 0);

    // Mobile-specific behavior
    const isMobile = window.innerWidth <= 900;
    if (isMobile) {
        // Close native keyboard
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
            document.activeElement.blur();
        }
    } else {
        // Auto-focus search on desktop only
        setTimeout(() => picker.querySelector('.ep-search')?.focus(), 60);
    }
}

function closeEmojiPicker() {
    if (_pickerEl) {
        _pickerEl.classList.remove('visible');
        document.body.classList.remove('emoji-picker-open');
    }
    hideTonePopover();
    if (_pickerClose) { document.removeEventListener('mousedown', _pickerClose); _pickerClose = null; }
}

function toggleEmojiPicker(triggerEl, callback) {
    const picker = buildPicker();
    if (picker.classList.contains('visible')) {
        closeEmojiPicker();
        return false;
    } else {
        openEmojiPicker(triggerEl, callback);
        return true;
    }
}

function positionPicker(picker, triggerEl) {
    const W = 352, H = 452, M = 8;
    const r  = triggerEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top  = r.top - H - M > 0 ? r.top - H - M : r.bottom + M;
    let left = r.right - W;

    if (left < M)          left = M;
    if (left + W > vw - M) left = vw - W - M;
    if (top  + H > vh - M) top  = vh - H - M;
    if (top  < M)          top  = M;

    picker.style.top  = top  + 'px';
    picker.style.left = left + 'px';
}
