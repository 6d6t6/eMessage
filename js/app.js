// Main application initialization and coordination

let appBootstrapped = false;

function bootstrapApp() {
    if (appBootstrapped) return;
    appBootstrapped = true;
    document.body.classList.add('app-bootstrapped');
    
    initializeIncognitoState();
    initializeChatState();
    if (typeof syncConversationsFromIncognito === 'function') {
        syncConversationsFromIncognito();
    }
    updateStatus();
    updateProfileAvatar();
    updateConversationsDisplay();
    if (userKeys && typeof requestProfileMetadataNow === 'function') {
        requestProfileMetadataNow(userKeys.publicKey);
    }
    
    const chatInterface = document.getElementById('chatInterface');
    const chatTitle = document.getElementById('chatTitle');
    
    if (chatInterface) chatInterface.style.display = 'flex';
    if (chatTitle) chatTitle.textContent = 'Select a conversation';
    
    if (!chatState.currentConversation) {
        const chatPlaceholder = document.getElementById('chatPlaceholder');
        const messagesArea = document.getElementById('messagesArea');
        const messageInputContainer = document.getElementById('messageInputContainer');
        
        if (chatPlaceholder) chatPlaceholder.style.display = 'flex';
        if (messagesArea) messagesArea.style.display = 'none';
        if (messageInputContainer) messageInputContainer.style.display = 'none';
    }

    const profilePanel = document.getElementById('profilePanel');
    if (profilePanel && !profilePanel.classList.contains('active')) {
        if (typeof setPanelAccessibility === 'function') {
            setPanelAccessibility(profilePanel, false);
        }
    }
    
    if (typeof updateRelayButtonState === 'function') {
        updateRelayButtonState();
    }
    
    if (userKeys) {
        if (typeof loadMessageSendingStatus === 'function') {
            loadMessageSendingStatus();
        }
        
        setTimeout(() => {
            connectRelays();
            
            // Resume any pending sends after connections are established
            setTimeout(() => {
                if (typeof resumePendingSends === 'function') {
                    resumePendingSends();
                }
            }, 3000);
        }, 1000);
    }

    const isMobile = window.innerWidth <= 900;
    chatState.disableMobileAutoOpen = isMobile;
    chatState.lastConversationSelectSource = 'system';
    if (isMobile && chatState.currentConversation) {
        chatState.currentConversation = null;
        chatState.suppressAutoSelectUntil = Date.now() + 2000;
        if (typeof displayConversationMessages === 'function') {
            displayConversationMessages(null);
        }
        saveChatState();
    }

    syncResponsiveLayout();
    
    // Initialize mobile gestures
    if (typeof initGestures === 'function') {
        initGestures();
    }
}

