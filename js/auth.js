// Authentication and onboarding flow

function initializeAuthFlow() {
    loadRelaySettings();
    loadProfileState();
    loadProfileCache();
    loadStoredKeys({ silent: true });
    saveRelaySettings();
    
    renderRelayList();
    syncProfileForms();
    
    if (userKeys) {
        setAuthView(true);
        bootstrapApp();
    } else {
        setAuthView(false);
        showAuthStep('signin');
    }
}

function setAuthView(isAuthenticated) {
    const authContainer = document.getElementById('authContainer');
    const appContainer = document.getElementById('appContainer');
    
    if (authContainer) {
        authContainer.style.display = isAuthenticated ? 'none' : 'flex';
    }
    if (appContainer) {
        appContainer.style.display = isAuthenticated ? 'flex' : 'none';
    }
}

function showAuthStep(step) {
    const steps = document.querySelectorAll('.auth-panel');
    steps.forEach((panel) => panel.classList.remove('active'));
    
    const target = document.getElementById(`auth-${step}`);
    if (target) {
        target.classList.add('active');
    }
    
    const tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach((tab) => tab.classList.remove('active'));
    const activeTab = document.querySelector(`[data-auth-tab="${step}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
}

function completeAuth() {
    setAuthView(true);
    bootstrapApp();
}

function signInWithNsec() {
    const input = document.getElementById('signInNsecInput');
    if (!input) return;
    const nsec = input.value.trim();
    if (!nsec) {
        showNotification('Please enter your nsec', 'error');
        return;
    }
    
    try {
        setKeysFromNsec(nsec);
        showNotification('Signed in successfully', 'success');
        completeAuth();
    } catch (error) {
        showNotification('Invalid nsec: ' + error.message, 'error');
    }
}

async function signInWithExtension() {
    if (!window.nostr || !window.nostr.getPublicKey) {
        showNotification('Nostr extension not detected', 'error');
        return;
    }
    
    try {
        const publicKey = await window.nostr.getPublicKey();
        setKeysFromExtension(publicKey);
        showNotification('Signed in with extension', 'success');
        completeAuth();
    } catch (error) {
        showNotification('Failed to sign in with extension: ' + error.message, 'error');
    }
}

function startSignUp() {
    generateKeys();
    showAuthStep('profile');
    syncProfileForms();
}

async function saveProfileAndContinue(prefix) {
    try {
        const metadata = readProfileForm(prefix);
        await saveProfileMetadata(metadata, true);
        completeAuth();
    } catch (error) {
        showNotification('Profile save failed: ' + error.message, 'error');
    }
}

function skipProfileSetup() {
    completeAuth();
}

function signOut() {
    if (typeof disconnectRelays === 'function') {
        disconnectRelays();
    }

    if (typeof window !== 'undefined') {
        window.__EMESSAGE_SIGNED_OUT__ = true;
    }

    try {
        localStorage.removeItem('nostrKeys');

        const legacyUnscopedKeys = new Set([
            'receivedMessages',
            'incognitoState',
            'chatState',
            'profileState',
            'profileCache',
            'relaySettings'
        ]);

        for (let i = localStorage.length - 1; i >= 0; i -= 1) {
            const key = localStorage.key(i);
            if (!key) continue;
            if (legacyUnscopedKeys.has(key)) {
                localStorage.removeItem(key);
            }
        }
    } catch (error) {
        console.warn('Failed clearing localStorage during sign out:', error);
    }

    userKeys = null;
    nostrClient = null;
    relayConnection = null;
    relayConnections = new Map();
    receivedMessages = [];
    messageSubscription = null;

    if (typeof processedEventIds !== 'undefined' && processedEventIds && typeof processedEventIds.clear === 'function') {
        processedEventIds.clear();
    }
    if (typeof processedMessageIds !== 'undefined' && processedMessageIds && typeof processedMessageIds.clear === 'function') {
        processedMessageIds.clear();
    }
    if (typeof messageSendingStatus !== 'undefined' && messageSendingStatus && typeof messageSendingStatus.clear === 'function') {
        messageSendingStatus.clear();
    }
    if (typeof lastNotificationTime !== 'undefined') {
        lastNotificationTime = 0;
    }

    if (typeof window !== 'undefined' && window.pendingMessages) {
        window.pendingMessages = [];
    }

    if (typeof incognitoBackupTimer !== 'undefined' && incognitoBackupTimer) {
        clearTimeout(incognitoBackupTimer);
        incognitoBackupTimer = null;
    }
    if (typeof incognitoBackupPending !== 'undefined') {
        incognitoBackupPending = false;
    }

    if (typeof incognitoState !== 'undefined' && incognitoState) {
        incognitoState.conversations = new Map();
        incognitoState.disposableKeys = new Map();
        incognitoState.pendingInvitations = new Map();
        incognitoState.seed = null;
        incognitoState.conversationCounter = 0;
    }

    if (typeof chatState !== 'undefined' && chatState) {
        chatState.currentConversation = null;
        chatState.conversations = [];
        chatState.messages = new Map();
        chatState.showSettings = false;
        chatState.suppressAutoSelectUntil = 0;
        chatState.suppressNotificationsUntil = 0;
        chatState.lastConversationSelectSource = 'system';
    }

    if (typeof profileState !== 'undefined' && profileState) {
        profileState.metadata = null;
        profileState.updatedAt = null;
        profileState.nip05 = {
            identifier: '',
            verified: false,
            lastChecked: null,
            error: null
        };
        profileState.pendingPublish = false;
    }
    if (typeof profileCache !== 'undefined') {
        profileCache = new Map();
    }

    const privateKeyDisplay = document.getElementById('privateKeyDisplay');
    const publicKeyDisplay = document.getElementById('publicKeyDisplay');
    if (privateKeyDisplay) {
        privateKeyDisplay.dataset.nsec = '';
        const span = privateKeyDisplay.querySelector('span');
        if (span) span.textContent = 'Not set';
    }
    if (publicKeyDisplay) {
        const span = publicKeyDisplay.querySelector('span');
        if (span) span.textContent = 'Not set';
    }

    if (typeof displayConversationMessages === 'function') {
        displayConversationMessages(null);
    }
    if (typeof updateMessagesDisplay === 'function') {
        updateMessagesDisplay();
    }
    if (typeof updateConversationsDisplay === 'function') {
        updateConversationsDisplay();
    }
    if (typeof updateStatus === 'function') {
        updateStatus();
    }
    if (typeof updateProfileAvatar === 'function') {
        updateProfileAvatar();
    }

    if (typeof appBootstrapped !== 'undefined') {
        appBootstrapped = false;
    }

    setAuthView(false);
    showAuthStep('signin');

    setTimeout(() => {
        try {
            window.location.reload();
        } catch (error) {
            // no-op
        }
    }, 0);
}
