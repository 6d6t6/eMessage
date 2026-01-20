// Chat interface and conversation management functions

let mobileConversationTransitionToken = 0;
const MOBILE_AUTOPEN_SUPPRESSION_MS = 1500;

function nextMobileConversationToken() {
    mobileConversationTransitionToken += 1;
    return mobileConversationTransitionToken;
}

function getMobileConversationToken() {
    return mobileConversationTransitionToken;
}

function setPanelAccessibility(element, isVisible) {
    if (!element) return;
    element.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    if ('inert' in element) {
        element.inert = !isVisible;
    }
    const focusables = element.querySelectorAll(
        'a, button, input, textarea, select, [tabindex]'
    );
    focusables.forEach((item) => {
        if (isVisible) {
            if (item.dataset.prevTabindex !== undefined) {
                const prev = item.dataset.prevTabindex;
                if (prev === '') {
                    item.removeAttribute('tabindex');
                } else {
                    item.setAttribute('tabindex', prev);
                }
                delete item.dataset.prevTabindex;
            } else if (item.getAttribute('tabindex') === '-1') {
                item.removeAttribute('tabindex');
            }
        } else {
            if (item.dataset.prevTabindex === undefined) {
                const current = item.getAttribute('tabindex');
                item.dataset.prevTabindex = current === null ? '' : current;
            }
            item.setAttribute('tabindex', '-1');
        }
    });
}

// Show new chat modal
function showNewChatModal() {
    const modal = document.getElementById('newChatModal');
    modal.classList.add('active');
}

// Close new chat modal
function closeNewChatModal() {
    const modal = document.getElementById('newChatModal');
    modal.classList.remove('active');
    // Clear form
    document.getElementById('recipientPubkeyInput').value = '';
}

// Start new conversation
async function startNewConversation() {
    const recipient = document.getElementById('recipientPubkeyInput').value.trim();
    
    if (!recipient) {
        showNotification('Please enter a recipient public key', 'error');
        return;
    }
    
    // Validate pubkey
    const isValidHex = /^[0-9a-fA-F]{64}$/.test(recipient);
    const isValidNpub = recipient.startsWith('npub1');
    const isNip05 = recipient.includes('@');
    
    if (!isValidHex && !isValidNpub && !isNip05) {
        showNotification('Invalid public key format. Use hex (64 chars), npub1..., or name@domain.tld', 'error');
        return;
    }
    
    // Convert npub to hex if needed
    let recipientHex = recipient;
    if (isNip05) {
        try {
            recipientHex = await resolveNip05ToPubkey(recipient);
            upsertProfileCache(recipientHex, { nip05: recipient }, 0);
        } catch (error) {
            showNotification('Unable to resolve NIP-05: ' + error.message, 'error');
            return;
        }
    } else if (recipient.startsWith('npub1')) {
        try {
            const decoded = window.NostrTools.nip19.decode(recipient);
            recipientHex = decoded.data;
            
            // Validate the decoded data
            if (!recipientHex || recipientHex.length !== 64) {
                throw new Error('Invalid npub format');
            }
        } catch (error) {
            showNotification('Invalid npub format: ' + error.message, 'error');
            return;
        }
    } else {
        // Validate hex format
        if (recipientHex.length !== 64) {
            showNotification('Invalid hex format: must be 64 characters', 'error');
            return;
        }
    }
    
    // Create conversation
    const conversationId = recipientHex;
    const conversation = {
        id: conversationId,
        recipient: recipientHex,
        name: getDisplayNameForPubkey(recipientHex),
        lastMessage: '',
        lastMessageTime: Date.now(),
        unreadCount: 0,
        lastReadTime: Date.now()
    };
    
    console.log('Creating conversation:', conversation);
    
    // Add to conversations if not exists
    const existingIndex = chatState.conversations.findIndex(c => c.id === conversationId);
    if (existingIndex === -1) {
        chatState.conversations.unshift(conversation);
    } else {
        // Move to top
        chatState.conversations.splice(existingIndex, 1);
        chatState.conversations.unshift(conversation);
    }
    
    // Initialize messages array if not exists
    if (!chatState.messages.has(conversationId)) {
        chatState.messages.set(conversationId, []);
    }
    
    // Switch to conversation
    selectConversation(conversationId, 'user');
    requestProfileMetadataNow(recipientHex);
    
    closeNewChatModal();
    saveChatState();
    updateConversationsDisplay();
}

