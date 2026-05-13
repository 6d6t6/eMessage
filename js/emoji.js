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

    // 1. Initial pass for basic shortcodes and tone-suffixed ones (e.g. :wave_tone3:)
    let replaced = text.replace(/:([a-zA-Z0-9_+\-]+):/g, (match, code) => {
        if (EMOJI_MAP[code]) return EMOJI_MAP[code];

        // Handle _toneN suffixes dynamically
        if (code.includes('_tone')) {
            const parts = code.split('_tone');
            const base = parts[0];
            const toneNum = parts[1];
            const baseChar = EMOJI_MAP[base];
            if (baseChar) {
                const item = (typeof EMOJI_DATA !== 'undefined' ? EMOJI_DATA : []).find(d => d.c === baseChar);
                if (item && item.v) {
                    const toneSuffix = '_tone' + toneNum;
                    const targetTone = Object.keys(TONE_SUFFIX).find(t => TONE_SUFFIX[t] === toneSuffix);
                    const variant = item.v.find(v => v.t === targetTone);
                    if (variant) return variant.c;
                }
            }
        }
        return match;
    });

    // 2. Handle the pattern :emoji::skin-tone-N: (or EmojiChar + ModifierChar)
    // We use our lookup map to find the correct variant character from EMOJI_DATA
    const lookup = _getEmojiLookupMap();
    const modifierMap = { '\u{1F3FB}': '1F3FB', '\u{1F3FC}': '1F3FC', '\u{1F3FD}': '1F3FD', '\u{1F3FE}': '1F3FE', '\u{1F3FF}': '1F3FF' };

    replaced = replaced.replace(/(\p{Extended_Pictographic}(?:\uFE0F|\u200d\p{Extended_Pictographic})*)([\u{1F3FB}-\u{1F3FF}])/gu, (match, base, modifier) => {
        const tone = modifierMap[modifier];
        const normalized = base.replace(/\uFE0F/g, '');
        const entry = lookup.get(base) || lookup.get(normalized);

        if (entry && entry.item && entry.item.v) {
            // Find the variant that matches this tone
            const variant = entry.item.v.find(v => v.t === tone);
            if (variant) return variant.c;
        }

        // Fallback: just append if not found in our data
        return base + modifier;
    });

    return replaced;
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
        const end = el.selectionEnd;
        const diff = original.length - replaced.length;
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

// ── Regional Indicators (Letter Blocks) ──────────────────────────────────────

function injectRegionalIndicators() {
    if (typeof EMOJI_DATA === 'undefined' || typeof EMOJI_MAP === 'undefined') return;
    if (EMOJI_MAP['regional_indicator_a']) return; // Already injected

    for (let i = 0; i < 26; i++) {
        const char = String.fromCodePoint(0x1F1E6 + i);
        const letter = String.fromCharCode(97 + i);
        const shortcode = `regional_indicator_${letter}`;

        EMOJI_DATA.push({
            c: char,
            s: [shortcode],
            k: 'Symbols'
        });
        EMOJI_MAP[shortcode] = char;
    }
}

injectRegionalIndicators();

// ── Skin-tone state ───────────────────────────────────────────────────────────

const SKIN_TONE_ORDER = ['1F3FB', '1F3FC', '1F3FD', '1F3FE', '1F3FF'];
const SKIN_TONE_LABELS = {
    '1F3FB': 'Light',
    '1F3FC': 'Medium-Light',
    '1F3FD': 'Medium',
    '1F3FE': 'Medium-Dark',
    '1F3FF': 'Dark',
};

// Shortcode suffix for each skin tone codepoint (Discord-style _toneN)
const TONE_SUFFIX = {
    '1F3FB': '_tone1',
    '1F3FC': '_tone2',
    '1F3FD': '_tone3',
    '1F3FE': '_tone4',
    '1F3FF': '_tone5',
};

// Build a full shortcode for a toned variant: 'muscle' + '1F3FD' → 'muscle_tone3'
// For multi-tone emojis: 'handshake' + '1F3FB,1F3FF' → 'handshake_tone1_tone5'
function toneShortcode(base, tone) {
    if (!tone) return base;
    return base + tone.split(',').map(t => TONE_SUFFIX[t] || '').join('');
}

