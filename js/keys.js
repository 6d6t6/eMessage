// Key management functions

// Generate new Nostr keys
function generateKeys() {
    try {
        // Check if NostrTools is available
        if (!checkNostrTools()) {
            return;
        }
        
        const keys = window.NostrTools.generateSecretKey();
        const publicKey = window.NostrTools.getPublicKey(keys);
        
        // Convert keys to the format needed for display and storage
        let privateKeyHex, publicKeyHex;
        
        if (typeof keys === 'string') {
            privateKeyHex = keys;
        } else {
            privateKeyHex = bytesToHex(keys);
        }
        
        if (typeof publicKey === 'string') {
            publicKeyHex = publicKey;
        } else {
            publicKeyHex = bytesToHex(publicKey);
        }
        
        // For nsecEncode, we need to pass the original Uint8Array
        // For npubEncode, we need to pass a hex string
        let nsecEncoded, npubEncoded;
        
        if (typeof keys === 'string') {
            nsecEncoded = window.NostrTools.nip19.nsecEncode(hexToBytes(keys));
        } else {
            nsecEncoded = window.NostrTools.nip19.nsecEncode(keys);
        }
        
        // npubEncode expects a hex string
        npubEncoded = window.NostrTools.nip19.npubEncode(publicKeyHex);
        
        // Update the display elements
        const privateKeyDisplay = document.getElementById('privateKeyDisplay');
        const publicKeyDisplay = document.getElementById('publicKeyDisplay');
        
        if (privateKeyDisplay) {
            privateKeyDisplay.dataset.nsec = nsecEncoded;
            privateKeyDisplay.querySelector('span').textContent = maskNsec(nsecEncoded);
        }
        if (publicKeyDisplay) {
            publicKeyDisplay.querySelector('span').textContent = npubEncoded;
        }
        
        userKeys = {
            privateKey: privateKeyHex,
            publicKey: publicKeyHex,
            signingMethod: 'nsec'
        };
        
        persistKeys({
            privateKey: nsecEncoded,
            publicKey: npubEncoded,
            signingMethod: 'nsec'
        });
        
        updateStatus();
        updateProfileAvatar();
        showNotification('New keys generated successfully!', 'success');
        
        // Add context menus to key displays
        setupKeyContextMenus();
    } catch (error) {
        console.error('Error generating keys:', error);
        showNotification('Error generating keys: ' + error.message, 'error');
    }
}

// Load stored keys from localStorage
function loadStoredKeys(options = {}) {
    const { silent = false } = options;
    const stored = localStorage.getItem('nostrKeys');
    if (stored) {
        try {
            const keys = JSON.parse(stored);
            
            // Update the display elements
            const privateKeyDisplay = document.getElementById('privateKeyDisplay');
            const publicKeyDisplay = document.getElementById('publicKeyDisplay');
            
            if (privateKeyDisplay) {
                privateKeyDisplay.dataset.nsec = keys.privateKey || '';
                if (keys.signingMethod === 'extension') {
                    privateKeyDisplay.querySelector('span').textContent = 'Managed by extension';
                } else {
                    privateKeyDisplay.querySelector('span').textContent = maskNsec(keys.privateKey);
                }
            }
            if (publicKeyDisplay) {
                publicKeyDisplay.querySelector('span').textContent = keys.publicKey;
            }
            
            let privateKey = null;
            let publicKey = null;
            let signingMethod = keys.signingMethod || 'nsec';
            
            if (signingMethod === 'extension') {
                publicKey = window.NostrTools.nip19.decode(keys.publicKey).data;
            } else {
                privateKey = window.NostrTools.nip19.decode(keys.privateKey).data;
                publicKey = window.NostrTools.nip19.decode(keys.publicKey).data;
            }
            
            userKeys = {
                privateKey: privateKey ? (typeof privateKey === 'string' ? privateKey : bytesToHex(privateKey)) : null,
                publicKey: publicKey,
                signingMethod: signingMethod
            };
            
            updateStatus();
            updateProfileAvatar();
            if (!silent) {
                showNotification('Keys loaded successfully!', 'success');
            }
            
            // Add context menus to key displays
            setupKeyContextMenus();
        } catch (error) {
            if (!silent) {
                showNotification('Error loading stored keys: ' + error.message, 'error');
            }
        }
    } else {
        if (!silent) {
            showNotification('No stored keys found', 'info');
        }
    }
}

// Mask an nsec string keeping first 9 and last 5 visible
function maskNsec(nsec) {
    if (!nsec || nsec.length < 16) return nsec || '';
    const head = nsec.slice(0, 9);
    const tail = nsec.slice(-5);
    const hiddenCount = nsec.length - (head.length + tail.length);
    return head + '' + '•'.repeat(hiddenCount) + '' + tail;
}

// Toggle private key visibility
function togglePrivateKeyVisibility() {
    const el = document.getElementById('privateKeyDisplay');
    if (!el) return;
    const span = el.querySelector('span');
    const icon = document.getElementById('privateVisibilityIcon');
    const nsec = el.dataset.nsec || '';
    if (userKeys && userKeys.signingMethod === 'extension') {
        if (span) span.textContent = 'Managed by extension';
        return;
    }
    const isMasked = span && span.textContent && span.textContent.includes('•');
    if (isMasked) {
        span.textContent = nsec;
        if (icon) icon.textContent = 'visibility';
    } else {
        span.textContent = maskNsec(nsec);
        if (icon) icon.textContent = 'visibility_off';
    }
}