function ensureConversationEntry(recipientPubkey, options = {}) {
    if (!recipientPubkey) return null;
    const existing = chatState.conversations.find(c => c.id === recipientPubkey);
    if (existing) {
        return existing;
    }
    
    const createdAtMs = typeof options.createdAt === 'number' ? options.createdAt * 1000 : 0;
    const conversation = {
        id: recipientPubkey,
        recipient: recipientPubkey,
        name: getDisplayNameForPubkey(recipientPubkey),
        lastMessage: '',
        lastMessageTime: createdAtMs,
        unreadCount: 0,
        lastReadTime: 0
    };
    
    chatState.conversations.unshift(conversation);
    if (!chatState.messages.has(recipientPubkey)) {
        chatState.messages.set(recipientPubkey, []);
    }
    
    return conversation;
}

function syncConversationsFromIncognito() {
    if (!incognitoState || !incognitoState.conversations) return;
    let updated = false;
    for (const [recipient, data] of incognitoState.conversations) {
        const exists = chatState.conversations.find(c => c.id === recipient);
        if (!exists) {
            ensureConversationEntry(recipient, { createdAt: data.createdAt });
            updated = true;
        }
        if (typeof requestProfileMetadata === 'function') {
            requestProfileMetadata(recipient);
        }
    }
    if (updated) {
        saveChatState();
        updateConversationsDisplay();
    }
}

// Select conversation
function selectConversation(conversationId, source = 'system') {
    const isMobile = window.innerWidth <= 900;
    if (isMobile && chatState.disableMobileAutoOpen && source !== 'user') {
        return;
    }
    console.log('Selecting conversation:', conversationId);
    chatState.lastConversationSelectSource = source;
    chatState.currentConversation = conversationId;
    
    const conversation = chatState.conversations.find(c => c.id === conversationId);
    if (conversation) {
        if (conversation.unreadCount) {
            conversation.unreadCount = 0;
        }
        const messages = chatState.messages.get(conversationId) || [];
        const lastMessage = messages.reduce((latest, current) => {
            if (!latest) return current;
            return current.timestamp > latest.timestamp ? current : latest;
        }, null);
        if (lastMessage && typeof lastMessage.timestamp === 'number') {
            conversation.lastReadTime = lastMessage.timestamp * 1000;
        } else if (!conversation.lastReadTime) {
            conversation.lastReadTime = Date.now();
        }
    }
    
    // Update UI
    const conversationItems = document.querySelectorAll('.conversation-item');
    conversationItems.forEach(item => item.classList.remove('active'));
    
    const selectedItem = document.querySelector(`[data-conversation-id="${conversationId}"]`);
    if (selectedItem) {
        selectedItem.classList.add('active');
    }
    
    // Update chat title
    const chatTitle = document.getElementById('chatTitle');
    if (chatTitle && conversationId) {
        const recipient = conversation ? conversation.recipient : conversationId;
        chatTitle.textContent = getDisplayNameForPubkey(recipient);
        addPubkeyContextMenu(chatTitle, recipient, 'Recipient Public Key');
    }
    
    // Show messages for this conversation
    displayConversationMessages(conversationId);
    updateChatHeaderProfile();
    renderProfilePanel();
    requestProfileMetadata(conversationId);
    updateConversationsDisplay();
    
    saveChatState();
}