let _selectedTone = null; // null = default (yellow)

function getStoredTone() {
    return localStorage.getItem('emessage_skin_tone') || null;
}
function setStoredTone(tone) {
    if (tone) localStorage.setItem('emessage_skin_tone', tone);
    else localStorage.removeItem('emessage_skin_tone');
    _selectedTone = tone;
}

function getEmojiTone(baseChar) {
    try {
        const tones = JSON.parse(localStorage.getItem('emessage_individual_tones') || '{}');
        return tones[baseChar] || null;
    } catch { return null; }
}
function setEmojiTone(baseChar, tone) {
    try {
        const tones = JSON.parse(localStorage.getItem('emessage_individual_tones') || '{}');
        // Store 'default' explicitly so resolveEmoji knows not to fall back to global
        tones[baseChar] = tone || 'default';
        localStorage.setItem('emessage_individual_tones', JSON.stringify(tones));
    } catch { }
}
function clearIndividualTones() {
    localStorage.removeItem('emessage_individual_tones');
}

// Inject skin-tone shortcodes into EMOJI_MAP for :skin-tone-N: support
if (typeof EMOJI_MAP !== 'undefined') {
    EMOJI_MAP['skin-tone-1'] = '\u{1F3FB}';
    EMOJI_MAP['skin-tone-2'] = '\u{1F3FC}';
    EMOJI_MAP['skin-tone-3'] = '\u{1F3FD}';
    EMOJI_MAP['skin-tone-4'] = '\u{1F3FE}';
    EMOJI_MAP['skin-tone-5'] = '\u{1F3FF}';
}

