// Context menu functionality for messages
// 
// NESTED SUBMENU SUPPORT:
// The context menu system supports unlimited nesting levels. To create nested submenus:
// 1. Add 'has-submenu' class to any .context-menu-item
// 2. Add a .context-submenu div inside the item
// 3. Add .context-menu-item elements inside the submenu
// 4. For deeper nesting, add 'has-submenu' to any submenu item
// 
// Example structure:
// <div class="context-menu-item has-submenu">
//     <span class="material-symbols-rounded">icon</span>
//     Menu Text
//     <span class="material-symbols-rounded submenu-arrow">chevron_right</span>
//     <div class="context-submenu">
//         <div class="context-menu-item" onclick="yourFunction()">Option</div>
//     </div>
// </div>

// Global variables for context menu
let contextMenu = null;
let currentContextMessage = null;
let currentContextEvent = null;
let currentContextConversation = null;
let currentContextPubkey = null;
let currentlySpeakingMessageId = null; // Track which message is being spoken
let contextMenuTarget = null; // Track the element that was right-clicked

// Initialize context menu functionality
function initContextMenu() {
    contextMenu = document.getElementById('contextMenu');
    
    // Hide context menu when clicking outside
    document.addEventListener('click', hideContextMenu);
    
    // Prevent context menu from closing when clicking inside it
    contextMenu.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Prevent default context menu on the entire app and manage open state
    document.addEventListener('contextmenu', (e) => {
        const eligible = isEligibleContextTarget(e.target);
        // Always prevent default system context menu
        e.preventDefault();
        
        // Close any open custom menu first (before target listeners)
        hideContextMenu();
        
        // If eligible, the specific target handler will handle showing the new menu
        // via its own contextmenu listener (on the target element)
    }, true);

    // Hide on resize or scroll anywhere
    window.addEventListener('resize', hideContextMenu);
    document.addEventListener('scroll', hideContextMenu, true);

    // Hide editable menus on any key press
    document.addEventListener('keydown', () => {
        if (window.__contextMenuOpenType === 'editable') {
            hideContextMenu();
        }
    }, true);
}
 
// Determine if a right-click target is eligible for a custom menu
function isEligibleContextTarget(target) {
    return !!(
        target.closest('.message') ||
        target.closest('.conversation-item') ||
        target.closest('#publicKeyDisplay') ||
        target.closest('#privateKeyDisplay') ||
        target.closest('#profileNpub') ||
        target.closest('#chatTitle') ||
        target.closest('.message-avatar') ||
        target.closest('.profile-avatar') ||
        target.closest('.conversation-avatar') ||
        isEditableTarget(target)
    );
}

function isEditableTarget(target) {
    if (!target) return false;
    if (target.closest('textarea')) return true;
    if (target.closest('input')) {
        const input = target.closest('input');
        return input && ['text','search','url','tel','password','email','number'].includes(input.type || 'text');
    }
    const editable = target.closest('[contenteditable=""], [contenteditable="true"]');
    return !!editable;
}

