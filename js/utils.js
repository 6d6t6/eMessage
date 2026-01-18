// Utility functions for the Nostr DM application

// Utility function to convert hex string to Uint8Array
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

// Utility function to convert Uint8Array to hex string
function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Utility function to check if NostrTools is loaded
function checkNostrTools() {
    if (!window.NostrTools) {
        console.error('NostrTools not available');
        showNotification('Error: NostrTools library not loaded. Please refresh the page.', 'error');
        return false;
    }
    
    console.log('NostrTools loaded successfully');
    console.log('NIP-44 available:', !!window.NostrTools.nip44);
    return true;
}

// Format pubkey for display
function formatPubkey(pubkey) {
    if (pubkey.length > 20) {
        return pubkey.substring(0, 8) + '...' + pubkey.substring(pubkey.length - 8);
    }
    return pubkey;
}

// Format pubkey for display (shows npub1 if available, otherwise hex)
function formatPubkeyForDisplay(pubkey) {
    try {
        // Try to convert hex to npub1 for better readability
        if (pubkey.length === 64 && /^[0-9a-fA-F]{64}$/.test(pubkey)) {
            const npub = window.NostrTools.nip19.npubEncode(pubkey);
            // Truncate npub1 for display: npub12345...67890
            return npub.substring(0, 9) + '...' + npub.substring(npub.length - 5);
        }
        // If it's already npub1, truncate it
        if (pubkey.startsWith('npub1')) {
            return pubkey.substring(0, 9) + '...' + pubkey.substring(pubkey.length - 5);
        }
        // Fallback to hex format
        return formatPubkey(pubkey);
    } catch (error) {
        // If conversion fails, fallback to hex format
        return formatPubkey(pubkey);
    }
}

// Format timestamp for display
function formatTimestamp(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Copy text to clipboard
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const textToCopy = element.querySelector('span') ? element.querySelector('span').textContent : element.textContent;
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            showNotification('Copied to clipboard!', 'success');
        }).catch(() => {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = textToCopy;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showNotification('Copied to clipboard!', 'success');
        });
    } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('Copied to clipboard!', 'success');
    }
}

// Function to manage processedEventIds size
function addProcessedEventId(eventId) {
    processedEventIds.add(eventId);
    if (processedEventIds.size > MAX_PROCESSED_EVENTS) {
        // Remove oldest entries by clearing and keeping only recent ones
        // Note: Sets maintain insertion order, so we can use this approach
        const eventIds = Array.from(processedEventIds);
        processedEventIds.clear();
        eventIds.slice(-MAX_PROCESSED_EVENTS + 1).forEach(id => processedEventIds.add(id));
        processedEventIds.add(eventId);
    }
}

// Generate random pubkey for obfuscation
function generateRandomPubkey() {
    const randomKey = window.NostrTools.generateSecretKey();
    return window.NostrTools.getPublicKey(randomKey);
}

// Sign a Nostr event using the available signing method
async function signNostrEvent(eventTemplate, privateKeyOverride = null) {
    if (!eventTemplate) {
        throw new Error('Missing event to sign');
    }
    
    if (privateKeyOverride) {
        return window.NostrTools.finalizeEvent(eventTemplate, privateKeyOverride);
    }
    
    if (!userKeys) {
        throw new Error('No user keys available for signing');
    }
    
    if (userKeys.signingMethod === 'extension') {
        if (!window.nostr || !window.nostr.signEvent) {
            throw new Error('Nostr extension not available for signing');
        }
        const eventToSign = {
            ...eventTemplate,
            pubkey: userKeys.publicKey
        };
        return await window.nostr.signEvent(eventToSign);
    }
    
    return window.NostrTools.finalizeEvent(eventTemplate, userKeys.privateKey);
}