// Copy the true nsec even if masked in the UI
function copyPrivateNsecFromDisplay() {
    const el = document.getElementById('privateKeyDisplay');
    if (!el) return;
    const nsec = el.dataset.nsec || '';
    if (userKeys && userKeys.signingMethod === 'extension') {
        showNotification('Private key is managed by your extension', 'info');
        return;
    }
    if (!nsec) return;
    navigator.clipboard.writeText(nsec).then(() => {
        showNotification('Private key (nsec) copied', 'success');
    }).catch(() => {
        showNotification('Failed to copy private key', 'error');
    }).finally(() => {
        if (typeof hideContextMenu === 'function') hideContextMenu();
    });
}

function copyPrivateHex() {
    if (!userKeys || !userKeys.privateKey) {
        showNotification('Private key not available', 'error');
        return;
    }
    navigator.clipboard.writeText(userKeys.privateKey).then(() => {
        showNotification('Private key (hex) copied', 'success');
    }).catch(() => {
        showNotification('Failed to copy private key (hex)', 'error');
    }).finally(() => {
        if (typeof hideContextMenu === 'function') hideContextMenu();
    });
}

function importKeysFromInput() {
    const input = document.getElementById('privateKeyInput');
    if (!input) return;
    const value = input.value.trim();
    if (!value) {
        showNotification('Please enter a private key', 'error');
        return;
    }
    
    try {
        if (value.startsWith('nsec1')) {
            setKeysFromNsec(value);
        } else if (/^[0-9a-fA-F]{64}$/.test(value)) {
            const nsec = window.NostrTools.nip19.nsecEncode(hexToBytes(value));
            setKeysFromNsec(nsec);
        } else {
            throw new Error('Unsupported key format');
        }
        
        showNotification('Keys imported successfully', 'success');
    } catch (error) {
        showNotification('Failed to import keys: ' + error.message, 'error');
    }
}

function persistKeys(keys) {
    localStorage.setItem('nostrKeys', JSON.stringify(keys));
}

function setKeysFromNsec(nsec) {
    const privateKey = window.NostrTools.nip19.decode(nsec).data;
    const privateKeyHex = typeof privateKey === 'string' ? privateKey : bytesToHex(privateKey);
    const publicKeyHex = window.NostrTools.getPublicKey(privateKeyHex);
    const npub = window.NostrTools.nip19.npubEncode(publicKeyHex);
    
    userKeys = {
        privateKey: privateKeyHex,
        publicKey: publicKeyHex,
        signingMethod: 'nsec'
    };
    
    persistKeys({
        privateKey: nsec,
        publicKey: npub,
        signingMethod: 'nsec'
    });
    
    loadStoredKeys({ silent: true });
}

function setKeysFromExtension(publicKeyHex) {
    const npub = window.NostrTools.nip19.npubEncode(publicKeyHex);
    userKeys = {
        privateKey: null,
        publicKey: publicKeyHex,
        signingMethod: 'extension'
    };
    
    persistKeys({
        privateKey: null,
        publicKey: npub,
        signingMethod: 'extension'
    });
    
    loadStoredKeys({ silent: true });
}

function clearKeys() {
    localStorage.removeItem('nostrKeys');
    userKeys = null;
    const privateKeyDisplay = document.getElementById('privateKeyDisplay');
    const publicKeyDisplay = document.getElementById('publicKeyDisplay');
    if (privateKeyDisplay) {
        privateKeyDisplay.dataset.nsec = '';
        privateKeyDisplay.querySelector('span').textContent = 'Not set';
    }
    if (publicKeyDisplay) {
        publicKeyDisplay.querySelector('span').textContent = 'Not set';
    }
    updateStatus();
    updateProfileAvatar();
}

// Validate pubkey format
function validatePubkey(inputValue = null) {
    const pubkey = inputValue !== null ? inputValue.trim() : (document.getElementById('recipientPubkey')?.value.trim() || '');
    
    if (!pubkey) {
        showNotification('Please enter a recipient public key', 'error');
        return;
    }
    
    try {
        let decodedPubkey;
        
        if (pubkey.startsWith('npub1')) {
            decodedPubkey = window.NostrTools.nip19.decode(pubkey).data;
        } else {
            // Assume it's a hex key
            decodedPubkey = pubkey;
        }
        
        // Validate the key format
        if (decodedPubkey.length !== 64) {
            throw new Error('Invalid public key length');
        }
        
        showNotification('Public key validated successfully!', 'success');
        return decodedPubkey;
    } catch (error) {
        showNotification('Invalid public key: ' + error.message, 'error');
        return null;
    }
}

// Setup context menus for key displays
function setupKeyContextMenus() {
    const publicKeyDisplay = document.getElementById('publicKeyDisplay');
    const privateKeyDisplay = document.getElementById('privateKeyDisplay');
    
    if (publicKeyDisplay && userKeys && userKeys.publicKey) {
        // Add context menu to public key display
        addPubkeyContextMenu(publicKeyDisplay, userKeys.publicKey, 'Public Key');
    }
    
    if (privateKeyDisplay && userKeys && userKeys.privateKey) {
        // Use the shared pubkey menu builder; it detects private key and shows two options
        addPubkeyContextMenu(privateKeyDisplay, userKeys.privateKey, 'Private Key');
    }
}