// Build and show editable context menu
async function showEditableContextMenu(event, target) {
    const menu = document.getElementById('contextMenu');
    if (!menu) return;

    // Resolve the actual control
    const el = target.closest('textarea') || target.closest('input') || target.closest('[contenteditable]');
    if (!el) return;

    // Handle word selection on right-click if no text is currently selected
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (range.collapsed) {
            // Check if we're clicking on actual text content
            const clickedElement = event.target;
            const isClickingOnText = clickedElement.nodeType === Node.TEXT_NODE || 
                                   clickedElement.classList.contains('message-bubble') ||
                                   clickedElement.closest('.message-bubble') ||
                                   clickedElement === el ||
                                   clickedElement.closest('input, textarea, [contenteditable]');
            
            if (isClickingOnText) {
                // Handle word selection for different element types
                if (el.selectionStart !== undefined && el.selectionEnd !== undefined) {
                    // Input/textarea element - check if we have a selection first
                    const hasSelection = el.selectionStart !== el.selectionEnd;
                    if (!hasSelection) {
                        const text = el.value || '';
                        const clickOffset = el.selectionStart;
                        
                        // Don't select word if clicking at the very end of text or on whitespace
                        if (clickOffset >= text.length || /\s/.test(text[clickOffset])) {
                            // Don't select anything - just show the context menu
                        } else {
                            // Find word boundaries
                            let wordStart = clickOffset;
                            let wordEnd = clickOffset;
                            
                            while (wordStart > 0 && /\S/.test(text[wordStart - 1])) {
                                wordStart--;
                            }
                            while (wordEnd < text.length && /\S/.test(text[wordEnd])) {
                                wordEnd++;
                            }
                            
                            if (wordStart < wordEnd) {
                                el.setSelectionRange(wordStart, wordEnd);
                            }
                        }
                    }
                } else {
                    // Contenteditable or text node - use same logic as messages
                    if (clickedElement.nodeType === Node.TEXT_NODE) {
                        const textContent = clickedElement.textContent;
                        const clickOffset = range.startOffset;
                        
                        // Don't select word if clicking at the very end of text or on whitespace
                        if (clickOffset >= textContent.length || /\s/.test(textContent[clickOffset])) {
                            // Don't select anything - just show the context menu
                        } else {
                            // Only try to select word if we're clicking on actual text content
                            const wordRange = getWordRange(range);
                            if (wordRange) {
                                selection.removeAllRanges();
                                selection.addRange(wordRange);
                            }
                        }
                    } else {
                        // For non-text nodes, check if the click is within actual text content
                        const textRange = document.createRange();
                        textRange.selectNodeContents(clickedElement);
                        const textContent = textRange.toString().trim();
                        
                        if (textContent.length > 0) {
                            // Only try to select word if we're clicking on actual text content
                            const wordRange = getWordRange(range);
                            if (wordRange) {
                                selection.removeAllRanges();
                                selection.addRange(wordRange);
                            }
                        }
                    }
                }
            }
        }
    }

    const isTextControl = (el.selectionStart !== undefined && el.selectionEnd !== undefined);
    let selectionText = '';
    let selStart = null, selEnd = null;
    if (isTextControl) {
        selStart = el.selectionStart;
        selEnd = el.selectionEnd;
        selectionText = el.value?.substring(selStart, selEnd) || '';
        // Save selection for later use (menu click blurs input)
        window.__editableSelection = { start: selStart, end: selEnd, isTextControl: true };
        window.__editableRange = null;
    } else {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
            const range = sel.getRangeAt(0).cloneRange();
            selectionText = sel.toString();
            window.__editableRange = range;
        } else {
            window.__editableRange = null;
        }
        window.__editableSelection = { isTextControl: false };
    }

    const canCut = !el.readOnly && !el.disabled && !!selectionText;
    const canCopy = !!selectionText;

    // Detect paste support
    let canPaste = false;
    try {
        if (navigator.clipboard && navigator.clipboard.readText) {
            canPaste = true;
        }
    } catch (_) {}

    menu.innerHTML = `
        <div class="context-menu-item ${canCut ? '' : 'disabled'}" onclick="cutFromEditable()">
            <span class="material-symbols-rounded">content_cut</span>
            Cut
        </div>
        <div class="context-menu-item ${canCopy ? '' : 'disabled'}" onclick="copyFromEditable()">
            <span class="material-symbols-rounded">content_copy</span>
            Copy
        </div>
        <div class="context-menu-item ${canPaste ? '' : 'disabled'}" onclick="pasteIntoEditable()">
            <span class="material-symbols-rounded">content_paste</span>
            Paste
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" onclick="selectAllEditable()">
            <span class="material-symbols-rounded">select_all</span>
            Select All
        </div>
    `;

    // Remember current editable element globally
    window.__currentEditableEl = el;

    positionContextMenu(event, menu);
    window.__contextMenuOpenType = 'editable';
    menu.classList.add('show');
}

// Editable actions
function focusEditable() {
    const el = window.__currentEditableEl;
    if (!el) return false;
    el.focus({ preventScroll: true });
    return true;
}

function cutFromEditable() {
    const el = window.__currentEditableEl;
    if (!el || el.readOnly || el.disabled) { hideContextMenu(); return; }
    copyFromEditable(true);
}

function copyFromEditable(andDeleteSelection = false) {
    const el = window.__currentEditableEl;
    if (!el) { hideContextMenu(); return; }
    focusEditable();

    const saved = window.__editableSelection || {};
    let start, end, text = '';

    if (el.selectionStart !== undefined && el.selectionEnd !== undefined) {
        // Restore saved selection if present
        if (saved.isTextControl && typeof saved.start === 'number' && typeof saved.end === 'number') {
            start = saved.start; end = saved.end;
        } else {
            start = el.selectionStart; end = el.selectionEnd;
        }
        text = el.value?.substring(start, end) || '';
    } else {
        // contenteditable
        const sel = window.getSelection();
        let range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
        if (window.__editableRange) {
            range = window.__editableRange.cloneRange();
            sel.removeAllRanges(); sel.addRange(range);
        }
        text = sel ? sel.toString() : '';
    }

    if (!text) { hideContextMenu(); return; }

    navigator.clipboard.writeText(text).then(() => {
        if (andDeleteSelection) {
            if (el.selectionStart !== undefined && el.selectionEnd !== undefined) {
                el.setSelectionRange(start, end);
                el.setRangeText('', start, end, 'start');
                const inputEvent = new Event('input', { bubbles: true });
                el.dispatchEvent(inputEvent);
            } else if (window.__editableRange) {
                const sel = window.getSelection();
                const range = window.__editableRange.cloneRange();
                sel.removeAllRanges(); sel.addRange(range);
                range.deleteContents();
                sel.removeAllRanges(); sel.addRange(range);
            }
        }
    }).finally(() => {
        hideContextMenu();
    });
}