function resolveEmoji(item) {
    // Return the best char for an item given current skin-tone preference
    // Prioritize individual emoji preference, then global preference.
    let tone = getEmojiTone(item.c);
    if (tone === null) tone = _selectedTone || getStoredTone();

    if (tone && tone !== 'default' && item.v && item.v.length > 0) {
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

window.handleEmojiFavoriteAction = function (char, shortcode, currentlyFav) {
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

window.copyEmojiToClipboard = function (char) {
    navigator.clipboard.writeText(char).then(() => {
        showNotification('Emoji copied to clipboard', 'success');
    });
    if (typeof hideContextMenu === 'function') hideContextMenu();
};

const EMOJI_CATEGORIES = [
    { id: 'recent', label: 'Recently Used', icon: 'history' },
    { id: 'favorites', label: 'Favorites', icon: 'favorite' },
    { id: 'smileys', label: 'Smileys & People', icon: 'sentiment_satisfied' },
    { id: 'nature', label: 'Animals & Nature', icon: 'park' },
    { id: 'food', label: 'Food & Drink', icon: 'lunch_dining' },
    { id: 'activities', label: 'Activities', icon: 'sports_esports' },
    { id: 'travel', label: 'Travel & Places', icon: 'pedal_bike' },
    { id: 'objects', label: 'Objects', icon: 'emoji_objects' },
    { id: 'symbols', label: 'Symbols', icon: 'interests' },
    { id: 'flags', label: 'Flags', icon: 'flag' },
];

// ── Recent emojis ─────────────────────────────────────────────────────────────

const RECENT_KEY = 'emessage_recent_emojis';
const MAX_RECENT = 40;

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
        'Food & Drink': 'food',
        'Activities': 'activities',
        'Travel & Places': 'travel',
        'Objects': 'objects',
        'Symbols': 'symbols',
        'Flags': 'flags'
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
let _toneTarget = null;     // the emoji-btn that was long-pressed / right-clicked
let _tonePopClose = null;    // closer listener for the popover

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
    el.addEventListener('click', e => e.stopPropagation());
    return el;
}

function showTonePopover(anchorBtn, baseItem, onChoose, isHolding = false) {
    const pop = buildTonePopover();
    _toneTarget = anchorBtn;

    const isMulti = baseItem.v && baseItem.v.some(v => v.t.includes(','));
    pop.classList.toggle('multi-tone', isMulti);

    const baseShortcode = Array.isArray(baseItem.s) ? baseItem.s[0] : (baseItem.s || '');
    const options = [{ label: 'Default', char: baseItem.c, tone: null, isDefault: true, shortcode: baseShortcode }];

    if (baseItem.v) {
        if (isMulti) {
            // For multi-tone, just add all 25 variants.
            baseItem.v.forEach(v => {
                options.push({ label: 'Mixed Tone', char: v.c, tone: v.t, shortcode: toneShortcode(baseShortcode, v.t) });
            });
        } else {
            SKIN_TONE_ORDER.forEach(t => {
                const v = baseItem.v.find(x => x.t === t);
                if (v) options.push({ label: SKIN_TONE_LABELS[t], char: v.c, tone: t, shortcode: toneShortcode(baseShortcode, t) });
            });
        }
    }

    // Determine which tone should be highlighted as 'active'.
    let activeTone = _selectedTone || getStoredTone();
    const isFooterBtn = anchorBtn && anchorBtn.id === 'epSkinBtn';
    if (!isFooterBtn) {
        const individual = getEmojiTone(baseItem.c);
        if (individual !== null) {
            activeTone = (individual === 'default' ? null : individual);
        }
    }

    pop.innerHTML = options.map(o => {
        let active = false;
        if (isMulti && o.tone === activeTone) active = true;
        else if (isMulti && activeTone && o.tone === `${activeTone},${activeTone}`) active = true;
        else if (!isMulti && o.tone === activeTone) active = true;

        return `<button class="ep-tone-btn${active ? ' active' : ''}${o.isDefault ? ' default' : ''}"
                 data-tone="${o.tone || ''}"
                 data-emoji="${o.char}"
                 data-shortcode="${o.shortcode}"
                 title="${o.label}"
                 aria-label="${o.label}">${o.char}</button>`;
    }).join('');

    // Position near anchor
    const r = anchorBtn.getBoundingClientRect();
    const pw = isMulti ? 202 : (options.length * 38 + 8);
    const ph = isMulti ? 240 : 46;

    let left = r.left + r.width / 2 - pw / 2;
    if (left < 8) left = 8;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    const top = r.top - ph - 6;

    pop.style.left = left + 'px';
    pop.style.top = (top < 8 ? r.bottom + 8 : top) + 'px';
    pop.style.minWidth = pw + 'px';
    pop.classList.add('visible');

    const handleSelection = (btn) => {
        const tone = btn.dataset.tone || null;
        const emoji = btn.dataset.emoji;

        if (isFooterBtn) {
            setStoredTone(tone);
            clearIndividualTones();
            _refreshSkinBtn();
        } else {
            const baseEmoji = baseItem.c;
            if (baseEmoji) setEmojiTone(baseEmoji, tone);
        }

        hideTonePopover();

        const _grid = _pickerEl && _pickerEl.querySelector('.ep-grid');
        const _savedScroll = _grid ? _grid.scrollTop : 0;
        renderCurrentCategory();
        if (_grid) _grid.scrollTop = _savedScroll;

        onChoose(emoji);
        addRecentEmoji(emoji, btn.dataset.shortcode);
    };

    pop.onclick = (e) => {
        const btn = e.target.closest('.ep-tone-btn');
        if (btn) handleSelection(btn);
    };

    if (isHolding) {
        const onPointerMove = (e) => {
            const target = document.elementFromPoint(e.clientX, e.clientY);
            const btn = target ? target.closest('.ep-tone-btn') : null;
            pop.querySelectorAll('.ep-tone-btn').forEach(b => b.classList.toggle('sliding-over', b === btn));
        };
        const cleanup = () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', cleanup);
        };
        const onPointerUp = (e) => {
            const target = document.elementFromPoint(e.clientX, e.clientY);
            const btn = target ? target.closest('.ep-tone-btn') : null;
            cleanup();
            if (btn) handleSelection(btn);
        };
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', cleanup);
    }

    // Desktop right-click or mobile long-press on a tone button → context menu
    // for that specific variant.  We re-attach each time the popover is rebuilt.
    pop.oncontextmenu = (e) => {
        const btn = e.target.closest('.ep-tone-btn');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const emoji = btn.dataset.emoji;
        // data-shortcode holds e.g. 'muscle_tone3'; fall back to bare emoji char
        const shortcode = btn.dataset.shortcode || emoji;
        showEmojiContextMenu(e, emoji, shortcode);
    };

    // Close on outside click / tap
    if (_tonePopClose) document.removeEventListener('mousedown', _tonePopClose);
    _tonePopClose = (e) => {
        const ctxMenu = document.getElementById('contextMenu');
        const ctxOverlay = document.getElementById('contextMenuOverlay');
        const tonePop = document.getElementById('emojiTonePopover');

        // Don't close if interacting with the context menu or its overlay
        if (ctxMenu && ctxMenu.contains(e.target)) return;
        if (ctxOverlay && ctxOverlay.contains(e.target)) return;

        // Don't close if clicking inside the popover itself (handled by its own listeners)
        if (tonePop && tonePop.contains(e.target)) return;

        // If clicking anywhere else, close the popover
        hideTonePopover();
    };
    setTimeout(() => {
        document.addEventListener('mousedown', _tonePopClose);
    }, 0);
}

function hideTonePopover() {
    if (_tonePopover) _tonePopover.classList.remove('visible');
    _toneTarget = null;
    if (_tonePopClose) {
        document.removeEventListener('mousedown', _tonePopClose);
        _tonePopClose = null;
    }
}

// ── Picker singleton ──────────────────────────────────────────────────────────

let _pickerEl = null;
let _pickerCallback = null;
let _pickerClose = null;
let _activeCategory = 'recent';
let _searchTimer = null;

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
        let _holdTimer = null;
        let _holdOrigin = { x: 0, y: 0 };
        const HOLD_MS = 300; // faster for skin btn
        const dummyItem = {
            c: '✋',
            s: ['raised_hand'],
            v: SKIN_TONE_ORDER.map(t => ({
                c: { '1F3FB': '✋🏻', '1F3FC': '✋🏼', '1F3FD': '✋🏽', '1F3FE': '✋🏾', '1F3FF': '✋🏿' }[t],
                t
            }))
        };

        const startHold = (e) => {
            if (e.button && e.button !== 0) return;
            _holdOrigin = { x: e.clientX, y: e.clientY };
            skinBtn.style.touchAction = 'none';
            _holdTimer = setTimeout(() => {
                _holdTimer = null;
                _menuOpened = true; // suppress upcoming click
                setTimeout(() => _menuOpened = false, 500);
                showTonePopover(skinBtn, dummyItem, () => { }, true);
            }, HOLD_MS);
        };
        const cancelHold = () => {
            if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = null; }
            skinBtn.style.touchAction = '';
        };

        skinBtn.addEventListener('pointerdown', startHold);
        window.addEventListener('pointerup', cancelHold);
        window.addEventListener('pointercancel', cancelHold);
        window.addEventListener('pointermove', (e) => {
            if (!_holdTimer) return;
            if (Math.abs(e.clientX - _holdOrigin.x) > 10 || Math.abs(e.clientY - _holdOrigin.y) > 10) cancelHold();
        });

        skinBtn.addEventListener('click', (e) => {
            if (_menuOpened) return;
            e.stopPropagation();
            showTonePopover(skinBtn, dummyItem, () => { });
        });
    }

    // Emoji grid — delegation
    const grid = el.querySelector('.ep-grid');

    let _menuOpened = false;

    // ── Unified hold-and-slide logic for variants ─────────────
    let _holdTimer = null;
    let _holdOrigin = { x: 0, y: 0 };
    const HOLD_MS = 450;
    const HOLD_MOVE_THRESHOLD = 10;

    grid.addEventListener('pointerdown', e => {
        if (e.button && e.button !== 0) return;
        const btn = e.target.closest('.ep-emoji-btn');
        if (!btn || btn.dataset.hasVariants !== '1') return;

        _holdOrigin = { x: e.clientX, y: e.clientY };
        grid.style.touchAction = 'none';
        _holdTimer = setTimeout(() => {
            _holdTimer = null;
            _menuOpened = true;
            setTimeout(() => { _menuOpened = false; }, 600);

            const baseEmoji = btn.dataset.baseEmoji;
            const item = typeof EMOJI_DATA !== 'undefined'
                ? EMOJI_DATA.find(d => d.c === baseEmoji)
                : null;
            if (item) {
                showTonePopover(btn, item, (emoji) => {
                    if (typeof _pickerCallback === 'function') _pickerCallback(emoji);
                }, true);
            }
        }, HOLD_MS);
    });

    const _cancelHold = () => {
        if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = null; }
        grid.style.touchAction = '';
    };
    window.addEventListener('pointerup', _cancelHold);
    window.addEventListener('pointercancel', _cancelHold);
    window.addEventListener('pointermove', e => {
        if (!_holdTimer) return;
        const dx = e.clientX - _holdOrigin.x;
        const dy = e.clientY - _holdOrigin.y;
        if (Math.sqrt(dx * dx + dy * dy) > HOLD_MOVE_THRESHOLD) _cancelHold();
    });

    // Stop scrolling if we are in the middle of a hold or the popover is open
    grid.addEventListener('touchmove', e => {
        if (_holdTimer || (_tonePopover && _tonePopover.classList.contains('visible'))) {
            e.preventDefault();
        }
    }, { passive: false });

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

        const isMobile = window.innerWidth <= 900;
        const hasVariants = btn.dataset.hasVariants === '1';

        // On mobile, variant emojis should ONLY open the popover (via the hold timer).
        // The context menu for them is only accessible from the popover variants.
        if (isMobile && hasVariants) return;

        showEmojiContextMenu(e, btn.dataset.emoji, btn.dataset.shortcode);
    });

    // Hover preview
    grid.addEventListener('mouseover', e => {
        const btn = e.target.closest('.ep-emoji-btn');
        if (!btn) return;
        el.querySelector('.ep-preview-emoji').textContent = btn.dataset.emoji;
        el.querySelector('.ep-preview-name').textContent = ':' + btn.dataset.shortcode + ':';
    });
    grid.addEventListener('mouseleave', () => {
        el.querySelector('.ep-preview-emoji').textContent = '';
        el.querySelector('.ep-preview-name').textContent = '';
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

window.openTonePopoverFromMenu = function (baseEmoji) {
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
    const btn = document.getElementById('epSkinBtn');
    if (!btn) return;
    const tone = getStoredTone();
    const toneEmojis = { '1F3FB': '✋🏻', '1F3FC': '✋🏼', '1F3FD': '✋🏽', '1F3FE': '✋🏾', '1F3FF': '✋🏿' };
    btn.textContent = tone ? (toneEmojis[tone] || '✋') : '✋';
    btn.title = tone ? ('Skin tone: ' + SKIN_TONE_LABELS[tone]) : 'Choose default skin tone';
}

function _insertFromBtn(btn) {
    const char = btn.dataset.emoji;
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
        const resolved = resolveEmoji(item);
        const sc = Array.isArray(item.s) ? item.s[0] : (item.s || '');
        const hasVar = item.v && item.v.length > 0;
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
    _selectedTone = getStoredTone();
    positionPicker(picker, triggerEl);
    picker.classList.add('visible');
    document.body.classList.add('emoji-picker-open');
    setPickerCategory(_activeCategory);
    _refreshSkinBtn();

    if (_pickerClose) document.removeEventListener('mousedown', _pickerClose);
    _pickerClose = (e) => {
        // Don't close the picker when interacting with the context menu, its overlay,
        // or the skin-tone popover (which lives outside the picker DOM).
        const ctxMenu = document.getElementById('contextMenu');
        const ctxOverlay = document.getElementById('contextMenuOverlay');
        const tonePop = document.getElementById('emojiTonePopover');
        if (ctxMenu && ctxMenu.contains(e.target)) return;
        if (ctxOverlay && ctxOverlay.contains(e.target)) return;
        if (tonePop && tonePop.contains(e.target)) return;
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
    const r = triggerEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = r.top - H - M > 0 ? r.top - H - M : r.bottom + M;
    let left = r.right - W;

    if (left < M) left = M;
    if (left + W > vw - M) left = vw - W - M;
    if (top + H > vh - M) top = vh - H - M;
    if (top < M) top = M;

    picker.style.top = top + 'px';
    picker.style.left = left + 'px';
}

// ── Emoji Details (for Chat Messages) ────────────────────────────────────────

let _emojiMatchRegex = null;
let _emojiLookupMap = null;
let _detailsCloseHandler = null;
let _activeDetailsTarget = null;

function _getEmojiLookupMap() {
    if (_emojiLookupMap) return _emojiLookupMap;
    _emojiLookupMap = new Map();
    const data = (typeof EMOJI_DATA !== 'undefined' ? EMOJI_DATA : []);
    data.forEach(item => {
        const baseShortcode = item.s[0];
        const entry = { item, shortcode: baseShortcode };

        // Map base character
        const normalized = item.c.replace(/\uFE0F/g, '');
        if (!_emojiLookupMap.has(item.c)) _emojiLookupMap.set(item.c, entry);
        if (!_emojiLookupMap.has(normalized)) _emojiLookupMap.set(normalized, entry);

        // Map all variants (skin tones, etc.) with specific tone shortcodes
        if (item.v && Array.isArray(item.v)) {
            item.v.forEach(v => {
                const vShortcode = toneShortcode(baseShortcode, v.t);
                const vEntry = { item, shortcode: vShortcode };
                const vNorm = v.c.replace(/\uFE0F/g, '');

                if (!_emojiLookupMap.has(v.c)) _emojiLookupMap.set(v.c, vEntry);
                if (!_emojiLookupMap.has(vNorm)) _emojiLookupMap.set(vNorm, vEntry);
            });
        }
    });
    return _emojiLookupMap;
}

function _getEmojiMatchRegex() {
    // This regex matches any emoji sequence (including ZWJ, skin tones, and variation selectors).
    // It is much more robust than matching against a fixed list of characters and ensures
    // that complex sequences like families or skin-toned variants stay joined.
    return /(\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200d\p{Extended_Pictographic})*)/gu;
}

/**
 * Prepares chat message content: escapes HTML, replaces shortcodes, 
 * and wraps all emojis in interactive spans.
 */
function formatMessageContent(text) {
    if (!text) return '';
    // 1. Escape HTML (standard utility)
    let content = typeof escapeHtml === 'function' ? escapeHtml(text) : text;

    // 2. Expand shortcodes (e.g. :smile: -> 😀)
    content = replaceShortcodes(content);

    // 2. Wrap all unicode emojis in interactive spans
    const re = /(\p{Regional_Indicator}+|\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200d\p{Extended_Pictographic})*)/gu;
    const lookup = _getEmojiLookupMap();

    let actualEmojiCount = 0;
    let formatted = content.replace(re, (match) => {
        const cp = match.codePointAt(0);
        if (cp >= 0x1F1E6 && cp <= 0x1F1FF) {
            // Process Regional Indicators
            let output = "";
            let i = 0;
            const chars = Array.from(match);
            while (i < chars.length) {
                const pair = (chars[i] || '') + (chars[i + 1] || '');
                const entry = pair.length === 4 ? (lookup.get(pair) || lookup.get(pair.replace(/\uFE0F/g, ''))) : null;

                if (entry) {
                    output += `<span class="chat-emoji" data-emoji="${pair}" data-shortcode="${entry.shortcode}">${pair}</span>`;
                    actualEmojiCount++;
                    i += 2;
                } else {
                    const single = chars[i];
                    const sEntry = lookup.get(single) || lookup.get(single.replace(/\uFE0F/g, ''));
                    const sc = sEntry ? sEntry.shortcode : '';
                    output += `<span class="chat-emoji" data-emoji="${single}" data-shortcode="${sc}">${single}</span>`;
                    actualEmojiCount++;
                    i += 1;
                }
            }
            return output;
        }

        actualEmojiCount++;
        const normalized = match.replace(/\uFE0F/g, '');
        const entry = lookup.get(match) || lookup.get(normalized);
        const shortcode = entry ? entry.shortcode : '';
        return `<span class="chat-emoji" data-emoji="${match}" data-shortcode="${shortcode}">${match}</span>`;
    });

    // Check if the message is "emoji only" (only emojis and whitespace, up to 27 emojis)
    const nonEmojiText = content.replace(re, '').trim();
    const isLarge = (nonEmojiText === '' && actualEmojiCount > 0 && actualEmojiCount <= 27);

    if (isLarge) {
        return `<div class="large-emoji-wrapper">${formatted}</div>`;
    }
    return formatted;
}

// ── Emoji Tooltip ────────────────────────────────────────────────────────────

let _tooltipEl = null;

function showEmojiTooltip(target, shortcode) {
    if (!shortcode) return;

    // Don't show tooltips on mobile/touch devices
    if (window.innerWidth <= 900) return;

    // Suppress tooltip only for the specific emoji that currently has a details card open
    if (target === _activeDetailsTarget) return;

    if (!_tooltipEl) {
        _tooltipEl = document.createElement('div');
        _tooltipEl.className = 'emoji-tooltip';
        document.body.appendChild(_tooltipEl);
    }

    _tooltipEl.textContent = `:${shortcode}:`;
    _tooltipEl.classList.add('visible');

    const rect = target.getBoundingClientRect();
    const tw = _tooltipEl.offsetWidth;
    const th = _tooltipEl.offsetHeight;

    let top = rect.top - th - 6;
    let left = rect.left + (rect.width / 2) - (tw / 2);

    if (top < 5) top = rect.bottom + 6;
    if (left < 5) left = 5;
    if (left + tw > window.innerWidth - 5) left = window.innerWidth - tw - 5;

    _tooltipEl.style.top = top + 'px';
    _tooltipEl.style.left = left + 'px';
}

function hideEmojiTooltip() {
    if (_tooltipEl) _tooltipEl.classList.remove('visible');
}

/**
 * Shows details for a clicked emoji in a message.
 */
function showEmojiDetails(e, emojiChar, shortcode) {
    hideEmojiTooltip(); // Close tooltip on click
    _activeDetailsTarget = e.target.closest('.chat-emoji');
    const isMobile = window.innerWidth <= 900;
    if (isMobile) {
        // Reuse existing context menu logic for mobile (action sheet)
        showEmojiContextMenu(e, emojiChar, shortcode);
        return;
    }

    // Desktop: Little floating card
    let card = document.getElementById('emojiDetailsCard');
    if (!card) {
        card = document.createElement('div');
        card.id = 'emojiDetailsCard';
        card.className = 'emoji-details-card';
        document.body.appendChild(card);
    }

    card.innerHTML = `
        <div class="edc-emoji">${emojiChar}</div>
        <div class="edc-name">:${shortcode}:</div>
    `;

    // Temporarily show to calculate dimensions
    card.style.display = 'flex';
    card.style.visibility = 'hidden';
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    card.style.display = '';
    card.style.visibility = '';

    const rect = e.target.getBoundingClientRect();
    let top = rect.top - ch - 8;
    let left = rect.left + (rect.width / 2) - (cw / 2);

    // Boundary check
    if (top < 10) top = rect.bottom + 8;
    if (left < 10) left = 10;
    if (left + cw > window.innerWidth - 10) left = window.innerWidth - cw - 10;

    card.style.top = top + 'px';
    card.style.left = left + 'px';
    card.classList.add('visible');

    // Click outside to close
    if (_detailsCloseHandler) document.removeEventListener('mousedown', _detailsCloseHandler);
    _detailsCloseHandler = (ev) => {
        if (!card.contains(ev.target)) {
            card.classList.remove('visible');
            _activeDetailsTarget = null;
            document.removeEventListener('mousedown', _detailsCloseHandler);
            _detailsCloseHandler = null;
        }
    };
    setTimeout(() => document.addEventListener('mousedown', _detailsCloseHandler), 0);
}

// ── Speech Synthesis Support ────────────────────────────────────────────────

let _supportCanvas = null;
let _supportedEmojiCache = new Map();

/**
 * Checks if the system natively supports (can render) an emoji.
 */
function isEmojiSupported(emoji) {
    if (_supportedEmojiCache.has(emoji)) return _supportedEmojiCache.get(emoji);

    if (!_supportCanvas) {
        _supportCanvas = document.createElement('canvas');
        _supportCanvas.width = 24;
        _supportCanvas.height = 24;
    }
    const ctx = _supportCanvas.getContext('2d', { willReadFrequently: true });
    // Use standard emoji font stack
    ctx.font = '16px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Android Emoji", "EmojiSymbols", sans-serif';
    ctx.textBaseline = 'top';

    // Get "tofu" pixels (rendering a character that definitely doesn't exist)
    ctx.clearRect(0, 0, 24, 24);
    ctx.fillText('\uFFFF', 0, 0);
    const tofuData = ctx.getImageData(0, 0, 24, 24).data;
    const tofuStr = tofuData.toString();

    // Get emoji pixels
    ctx.clearRect(0, 0, 24, 24);
    ctx.fillText(emoji, 0, 0);
    const emojiData = ctx.getImageData(0, 0, 24, 24).data;
    const emojiStr = emojiData.toString();

    // If pixels are identical to tofu, or if it's completely empty, it's unsupported
    const supported = (tofuStr !== emojiStr);
    _supportedEmojiCache.set(emoji, supported);
    return supported;
}

/**
 * Returns a human-friendly name for an emoji, including skin tone descriptions.
 */
function getFriendlyEmojiName(entry, match) {
    if (!entry) return '';
    // Use the specific shortcode we found (which already has _tone if it was a variant)
    const baseShortcode = entry.shortcode || '';
    let name = baseShortcode.split('_tone')[0].replace(/[:_]/g, ' ').trim();

    // Explicitly check for skin tone modifiers in the Unicode sequence
    const toneMatch = match.match(/[\u{1F3FB}-\u{1F3FF}]/u);
    if (toneMatch) {
        const codepoint = toneMatch[0].codePointAt(0).toString(16).toUpperCase();
        const toneLabel = SKIN_TONE_LABELS[codepoint] || '';
        if (toneLabel) {
            name += ` with ${toneLabel.toLowerCase()} skin tone`;
        }
    }

    return name;
}

/**
 * Prepares text for speech synthesis by replacing unsupported emojis 
 * with their human-friendly names as a fallback.
 */
function prepareTextForSpeech(text) {
    if (!text) return '';

    // Expand shortcodes first so we're processing real emojis
    text = replaceShortcodes(text);

    // Match regional indicators (single or pairs) or any pictographic sequence
    const re = /(\p{Regional_Indicator}+|\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200d\p{Extended_Pictographic})*)/gu;
    const lookup = _getEmojiLookupMap();

    return text.replace(re, (match) => {
        const cp = match.codePointAt(0);
        if (cp >= 0x1F1E6 && cp <= 0x1F1FF) {
            let output = "";
            let i = 0;
            const chars = Array.from(match);
            while (i < chars.length) {
                const pair = (chars[i] || '') + (chars[i + 1] || '');
                const entry = pair.length === 4 ? (lookup.get(pair) || lookup.get(pair.replace(/\uFE0F/g, ''))) : null;

                if (entry && isEmojiSupported(pair)) {
                    // Valid flag supported by system
                    output += pair;
                    i += 2;
                } else {
                    // Single letter or unsupported flag pair
                    const char = chars[i];
                    const charCp = char.codePointAt(0);
                    if (charCp && charCp >= 0x1F1E6 && charCp <= 0x1F1FF) {
                        output += " Letter " + String.fromCharCode(65 + (charCp - 0x1F1E6)) + " ";
                    }
                    i += 1;
                }
            }
            return output;
        }

        // If the system knows how to render/speak it, let it use its native name
        if (isEmojiSupported(match)) return match;

        // Fallback to our internal data
        const normalized = match.replace(/\uFE0F/g, '');
        const entry = lookup.get(match) || lookup.get(normalized);
        if (entry) {
            return " " + getFriendlyEmojiName(entry, match) + " ";
        }
        return ''; // Skip if completely unknown
    });
}