// Initialize the app shell
document.addEventListener('DOMContentLoaded', function() {
    if (!checkNostrTools()) {
        return;
    }
    
    testNip44();
    initializeAuthFlow();
    window.addEventListener('resize', syncResponsiveLayout);

    // Setup visual viewport handling for mobile keyboards
    let lastVh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    let isScrolledToBottom = true;
    
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
        messagesContainer.addEventListener('scroll', () => {
            isScrolledToBottom = Math.abs(messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight) < 50;
        });
    }

    function updateAppHeight() {
        const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        document.documentElement.style.setProperty('--app-height', `${vh}px`);
        
        if (messagesContainer && vh < lastVh) {
            // When viewport shrinks (keyboard opens), scroll to bottom ONLY if already near bottom
            if (isScrolledToBottom) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }
        lastVh = vh;
    }
    updateAppHeight();
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateAppHeight);
    } else {
        window.addEventListener('resize', updateAppHeight);
    }

    // Auto-resize message input
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('input', function() {
            this.style.height = '48px';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            
            // Sync context menu and handles if open
            if (window.__currentEditableEl === this && window.innerWidth <= 900) {
                if (typeof updateSelectionHandles === 'function') updateSelectionHandles(this);
                if (typeof _repositionBarForSelection === 'function' && window.contextMenu && window.contextMenu.classList.contains('horizontal')) {
                    _repositionBarForSelection(this);
                }
            }
        });
    }

    // Wire up emoji picker for chat input
    const chatEmojiBtn = document.getElementById('chatEmojiBtn');
    let lastSelection = { start: 0, end: 0 };
    let isRestoring = false;

    if (chatEmojiBtn && messageInput) {
        // Track selection in real-time to prevent "jump to start" bug
        const saveSelection = () => {
            if (isRestoring) return;
            if (document.activeElement === messageInput) {
                lastSelection.start = messageInput.selectionStart;
                lastSelection.end = messageInput.selectionEnd;
            }
        };
        // Listen to everything that can move the cursor
        document.addEventListener('selectionchange', saveSelection);
        messageInput.addEventListener('mousedown', saveSelection);
        messageInput.addEventListener('mouseup', saveSelection);
        messageInput.addEventListener('keyup', saveSelection);
        messageInput.addEventListener('input', saveSelection);
        messageInput.addEventListener('focus', saveSelection);
        messageInput.addEventListener('blur', saveSelection);

        chatEmojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isMobile = window.innerWidth <= 900;
            
            const opened = toggleEmojiPicker(chatEmojiBtn, (emoji) => {
                // Determine exactly where to insert
                let start, end;
                if (document.activeElement === messageInput) {
                    start = messageInput.selectionStart;
                    end = messageInput.selectionEnd;
                } else {
                    // If blurred, we MUST use our verified last known position
                    start = lastSelection.start;
                    end = lastSelection.end;
                }

                const val = messageInput.value;
                const before = val.slice(0, start);
                const after = val.slice(end);
                messageInput.value = before + emoji + after;
                
                const newPos = start + emoji.length;
                
                // CRITICAL: Update our tracked position immediately 
                // so the NEXT emoji knows where to go
                lastSelection.start = lastSelection.end = newPos;
                
                // Try to set it on the element as well (might only stick if focused)
                messageInput.setSelectionRange(newPos, newPos);
                
                if (!isMobile) {
                    messageInput.focus();
                }
                
                messageInput.style.height = '48px';
                messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
            });
            
            if (!opened) {
                // When toggling closed, refocus and explicitly restore the last cursor position.
                // We use a guard to prevent the 'focus' event from overwriting our good selection with 0.
                isRestoring = true;
                messageInput.focus();
                messageInput.setSelectionRange(lastSelection.start, lastSelection.end);
                setTimeout(() => { isRestoring = false; }, 50);
            }
        });
    }
});

// Legacy gift wrap functions (kept for compatibility)
async function handleGiftWrapEvent(event) {
    try {
        Logger.debug('Received gift wrap event:', event);
        
        // Check if this gift wrap is for us
        const recipientTag = event.tags.find(tag => tag[0] === 'p');
        if (recipientTag && recipientTag[1] === userKeys.publicKey) {
            // This gift wrap is for us, try to unwrap it
            const unwrappedEvent = await unwrapGiftWrap(event);
            
            if (unwrappedEvent) {
                const message = {
                    id: unwrappedEvent.id,
                    sender: unwrappedEvent.pubkey,
                    content: unwrappedEvent.content,
                    timestamp: unwrappedEvent.created_at,
                    decrypted: true
                };
                
                receivedMessages.unshift(message);
                updateMessagesDisplay();
                updateStatus();
                showNotification('New encrypted message received!', 'success');
                saveMessages(); // Save messages after adding new ones
            }
        }
    } catch (error) {
        Logger.error('Error handling gift wrap event:', error);
        showNotification('Error decrypting message: ' + error.message, 'error');
    }
}

// REAL NIP-17 Gift Wrap Unwrapping with REAL NIP-44
async function unwrapGiftWrap(event) {
    try {
        Logger.debug('Unwrapping gift wrap with REAL NIP-44...');
        
        // Decrypt the gift wrap content using REAL NIP-44
        const decryptedContent = await decryptGiftWrapContent(event.content, event.pubkey);
        
        if (decryptedContent) {
            // Parse the decrypted content to extract the rumor
            const rumor = JSON.parse(decryptedContent);
            
            return {
                kind: 4, // The original message kind
                id: rumor.id,
                pubkey: rumor.pubkey,
                content: rumor.content,
                created_at: rumor.created_at
            };
        }
        
        return null;
    } catch (error) {
        Logger.error('Error unwrapping gift wrap:', error);
        return null;
    }
}