function pasteIntoEditable() {
    const el = window.__currentEditableEl;
    if (!el || el.readOnly || el.disabled) { hideContextMenu(); return; }
    if (!navigator.clipboard || !navigator.clipboard.readText) { hideContextMenu(); return; }

    focusEditable();

    const saved = window.__editableSelection || {};

    navigator.clipboard.readText().then((clip) => {
        if (clip == null) return;
        if (el.selectionStart !== undefined && el.selectionEnd !== undefined) {
            let start = el.selectionStart, end = el.selectionEnd;
            if (saved.isTextControl && typeof saved.start === 'number' && typeof saved.end === 'number') {
                start = saved.start; end = saved.end;
            }
            const before = (el.value || '').slice(0, start);
            const after = (el.value || '').slice(end);
            el.value = before + clip + after;
            const caret = start + clip.length;
            el.selectionStart = el.selectionEnd = caret;
        } else {
            // contenteditable with saved range
            const sel = window.getSelection();
            let range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
            if (window.__editableRange) {
                range = window.__editableRange.cloneRange();
            }
            if (range) {
                range.deleteContents();
                const textNode = document.createTextNode(clip);
                range.insertNode(textNode);
                range.setStartAfter(textNode);
                range.collapse(true);
                sel.removeAllRanges(); sel.addRange(range);
            } else {
                document.execCommand('insertText', false, clip);
            }
        }
        const inputEvent = new Event('input', { bubbles: true });
        el.dispatchEvent(inputEvent);
    }).finally(() => {
        hideContextMenu();
    });
}

function selectAllEditable() {
    const el = window.__currentEditableEl;
    if (!el) { hideContextMenu(); return; }
    focusEditable();

    if (el.selectionStart !== undefined && el.selectionEnd !== undefined) {
        el.selectionStart = 0;
        el.selectionEnd = (el.value || '').length;
        window.__editableSelection = { start: 0, end: (el.value || '').length, isTextControl: true };
    } else if (el.select) {
        el.select();
        window.__editableSelection = { isTextControl: true, start: 0, end: (el.value || '').length };
    } else {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        window.__editableRange = range.cloneRange();
        window.__editableSelection = { isTextControl: false };
    }
    hideContextMenu();
}

// Hook: when a right-click occurs on editable, build its menu
// Keep existing global capture that prevents default and hides; target listener will show
(function attachEditableMenu() {
    document.addEventListener('contextmenu', (e) => {
        const target = e.target;
        if (isEditableTarget(target)) {
            // Let our global capture hide any open menu first, then build the editable menu
            setTimeout(() => showEditableContextMenu(e, target), 0);
        }
    });
})();
 
