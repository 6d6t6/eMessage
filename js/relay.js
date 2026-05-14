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
        subscribeToIncognitoMessages(relayState.socket, null, 0);
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
        if (typeof subscribeToReadMarkers === 'function') {
            subscribeToReadMarkers(relayState.socket);
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
        
        if (message[0] === 'EVENT') {
            const event = message[2];
            
            // Add event deduplication
            if (processedEventIds.has(event.id)) {
                return; // Already processed this event
            }
            addProcessedEventId(event.id);
            
            Logger.debug('Event received:', event.kind, event.id.substring(0, 8), 'from', relayUrl);
            
            if (event.kind === 0) {
                try {
                    const metadata = JSON.parse(event.content || '{}');
                    upsertProfileCache(event.pubkey, metadata, event.created_at);
                } catch (error) {
                    Logger.warn('Failed to parse profile metadata:', error);
                }
                return;
            }
            
            if (event.kind === 30078) {
                if (typeof handleIncognitoBackupEvent === 'function') {
                    handleIncognitoBackupEvent(event);
                }
                if (typeof handleReadMarkersEvent === 'function') {
                    handleReadMarkersEvent(event);
                }
                return;
            }
            
            if (event.kind === 4 || event.kind === 1059) {
                // Check if it's an incognito invitation or message
                const recipientTag = event.tags.find(tag => tag[0] === 'p');
                const isForUs = recipientTag && recipientTag[1] === userKeys.publicKey;
                
                if (isForUs) {
                    // First, check if this is from a known conversation identity (highest priority)
                    const isFromConversationIdentity = Array.from(incognitoState.conversations.values())
                        .some(conv => conv.conversationPubkey === event.pubkey);
                    
                    if (isFromConversationIdentity) {
                        Logger.debug('Processing as incognito message (from conversation identity)');
                        handleIncognitoMessage(event);
                    } else if (incognitoState.conversations.size > 0) {
                        // We have conversations, so this is likely a message
                        Logger.debug('Processing as incognito message (has conversations)');
                        handleIncognitoMessage(event);
                    } else {
                        // Check if we have a pending invitation for this sender
                        const hasPendingInvitation = Array.from(incognitoState.pendingInvitations.values())
                            .some(inv => inv.senderPubkey === event.pubkey);
                        
                        if (hasPendingInvitation) {
                            Logger.debug('Processing as incognito message (has pending invitation)');
                            handleIncognitoMessage(event);
                        } else {
                            // No conversations yet, likely an invitation
                            Logger.debug('Processing as invitation (no conversations)');
                            handleIncognitoInvitation(event);
                        }
                    }
                } else {
                    // Check if it's an incognito message from a conversation identity
                    // Only process if we have active conversations to reduce spam
                    if (incognitoState.conversations.size > 0) {
                        handleIncognitoMessage(event);
                    }
                }
            }
        } else if (message[0] === 'OK') {
            const eventId = message[1];
            const accepted = !!message[2];
            const reason = message[3] || 'no reason';
            
            if (accepted) {
                Logger.debug('Relay accepted event:', eventId, 'from', relayUrl);
            } else {
                const health = relayHealth.get(relayUrl) || {};
                if (reason && reason.toLowerCase().includes('pow:')) {
                    Logger.warn(`Relay ${relayUrl} requires Proof of Work (${reason}). Future Kind 4 events will skip this relay.`);
                    health.powRequired = true;
                    relayHealth.set(relayUrl, health);
                } else if (reason && reason.toLowerCase().includes('rate-limited')) {
                    Logger.warn(`Relay ${relayUrl} is rate-limiting your events. Increasing outbox delay...`);
                    health.lastRateLimit = Date.now();
                    relayHealth.set(relayUrl, health);
                    globalQueueDelay = Math.min(MAX_QUEUE_DELAY, globalQueueDelay + 2000);
                } else {
                    Logger.warn('Relay REJECTED event:', eventId, 'Reason:', reason, 'from', relayUrl);
                }
            }
            updateEventDeliveryStatus(eventId, relayUrl, accepted, reason);
        } else if (message[0] === 'NOTICE') {
            Logger.info('Relay NOTICE:', message[1], 'from', relayUrl);
        } else if (message[0] === 'EOSE') {
            const subId = message[1];
            relayConnections.forEach((state) => {
                if (state.socket && state.socket.readyState === WebSocket.OPEN && state.incognitoSubId === subId) {
                    Logger.debug('EOSE received for subscription:', subId, 'on', state.url);
                    
                    // Trigger next sync layer if applicable
                    if (state.syncLayer === 0) {
                        Logger.info('24h sync complete, starting 30d background sync on', state.url);
                        subscribeToIncognitoMessages(state.socket, null, 1);
                    } else if (state.syncLayer === 1) {
                        Logger.info('30d sync complete, starting 1y deep sync on', state.url);
                        subscribeToIncognitoMessages(state.socket, null, 2);
                    } else {
                        Logger.info('Full 1y deep sync complete on', state.url);
                    }

                    if (typeof retryPendingMessages === 'function') {
                        retryPendingMessages();
                    }
                    if (chatState && chatState.currentConversation) {
                        displayConversationMessages(chatState.currentConversation);
                    }
                }
            });
        }
    } catch (error) {
        Logger.error('Error handling relay message:', error);
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
        if (typeof saveMessageSendingStatus === 'function') {
            saveMessageSendingStatus();
        }
        return;
    }
    
    status.status = 'pending';
    status.error = reason;
    messageSendingStatus.set(eventId, status);
    if (typeof saveMessageSendingStatus === 'function') {
        saveMessageSendingStatus();
    }
}

