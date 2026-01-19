// Relay connection and message handling functions

function getEnabledRelayUrls() {
    const urls = relaySettings.relays
        .filter((relay) => relay.enabled)
        .map((relay) => relay.url);
    return Array.from(new Set(urls));
}

function getConnectedRelays() {
    const connected = [];
    relayConnections.forEach((state) => {
        if (state.socket && state.socket.readyState === WebSocket.OPEN) {
            connected.push(state);
        }
    });
    return connected;
}

function getConnectedRelayUrls() {
    return getConnectedRelays().map((state) => state.url);
}

function hasActiveRelayConnection() {
    return getConnectedRelays().length > 0;
}

// Toggle relay connection (connect/disconnect)
async function toggleRelayConnection() {
    if (hasActiveRelayConnection()) {
        disconnectRelays();
    } else {
        await connectRelays();
    }
}

// Disconnect from all relays
function disconnectRelays() {
    relayConnections.forEach((state) => {
        state.manualClose = true;
        if (state.socket && state.socket.readyState !== WebSocket.CLOSED) {
            state.socket.close();
        }
    });
    relayConnection = null;
    updateStatus();
    updateRelayButtonState();
    renderRelayList();
}

// Update relay button state based on connection status
function updateRelayButtonState() {
    const toggleBtn = document.getElementById('relayToggleBtn');
    const toggleIcon = document.getElementById('relayToggleIcon');
    const toggleText = document.getElementById('relayToggleText');
    
    if (!toggleBtn || !toggleIcon || !toggleText) return;
    
    const connectedCount = getConnectedRelays().length;
    
    if (connectedCount > 0) {
        toggleBtn.className = 'btn btn-secondary';
        toggleIcon.textContent = 'power_off';
        toggleText.textContent = `Disconnect (${connectedCount})`;
    } else {
        toggleBtn.className = 'btn btn-primary';
        toggleIcon.textContent = 'power';
        toggleText.textContent = 'Connect';
    }
}

// Connect to all enabled relays
async function connectRelays() {
    if (!userKeys) {
        showNotification('Please set your keys first', 'error');
        return;
    }
    
    const relayUrls = getEnabledRelayUrls();
    if (!relayUrls.length) {
        showNotification('No relays are enabled', 'error');
        return;
    }
    
    relayUrls.forEach((relayUrl) => {
        connectRelay(relayUrl);
    });
    updateRelayButtonState();
}

function scheduleReconnect(relayUrl) {
    const state = relayConnections.get(relayUrl);
    if (!state || state.manualClose || !relaySettings.autoReconnect) return;
    
    if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
    }
    
    const attempt = state.reconnectAttempts || 0;
    const baseDelay = relaySettings.reconnectBaseDelayMs;
    const maxDelay = relaySettings.reconnectMaxDelayMs;
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    const jitter = Math.floor(Math.random() * 400);
    
    state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = null;
        if (!state.manualClose) {
            connectRelay(relayUrl);
        }
    }, delay + jitter);
}

// Connect to a single relay
function connectRelay(relayUrl) {
    if (!relayUrl) return;
    
    const existing = relayConnections.get(relayUrl);
    if (existing && existing.socket &&
        (existing.socket.readyState === WebSocket.OPEN || existing.socket.readyState === WebSocket.CONNECTING)) {
        return;
    }
    
    const relayState = existing || {
        url: relayUrl,
        socket: null,
        reconnectAttempts: 0,
        reconnectTimer: null,
        manualClose: false
    };
    
    relayState.manualClose = false;
    relayState.socket = new WebSocket(relayUrl);
    relayConnections.set(relayUrl, relayState);
    
    relayState.socket.onopen = function() {
        relayState.reconnectAttempts = 0;
        updateStatus();
        updateRelayButtonState();
        renderRelayList();
        chatState.suppressNotificationsUntil = Date.now() + 4000;
        if (!relayConnection) {
            relayConnection = relayState.socket;
        }
        subscribeToIncognitoMessages(relayState.socket);
        if (typeof subscribeToProfiles === 'function') {
            const pubkeys = chatState.conversations.map((conversation) => conversation.recipient);
            subscribeToProfiles(relayState.socket, pubkeys);
        }
        if (typeof refreshProfilesForConversations === 'function') {
            refreshProfilesForConversations();
        }
        if (typeof scheduleProfileRequestFlush === 'function') {
            scheduleProfileRequestFlush(true);
        }
        if (typeof requestProfileMetadataNow === 'function' && userKeys) {
            requestProfileMetadataNow(userKeys.publicKey);
        }
        if (typeof subscribeToIncognitoBackup === 'function') {
            subscribeToIncognitoBackup(relayState.socket);
        }
        if (typeof attemptPendingIncognitoBackup === 'function') {
            attemptPendingIncognitoBackup();
        }
        if (typeof attemptPendingProfilePublish === 'function') {
            attemptPendingProfilePublish();
        }
    };
    
    relayState.socket.onclose = function() {
        if (!relayState.manualClose) {
            relayState.reconnectAttempts += 1;
            scheduleReconnect(relayUrl);
        }
        updateStatus();
        updateRelayButtonState();
        renderRelayList();
    };
    
    relayState.socket.onerror = function() {
        updateRelayButtonState();
        renderRelayList();
    };
    
    relayState.socket.onmessage = function(event) {
        handleRelayMessage(event.data, relayUrl);
    };
}