// Show context menu for a message
function showContextMenu(event, messageElement, message, nostrEvent) {
    // Close any existing context menu immediately
    hideContextMenu();
    event.preventDefault();
    
    // Handle word selection on right-click if no text is currently selected
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (range.collapsed) {
            // Check if we're clicking on actual message text content
            const clickedElement = event.target;
            const isClickingOnText = clickedElement.nodeType === Node.TEXT_NODE || 
                                   clickedElement.classList.contains('message-bubble') ||
                                   clickedElement.closest('.message-bubble');
            
            if (isClickingOnText) {
                // Additional check: make sure we're not clicking at the end of a text node
                if (clickedElement.nodeType === Node.TEXT_NODE) {
                    const textContent = clickedElement.textContent;
                    const clickOffset = range.startOffset;
                    

                    
                    // Don't select word if clicking at the very end of text or on whitespace
                    if (clickOffset >= textContent.length || /\s/.test(textContent[clickOffset])) {
                        /* debug removed */
                        // Don't select anything - just show the context menu
                    } else {
                        // Only try to select word if we're clicking on actual text content
                        const wordRange = getWordRange(range);
                        if (wordRange) {
                                    selection.removeAllRanges();
                                    selection.addRange(wordRange);
                                }
                        }
                    } else {
                    // For non-text nodes, check if the click is within actual text content
                    const textRange = document.createRange();
                    textRange.selectNodeContents(clickedElement);
                    const textContent = textRange.toString().trim();
                    

                    
                    if (textContent.length > 0) {
                        // Check if the click is actually on text, not just within the element
                        const clickPoint = range.startContainer;
                        const clickOffset = range.startOffset;
                        
                        // If we're clicking on a text node within the element, check if it's on actual text
                        if (clickPoint.nodeType === Node.TEXT_NODE) {
                            const textNodeContent = clickPoint.textContent;
                            const isClickingOnWhitespace = clickOffset >= textNodeContent.length || /\s/.test(textNodeContent[clickOffset]);
                            

                            
                            if (!isClickingOnWhitespace) {
                                // Only try to select word if we're clicking on actual text content
                                const wordRange = getWordRange(range);
                                if (wordRange) {
                                    selection.removeAllRanges();
                                    selection.addRange(wordRange);
                                }
                            } else {
                                /* debug removed */
                                // Clear any existing selection when clicking on whitespace
                                selection.removeAllRanges();
                            }
                        } else {
                            // Clicking on the element itself, not on text - don't select anything
                            /* debug removed */
                            // Clear any existing selection when clicking on element
                            selection.removeAllRanges();
                        }
                    }
                }
            }
        }
    }
    
    // Clear any existing selection if we clicked on whitespace
    if (selection && !selection.isCollapsed) {
        const clickedElement = event.target;
        

        
        // Check if we clicked on whitespace or at the end of text
        let shouldClearSelection = false;
        
        // Get the actual click position, not the selection position
        const clickRange = document.caretRangeFromPoint ? 
            document.caretRangeFromPoint(event.clientX, event.clientY) : 
            document.createRange();
        
        if (clickRange && clickedElement.nodeType === Node.TEXT_NODE) {
            const textContent = clickedElement.textContent;
            const clickOffset = clickRange.startOffset;
            shouldClearSelection = clickOffset >= textContent.length || /\s/.test(textContent[clickOffset]);
        } else if (clickedElement.classList.contains('message-bubble') || clickedElement.closest('.message-bubble')) {
            // Check if clicking on whitespace within the message bubble
            if (clickRange && clickRange.startContainer.nodeType === Node.TEXT_NODE) {
                const textNodeContent = clickRange.startContainer.textContent;
                const clickOffset = clickRange.startOffset;
                shouldClearSelection = clickOffset >= textNodeContent.length || /\s/.test(textNodeContent[clickOffset]);
            } else {
                shouldClearSelection = true; // Clicking on element, not text
            }
        }
        
        if (shouldClearSelection) {
            selection.removeAllRanges();
            // Force a small delay to ensure selection is cleared
            setTimeout(() => {
                if (selection.rangeCount > 0) {
                    selection.removeAllRanges();
                }
            }, 0);
        }
    }
    
    // Check if there's selected text in the message (after potential clearing)
    const hasSelection = selection && !selection.isCollapsed && 
                        messageElement.contains(selection.anchorNode) && 
                        messageElement.contains(selection.focusNode);
    
    // Check if speech is currently playing for THIS specific message
    const isSpeakingThisMessage = currentlySpeakingMessageId === message.id;
    
    // Store current message and event data
    currentContextMessage = message;
    currentContextEvent = nostrEvent;
    currentContextConversation = null;
    currentContextPubkey = null;
    
    // Add hover effect to the right-clicked element
    contextMenuTarget = messageElement;
    contextMenuTarget.classList.add('context-menu-active');
    
    // Reset context menu to message options
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.innerHTML = `
        ${hasSelection ? `
        <div class="context-menu-item" onclick="copySelectedText()">
            <span class="material-symbols-rounded">content_copy</span>
            Copy
        </div>
        <div class="context-menu-separator"></div>
        ` : ''}
        <div class="context-menu-item" onclick="copyMessageText()">
            <span class="material-symbols-rounded">content_copy</span>
            Copy Message
        </div>
        <div class="context-menu-item" onclick="copyMessageId()">
            <span class="material-symbols-rounded">tag</span>
            Copy Message ID
        </div>
                     <div class="context-menu-item${isSpeakingThisMessage ? ' context-menu-item-red' : ''}" onclick="${isSpeakingThisMessage ? 'stopSpeaking()' : 'speakMessage()'}">
                 <span class="material-symbols-rounded">${isSpeakingThisMessage ? 'stop_circle' : 'volume_up'}</span>
                 ${isSpeakingThisMessage ? 'Stop Speaking' : 'Speak Message'}
             </div>
        <div class="context-menu-item has-submenu">
            <span class="material-symbols-rounded">grid_on</span>
            Tools
            <span class="material-symbols-rounded submenu-arrow">chevron_right</span>
            <div class="context-submenu">
                <div class="context-menu-item disabled">
                    <span class="material-symbols-rounded">block</span>
                    No Tools Available
                </div>
                <!-- 
                *** NESTED TEMPLATE: ***
                <div class="context-menu-item has-submenu">
                    <span class="material-symbols-rounded">your_icon</span>
                    Your Menu Text
                    <span class="material-symbols-rounded submenu-arrow">chevron_right</span>
                    <div class="context-submenu">
                        <div class="context-menu-item" onclick="yourFunction()">
                            <span class="material-symbols-rounded">icon</span>
                            Submenu Option
                        </div>
                        *** You can nest even deeper by adding has-submenu to any item above ***
                    </div>
                </div>
                -->
            </div>
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" onclick="inspectEvent()">
            <span class="material-symbols-rounded">info</span>
            Inspect Message
        </div>
    `;
    
    // If submenu would overflow right edge, flip it to the left
    requestAnimationFrame(() => {
        flipAnySubmenus(contextMenu);
    });
    // Position and show menu
    positionContextMenu(event, contextMenu);
    window.__contextMenuOpenType = 'message';
    contextMenu.classList.add('show');
    
    // Disable hover effects globally (Discord-style)
    document.body.classList.add('context-menu-open');
}

// Hide context menu
function hideContextMenu() {
    if (contextMenu) {
        contextMenu.classList.remove('show');
        // Clear any dynamic HTML so measuring remains accurate next time
        // but keep a minimal structure to avoid empty width/height
        // We'll restore content on show
    }
    // Reset menu type flag
    window.__contextMenuOpenType = null;
    
    // Remove hover effect from the right-clicked element
    if (contextMenuTarget) {
        contextMenuTarget.classList.remove('context-menu-active');
        contextMenuTarget = null;
    }
    
    // Re-enable hover effects globally
    document.body.classList.remove('context-menu-open');
}

// Copy message text to clipboard
function copyMessageText() {
    if (!currentContextMessage) return;
    
    navigator.clipboard.writeText(currentContextMessage.content).then(() => {
        showNotification('Message copied to clipboard', 'success');
    }).catch(() => {
        showNotification('Failed to copy message', 'error');
    });
    
    hideContextMenu();
}

// Copy message ID to clipboard
function copyMessageId() {
    if (!currentContextMessage) return;
    
    navigator.clipboard.writeText(currentContextMessage.id).then(() => {
        showNotification('Message ID copied to clipboard', 'success');
    }).catch(() => {
        showNotification('Failed to copy message ID', 'error');
    });
    
    hideContextMenu();
}