function showConversationsList() {
    const chatInterface = document.getElementById('chatInterface');
    const chatArea = document.querySelector('.chat-area');
    const conversationsSidebar = document.querySelector('.conversations-sidebar');
    const isMobile = window.innerWidth <= 900;
    const shouldAnimate = isMobile && chatInterface && chatInterface.classList.contains('conversation-open');
    const closeToken = nextMobileConversationToken();
    chatState.suppressAutoSelectUntil = Date.now() + MOBILE_AUTOPEN_SUPPRESSION_MS;
    chatState.lastConversationSelectSource = 'system';

    const finalizeClose = () => {
        chatState.currentConversation = null;
        const conversationItems = document.querySelectorAll('.conversation-item');
        conversationItems.forEach(item => item.classList.remove('active'));
        const panel = document.getElementById('profilePanel');
        if (panel && panel.classList.contains('active')) {
            toggleProfilePanel();
        }
        displayConversationMessages(null);
        updateChatHeaderProfile();
        renderProfilePanel();
        saveChatState();
        if (isMobile && chatArea) {
            chatArea.style.display = 'none';
            setPanelAccessibility(chatArea, false);
        }
    };

    if (!shouldAnimate || !chatArea) {
        finalizeClose();
        return;
    }

    if (conversationsSidebar) {
        conversationsSidebar.style.display = '';
        setPanelAccessibility(conversationsSidebar, true);
    }

    const handleTransitionEnd = (event) => {
        if (event.propertyName !== 'transform') return;
        chatArea.removeEventListener('transitionend', handleTransitionEnd);
        if (closeToken !== getMobileConversationToken()) return;
        finalizeClose();
    };

    chatArea.addEventListener('transitionend', handleTransitionEnd);
    setTimeout(() => {
        chatArea.removeEventListener('transitionend', handleTransitionEnd);
        if (closeToken !== getMobileConversationToken()) return;
        finalizeClose();
    }, 300);
    chatInterface.classList.remove('conversation-open');
}