// Handle incoming relay messages
function handleRelayMessage(data, relayUrl = null) {
    try {
        const message = JSON.parse(data);
        
        console.log('=== RELAY MESSAGE RECEIVED ===');
        if (relayUrl) {
            console.log('Relay:', relayUrl);
        }
        console.log('Message type:', message[0]);
        
        if (message[0] === 'EVENT') {
            const event = message[2];
            
            console.log('Event details:');
            console.log('- Event ID:', event.id);
            console.log('- Kind:', event.kind);
            console.log('- Pubkey:', event.pubkey.substring(0, 16) + '...');
            console.log('- Created at:', event.created_at);
            console.log('- Content length:', event.content?.length);
            console.log('- Tags:', event.tags);
            
            // Add event deduplication
            if (processedEventIds.has(event.id)) {
                console.log('DUPLICATE EVENT - already processed:', event.id);
                return; // Already processed this event
            }
            addProcessedEventId(event.id);
            console.log('NEW EVENT - processing:', event.id);
            
            if (event.kind === 0) {
                try {
                    const metadata = JSON.parse(event.content || '{}');
                    upsertProfileCache(event.pubkey, metadata, event.created_at);
                } catch (error) {
                    console.warn('Failed to parse profile metadata:', error);
                }
                return;
            }
            
            if (event.kind === 30078) {
                if (typeof handleIncognitoBackupEvent === 'function') {
                    handleIncognitoBackupEvent(event);
                }
                return;
            }
            
            if (event.kind === 4) {
                // Check if it's an incognito invitation or message
                const recipientTag = event.tags.find(tag => tag[0] === 'p');
                const isForUs = recipientTag && recipientTag[1] === userKeys.publicKey;
                
                console.log('=== KIND 4 EVENT ROUTING ===');
                console.log('Event pubkey:', event.pubkey.substring(0, 16) + '...');
                console.log('Recipient tag:', recipientTag ? recipientTag[1].substring(0, 16) + '...' : 'none');
                console.log('Our pubkey:', userKeys.publicKey.substring(0, 16) + '...');
                console.log('Is for us:', isForUs);
                console.log('Has conversations:', incognitoState.conversations.size > 0);
                
                if (isForUs) {
                            // First, check if this is from a known conversation identity (highest priority)
                            const isFromConversationIdentity = Array.from(incognitoState.conversations.values())
                                .some(conv => conv.conversationPubkey === event.pubkey);
                            
                            if (isFromConversationIdentity) {
                                console.log('>>> Processing as incognito message (from conversation identity)');
                                handleIncognitoMessage(event);
                            } else if (incognitoState.conversations.size > 0) {
                                // We have conversations, so this is likely a message
                        console.log('>>> Processing as incognito message (has conversations)');
                        handleIncognitoMessage(event);
                    } else {
                        // Check if we have a pending invitation for this sender
                        const hasPendingInvitation = Array.from(incognitoState.pendingInvitations.values())
                            .some(inv => inv.senderPubkey === event.pubkey);
                        
                        if (hasPendingInvitation) {
                            console.log('>>> Processing as incognito message (has pending invitation)');
                            handleIncognitoMessage(event);
                        } else {
                            // No conversations yet, likely an invitation
                            console.log('>>> Processing as invitation (no conversations)');
                            handleIncognitoInvitation(event);
                        }
                    }
                } else {
                    // Check if it's an incognito message from a conversation identity
                    // Only process if we have active conversations to reduce spam
                    if (incognitoState.conversations.size > 0) {
                        console.log('>>> Processing incognito message from:', event.pubkey.substring(0, 16) + '...');
                        console.log('>>> Available conversation pubkeys:');
                        for (const [recipient, data] of incognitoState.conversations) {
                            console.log('   - Conv with', recipient.substring(0, 16) + '... has pubkey:', data.conversationPubkey?.substring(0, 16) + '...');
                        }
                        handleIncognitoMessage(event);
                    } else {
                        console.log('>>> Ignoring message - no active conversations');
                    }
                    // Silently ignore messages when no active conversations
                }
            } else {
                console.log('>>> Ignoring non-kind-4 event');
            }
        } else if (message[0] === 'OK') {
            console.log('=== RELAY OK RESPONSE ===');
            console.log('Event ID:', message[1]);
            console.log('Accepted:', message[2]);
            console.log('Message:', message[3] || 'no message');
            const eventId = message[1];
            const accepted = !!message[2];
            const reason = message[3] || 'Unknown error';
            updateEventDeliveryStatus(eventId, relayUrl, accepted, reason);
        } else if (message[0] === 'NOTICE') {
            console.log('=== RELAY NOTICE ===');
            console.log('Notice:', message[1]);
        } else if (message[0] === 'EOSE') {
            const subId = message[1];
            relayConnections.forEach((state) => {
                if (state.socket && state.socket.readyState === WebSocket.OPEN && state.incognitoSubId === subId) {
                    if (typeof retryPendingMessages === 'function') {
                        retryPendingMessages();
                    }
                    if (chatState && chatState.currentConversation) {
                        displayConversationMessages(chatState.currentConversation);
                    }
                }
            });
        } else {
            console.log('=== OTHER RELAY MESSAGE ===');
            console.log('Type:', message[0]);
            console.log('Full message:', message);
        }
    } catch (error) {
        console.error('=== ERROR HANDLING RELAY MESSAGE ===');
        console.error('Error handling relay message:', error);
        console.error('Raw data:', data);
    }
}