// Show event inspector modal
function inspectEvent() {
    if (!currentContextEvent) {
        showNotification('No event data available', 'error');
        hideContextMenu();
        return;
    }
    
    showEventInspector(currentContextEvent);
    hideContextMenu();
}

// Show event inspector modal with event data
function showEventInspector(event) {
    const modal = document.getElementById('eventInspectorModal');
    const body = document.getElementById('eventInspectorBody');
    
    // Format the event data for display
    const eventData = {
        id: event.id,
        pubkey: event.pubkey,
        created_at: new Date(event.created_at * 1000).toISOString(),
        kind: event.kind,
        tags: event.tags,
        content: event.content,
        sig: event.sig
    };
    
    // Create the HTML for the event inspector
    body.innerHTML = `
        <div class="event-inspector-section">
            <h4>Basic Information</h4>
            <div class="event-inspector-field">
                <div class="event-inspector-label">Event ID</div>
                <div class="event-inspector-value">${eventData.id}</div>
            </div>
            <div class="event-inspector-field">
                <div class="event-inspector-label">Public Key</div>
                <div class="event-inspector-value">${eventData.pubkey}</div>
            </div>
            <div class="event-inspector-field">
                <div class="event-inspector-label">Created At</div>
                <div class="event-inspector-value">${eventData.created_at}</div>
            </div>
            <div class="event-inspector-field">
                <div class="event-inspector-label">Kind</div>
                <div class="event-inspector-value">${eventData.kind}</div>
            </div>
        </div>
        
        <div class="event-inspector-section">
            <h4>Content</h4>
            <div class="event-inspector-field">
                <div class="event-inspector-label">Message Content</div>
                <div class="event-inspector-value">${escapeHtml(eventData.content)}</div>
            </div>
        </div>
        
        <div class="event-inspector-section">
            <h4>Tags</h4>
            <div class="event-inspector-field">
                <div class="event-inspector-label">Tags (${eventData.tags.length})</div>
                <div class="event-inspector-value json">${JSON.stringify(eventData.tags, null, 2)}</div>
            </div>
        </div>
        
        <div class="event-inspector-section">
            <h4>Signature</h4>
            <div class="event-inspector-field">
                <div class="event-inspector-label">Signature</div>
                <div class="event-inspector-value">${eventData.sig}</div>
            </div>
        </div>
        
        <div class="event-inspector-section">
            <h4>Raw Event</h4>
            <div class="event-inspector-field">
                <div class="event-inspector-label">Complete Event JSON</div>
                <div class="event-inspector-value json">${JSON.stringify(event, null, 2)}</div>
            </div>
        </div>
    `;
    
    modal.classList.add('show');
}

// Close event inspector modal
function closeEventInspector() {
    const modal = document.getElementById('eventInspectorModal');
    modal.classList.remove('show');
}

// Copy event to clipboard
function copyEventToClipboard() {
    if (!currentContextEvent) return;
    
    const eventJson = JSON.stringify(currentContextEvent, null, 2);
    navigator.clipboard.writeText(eventJson).then(() => {
        showNotification('Event copied to clipboard', 'success');
    }).catch(() => {
        showNotification('Failed to copy event', 'error');
    });
}

function speakMessage() {
    if (currentContextMessage) {
        const messageText = currentContextMessage.content || currentContextMessage.text || '';
        if (messageText.trim()) {
            // Ensure speech synthesis is available
            if (!window.speechSynthesis) {
                showNotification('Speech synthesis not available', 'error');
                hideContextMenu();
                return;
            }
            
            // Function to actually start speaking
            const startSpeaking = () => {
                // Double-check speech synthesis is still available
                if (!window.speechSynthesis) {
                    showNotification('Speech synthesis not available', 'error');
                    currentlySpeakingMessageId = null;
                    refreshContextMenu();
                    return;
                }
                
                // Create and speak the message
                const utterance = new SpeechSynthesisUtterance(messageText);
                utterance.rate = 0.9; // Slightly slower for better clarity
                utterance.pitch = 1.0;
                utterance.volume = 0.8;
                
                // Try to use a natural-sounding voice if available
                const voices = window.speechSynthesis.getVoices();
                const preferredVoice = voices.find(voice => 
                    voice.name.includes('Samantha') || 
                    voice.name.includes('Alex') || 
                    voice.name.includes('Google') ||
                    voice.name.includes('Natural')
                );
                if (preferredVoice) {
                    utterance.voice = preferredVoice;
                }
                
                // Track which message is being spoken
                currentlySpeakingMessageId = currentContextMessage.id;
                refreshContextMenu(); // Update UI immediately
                
                // Set up event handlers to reset state when speech ends
                utterance.onend = () => {
                    currentlySpeakingMessageId = null;
                    refreshContextMenu(); // Update menu display
                };
                utterance.onerror = (event) => {
                    // Don't show error for interrupted or canceled - these are expected when switching messages
                    if (event.error !== 'interrupted' && event.error !== 'canceled') {
                        console.warn('Speech synthesis error:', event.error);
                        showNotification('Speech error occurred', 'warning');
                    }
                    currentlySpeakingMessageId = null;
                    refreshContextMenu(); // Update menu display
                };
                utterance.onstart = () => {
                    // Confirm speech actually started and update UI
                    currentlySpeakingMessageId = currentContextMessage.id;
                    refreshContextMenu();
                };
                
                try {
                    window.speechSynthesis.speak(utterance);
                    showNotification('Speaking message...', 'info');
                } catch (error) {
                    console.error('Error starting speech:', error);
                    currentlySpeakingMessageId = null;
                    refreshContextMenu();
                    showNotification('Failed to start speech', 'error');
                }
            };
            
            // Stop any currently playing speech first
            if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
                window.speechSynthesis.cancel();
                currentlySpeakingMessageId = null; // Clear previous tracking immediately
                refreshContextMenu(); // Update UI immediately
                
                // Wait for cancellation to complete before starting new speech
                setTimeout(() => {
                    // Check if speech synthesis is paused and resume if needed
                    if (window.speechSynthesis.paused) {
                        window.speechSynthesis.resume();
                    }
                    
                    // Final check - if still speaking, cancel again and retry
                    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
                        window.speechSynthesis.cancel();
                        setTimeout(() => {
                            // Double-check we're still trying to speak the same message
                            if (currentContextMessage && currentContextMessage.id) {
                                startSpeaking();
                            }
                        }, 100);
                    } else {
                        // Double-check we're still trying to speak the same message
                        if (currentContextMessage && currentContextMessage.id) {
                            startSpeaking();
                        }
                    }
                }, 100); // Increased delay for better reliability
            } else {
                // No speech currently playing, start immediately
                startSpeaking();
            }
        } else {
            showNotification('No text to speak', 'warning');
        }
    }
    hideContextMenu();
}

