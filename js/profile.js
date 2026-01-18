// Profile metadata and NIP-05 handling

const PROFILE_FIELDS = [
    { key: 'display_name', suffix: 'DisplayNameInput' },
    { key: 'name', suffix: 'NameInput' },
    { key: 'about', suffix: 'AboutInput' },
    { key: 'picture', suffix: 'PictureInput' },
    { key: 'banner', suffix: 'BannerInput' },
    { key: 'website', suffix: 'WebsiteInput' },
    { key: 'nip05', suffix: 'Nip05Input' },
    { key: 'lud16', suffix: 'Lud16Input' }
];

const profileFetchState = new Map();
let profileSubCounter = 0;
const profileRequestTimestamps = new Map();
const pendingProfileRequests = new Set();
let profileRequestTimer = null;
const PROFILE_REQUEST_DEBOUNCE_MS = 200;
const PROFILE_REQUEST_COOLDOWN_MS = 8000;
const PROFILE_REQUEST_MAX_BATCH = 100;

function nextProfileSubId(prefix) {
    profileSubCounter += 1;
    return `${prefix}${profileSubCounter}`;
}

function flushProfileRequests() {
    profileRequestTimer = null;
    if (!pendingProfileRequests.size || !hasActiveRelayConnection()) return;
    const pubkeys = Array.from(pendingProfileRequests);
    pendingProfileRequests.clear();
    for (let i = 0; i < pubkeys.length; i += PROFILE_REQUEST_MAX_BATCH) {
        const batch = pubkeys.slice(i, i + PROFILE_REQUEST_MAX_BATCH);
        const subscriptionId = nextProfileSubId('profiles_');
        const filter = { kinds: [0], authors: batch, limit: batch.length };
        const payload = JSON.stringify(['REQ', subscriptionId, filter]);
        try {
            sendToRelays(payload);
        } catch (error) {
            console.error('Failed to request profile metadata batch:', error);
        }
    }
}

function scheduleProfileRequestFlush(immediate = false) {
    if (profileRequestTimer) {
        if (immediate) {
            clearTimeout(profileRequestTimer);
            profileRequestTimer = null;
        } else {
            return;
        }
    }
    const delay = immediate ? 0 : PROFILE_REQUEST_DEBOUNCE_MS;
    profileRequestTimer = setTimeout(flushProfileRequests, delay);
}

function getProfileInput(prefix, suffix) {
    const id = `${prefix}${suffix}`;
    return document.getElementById(id);
}

function readProfileForm(prefix = 'profile') {
    const metadata = {};
    PROFILE_FIELDS.forEach((field) => {
        const input = getProfileInput(prefix, field.suffix);
        if (!input) return;
        const value = input.value.trim();
        if (value) {
            metadata[field.key] = value;
        }
    });
    return metadata;
}

function syncProfileForms() {
    const metadata = profileState.metadata || {};
    ['profile', 'auth'].forEach((prefix) => {
        PROFILE_FIELDS.forEach((field) => {
            const input = getProfileInput(prefix, field.suffix);
            if (!input) return;
            input.value = metadata[field.key] || '';
        });
        updateNip05Status(prefix);
    });
}

function getProfileMetadata(pubkey) {
    if (!pubkey) return null;
    if (userKeys && pubkey === userKeys.publicKey) {
        return profileState.metadata || null;
    }
    const cached = profileCache.get(pubkey);
    return cached ? cached.metadata || null : null;
}

function getDisplayNameForPubkey(pubkey) {
    const metadata = getProfileMetadata(pubkey);
    if (metadata) {
        if (metadata.display_name) return metadata.display_name;
        if (metadata.name) return metadata.name;
        if (metadata.nip05) return metadata.nip05;
    }
    return formatPubkeyForDisplay(pubkey);
}

function getSecondaryIdentity(pubkey) {
    const metadata = getProfileMetadata(pubkey);
    if (metadata) {
        if (metadata.display_name && metadata.name) return metadata.name;
        if (metadata.display_name && metadata.nip05) return metadata.nip05;
        if (metadata.name && metadata.nip05) return metadata.nip05;
    }
    return null;
}

function updateConversationNameForPubkey(pubkey) {
    if (!pubkey || !chatState || !Array.isArray(chatState.conversations)) return;
    const displayName = getDisplayNameForPubkey(pubkey);
    let updated = false;
    chatState.conversations.forEach((conversation) => {
        if (conversation.recipient === pubkey && conversation.name !== displayName) {
            conversation.name = displayName;
            updated = true;
        }
    });
    if (updated && typeof saveChatState === 'function') {
        saveChatState();
    }
}