function updateEventDeliveryStatus(eventId, relayUrl, accepted, reason) {
    if (!messageSendingStatus.has(eventId)) {
        return;
    }
    
    const status = messageSendingStatus.get(eventId);
    if (status.retryTimer) {
        clearTimeout(status.retryTimer);
        status.retryTimer = null;
    }
    status.relayAcks = status.relayAcks || {};
    
    if (relayUrl) {
        status.relayAcks[relayUrl] = {
            accepted,
            reason: accepted ? null : reason
        };
    }
    
    status.acceptedRelays = status.acceptedRelays || [];
    status.rejectedRelays = status.rejectedRelays || [];
    
    if (accepted) {
        if (!status.acceptedRelays.includes(relayUrl)) {
            status.acceptedRelays.push(relayUrl);
        }
        status.status = 'sent';
        status.error = null;
        messageSendingStatus.set(eventId, status);
        updateMessageStatus(eventId, 'sent');
        return;
    }
    
    if (relayUrl && !status.rejectedRelays.includes(relayUrl)) {
        status.rejectedRelays.push(relayUrl);
    }
    
    if (status.status === 'sent') {
        messageSendingStatus.set(eventId, status);
        return;
    }
    
    const pendingRelays = status.pendingRelays && status.pendingRelays.length
        ? status.pendingRelays
        : Object.keys(status.relayAcks);
    const allResponded = pendingRelays.every((url) => status.relayAcks[url]);
    const hasAccepted = status.acceptedRelays.length > 0;
    
    if (allResponded && !hasAccepted) {
        status.status = 'failed';
        status.error = reason;
        messageSendingStatus.set(eventId, status);
        if (reason.includes('rate-limited')) {
            showNotification('Message failed: Rate limited by relay. Please wait before sending more messages.', 'error');
        } else if (reason.includes('pow:')) {
            showNotification('Message failed: Relay requires proof of work.', 'error');
        } else if (reason.includes('auth-required')) {
            showNotification('Message failed: Relay requires authentication.', 'error');
        } else {
            showNotification(`Message failed: ${reason}`, 'error');
        }
        updateMessageStatus(eventId, 'failed', reason);
        return;
    }
    
    status.status = 'pending';
    status.error = reason;
    messageSendingStatus.set(eventId, status);
}