function stopSpeaking() {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        currentlySpeakingMessageId = null; // Clear tracking
        refreshContextMenu(); // Update UI immediately
        showNotification('Speech stopped', 'info');
    }
    hideContextMenu();
}

// Function to refresh context menu display when speech state changes
function refreshContextMenu() {
    if (window.__contextMenuOpenType === 'message' && currentContextMessage) {
        const contextMenu = document.getElementById('contextMenu');
        if (contextMenu && contextMenu.classList.contains('show')) {
            // Re-check if this specific message is being spoken
            const isSpeakingThisMessage = currentlySpeakingMessageId === currentContextMessage.id;
            
            // Find the speech button more reliably - look for any context menu item that might be the speech button
            const menuItems = contextMenu.querySelectorAll('.context-menu-item');
            let speechMenuItem = null;
            
            for (const item of menuItems) {
                const icon = item.querySelector('.material-symbols-rounded');
                if (icon && (icon.textContent === 'volume_up' || icon.textContent === 'stop_circle')) {
                    // Check if this is the speech button by looking at the text content
                    const textContent = item.textContent.trim();
                    if (textContent.includes('Speak Message') || textContent.includes('Stop Speaking')) {
                        speechMenuItem = item;
                        break;
                    }
                }
            }
            
            if (speechMenuItem) {
                speechMenuItem.onclick = isSpeakingThisMessage ? stopSpeaking : speakMessage;
                speechMenuItem.innerHTML = `
                    <span class="material-symbols-rounded">${isSpeakingThisMessage ? 'stop_circle' : 'volume_up'}</span>
                    ${isSpeakingThisMessage ? 'Stop Speaking' : 'Speak Message'}
                `;
                
                // Update the class - only red when it's the Stop option
                if (isSpeakingThisMessage) {
                    speechMenuItem.classList.add('context-menu-item-red');
                } else {
                    speechMenuItem.classList.remove('context-menu-item-red');
                }
            }
        }
    }
}

// Get word range at cursor position
function getWordRange(range) {
    const start = range.startContainer;
    const startOffset = range.startOffset;
    
    if (start.nodeType === Node.TEXT_NODE) {
        const text = start.textContent;
        let wordStart = startOffset;
        let wordEnd = startOffset;
        
        // Find word boundaries
        while (wordStart > 0 && /\S/.test(text[wordStart - 1])) {
            wordStart--;
        }
        while (wordEnd < text.length && /\S/.test(text[wordEnd])) {
            wordEnd++;
        }
        
        if (wordStart < wordEnd) {
            const wordRange = document.createRange();
            wordRange.setStart(start, wordStart);
            wordRange.setEnd(start, wordEnd);
            return wordRange;
        }
    }
    
    return null;
}

// Copy selected text to clipboard
function copySelectedText() {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
        const selectedText = selection.toString().trim();
        if (selectedText) {
            navigator.clipboard.writeText(selectedText).then(() => {
                showNotification('Selected text copied to clipboard', 'success');
            }).catch(() => {
                showNotification('Failed to copy selected text', 'error');
            });
        } else {
            showNotification('No text selected', 'warning');
        }
    } else {
        showNotification('No text selected', 'warning');
    }
    hideContextMenu();
}

// Add right-click event listeners to messages
function addMessageContextMenu(messageElement, message, nostrEvent) {
    messageElement.addEventListener('contextmenu', (event) => {
        showContextMenu(event, messageElement, message, nostrEvent);
    });
}

// Add context menu for conversation items
function addConversationContextMenu(conversationElement, conversation) {
    conversationElement.addEventListener('contextmenu', (event) => {
        showConversationContextMenu(event, conversationElement, conversation);
    });
}

// Add context menu for public key displays
function addPubkeyContextMenu(element, pubkey, label = 'Public Key') {
    element.addEventListener('contextmenu', (event) => {
        showPubkeyContextMenu(event, element, pubkey, label);
    });
}