function getAvatarMarkupForPubkey(pubkey, size = 40) {
    const metadata = getProfileMetadata(pubkey);
    if (metadata && metadata.picture) {
        return `<img src="${escapeHtml(metadata.picture)}" alt="Profile avatar" style="width:${size}px;height:${size}px;" />`;
    }
    const npub = window.NostrTools.nip19.npubEncode(pubkey);
    return getAvatarForPubkey(npub, size);
}

function getBannerMarkupForPubkey(pubkey) {
    const metadata = getProfileMetadata(pubkey);
    if (metadata && metadata.banner) {
        return `<img src="${escapeHtml(metadata.banner)}" alt="Profile banner" />`;
    }
    return '';
}

function upsertProfileCache(pubkey, metadata, createdAt) {
    if (!pubkey || !metadata) return;
    const existing = profileCache.get(pubkey);
    const existingAt = existing ? (existing.createdAt ?? 0) : 0;
    const createdAtValue = (createdAt === undefined || createdAt === null)
        ? Math.floor(Date.now() / 1000)
        : createdAt;
    if (createdAtValue < existingAt) {
        return;
    }
    profileCache.set(pubkey, {
        metadata,
        createdAt: createdAtValue
    });
    const fetchState = profileFetchState.get(pubkey);
    if (fetchState && fetchState.timer) {
        clearTimeout(fetchState.timer);
        profileFetchState.delete(pubkey);
    }
    saveProfileCache();
    updateConversationNameForPubkey(pubkey);
    updateConversationsDisplay();
    if (chatState.currentConversation === pubkey) {
        displayConversationMessages(pubkey);
        updateChatHeaderProfile();
        renderProfilePanel();
    }
}

function requestProfileMetadata(pubkey, options = {}) {
    if (!pubkey || !hasActiveRelayConnection()) return;
    const now = Date.now();
    const lastRequestedAt = profileRequestTimestamps.get(pubkey) || 0;
    if (now - lastRequestedAt < PROFILE_REQUEST_COOLDOWN_MS) return;
    profileRequestTimestamps.set(pubkey, now);
    pendingProfileRequests.add(pubkey);
    scheduleProfileRequestFlush(Boolean(options.immediate));
    scheduleProfileRetry(pubkey);
}

function subscribeToProfiles(socket, pubkeys) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const unique = Array.from(new Set(pubkeys.filter(Boolean)));
    if (!unique.length) return;
    const now = Date.now();
    unique.forEach((pubkey) => {
        profileRequestTimestamps.set(pubkey, now);
    });
    const subscriptionId = nextProfileSubId('profiles_');
    const filter = { kinds: [0], authors: unique, limit: unique.length };
    const payload = JSON.stringify(['REQ', subscriptionId, filter]);
    socket.send(payload);
}

function requestProfileMetadataNow(pubkey) {
    requestProfileMetadata(pubkey, { immediate: true });
}