function ensureRelayEnabled(relayUrl) {
    const normalized = normalizeRelayUrl(relayUrl);
    if (!normalized) return null;
    
    let relay = relaySettings.relays.find((item) => item.url === normalized);
    if (!relay) {
        relay = {
            url: normalized,
            enabled: true,
            isDefault: false
        };
        relaySettings.relays.push(relay);
    } else if (!relay.enabled) {
        relay.enabled = true;
    }
    
    saveRelaySettings();
    renderRelayList();
    connectRelay(normalized);
    
    return normalized;
}

function getIncognitoHistorySince() {
    const fallbackSeconds = 30 * 24 * 60 * 60;
    const nowSeconds = Math.floor(Date.now() / 1000);
    let since = nowSeconds - fallbackSeconds;
    let earliestMs = null;

    if (chatState && Array.isArray(chatState.conversations)) {
        chatState.conversations.forEach((conversation) => {
            const candidates = [conversation.lastReadTime, conversation.lastMessageTime]
                .filter((value) => typeof value === 'number' && value > 0);
            candidates.forEach((value) => {
                if (earliestMs === null || value < earliestMs) {
                    earliestMs = value;
                }
            });
        });
    }

    if (earliestMs) {
        since = Math.floor(earliestMs / 1000) - 300;
    }
    
    if (incognitoState && incognitoState.conversations) {
        incognitoState.conversations.forEach((data) => {
            if (data && typeof data.createdAt === 'number') {
                const createdMs = data.createdAt * 1000;
                if (earliestMs === null || createdMs < earliestMs) {
                    earliestMs = createdMs;
                }
            }
        });
        if (earliestMs) {
            since = Math.floor(earliestMs / 1000) - 300;
        }
    }

    return Math.max(0, since);
}

function buildIncognitoSubscriptionFilters(since) {
    const filters = [];
    const incomingAuthors = new Set();
    const outgoingAuthors = new Set();
    
    if (incognitoState && incognitoState.conversations) {
        incognitoState.conversations.forEach((data) => {
            if (data.conversationPubkey) {
                incomingAuthors.add(data.conversationPubkey);
            }
            if (data.recipientReplyIdentity && data.recipientReplyIdentity.publicKey) {
                incomingAuthors.add(data.recipientReplyIdentity.publicKey);
            }
            if (data.conversationIdentity && data.conversationIdentity.publicKey) {
                outgoingAuthors.add(data.conversationIdentity.publicKey);
            }
        });
    }
    
    if (userKeys && userKeys.publicKey) {
        filters.push({
            kinds: [4],
            '#p': [userKeys.publicKey],
            since,
            limit: 200
        });
    }
    
    if (incomingAuthors.size) {
        filters.push({
            kinds: [4],
            authors: Array.from(incomingAuthors),
            since,
            limit: 200
        });
    }
    
    if (outgoingAuthors.size) {
        filters.push({
            kinds: [4],
            authors: Array.from(outgoingAuthors),
            since,
            limit: 200
        });
    }
    
    return filters;
}

// Subscribe to incognito messages (listen for messages from other people's conversation identities)
function subscribeToIncognitoMessages(socket) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
    }
    
    console.log('Subscribing to incognito messages...');
    const since = getIncognitoHistorySince();
    const filters = buildIncognitoSubscriptionFilters(since);
    if (!filters.length) {
        return;
    }
    
    const subscriptionId = 'incognito_' + Date.now();
    if (relayConnections) {
        relayConnections.forEach((state) => {
            if (state.socket === socket && state.incognitoSubId) {
                socket.send(JSON.stringify(['CLOSE', state.incognitoSubId]));
                state.incognitoSubId = null;
            }
        });
    }
    
    const subscribeMessage = JSON.stringify([
        'REQ',
        subscriptionId,
        ...filters
    ]);
    
    socket.send(subscribeMessage);
    relayConnections.forEach((state) => {
        if (state.socket === socket) {
            state.incognitoSubId = subscriptionId;
        }
    });
    console.log('Subscribed to incognito messages with targeted filters');
}