// Display conversation messages
function displayConversationMessages(conversationId) {
    const messagesArea = document.getElementById('messagesArea');
    const messagesContainer = document.getElementById('messagesContainer');
    const messageInputContainer = document.getElementById('messageInputContainer');
    const chatPlaceholder = document.getElementById('chatPlaceholder');
    const chatHeader = document.getElementById('chatHeader');
    const chatTitle = document.getElementById('chatTitle');
    const chatInterface = document.getElementById('chatInterface');
    const conversationsSidebar = document.querySelector('.conversations-sidebar');
    const chatArea = document.querySelector('.chat-area');
    const isMobile = window.innerWidth <= 900;
    
    if (!conversationId) {
        nextMobileConversationToken();
        messagesArea.style.display = 'none';
        messageInputContainer.style.display = 'none';
        chatPlaceholder.style.display = 'flex';
        if (chatTitle) chatTitle.textContent = 'Select a conversation';
        if (chatInterface) {
            chatInterface.classList.remove('conversation-open');
        }
        if (isMobile) {
            if (conversationsSidebar) {
                conversationsSidebar.style.display = '';
                setPanelAccessibility(conversationsSidebar, true);
            }
            if (chatArea) {
                chatArea.style.display = 'none';
                setPanelAccessibility(chatArea, false);
            }
        } else {
            if (conversationsSidebar) {
                conversationsSidebar.style.display = '';
                setPanelAccessibility(conversationsSidebar, true);
            }
            if (chatArea) {
                chatArea.style.display = '';
                setPanelAccessibility(chatArea, true);
            }
        }
        return;
    }
    
    if (chatInterface) {
        const wasOpen = chatInterface.classList.contains('conversation-open');
        if (isMobile) {
            const openToken = nextMobileConversationToken();
            if (chatArea) {
                chatArea.style.display = 'flex';
                setPanelAccessibility(chatArea, true);
            }
            if (conversationsSidebar) {
                conversationsSidebar.style.display = '';
                setPanelAccessibility(conversationsSidebar, false);
            }
            if (wasOpen) {
                if (openToken === getMobileConversationToken()) {
                    chatInterface.classList.add('conversation-open');
                }
            } else {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (
                            openToken === getMobileConversationToken()
                            && chatState.currentConversation === conversationId
                        ) {
                            chatInterface.classList.add('conversation-open');
                        }
                    });
                });
            }
            if (!wasOpen && chatArea && conversationsSidebar) {
                const handleOpenEnd = (event) => {
                    if (event.propertyName !== 'transform') return;
                    if (
                        openToken !== getMobileConversationToken()
                        || !chatInterface.classList.contains('conversation-open')
                        || chatState.currentConversation !== conversationId
                    ) {
                        return;
                    }
                    conversationsSidebar.style.display = 'none';
                };
                chatArea.addEventListener('transitionend', handleOpenEnd, { once: true });
                setTimeout(() => {
                    if (
                        openToken !== getMobileConversationToken()
                        || !chatInterface.classList.contains('conversation-open')
                        || chatState.currentConversation !== conversationId
                    ) {
                        return;
                    }
                    conversationsSidebar.style.display = 'none';
                }, 300);
            }
        } else {
            if (conversationsSidebar) {
                conversationsSidebar.style.display = '';
                setPanelAccessibility(conversationsSidebar, true);
            }
            if (chatArea) {
                chatArea.style.display = '';
                setPanelAccessibility(chatArea, true);
            }
            chatInterface.classList.add('conversation-open');
        }
    }
    
    const messages = chatState.messages.get(conversationId) || [];
    const sortedMessages = [...messages].sort((a, b) => {
        if (a.timestamp === b.timestamp) {
            return (a.id || '').localeCompare(b.id || '');
        }
        return a.timestamp - b.timestamp;
    });
    
    // Show messages area and input, hide placeholder
    messagesArea.style.display = 'flex';
    messageInputContainer.style.display = 'block';
    chatPlaceholder.style.display = 'none';
    
    // Update chat title
    if (chatTitle) {
        const conversation = chatState.conversations.find(c => c.id === conversationId);
        const recipient = conversation ? conversation.recipient : conversationId;
        chatTitle.textContent = getDisplayNameForPubkey(recipient);
    }
    
    if (sortedMessages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="welcome-screen">
                <div class="welcome-content">
                    <span class="material-symbols-rounded">person_off</span>
                    <h2>Start a conversation</h2>
                    <p>Send your first message to begin the incognito conversation</p>
                </div>
            </div>
        `;
        return;
    }
    
    ensureProfileFetched(conversationId);
    
    messagesContainer.innerHTML = sortedMessages.map(message => {
        // Format the sender identity for display
        let senderDisplayName;
        if (message.sent) {
            senderDisplayName = getDisplayNameForPubkey(userKeys.publicKey);
        } else {
            senderDisplayName = getDisplayNameForPubkey(chatState.currentConversation);
        }
        const senderInitial = senderDisplayName.charAt(0).toUpperCase();
        const senderPubkey = message.sent ? userKeys.publicKey : chatState.currentConversation;
        const avatarSVG = getAvatarMarkupForPubkey(senderPubkey, 40);
        
        // Determine message status and styling
        let statusClass = '';
        let statusIndicator = '';
        let retryButton = '';
        
        if (message.sent) {
            const status = message.status || 'sent';
            switch (status) {
                case 'pending':
                    statusClass = 'status-pending';
                    statusIndicator = '<span class="message-status pending" title="Sending..."><span class="material-symbols-rounded">schedule</span></span>';
                    break;
                case 'failed':
                    statusClass = 'status-failed';
                    statusIndicator = '<span class="message-status failed" title="Failed to send"><span class="material-symbols-rounded">error</span></span>';
                    retryButton = `<button class="retry-btn" onclick="retryMessage('${message.id}')" title="Retry sending">
                        <span class="material-symbols-rounded">refresh</span> Retry
                    </button>`;
                    break;
                case 'sent':
                default:
                    statusClass = 'status-sent';
                    statusIndicator = '<span class="message-status sent" title="Sent"><span class="material-symbols-rounded">check</span></span>';
                    break;
            }
        }
        
        return `
            <div class="message ${message.sent ? 'sent' : 'received'} ${statusClass}" 
                 data-message-id="${message.id}" 
                 data-message-content="${escapeHtml(message.content)}"
                 data-message-timestamp="${message.timestamp}">
            <div class="message-avatar">
                ${avatarSVG}
            </div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-author">${senderDisplayName}</span>
                        <span class="message-time">${formatTimestamp(message.timestamp)}</span>
                        ${statusIndicator}
                    </div>
                    <div class="message-bubble">${escapeHtml(message.content)}</div>
                    <div class="message-footer">
                        ${message.incognito ? '<span class="incognito-tag">Incognito</span>' : ''}
                        ${message.error ? `<div class="error-info">${escapeHtml(message.error)}</div>` : ''}
                        ${retryButton}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Add context menu functionality to messages
    setupMessageContextMenus(sortedMessages);
    
    // Add avatar context menu listeners
    const messageAvatars = messagesContainer.querySelectorAll('.message-avatar');
    messageAvatars.forEach(avatar => {
        avatar.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showAvatarContextMenu(e, avatar);
        });
    });
}