function resumePendingSends() {
    if (!messageSendingStatus || messageSendingStatus.size === 0) return;
    
    Logger.info('Resuming pending sends from outbox...');
    let resumedCount = 0;
    
    for (const [eventId, status] of messageSendingStatus) {
        if (status.status === 'pending' && status.event) {
            // Re-queue to relays
            Logger.debug('Re-queueing pending message:', eventId);
            sendToRelays(JSON.stringify(['EVENT', status.event]));
            resumedCount++;
        }
    }
    
    if (resumedCount > 0) {
        Logger.info(`Successfully re-queued ${resumedCount} pending messages`);
    }
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

function getIncognitoHistorySince(layer = 0) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    
    switch (layer) {
        case 0: // 24 hours
            return nowSeconds - (24 * 60 * 60);
        case 1: // 30 days
            return nowSeconds - (30 * 24 * 60 * 60);
        case 2: // 1 year
        default:
            return nowSeconds - (365 * 24 * 60 * 60);
    }
}

let isDeepSyncing = false;

function triggerDeepSync() {
    if (isDeepSyncing) {
        showNotification('Sync already in progress...', 'info');
        return;
    }
    
    isDeepSyncing = true;
    if (typeof clearSyncCache === 'function') {
        clearSyncCache();
    }
    
    // Force a 1-year history fetch
    const forceSince = Math.floor(Date.now() / 1000) - (365 * 24 * 60 * 60);
    subscribeToIncognitoMessages(null, forceSince);
    showNotification('Deep sync initiated (1 year lookback)', 'success');
    
    // Allow re-sync after 10 seconds
    setTimeout(() => {
        isDeepSyncing = false;
    }, 10000);
}

function buildIncognitoSubscriptionFilters(since) {
    const filters = [];
    const allIdentities = new Set();
    
    if (incognitoState && incognitoState.conversations) {
        incognitoState.conversations.forEach((data) => {
            if (data.conversationPubkey) allIdentities.add(data.conversationPubkey);
            if (data.recipientReplyIdentity && data.recipientReplyIdentity.publicKey) {
                allIdentities.add(data.recipientReplyIdentity.publicKey);
            }
            if (data.conversationIdentity && data.conversationIdentity.publicKey) {
                allIdentities.add(data.conversationIdentity.publicKey);
            }
            if (data.senderIdentity && data.senderIdentity.publicKey) {
                allIdentities.add(data.senderIdentity.publicKey);
            }
        });
    }

    // Always fetch messages sent TO our main pubkey
    if (userKeys && userKeys.publicKey) {
        filters.push({
            kinds: [4, 1059], // Fetch both legacy and standard wraps
            '#p': [userKeys.publicKey],
            since,
            limit: 5000
        });
    }
    
    // Fetch messages FROM all our conversation identities (history sync)
    // AND messages FROM their conversation identities (incoming)
    if (allIdentities.size > 0) {
        const identityArray = Array.from(allIdentities);
        const CHUNK_SIZE = 50; // Some relays limit the number of authors in a single filter
        
        for (let i = 0; i < identityArray.length; i += CHUNK_SIZE) {
            const chunk = identityArray.slice(i, i + CHUNK_SIZE);
            filters.push({
                kinds: [4, 1059],
                authors: chunk,
                since,
                limit: 5000
            });
            
            // Also explicitly check if any of these identities received messages directed to them
            filters.push({
                kinds: [4],
                '#p': chunk,
                since,
                limit: 5000
            });
        }
    }
    
    return filters;
}

// Track recent subscriptions to avoid hammering
let subscriptionDebounceTimer = null;
const SUBSCRIPTION_COOLDOWN_MS = 2000;