// Send a message to the relay
async function sendMessage() {
    const recipientInput = document.getElementById('testRecipientInput');
    const messageInput = document.getElementById('testMessageInput');
    const recipientPubkey = validatePubkey(recipientInput ? recipientInput.value : '');
    const messageText = messageInput ? messageInput.value.trim() : '';
    
    if (!recipientPubkey) {
        return;
    }
    
    if (!messageText) {
        showNotification('Please enter a message', 'error');
        return;
    }
    
    if (!userKeys) {
        showNotification('Please set your keys first', 'error');
        return;
    }
    
    if (!hasActiveRelayConnection()) {
        showNotification('Please connect to a relay first', 'error');
        return;
    }
    
    try {
        // Always send incognito message
        console.log('Sending incognito message to:', recipientPubkey);
        await sendIncognitoMessage(recipientPubkey, messageText);
        
        // Clear the message input
        if (messageInput) {
            messageInput.value = '';
        }
        
    } catch (error) {
        showNotification('Error sending incognito message: ' + error.message, 'error');
    }
}

function sendToRelays(payload) {
    const connected = getConnectedRelays();
    if (!connected.length) {
        throw new Error('No relay connections available');
    }
    
    connected.forEach((state) => {
        try {
            state.socket.send(payload);
        } catch (error) {
            console.error('Failed sending to relay:', state.url, error);
        }
    });
}

function normalizeRelayUrl(url) {
    if (!url) return '';
    const trimmed = url.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('wss://') || trimmed.startsWith('ws://')) {
        return trimmed;
    }
    return `wss://${trimmed}`;
}

function addRelay() {
    const input = document.getElementById('relayAddInput');
    if (!input) return;
    const relayUrl = normalizeRelayUrl(input.value);
    if (!relayUrl) {
        showNotification('Please enter a relay URL', 'error');
        return;
    }
    
    const exists = relaySettings.relays.some((relay) => relay.url === relayUrl);
    if (exists) {
        showNotification('Relay already exists', 'info');
        return;
    }
    
    relaySettings.relays.push({
        url: relayUrl,
        enabled: true,
        isDefault: false
    });
    saveRelaySettings();
    renderRelayList();
    input.value = '';
}

function toggleRelayEnabled(relayUrl) {
    const relay = relaySettings.relays.find((item) => item.url === relayUrl);
    if (!relay) return;
    relay.enabled = !relay.enabled;
    saveRelaySettings();
    if (relay.enabled) {
        connectRelay(relayUrl);
    } else {
        disconnectRelayByUrl(relayUrl);
    }
    renderRelayList();
}

function removeRelay(relayUrl) {
    relaySettings.relays = relaySettings.relays.filter((relay) => relay.url !== relayUrl);
    saveRelaySettings();
    disconnectRelayByUrl(relayUrl);
    renderRelayList();
}

function disconnectRelayByUrl(relayUrl) {
    const state = relayConnections.get(relayUrl);
    if (!state) return;
    state.manualClose = true;
    if (state.socket && state.socket.readyState !== WebSocket.CLOSED) {
        state.socket.close();
    }
    relayConnections.delete(relayUrl);
}

function renderRelayList() {
    const relayList = document.getElementById('relayList');
    if (!relayList) return;
    
    const connectedUrls = new Set(getConnectedRelays().map((state) => state.url));
    
    relayList.innerHTML = relaySettings.relays.map((relay) => {
        const isConnected = connectedUrls.has(relay.url);
        const statusClass = isConnected ? 'relay-connected' : 'relay-disconnected';
        const statusText = isConnected ? 'Connected' : 'Disconnected';
        const canRemove = !relay.isDefault;
        
        return `
            <div class="relay-item ${statusClass}">
                <label class="relay-toggle">
                    <input type="checkbox" ${relay.enabled ? 'checked' : ''} onchange="toggleRelayEnabled('${relay.url}')">
                    <span class="relay-url">${relay.url}</span>
                </label>
                <div class="relay-status">${statusText}</div>
                ${canRemove ? `<button class="btn btn-secondary btn-small" onclick="removeRelay('${relay.url}')">Remove</button>` : ''}
            </div>
        `;
    }).join('');
    
    const relaySummary = document.getElementById('relaySummary');
    if (relaySummary) {
        const connectedCount = connectedUrls.size;
        const enabledCount = relaySettings.relays.filter((relay) => relay.enabled).length;
        relaySummary.textContent = `Connected ${connectedCount}/${enabledCount} enabled relays`;
    }
}
