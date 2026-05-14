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

    if (isAuthenticated) {
        document.body.classList.add('app-bootstrapped');
    } else {
        document.body.classList.remove('app-bootstrapped');
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
    const keys = generateKeys();
    if (!keys) return;
    
    // Store encoded keys in the userKeys object for easy access during this session
    userKeys.nsec = keys.nsec;
    userKeys.npub = keys.npub;
    
    // Show keys in the backup step
    const npubDisplay = document.getElementById('signupNpubDisplay');
    const nsecDisplay = document.getElementById('signupNsecDisplay');
    const toggleBtn = document.getElementById('toggleSignupNsecBtn');
    
    if (npubDisplay) {
        npubDisplay.textContent = keys.npub;
    }
    if (nsecDisplay) {
        nsecDisplay.textContent = maskNsec(keys.nsec);
        nsecDisplay.classList.add('masked-key');
    }
    if (toggleBtn) {
        const icon = toggleBtn.querySelector('.material-symbols-rounded');
        if (icon) icon.textContent = 'visibility_off';
    }
    
    // Reset checkbox
    const checkbox = document.getElementById('backupConfirmCheckbox');
    if (checkbox) checkbox.checked = false;
    toggleBackupButton();
    
    showAuthStep('keys');
}

function toggleBackupButton() {
    const checkbox = document.getElementById('backupConfirmCheckbox');
    const btn = document.getElementById('continueToProfileBtn');
    if (checkbox && btn) {
        btn.disabled = !checkbox.checked;
    }
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
        Logger.warn('Failed clearing localStorage during sign out:', error);
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

function updateAuthAvatarPreview(url) {
    const preview = document.getElementById('authAvatarPreview');
    if (!preview) return;
    
    if (url && (url.startsWith('http') || url.startsWith('data:image'))) {
        preview.innerHTML = `<img src="${url}" onerror="this.parentElement.innerHTML='<span class=\\'material-symbols-rounded\\'>person</span>'">`;
    } else {
        preview.innerHTML = '<span class="material-symbols-rounded">person</span>';
    }
}

function toggleSignupNsecVisibility() {
    const el = document.getElementById('signupNsecDisplay');
    const btn = document.getElementById('toggleSignupNsecBtn');
    if (!el || !btn || !userKeys) return;
    
    const icon = btn.querySelector('.material-symbols-rounded');
    const isMasked = el.classList.contains('masked-key');
    
    if (isMasked) {
        el.textContent = userKeys.nsec;
        el.classList.remove('masked-key');
        if (icon) icon.textContent = 'visibility';
    } else {
        el.textContent = maskNsec(userKeys.nsec);
        el.classList.add('masked-key');
        if (icon) icon.textContent = 'visibility_off';
    }
}

function copySignupNsec() {
    if (!userKeys || !userKeys.nsec) return;
    navigator.clipboard.writeText(userKeys.nsec).then(() => {
        showNotification('Private key (nsec) copied', 'success');
    });
}

function downloadKeysAsTxt() {
    if (!userKeys) return;
    
    const confirmed = confirm("WARNING: You are about to download your Private Key in plain text. \n\nAnyone who gets access to this file will have FULL control over your account. \n\nDo you want to proceed?");
    if (!confirmed) return;
    
    const content = `emessage - Nostr Keys Backup
Generated: ${new Date().toLocaleString()}

IMPORTANT: Keep this file secure and private. Never share your Private Key with anyone.

Public Key (npub):
${userKeys.npub}

Private Key (nsec):
${userKeys.nsec}

You can use these keys to log in to emessage and any other Nostr client.`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'emessage_nostr_keys.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Keys saved as .txt', 'success');
}