// Show conversation context menu
function showConversationContextMenu(event, conversationElement, conversation) {
    // Close any existing context menu immediately
    hideContextMenu();
    event.preventDefault();
    
    // Update context menu for conversation
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.innerHTML = `
        <div class="context-menu-item" onclick="copyConversationPubkey()">
            <span class="material-symbols-rounded">content_copy</span>
            Copy Public Key
        </div>
        <div class="context-menu-item" onclick="copyConversationName()">
            <span class="material-symbols-rounded">person</span>
            Copy Display Name
        </div>
        <div class="context-menu-item" onclick="inspectConversation()">
            <span class="material-symbols-rounded">info</span>
            Inspect Conversation
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item context-menu-item-red" onclick="deleteConversation()">
            <span class="material-symbols-rounded">delete</span>
            Delete Conversation
        </div>
    `;
    
    // Store current conversation data
    currentContextMessage = null;
    currentContextEvent = null;
    currentContextConversation = conversation;
    
    // Add hover effect to the right-clicked element
    contextMenuTarget = conversationElement;
    contextMenuTarget.classList.add('context-menu-active');
    
    // Position and show menu
    positionContextMenu(event, contextMenu);
    window.__contextMenuOpenType = 'conversation';
    contextMenu.classList.add('show');
    flipAnySubmenus(contextMenu);
    
    // Disable hover effects globally (Discord-style)
    document.body.classList.add('context-menu-open');
}

// Show pubkey context menu
function showPubkeyContextMenu(event, element, pubkey, label) {
    // Close any existing context menu immediately
    hideContextMenu();
    event.preventDefault();
    
    // Update context menu for pubkey
    const contextMenu = document.getElementById('contextMenu');
    // For private key displays, show nsec option only
    const isPrivateKey = element.id === 'privateKeyDisplay';
    contextMenu.innerHTML = isPrivateKey ? `
        <div class="context-menu-item context-menu-item-red" onclick="copyPrivateHex()">
            <span class="material-symbols-rounded">content_copy</span>
            Copy Private Key
        </div>
        <div class="context-menu-item context-menu-item-red" onclick="copyPrivateNsecFromDisplay()">
            <span class="material-symbols-rounded">vpn_key</span>
            Copy as nsec
        </div>
    ` : `
        <div class="context-menu-item" onclick="copyPubkey()">
            <span class="material-symbols-rounded">content_copy</span>
            Copy ${label}
        </div>
        <div class="context-menu-item" onclick="copyNpub()">
            <span class="material-symbols-rounded">alternate_email</span>
            Copy as npub
        </div>
    `;
    
    // Store current pubkey data
    currentContextMessage = null;
    currentContextEvent = null;
    currentContextConversation = null;
    currentContextPubkey = pubkey;
    
    // Add hover effect to the right-clicked element
    contextMenuTarget = element;
    contextMenuTarget.classList.add('context-menu-active');
    
    // Position and show menu
    positionContextMenu(event, contextMenu);
    window.__contextMenuOpenType = isPrivateKey ? 'privateKey' : 'pubkey';
    contextMenu.classList.add('show');
    flipAnySubmenus(contextMenu);
    
    // Disable hover effects globally (Discord-style)
    document.body.classList.add('context-menu-open');
}

function flipAnySubmenus(menuRoot) {
    requestAnimationFrame(() => {
        flipSubmenusRecursive(menuRoot);
    });
    
    // Also check nested submenus when they become visible (on hover)
    const submenuParents = menuRoot.querySelectorAll('.context-menu-item.has-submenu');
    submenuParents.forEach(parentItem => {
        parentItem.addEventListener('mouseenter', () => {
            const submenu = parentItem.querySelector('.context-submenu');
            if (submenu) {
                // Small delay to ensure submenu is visible
                setTimeout(() => {
                    flipSubmenusRecursive(submenu);
                }, 10);
            }
        });
    });
}

// Recursive function to flip submenus at any nesting level
function flipSubmenusRecursive(menuElement) {
    const parents = menuElement.querySelectorAll('.context-menu-item.has-submenu');
    parents.forEach(parentItem => {
        const submenu = parentItem.querySelector('.context-submenu');
        if (!submenu) return;
        
        const parentRect = parentItem.getBoundingClientRect();
        const submenuWidth = submenu.getBoundingClientRect().width || 180;
        
        if (parentRect.right + submenuWidth + 10 > window.innerWidth) {
            submenu.classList.add('flip-left');
            parentItem.classList.add('submenu-open-left');
        } else {
            submenu.classList.remove('flip-left');
            parentItem.classList.remove('submenu-open-left');
        }
        
        // Recursively handle nested submenus
        flipSubmenusRecursive(submenu);
    });
}

function submenuTest(name) {
    showNotification(`Test successful (${name})`, 'success');
    hideContextMenu();
}

function stopSpeaking() {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        currentlySpeakingMessageId = null; // Clear tracking
        showNotification('Speech stopped', 'info');
    }
    hideContextMenu();
}