// Send message to conversation
async function sendMessageToConversation(conversationId, messageText) {
    console.log('Sending message to conversation:', conversationId, messageText);
    
    if (!messageText.trim()) return;
    
    const conversation = chatState.conversations.find(c => c.id === conversationId);
    if (!conversation) {
        console.error('Conversation not found:', conversationId);
        return;
    }
    
    try {
        // Send the incognito message
        await sendIncognitoMessage(conversation.recipient, messageText);
        
        // Don't add message locally - let the actual message processing handle it
        // This prevents duplicates when the message is sent and received back
        
        // Update conversation
        conversation.lastMessage = messageText;
        conversation.lastMessageTime = Date.now();
        
        // Update displays
        displayConversationMessages(conversationId);
        updateConversationsDisplay();
        saveChatState();
        
    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Error sending message: ' + error.message, 'error');
    }
}

// Handle message keydown
function handleMessageKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendCurrentMessage();
    }
}

// Send current message
function sendCurrentMessage() {
    const messageInput = document.getElementById('messageInput');
    const messageText = messageInput.value.trim();
    
    if (!messageText || !chatState.currentConversation) return;
    
    sendMessageToConversation(chatState.currentConversation, messageText);
    messageInput.value = '';
    
    // Auto-resize textarea
    messageInput.style.height = 'auto';
}

// Update conversations display
function updateConversationsDisplay() {
    const conversationsList = document.getElementById('conversationsList');
    
    if (chatState.conversations.length === 0) {
        conversationsList.innerHTML = `
            <div class="no-conversations">
            <span class="material-symbols-rounded">chat</span>
                <p>No conversations yet</p>
                <span>Start a new conversation to begin messaging</span>
            </div>
        `;
        return;
    }
    
    conversationsList.innerHTML = chatState.conversations.map(conversation => {
        ensureProfileFetched(conversation.recipient);
        const messages = chatState.messages.get(conversation.id) || [];
        const lastMessage = messages.reduce((latest, current) => {
            if (!latest) return current;
            return current.timestamp > latest.timestamp ? current : latest;
        }, null);
        const unreadCount = conversation.unreadCount || 0;
        const unreadBadge = unreadCount > 0
            ? `<div class="conversation-unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</div>`
            : '';
        
        const displayName = getDisplayNameForPubkey(conversation.recipient);
        const avatarSVG = getAvatarMarkupForPubkey(conversation.recipient, 40);
        
        return `
            <div class="conversation-item ${conversation.id === chatState.currentConversation ? 'active' : ''}" 
                 data-conversation-id="${conversation.id}"
                 onclick="selectConversation('${conversation.id}', 'user')">
                <div class="conversation-avatar">
                    ${avatarSVG}
                </div>
                <div class="conversation-info">
                    <div class="conversation-name">${displayName}</div>
                    <div class="conversation-preview">${lastMessage ? escapeHtml(lastMessage.content.substring(0, 50)) : 'No messages yet'}</div>
                    <div class="conversation-time">${lastMessage ? formatTimestamp(lastMessage.timestamp) : ''}</div>
                </div>
                ${unreadBadge}
            </div>
        `;
    }).join('');
    
    // Add context menus to conversation items
    const conversationElements = document.querySelectorAll('.conversation-item');
    conversationElements.forEach((element, index) => {
        const conversation = chatState.conversations[index];
        if (conversation) {
            addConversationContextMenu(element, conversation);
        }
    });
    
    // Add avatar context menu listeners to conversation avatars
    const conversationAvatars = document.querySelectorAll('.conversation-avatar');
    conversationAvatars.forEach(avatar => {
        avatar.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showAvatarContextMenu(e, avatar);
        });
    });
}

