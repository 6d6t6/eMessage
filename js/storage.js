// Storage management functions

function getUserScopedStorageKey(baseKey) {
    const pubkey = userKeys && userKeys.publicKey ? userKeys.publicKey : null;
    if (!pubkey) return baseKey;
    return `${baseKey}:${pubkey}`;
}

// Save chat state to localStorage
function saveChatState() {
    if (typeof window !== 'undefined' && window.__EMESSAGE_SIGNED_OUT__) return;
    if (!userKeys) return;
    try {
        const stateToSave = {
            conversations: chatState.conversations,
            currentConversation: chatState.currentConversation,
            messages: Array.from(chatState.messages.entries())
        };
        localStorage.setItem(getUserScopedStorageKey('chatState'), JSON.stringify(stateToSave));
    } catch (error) {
        console.error('Error saving chat state:', error);
    }
}

// Initialize chat state from localStorage
function initializeChatState() {
    const stored = localStorage.getItem(getUserScopedStorageKey('chatState'));
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            chatState.conversations = parsed.conversations || [];
            chatState.currentConversation = parsed.currentConversation || null;
            chatState.messages = new Map(parsed.messages || []);
            
            // Clean up any duplicate messages
            for (const [conversationId, messages] of chatState.messages) {
                const uniqueMessages = [];
                const seenIds = new Set();
                
                for (const message of messages) {
                    if (!seenIds.has(message.id)) {
                        seenIds.add(message.id);
                        uniqueMessages.push(message);
                    }
                }
                uniqueMessages.sort((a, b) => {
                    if (a.timestamp === b.timestamp) {
                        return (a.id || '').localeCompare(b.id || '');
                    }
                    return a.timestamp - b.timestamp;
                });
                chatState.messages.set(conversationId, uniqueMessages);
            }

            chatState.conversations.forEach((conversation) => {
                const messages = chatState.messages.get(conversation.id) || [];
                if (messages.length > 0) {
                    const lastMessage = messages.reduce((latest, current) => {
                        if (!latest) return current;
                        return current.timestamp > latest.timestamp ? current : latest;
                    }, null);
                    if (lastMessage) {
                        conversation.lastMessage = lastMessage.content;
                        conversation.lastMessageTime = typeof lastMessage.timestamp === 'number'
                            ? lastMessage.timestamp * 1000
                            : conversation.lastMessageTime;
                        if (!conversation.lastReadTime) {
                            conversation.lastReadTime = typeof lastMessage.timestamp === 'number'
                                ? lastMessage.timestamp * 1000
                                : conversation.lastReadTime;
                        }
                    }
                }
                if (conversation.unreadCount == null) {
                    conversation.unreadCount = 0;
                }
                if (chatState.currentConversation === conversation.id) {
                    conversation.unreadCount = 0;
                    if (!conversation.lastReadTime) {
                        conversation.lastReadTime = Date.now();
                    }
                }
                if (!conversation.lastReadTime && messages.length === 0) {
                    conversation.lastReadTime = 0;
                }
            });
            
            console.log('Chat state loaded and deduplicated');
        } catch (error) {
            console.error('Error loading chat state:', error);
        }
    }
}

// Save profile metadata to localStorage
function saveProfileState() {
    if (typeof window !== 'undefined' && window.__EMESSAGE_SIGNED_OUT__) return;
    if (!userKeys) return;
    try {
        localStorage.setItem(getUserScopedStorageKey('profileState'), JSON.stringify(profileState));
    } catch (error) {
        console.error('Error saving profile state:', error);
    }
}

// Load profile metadata from localStorage
function loadProfileState() {
    try {
        const stored = localStorage.getItem(getUserScopedStorageKey('profileState'));
        if (stored) {
            const parsed = JSON.parse(stored);
            profileState.metadata = parsed.metadata || null;
            profileState.updatedAt = parsed.updatedAt || null;
            profileState.nip05 = parsed.nip05 || {
                identifier: '',
                verified: false,
                lastChecked: null,
                error: null
            };
            profileState.pendingPublish = !!parsed.pendingPublish;
            if (profileState.nip05.identifier) {
                if (!profileState.metadata) {
                    profileState.metadata = {};
                }
                if (!profileState.metadata.nip05) {
                    profileState.metadata.nip05 = profileState.nip05.identifier;
                }
            }
        }
    } catch (error) {
        console.error('Error loading profile state:', error);
    }
}