// REAL NIP-17 Gift Wrap Creation with REAL NIP-44
async function createGiftWrap(originalMessage, recipientPubkey) {
    try {
        Logger.debug('Creating REAL gift wrap with REAL NIP-44 encryption...');
        
        // Create the rumor (the original message)
        const rumor = {
            id: originalMessage.id,
            pubkey: originalMessage.pubkey,
            created_at: originalMessage.created_at,
            kind: originalMessage.kind,
            tags: originalMessage.tags,
            content: originalMessage.content,
            sig: originalMessage.sig
        };
        
        // Encrypt the rumor using REAL NIP-44
        const encryptedRumor = await encryptGiftWrapContent(JSON.stringify(rumor), recipientPubkey);
        
        // Create the gift wrap event
        const giftWrapEvent = {
            kind: 1059,
            pubkey: userKeys.publicKey,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['p', recipientPubkey], // Recipient
                ['gift', 'nip17'] // Gift wrap identifier
            ],
            content: encryptedRumor
        };
        
        // Sign the gift wrap event
        const signedGiftWrap = await signNostrEvent(giftWrapEvent);
        
        Logger.debug('REAL gift wrap created successfully!');
        return signedGiftWrap;
    } catch (error) {
        Logger.error('Error creating gift wrap:', error);
        throw error;
    }
}

// Test functions for debugging
function testIncognitoMessage() {
    Logger.debug('=== TESTING INCOGNITO MESSAGE SENDING ===');
    
    if (!userKeys) {
        Logger.error('No user keys available');
        return;
    }
    
    // Get the recipient pubkey from the input
    const recipientPubkey = document.getElementById('testRecipientInput')?.value.trim();
    if (!recipientPubkey) {
        Logger.error('No recipient pubkey entered');
        return;
    }
    
    const messageText = 'Test message from ' + new Date().toISOString();
    Logger.debug('Sending test message:', messageText);
    Logger.debug('To recipient:', recipientPubkey);
    
    // Send the message
    sendIncognitoMessage(recipientPubkey, messageText);
}

function testDecryption(encryptedContent, senderPubkey) {
    Logger.debug('=== TESTING DECRYPTION ===');
    Logger.debug('Encrypted content:', encryptedContent);
    Logger.debug('Sender pubkey:', senderPubkey);
    
    decryptGiftWrapContent(encryptedContent, senderPubkey).then(decrypted => {
        Logger.debug('Decryption result:', decrypted);
        if (decrypted) {
            try {
                const parsed = JSON.parse(decrypted);
                Logger.debug('Parsed message:', parsed);
            } catch (e) {
                Logger.debug('Could not parse as JSON:', e);
            }
        }
    });
}

function testConversationMatching(eventPubkey) {
    Logger.debug('=== TESTING CONVERSATION MATCHING ===');
    Logger.debug('Event pubkey:', eventPubkey);
    Logger.debug('Number of conversations:', incognitoState.conversations.size);
    
    for (const [recipient, data] of incognitoState.conversations) {
        Logger.debug('Conversation with:', recipient);
        Logger.debug('- Conversation pubkey:', data.conversationPubkey);
        Logger.debug('- Conversation identity:', data.conversationIdentity ? data.conversationIdentity.publicKey : 'none');
        Logger.debug('- Sender identity:', data.senderIdentity ? data.senderIdentity.publicKey : 'none');
        Logger.debug('- Match with event pubkey:', data.conversationPubkey === eventPubkey);
        Logger.debug('---');
    }
}

function testProcessMessage(eventPubkey, encryptedContent) {
    Logger.debug('=== TESTING MESSAGE PROCESSING ===');
    Logger.debug('Event pubkey:', eventPubkey);
    Logger.debug('Encrypted content:', encryptedContent);
    
    // Create a mock event
    const mockEvent = {
        pubkey: eventPubkey,
        content: encryptedContent
    };
    
    // Process the message
    handleIncognitoMessage(mockEvent);
}

function testConversationData() {
    Logger.debug('=== TESTING CONVERSATION DATA INTEGRITY ===');
    Logger.debug('Number of conversations:', incognitoState.conversations.size);
    
    for (const [recipient, data] of incognitoState.conversations) {
        Logger.debug('Conversation with:', recipient);
        Logger.debug('- Full data:', data);
        Logger.debug('- conversationPubkey:', data.conversationPubkey);
        Logger.debug('- recipient:', data.recipient);
        Logger.debug('- status:', data.status);
        Logger.debug('---');
    }
    
    // Also check localStorage directly
    const stored = localStorage.getItem('incognitoState');
    if (stored) {
        const data = JSON.parse(stored);
        Logger.debug('Raw localStorage data:', data);
        if (data.conversations) {
            for (const [key, value] of Object.entries(data.conversations)) {
                Logger.debug('Stored conversation for:', key.substring(0, 16) + '...');
                Logger.debug('- conversationPubkey:', value.conversationPubkey);
            }
        }
    }
} 