// Process incoming message for conversation
function processIncomingMessageForConversation(event, decryptedContent) {
    console.log('Processing incoming message for conversation:', event.pubkey);
    try {
        const parsedPayload = JSON.parse(decryptedContent);
        const originalMessage = parsedPayload && parsedPayload.event ? parsedPayload.event : parsedPayload;
        if (parsedPayload && parsedPayload.profile) {
            const profilePubkey = originalMessage && originalMessage.pubkey ? originalMessage.pubkey : null;
            if (profilePubkey) {
                upsertProfileCache(profilePubkey, parsedPayload.profile, event.created_at);
            }
        }
        if (!originalMessage || !originalMessage.id || typeof originalMessage.content !== 'string') {
            return;
        }
        
        // Check if we've already processed this message in this function
        const messageKey = `${event.id}_${originalMessage.id}`;
        if (processedMessageIds.has(messageKey)) {
            console.log('Skipping already processed message in processIncomingMessageForConversation:', messageKey);
            return;
        }
        
        // Mark this message as processed
        processedMessageIds.add(messageKey);
        
        // Find which conversation this belongs to
        let conversationId = null;
        let senderPubkey = null;
        for (const [recipient, data] of incognitoState.conversations) {
            // Check if this is a message from their conversation identity (initial messages)
            if (data.conversationPubkey === event.pubkey) {
                conversationId = recipient;
                senderPubkey = recipient;
                break;
            }
            // Check if this is our own outgoing message (conversation identity)
            if (data.conversationIdentity && data.conversationIdentity.publicKey === event.pubkey) {
                conversationId = recipient;
                senderPubkey = recipient;
                break;
            }
            // Check if this is a reply from the recipient's reply identity
            if (data.recipientReplyIdentity && data.recipientReplyIdentity.publicKey === event.pubkey) {
                conversationId = recipient;
                senderPubkey = recipient;
                break;
            }
        }
        
        // If we didn't find a conversation but we have conversations, this might be a reply from the recipient
        if (!conversationId && incognitoState.conversations.size > 0) {
            console.log('No exact match found in processIncomingMessageForConversation, checking if this is a reply from recipient...');
            
            // Look for any conversation where this could be a reply from the recipient
            for (const [recipient, data] of incognitoState.conversations) {
                // If this pubkey doesn't match our conversation identity or sender identity, 
                // and we don't have a recipientReplyIdentity yet, this might be the first reply
                if (data.conversationPubkey !== event.pubkey && 
                    (!data.senderIdentity || data.senderIdentity.publicKey !== event.pubkey) &&
                    !data.recipientReplyIdentity) {
                    
                    console.log('Found potential recipient reply for conversation in processIncomingMessageForConversation:', recipient);
                    conversationId = recipient;
                    senderPubkey = recipient;
                    break;
                }
            }
        }
        
        if (!conversationId) {
            console.log('No conversation found for incoming message');
            return;
        }
        
        if (typeof requestProfileMetadata === 'function') {
            requestProfileMetadata(conversationId);
        }
        
        // Ensure conversation exists in chatState
        let chatConversation = chatState.conversations.find(c => c.id === conversationId);
        if (!chatConversation) {
            console.log('Creating new conversation in chatState for incoming message from:', senderPubkey);
            chatConversation = {
                id: conversationId,
                recipient: senderPubkey,
                name: getDisplayNameForPubkey(senderPubkey),
                lastMessage: '',
                lastMessageTime: Date.now(),
                unreadCount: 0,
                lastReadTime: 0
            };
            chatState.conversations.unshift(chatConversation);
            console.log('Created conversation:', chatConversation);
            ensureProfileFetched(senderPubkey);
            
            // Show a notification about the new conversation
            showNotification(`New conversation started with ${formatPubkeyForDisplay(senderPubkey)}`, 'info');
        }
        
        // Ensure the conversation exists in incognitoState for the receiver to be able to reply
        if (!incognitoState.conversations.has(senderPubkey)) {
            console.log('Creating incognito conversation for receiver to reply to:', senderPubkey);
            const conversationData = createIncognitoConversation(senderPubkey);
            incognitoState.conversations.set(senderPubkey, conversationData);
            saveIncognitoState();
            console.log('Incognito conversation created for reply:', conversationData);
        } else {
            console.log('Found existing incognito conversation for:', senderPubkey);
            console.log('Conversation data:', incognitoState.conversations.get(senderPubkey));
        }
        
        // If this is a reply from the recipient's reply identity, update our conversation data
        const conversationData = incognitoState.conversations.get(senderPubkey);
        if (conversationData && conversationData.conversationPubkey !== event.pubkey && !conversationData.recipientReplyIdentity) {
            // This is likely a reply from the recipient - store their reply identity
            conversationData.recipientReplyIdentity = {
                publicKey: event.pubkey
            };
            console.log('Learned recipient reply identity in processIncomingMessageForConversation:', event.pubkey, 'for conversation with:', senderPubkey);
            saveIncognitoState();
        }
        
        // Add message to conversation (with deduplication)
        const message = {
            id: originalMessage.id,
            content: originalMessage.content,
            timestamp: originalMessage.created_at,
            sent: originalMessage.pubkey === userKeys.publicKey, // Check if this is our own message
            incognito: true,
            nostrEvent: event // Store the original Nostr event for context menu
        };
        
        const messages = chatState.messages.get(conversationId) || [];
        
        // Check for duplicate messages
        const isDuplicate = messages.some(existing => existing.id === message.id);
        if (!isDuplicate) {
            messages.push(message);
            messages.sort((a, b) => {
                if (a.timestamp === b.timestamp) {
                    return (a.id || '').localeCompare(b.id || '');
                }
                return a.timestamp - b.timestamp;
            });
            chatState.messages.set(conversationId, messages);
            console.log('Added new message to conversation:', message.id, 'sent:', message.sent);
        } else {
            console.log('Skipping duplicate message:', message.id);
        }
        
        // Update conversation
        if (chatConversation) {
            const messageTimeMs = typeof message.timestamp === 'number' ? message.timestamp * 1000 : Date.now();
            const shouldUpdateLast = !chatConversation.lastMessageTime || messageTimeMs >= chatConversation.lastMessageTime;
            if (shouldUpdateLast) {
                chatConversation.lastMessage = message.content;
                chatConversation.lastMessageTime = messageTimeMs;
            }
            if (chatState.currentConversation === conversationId) {
                chatConversation.unreadCount = 0;
                chatConversation.lastReadTime = Date.now();
            } else if (!message.sent && !isDuplicate) {
                chatConversation.unreadCount = (chatConversation.unreadCount || 0) + 1;
            }
        }
        
        // Update displays if this is the current conversation
        if (chatState.currentConversation === conversationId) {
            displayConversationMessages(conversationId);
        } else {
            // If no conversation is currently selected, automatically select this one
            const suppressAutoSelect = chatState.suppressAutoSelectUntil
                && Date.now() < chatState.suppressAutoSelectUntil;
            const isMobile = window.innerWidth <= 900;
            const disableAutoOpen = isMobile && chatState.disableMobileAutoOpen;
            if (!chatState.currentConversation && !suppressAutoSelect && !disableAutoOpen) {
                console.log('Auto-selecting conversation:', conversationId);
                selectConversation(conversationId);
            }
        }
        
        updateConversationsDisplay();
        saveChatState();
        
        console.log('Message processed successfully. Conversation updated.');
        
        // Show notification
        const notificationsSuppressed = chatState.suppressNotificationsUntil
            && Date.now() < chatState.suppressNotificationsUntil;
        const shouldNotify = !notificationsSuppressed
            && !message.sent
            && chatState.currentConversation !== conversationId
            && !isDuplicate;
        if (shouldNotify) {
            const now = Date.now();
            if (now - lastNotificationTime > NOTIFICATION_COOLDOWN) {
                const senderName = formatPubkey(senderPubkey);
                showNotification(`New message from ${senderName}!`, 'success');
                lastNotificationTime = now;
            }
        }
        
    } catch (parseError) {
        console.error('Error parsing decrypted message:', parseError);
    }
}