// Save profile cache to localStorage
function saveProfileCache() {
    if (typeof window !== 'undefined' && window.__EMESSAGE_SIGNED_OUT__) return;
    if (!userKeys) return;
    try {
        const cacheObj = {};
        profileCache.forEach((value, key) => {
            cacheObj[key] = value;
        });
        localStorage.setItem(getUserScopedStorageKey('profileCache'), JSON.stringify(cacheObj));
    } catch (error) {
        console.error('Error saving profile cache:', error);
    }
}

// Load profile cache from localStorage
function loadProfileCache() {
    try {
        const stored = localStorage.getItem(getUserScopedStorageKey('profileCache'));
        if (stored) {
            const parsed = JSON.parse(stored);
            profileCache = new Map(Object.entries(parsed || {}));
        }
    } catch (error) {
        console.error('Error loading profile cache:', error);
    }
}

// Save relay settings to localStorage
function saveRelaySettings() {
    if (typeof window !== 'undefined' && window.__EMESSAGE_SIGNED_OUT__) return;
    try {
        localStorage.setItem(getUserScopedStorageKey('relaySettings'), JSON.stringify(relaySettings));
    } catch (error) {
        console.error('Error saving relay settings:', error);
    }
}

// Load relay settings from localStorage
function loadRelaySettings() {
    try {
        const stored = localStorage.getItem(getUserScopedStorageKey('relaySettings'));
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && Array.isArray(parsed.relays)) {
                relaySettings.relays = parsed.relays.filter((relay) => !DEPRECATED_RELAYS.includes(relay.url));
            }
            if (typeof parsed.autoReconnect === 'boolean') {
                relaySettings.autoReconnect = parsed.autoReconnect;
            }
            if (typeof parsed.reconnectBaseDelayMs === 'number') {
                relaySettings.reconnectBaseDelayMs = parsed.reconnectBaseDelayMs;
            }
            if (typeof parsed.reconnectMaxDelayMs === 'number') {
                relaySettings.reconnectMaxDelayMs = parsed.reconnectMaxDelayMs;
            }
        }
        
        const hasDeprecated = relaySettings.relays.some((relay) => DEPRECATED_RELAYS.includes(relay.url));
        if (hasDeprecated) {
            relaySettings.relays = relaySettings.relays.filter((relay) => !DEPRECATED_RELAYS.includes(relay.url));
        }
    } catch (error) {
        console.error('Error loading relay settings:', error);
    }
}

// Save incognito state to localStorage
function saveIncognitoState() {
    if (typeof window !== 'undefined' && window.__EMESSAGE_SIGNED_OUT__) return;
    if (!userKeys) return;
    try {
        // Convert conversations to serializable format
        const conversationsObj = {};
        for (const [key, value] of incognitoState.conversations) {
            conversationsObj[key] = {
                ...value,
                senderIdentity: value.senderIdentity ? {
                    privateKey: value.senderIdentity.privateKey ? Array.from(value.senderIdentity.privateKey) : null,
                    privateKeyHex: value.senderIdentity.privateKeyHex,
                    publicKey: value.senderIdentity.publicKey
                } : null,
                conversationIdentity: value.conversationIdentity ? {
                    privateKey: value.conversationIdentity.privateKey ? Array.from(value.conversationIdentity.privateKey) : null,
                    privateKeyHex: value.conversationIdentity.privateKeyHex,
                    publicKey: value.conversationIdentity.publicKey
                } : null
            };
        }

        const data = {
            seed: incognitoState.seed,
            conversationCounter: incognitoState.conversationCounter,
            conversations: conversationsObj,
            disposableKeys: Object.fromEntries(incognitoState.disposableKeys)
        };
        
        console.log('Saving incognito state with conversations:', Object.keys(conversationsObj));
        for (const [key, value] of Object.entries(conversationsObj)) {
            console.log('Saving conversation for:', key.substring(0, 16) + '...');
            console.log('- conversationPubkey:', value.conversationPubkey ? value.conversationPubkey.substring(0, 16) + '...' : 'none');
        }
        
        localStorage.setItem(getUserScopedStorageKey('incognitoState'), JSON.stringify(data));
        if (typeof scheduleIncognitoBackup === 'function') {
            scheduleIncognitoBackup();
        }
    } catch (error) {
        console.error('Error saving incognito state:', error);
    }
}