function subscribeToIncognitoMessages(socket = null, forcedSince = null, layer = 0) {
    if (socket && socket.readyState !== WebSocket.OPEN) {
        return;
    }
    
    // If no socket provided, subscribe on all connected relays with a debounce
    if (!socket) {
        if (subscriptionDebounceTimer) {
            clearTimeout(subscriptionDebounceTimer);
        }
        subscriptionDebounceTimer = setTimeout(() => {
            subscriptionDebounceTimer = null;
            const connected = getConnectedRelays();
            if (connected.length > 0) {
                Logger.info(`Starting automatic progressive sync (Layer ${layer}) on ${connected.length} relays...`);
                connected.forEach(state => {
                    subscribeToIncognitoMessages(state.socket, forcedSince, layer);
                });
            }
        }, 1000); // 1-second debounce for global refreshes
        return;
    }

    // Rate limit subscriptions per socket (skip if forcedSince or layered sync is provided)
    const state = Array.from(relayConnections.values()).find(s => s.socket === socket);
    if (!forcedSince && layer === 0 && state && state.lastSubTime && (Date.now() - state.lastSubTime < SUBSCRIPTION_COOLDOWN_MS)) {
        return;
    }
    
    const since = forcedSince || getIncognitoHistorySince(layer);
    Logger.info(`Subscribing to Layer ${layer} history (${formatTimestamp(since)}) on ${state ? state.url : 'relay'}`);
    
    const filters = buildIncognitoSubscriptionFilters(since);
    if (!filters.length) {
        return;
    }
    
    const subscriptionId = 'incognito_' + Math.random().toString(36).substring(2, 10);
    
    if (state && state.incognitoSubId) {
        try {
            socket.send(JSON.stringify(['CLOSE', state.incognitoSubId]));
        } catch (e) {}
        state.incognitoSubId = null;
    }
    
    const subscribeMessage = JSON.stringify([
        'REQ',
        subscriptionId,
        ...filters
    ]);
    
    socket.send(subscribeMessage);
    if (state) {
        state.incognitoSubId = subscriptionId;
        state.syncLayer = layer;
        state.lastSubTime = Date.now();
    }
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
        Logger.info('Sending incognito message to:', recipientPubkey);
        await sendIncognitoMessage(recipientPubkey, messageText);
        
        // Clear the message input
        if (messageInput) {
            messageInput.value = '';
        }
        
    } catch (error) {
        showNotification('Error sending incognito message: ' + error.message, 'error');
    }
}

const eventQueue = [];
let isProcessingQueue = false;
let globalQueueDelay = 1500; // Starting delay
const MAX_QUEUE_DELAY = 10000; // Max 10 seconds
const relayHealth = new Map(); // relayUrl -> { lastRateLimit: timestamp, powRequired: boolean }

async function processEventQueue() {
    if (isProcessingQueue || eventQueue.length === 0) return;
    isProcessingQueue = true;
    
    while (eventQueue.length > 0) {
        const payload = eventQueue.shift();
        const connected = getConnectedRelays();
        
        if (connected.length > 0) {
            connected.forEach((state) => {
                const health = relayHealth.get(state.url) || {};
                
                // Skip if relay requires PoW and we are just syncing (Kind 4)
                if (health.powRequired) {
                    Logger.debug('Skipping EVENT send to restricted PoW relay:', state.url);
                    return;
                }
                
                // Skip if recently rate-limited
                if (health.lastRateLimit && (Date.now() - health.lastRateLimit < 30000)) {
                    Logger.debug('Skipping EVENT send to rate-limited relay:', state.url);
                    return;
                }

                try {
                    state.socket.send(payload);
                } catch (error) {
                    Logger.error('Failed sending queued event to relay:', state.url, error);
                }
            });
        }
        
        // Wait before sending next event
        await new Promise(resolve => setTimeout(resolve, globalQueueDelay));
        
        // Slowly recover delay if no recent rate-limits
        if (globalQueueDelay > 1500) {
            globalQueueDelay -= 100;
        }
    }
    
    isProcessingQueue = false;
}

function sendToRelays(payload) {
    try {
        const message = JSON.parse(payload);
        if (message[0] === 'EVENT') {
            // Queue events to avoid rate-limiting
            eventQueue.push(payload);
            processEventQueue();
            return;
        }
    } catch (e) {
        // If not JSON or not an EVENT, just send directly
    }

    const connected = getConnectedRelays();
    if (!connected.length) {
        Logger.debug('No relay connections available for direct send');
        return;
    }
    
    connected.forEach((state) => {
        try {
            state.socket.send(payload);
        } catch (error) {
            Logger.error('Failed sending directly to relay:', state.url, error);
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