// Function to retry sending a failed message
async function retryMessage(originalMessageId) {
    console.log('Retrying message:', originalMessageId);
    
    // Find the message in conversations by original message ID
    let foundMessage = null;
    let foundConversationId = null;
    
    for (const [conversationId, messages] of chatState.messages) {
        const message = messages.find(msg => msg.id === originalMessageId);
        if (message) {
            foundMessage = message;
            foundConversationId = conversationId;
            break;
        }
    }
    
    if (!foundMessage) {
        console.error('Message not found for retry:', originalMessageId);
        showNotification('Message not found for retry', 'error');
        return;
    }
    
    try {
        // Update UI to show retrying status
        foundMessage.status = 'pending';
        foundMessage.error = null;
        
        // Refresh display
        if (chatState.currentConversation === foundConversationId) {
            displayConversationMessages(foundConversationId);
        }
        saveChatState();
        
        // Wait a bit before retrying to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Store the message content and remove the failed message before retrying
        const messageContent = foundMessage.content;
        const messageIndex = chatState.messages.get(foundConversationId).findIndex(msg => msg.id === originalMessageId);
        
        // Remove the failed message from the conversation
        if (messageIndex !== -1) {
            const messages = chatState.messages.get(foundConversationId);
            messages.splice(messageIndex, 1);
            chatState.messages.set(foundConversationId, messages);
            
            // Refresh display immediately to remove the failed message
            if (chatState.currentConversation === foundConversationId) {
                displayConversationMessages(foundConversationId);
            }
            saveChatState();
        }
        
        // Resend the message (this will create a new message with new ID)
        await sendIncognitoMessage(foundConversationId, messageContent);
        
        showNotification('Message retry successful!', 'success');
    } catch (error) {
        console.error('Error retrying message:', error);
        
        // If retry failed, restore the original failed message
        const messages = chatState.messages.get(foundConversationId);
        foundMessage.status = 'failed';
        foundMessage.error = error.message;
        
        // Add the message back if it was removed
        if (!messages.find(msg => msg.id === originalMessageId)) {
            messages.push(foundMessage);
            chatState.messages.set(foundConversationId, messages);
        }
        
        // Refresh display
        if (chatState.currentConversation === foundConversationId) {
            displayConversationMessages(foundConversationId);
        }
        saveChatState();
        
        showNotification('Retry failed: ' + error.message, 'error');
    }
}

// Setup context menus for messages
function setupMessageContextMenus(messages) {
    const messageElements = document.querySelectorAll('.message');
    
    messageElements.forEach((messageElement, index) => {
        const message = messages[index];
        if (!message) return;
        
        // Get the Nostr event data if available
        let nostrEvent = null;
        if (message.nostrEvent) {
            nostrEvent = message.nostrEvent;
        } else if (message.wrapperEventId) {
            // For sent messages, create a basic event object from the wrapper
            nostrEvent = {
                id: message.wrapperEventId,
                pubkey: message.sent ? userKeys.publicKey : chatState.currentConversation,
                created_at: message.timestamp,
                kind: 4, // DM kind
                content: message.content,
                tags: [],
                sig: ''
            };
        } else {
            // Create a basic event object for display purposes
            nostrEvent = {
                id: message.id,
                pubkey: message.sent ? userKeys.publicKey : chatState.currentConversation,
                created_at: message.timestamp,
                kind: 4, // DM kind
                content: message.content,
                tags: [],
                sig: ''
            };
        }
        
        // Add context menu functionality
        addMessageContextMenu(messageElement, message, nostrEvent);
    });
}