// Initialize incognito state from localStorage
function initializeIncognitoState() {
    try {
        // Load existing state from localStorage
        const stored = localStorage.getItem(getUserScopedStorageKey('incognitoState'));
        if (stored) {
            const data = JSON.parse(stored);
            incognitoState.seed = data.seed;
            incognitoState.conversationCounter = data.conversationCounter || 0;
            
            // Restore conversations and keys
            if (data.conversations) {
                console.log('Loading conversations from storage:', Object.keys(data.conversations));
                const conversationsMap = new Map();
                for (const [key, value] of Object.entries(data.conversations)) {
                    console.log('Loading conversation for:', key.substring(0, 16) + '...');
                    console.log('- conversationPubkey:', value.conversationPubkey ? value.conversationPubkey.substring(0, 16) + '...' : 'none');
                    
                    conversationsMap.set(key, {
                        ...value,
                        senderIdentity: value.senderIdentity ? {
                            privateKey: value.senderIdentity.privateKey ? new Uint8Array(value.senderIdentity.privateKey) : null,
                            privateKeyHex: value.senderIdentity.privateKeyHex,
                            publicKey: value.senderIdentity.publicKey
                        } : null,
                        conversationIdentity: value.conversationIdentity ? {
                            privateKey: value.conversationIdentity.privateKey ? new Uint8Array(value.conversationIdentity.privateKey) : null,
                            privateKeyHex: value.conversationIdentity.privateKeyHex,
                            publicKey: value.conversationIdentity.publicKey
                        } : null
                    });
                }
                incognitoState.conversations = conversationsMap;
            }
            if (data.disposableKeys) {
                incognitoState.disposableKeys = new Map(Object.entries(data.disposableKeys));
            }
        }
        
        // Generate seed if not exists
        if (!incognitoState.seed) {
            incognitoState.seed = bytesToHex(window.NostrTools.generateSecretKey());
            saveIncognitoState();
        }
        
        console.log('Incognito state initialized');
    } catch (error) {
        console.error('Error initializing incognito state:', error);
        // Reset state on error
        incognitoState.seed = bytesToHex(window.NostrTools.generateSecretKey());
        incognitoState.conversationCounter = 0;
        saveIncognitoState();
    }
}

// Load stored messages (legacy system)
function loadStoredMessages() {
    try {
        const stored = localStorage.getItem(getUserScopedStorageKey('receivedMessages'));
        if (stored) {
            receivedMessages = JSON.parse(stored);
            updateMessagesDisplay();
        }
    } catch (error) {
        console.error('Error loading stored messages:', error);
        receivedMessages = [];
    }
}

// Save messages to localStorage (legacy system)
function saveMessages() {
    if (typeof window !== 'undefined' && window.__EMESSAGE_SIGNED_OUT__) return;
    if (!userKeys) return;
    try {
        localStorage.setItem(getUserScopedStorageKey('receivedMessages'), JSON.stringify(receivedMessages));
    } catch (error) {
        console.error('Error saving messages:', error);
    }
}

// Clear all storage
function clearStorage() {
    // Clear all stored data
    const baseKeys = [
        'nostrKeys',
        'receivedMessages',
        'incognitoState',
        'chatState',
        'profileState',
        'profileCache',
        'relaySettings'
    ];
    baseKeys.forEach((key) => {
        localStorage.removeItem(key);
    });

    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        for (const base of baseKeys) {
            if (key === base || key.startsWith(`${base}:`)) {
                localStorage.removeItem(key);
                break;
            }
        }
    }
    
    // Clear in-memory data
    receivedMessages = [];
    processedEventIds.clear();
    processedMessageIds.clear();
    lastNotificationTime = 0;
    
    // Reset incognito state
    initializeIncognitoState();
    
    // Reset chat state
    chatState.currentConversation = null;
    chatState.conversations = [];
    chatState.messages = new Map();
    chatState.showSettings = false;

    profileState.metadata = null;
    profileState.updatedAt = null;
    profileState.nip05 = {
        identifier: '',
        verified: false,
        lastChecked: null,
        error: null
    };
    profileState.pendingPublish = false;
    profileCache = new Map();
    
    updateMessagesDisplay();
    updateConversationsDisplay();
    updateStatus();
    showNotification('Storage cleared!', 'info');
} 