// Position context menu
function positionContextMenu(event, contextMenu) {
    const padding = 8; // viewport padding
    const cursorGap = 0; // reduced gap from cursor (was 6)
    
    // Temporarily show to measure actual size
    contextMenu.style.visibility = 'hidden';
    contextMenu.style.opacity = '0';
    contextMenu.classList.add('show');
    const rect = contextMenu.getBoundingClientRect();
    const menuWidth = rect.width || 180;
    const menuHeight = rect.height || 120;
    contextMenu.classList.remove('show');
    contextMenu.style.visibility = '';
    contextMenu.style.opacity = '';
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Preferred side: right of cursor, else left
    let x;
    if (event.clientX + cursorGap + menuWidth + padding <= viewportWidth) {
        x = event.clientX + cursorGap;
    } else {
        x = Math.max(padding, event.clientX - cursorGap - menuWidth);
    }
    
    // Vertical position: try below cursor, else above
    let y;
    if (event.clientY + cursorGap + menuHeight + padding <= viewportHeight) {
        y = event.clientY + cursorGap;
    } else {
        y = Math.max(padding, event.clientY - cursorGap - menuHeight);
    }
    
    // Final clamps
    x = Math.min(x, viewportWidth - padding - menuWidth);
    y = Math.min(y, viewportHeight - padding - menuHeight);
    
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
}

// Conversation context menu actions
function copyConversationPubkey() {
    if (!currentContextConversation) return;
    
    navigator.clipboard.writeText(currentContextConversation.recipient).then(() => {
        showNotification('Public key copied to clipboard', 'success');
    }).catch(() => {
        showNotification('Failed to copy public key', 'error');
    });
    
    hideContextMenu();
}

function copyConversationName() {
    if (!currentContextConversation) return;
    
    const displayName = formatPubkeyForDisplay(currentContextConversation.recipient);
    navigator.clipboard.writeText(displayName).then(() => {
        showNotification('Display name copied to clipboard', 'success');
    }).catch(() => {
        showNotification('Failed to copy display name', 'error');
    });
    
    hideContextMenu();
}

function deleteConversation() {
    if (!currentContextConversation) return;
    
    if (confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
        // Remove from conversations
        const index = chatState.conversations.findIndex(c => c.id === currentContextConversation.id);
        if (index !== -1) {
            chatState.conversations.splice(index, 1);
        }
        
        // Remove messages
        chatState.messages.delete(currentContextConversation.id);
        
        // If this was the current conversation, clear it
        if (chatState.currentConversation === currentContextConversation.id) {
            chatState.currentConversation = null;
        }
        
        saveChatState();
        updateConversationsDisplay();
        displayConversationMessages(null);
        
        showNotification('Conversation deleted', 'success');
    }
    
    hideContextMenu();
}

function inspectConversation() {
    if (!currentContextConversation) return;
    if (typeof showConversationDetailsModal === 'function') {
        showConversationDetailsModal(currentContextConversation);
    }
    hideContextMenu();
}

// Pubkey context menu actions
function copyPubkey() {
    if (!currentContextPubkey) return;
    
    navigator.clipboard.writeText(currentContextPubkey).then(() => {
        showNotification('Public key copied to clipboard', 'success');
    }).catch(() => {
        showNotification('Failed to copy public key', 'error');
    });
    
    hideContextMenu();
}

function copyNpub() {
    if (!currentContextPubkey) return;
    
    try {
        const npub = window.NostrTools.nip19.npubEncode(currentContextPubkey);
        navigator.clipboard.writeText(npub).then(() => {
            showNotification('npub copied to clipboard', 'success');
        }).catch(() => {
            showNotification('Failed to copy npub', 'error');
        });
    } catch (error) {
        showNotification('Failed to encode npub', 'error');
    }
    
    hideContextMenu();
}

// Show context menu for an avatar
function showAvatarContextMenu(event, avatarElement) {
    // Close any existing context menu immediately
    hideContextMenu();
    event.preventDefault();
    
    // Store the avatar element for download
    contextMenuTarget = avatarElement;
    contextMenuTarget.classList.add('context-menu-active');
    
    // Build avatar context menu
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.innerHTML = `
        <div class="context-menu-item" onclick="downloadAvatarPNG()">
            <span class="material-symbols-rounded">download</span>
            Download Avatar PNG
        </div>
    `;
    
    // Position and show menu
    positionContextMenu(event, contextMenu);
    window.__contextMenuOpenType = 'avatar';
    contextMenu.classList.add('show');
    
    // Disable hover effects globally (Discord-style)
    document.body.classList.add('context-menu-open');
}

// Download avatar as PNG
function downloadAvatarPNG() {
    if (!contextMenuTarget) return;
    
    // Find the SVG element within the avatar
    const svgElement = contextMenuTarget.querySelector('svg');
    if (!svgElement) {
        showNotification('No avatar found to download', 'error');
        return;
    }
    
    try {
        // Convert SVG to PNG and download
        const svgData = new XMLSerializer().serializeToString(svgElement);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = function() {
            canvas.width = 400;
            canvas.height = 400;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, 400, 400);
            ctx.drawImage(img, 0, 0, 400, 400);
            
            const link = document.createElement('a');
            link.download = 'avatar.png';
            link.href = canvas.toDataURL();
            link.click();
            
            showNotification('Avatar downloaded successfully', 'success');
        };
        
        img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    } catch (error) {
        console.error('Error downloading avatar:', error);
        showNotification('Failed to download avatar', 'error');
    }
    
    hideContextMenu();
}

// Initialize context menu when DOM is loaded
document.addEventListener('DOMContentLoaded', initContextMenu);
