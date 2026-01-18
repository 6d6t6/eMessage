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
    disconnectRelays();
    clearKeys();
    setAuthView(false);
    showAuthStep('signin');
}