async function resolveNip05ToPubkey(identifier) {
    const parsed = parseNip05(identifier);
    if (!parsed) {
        throw new Error('Invalid NIP-05 identifier');
    }
    const url = `https://${parsed.domain}/.well-known/nostr.json?name=${encodeURIComponent(parsed.name)}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error('Failed to fetch NIP-05 record');
    }
    const data = await response.json();
    const pubkey = data.names && data.names[parsed.name];
    if (!pubkey || pubkey.length !== 64) {
        throw new Error('NIP-05 record not found');
    }
    return pubkey.toLowerCase();
}

function ensureProfileFetched(pubkey) {
    if (!pubkey) return;
    const cached = profileCache.get(pubkey);
    const stale = !cached || (Date.now() / 1000 - (cached.createdAt || 0)) > 3600;
    if (stale) {
        requestProfileMetadata(pubkey);
    }
    if (!cached || !cached.metadata) {
        scheduleProfileRetry(pubkey);
    }
}

function refreshProfilesForConversations() {
    chatState.conversations.forEach((conversation) => {
        requestProfileMetadata(conversation.recipient);
    });
}

function scheduleProfileRetry(pubkey) {
    const existing = profileFetchState.get(pubkey);
    if (existing && existing.timer) return;
    const attempts = existing ? existing.attempts : 0;
    if (attempts >= 6) return;
    const delay = Math.min(3000 * Math.pow(2, attempts), 30000);
    const timer = setTimeout(() => {
        requestProfileMetadata(pubkey);
        profileFetchState.set(pubkey, { attempts: attempts + 1, timer: null });
        scheduleProfileRetry(pubkey);
    }, delay);
    profileFetchState.set(pubkey, { attempts, timer });
}

function updateNip05Status(prefix = 'profile') {
    const statusEl = document.getElementById(`${prefix}Nip05Status`);
    if (!statusEl) return;
    if (!profileState.nip05 || !profileState.nip05.identifier) {
        statusEl.textContent = 'Not verified';
        statusEl.className = 'nip05-status';
        return;
    }
    
    statusEl.textContent = profileState.nip05.verified ? 'Verified' : 'Unverified';
    statusEl.className = profileState.nip05.verified ? 'nip05-status verified' : 'nip05-status';
    if (profileState.nip05.error) {
        statusEl.textContent = profileState.nip05.error;
    }
}

function normalizeProfileMetadata(metadata) {
    const cleaned = {};
    PROFILE_FIELDS.forEach((field) => {
        const value = metadata[field.key];
        if (value) {
            cleaned[field.key] = value.trim();
        }
    });
    return cleaned;
}

async function saveProfileMetadata(metadata, publish) {
    const cleaned = normalizeProfileMetadata(metadata || {});
    profileState.metadata = cleaned;
    profileState.nip05 = {
        identifier: cleaned.nip05 || '',
        verified: false,
        lastChecked: null,
        error: null
    };
    saveProfileState();
    updateProfileAvatar();
    updateStatus();
    syncProfileForms();
    
    if (cleaned.nip05) {
        await verifyAndStoreNip05(cleaned.nip05);
    }
    
    if (publish) {
        await queueProfilePublish(cleaned);
    }
}

async function publishProfileMetadata(metadata) {
    if (!userKeys) {
        throw new Error('Missing keys for publishing');
    }
    if (typeof hasActiveRelayConnection === 'function' && !hasActiveRelayConnection()) {
        return false;
    }
    
    const eventTemplate = {
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify(metadata)
    };
    
    const signedEvent = await signNostrEvent(eventTemplate);
    const payload = JSON.stringify(['EVENT', signedEvent]);
    sendToRelays(payload);
    showNotification('Profile published to relays', 'success');
    return true;
}

function parseNip05(identifier) {
    if (!identifier) return null;
    const trimmed = identifier.trim();
    if (!trimmed.includes('@')) return null;
    const [name, domain] = trimmed.split('@');
    if (!name || !domain) return null;
    return {
        name,
        domain,
        normalized: `${name}@${domain}`
    };
}

async function verifyAndStoreNip05(identifier) {
    if (!userKeys) {
        showNotification('Set your keys before verifying NIP-05', 'error');
        return;
    }
    const parsed = parseNip05(identifier);
    if (!parsed) {
        profileState.nip05 = {
            identifier,
            verified: false,
            lastChecked: Date.now(),
            error: 'Invalid NIP-05 format'
        };
        saveProfileState();
        syncProfileForms();
        return;
    }
    
    try {
        const url = `https://${parsed.domain}/.well-known/nostr.json?name=${encodeURIComponent(parsed.name)}`;
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Failed to fetch NIP-05 record');
        }
        const data = await response.json();
        const pubkey = data.names && data.names[parsed.name];
        const isVerified = pubkey && pubkey.toLowerCase() === userKeys.publicKey.toLowerCase();
        
        profileState.nip05 = {
            identifier: parsed.normalized,
            verified: isVerified,
            lastChecked: Date.now(),
            error: isVerified ? null : 'NIP-05 does not match this pubkey'
        };
        saveProfileState();
        syncProfileForms();
    } catch (error) {
        profileState.nip05 = {
            identifier: parsed.normalized,
            verified: false,
            lastChecked: Date.now(),
            error: error.message
        };
        saveProfileState();
        syncProfileForms();
    }
}

async function verifyNip05FromForm(prefix = 'profile') {
    const input = getProfileInput(prefix, 'Nip05Input');
    if (!input) return;
    const value = input.value.trim();
    if (!value) {
        showNotification('Enter a NIP-05 identifier', 'error');
        return;
    }
    await verifyAndStoreNip05(value);
    showNotification('NIP-05 verification complete', 'info');
}

async function saveProfileFromSettings(publish) {
    try {
        const metadata = readProfileForm('profile');
        await saveProfileMetadata(metadata, publish);
        showNotification(publish ? 'Profile published' : 'Profile saved', 'success');
    } catch (error) {
        showNotification('Profile save failed: ' + error.message, 'error');
    }
}

async function queueProfilePublish(metadata) {
    const published = await publishProfileMetadata(metadata);
    if (!published) {
        profileState.pendingPublish = true;
        saveProfileState();
        showNotification('Profile will publish when relays connect', 'info');
        return;
    }
    profileState.pendingPublish = false;
    saveProfileState();
}

async function attemptPendingProfilePublish() {
    if (!profileState.pendingPublish || !profileState.metadata) {
        return;
    }
    const published = await publishProfileMetadata(profileState.metadata);
    if (published) {
        profileState.pendingPublish = false;
        saveProfileState();
    }
}
