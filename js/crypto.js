// NIP-44 encryption and decryption functions

// Test NIP-44 functionality
function testNip44() {
    Logger.debug('=== TESTING NIP-44 FUNCTIONALITY ===');
    
    if (!window.NostrTools.nip44) {
        Logger.error('NIP-44 not available');
        return false;
    }
    
    // Create test keys using the new API
    const testPrivateKey = window.NostrTools.generateSecretKey();
    const testPublicKey = window.NostrTools.getPublicKey(testPrivateKey);
    
    Logger.debug('Test private key type:', typeof testPrivateKey);
    Logger.debug('Test private key:', testPrivateKey);
    Logger.debug('Test public key type:', typeof testPublicKey);
    Logger.debug('Test public key:', testPublicKey);
    
    // Test message
    const testMessage = 'Hello, NIP-44!';
    Logger.debug('Test message:', testMessage);
    
    // Convert keys to the format needed for NIP-44
    let privateKeyBytes, publicKeyBytes;
    
    if (typeof testPrivateKey === 'string') {
        privateKeyBytes = hexToBytes(testPrivateKey);
    } else {
        privateKeyBytes = testPrivateKey; // Assume it's already Uint8Array
    }
    
    if (typeof testPublicKey === 'string') {
        publicKeyBytes = hexToBytes(testPublicKey);
    } else {
        publicKeyBytes = testPublicKey; // Assume it's already Uint8Array
    }
    
    try {
        // Test encryption
        Logger.debug('Testing encryption...');
        const conversationKey = window.NostrTools.nip44.getConversationKey(
            privateKeyBytes,
            testPublicKey // Use hex string
        );
        
        const encrypted = window.NostrTools.nip44.v2.encrypt(
            testMessage,
            conversationKey
        );
        
        Logger.debug('NIP-44 encryption successful with conversation key');
        Logger.debug('NIP-44 encryption test successful');
        Logger.debug('Encrypted length:', encrypted.length);
        Logger.debug('Encrypted preview:', encrypted.substring(0, 50) + '...');
        
        // Test decryption
        Logger.debug('Testing decryption...');
        const decrypted = window.NostrTools.nip44.v2.decrypt(
            encrypted,
            conversationKey
        );
        
        Logger.debug('NIP-44 decryption test successful');
        Logger.debug('Decrypted message:', decrypted);
        
        if (decrypted === testMessage) {
            Logger.debug('NIP-44 test PASSED - encryption/decryption works correctly');
            return true;
        } else {
            Logger.debug('NIP-44 test FAILED - decrypted message does not match original');
            return false;
        }
    } catch (error) {
        Logger.error('NIP-44 test FAILED:', error);
        return false;
    }
}

// REAL NIP-44 Gift Wrap Content Encryption
async function encryptGiftWrapContent(content, recipientPubkey) {
    try {
        Logger.debug('=== NIP-44 ENCRYPTION START ===');
        Logger.debug('Encrypting with REAL NIP-44 for:', recipientPubkey);
        Logger.debug('Content to encrypt:', content);
        Logger.debug('Content length:', content.length);
        Logger.debug('Private key type:', typeof userKeys.privateKey);
        Logger.debug('Private key:', userKeys.privateKey);
        Logger.debug('Recipient pubkey:', recipientPubkey.substring(0, 10) + '...');
        
        // Check if NIP-44 is available
        if (!window.NostrTools.nip44) {
            Logger.error('NIP-44 not available in nostr-tools');
            throw new Error('NIP-44 not available in nostr-tools');
        }
        
        Logger.debug('NIP-44 module found:', !!window.NostrTools.nip44);
        Logger.debug('NIP-44 encrypt method:', !!window.NostrTools.nip44.encrypt);
        
        // Convert keys to Uint8Array for NIP-44
        const privateKeyBytes = hexToBytes(userKeys.privateKey); // Convert hex to Uint8Array
        const recipientPubkeyBytes = hexToBytes(recipientPubkey);
        
        Logger.debug('Private key bytes length:', privateKeyBytes.length);
        Logger.debug('Recipient pubkey bytes length:', recipientPubkeyBytes.length);
        
        // Use the correct NIP-44 API with conversation key
        let encrypted;
        try {
            Logger.debug('Attempting NIP-44 encryption with conversation key...');
            
            // Get conversation key using the correct API
            Logger.debug('Generating conversation key for encryption with:');
            Logger.debug('- Our private key:', privateKeyBytes);
            Logger.debug('- Recipient pubkey:', recipientPubkey);
            
            const conversationKey = window.NostrTools.nip44.getConversationKey(
                privateKeyBytes,
                recipientPubkey // Use hex string, not Uint8Array
            );
            
            Logger.debug('Conversation key generated for encryption:', !!conversationKey);
            Logger.debug('Conversation key length:', conversationKey ? conversationKey.length : 'N/A');
            
            // Encrypt using the conversation key
            encrypted = window.NostrTools.nip44.v2.encrypt(
                content,
                conversationKey
            );
            
            Logger.debug('NIP-44 encryption successful with conversation key');
        } catch (encryptError) {
            Logger.error('NIP-44 encrypt error:', encryptError);
            Logger.error('Error details:', encryptError.message);
            Logger.error('Error stack:', encryptError.stack);
            throw new Error('NIP-44 encryption failed');
        }
        
        Logger.debug('Successfully encrypted content with REAL NIP-44');
        Logger.debug('Encrypted content type:', typeof encrypted);
        Logger.debug('Encrypted content length:', encrypted.length);
        Logger.debug('Encrypted content preview:', encrypted.substring(0, 50) + '...');
        Logger.debug('=== NIP-44 ENCRYPTION END ===');
        
        // Return the encrypted content
        return encrypted;
    } catch (error) {
        Logger.error('=== NIP-44 ENCRYPTION FAILED ===');
        Logger.error('Error encrypting gift wrap content:', error);
        Logger.error('Error message:', error.message);
        Logger.error('Error stack:', error.stack);
        throw error;
    }
}

// REAL NIP-44 Gift Wrap Content Encryption with specific identity
async function encryptGiftWrapContentWithIdentity(content, recipientPubkey, identity) {
    try {
        // Get the private key from the identity
        const identityPrivateKeyHex = identity.privateKeyHex || 
                                      (identity.privateKey ? 
                                       bytesToHex(identity.privateKey) : 
                                       null);
        
        if (!identityPrivateKeyHex) {
            throw new Error('Unable to get private key for identity');
        }
        
        // Check if NIP-44 is available
        if (!window.NostrTools.nip44) {
            throw new Error('NIP-44 not available in nostr-tools');
        }
        
        // Convert keys to Uint8Array for NIP-44
        const privateKeyBytes = hexToBytes(identityPrivateKeyHex);
        const recipientPubkeyBytes = hexToBytes(recipientPubkey);
        
        // Get conversation key using the correct API
        const conversationKey = window.NostrTools.nip44.getConversationKey(
            privateKeyBytes,
            recipientPubkey // Use hex string, not Uint8Array
        );
        
        // Encrypt using the conversation key
        const encrypted = window.NostrTools.nip44.v2.encrypt(
            content,
            conversationKey
        );
        
        return encrypted;
    } catch (error) {
        Logger.error('Error encrypting gift wrap content with identity:', error);
        throw error;
    }
}

// REAL NIP-44 Gift Wrap Content Decryption
async function decryptGiftWrapContent(encryptedContent, senderPubkey) {
    try {
        // Check if NIP-44 is available
        if (!window.NostrTools.nip44) {
            throw new Error('NIP-44 not available in nostr-tools');
        }
        
        // Convert keys to Uint8Array for NIP-44
        const privateKeyBytes = hexToBytes(userKeys.privateKey);
        const senderPubkeyBytes = hexToBytes(senderPubkey);
        
        // Get conversation key using the correct API
            const conversationKey = window.NostrTools.nip44.getConversationKey(
                privateKeyBytes,
                senderPubkey // Use hex string, not Uint8Array
            );
            
            // Decrypt using the conversation key
            let decrypted;
            try {
                decrypted = window.NostrTools.nip44.v2.decrypt(
                encryptedContent,
                conversationKey
            );
            } catch (nip44Error) {
                Logger.debug('NIP-44 decryption failed:', nip44Error.message);
                
                // Handle specific encryption errors
                if (nip44Error.message && nip44Error.message.includes('unknown encryption version')) {
                    Logger.debug('Skipping message with unknown encryption version - likely corrupted or incompatible');
                    return null;
                }
                
                // Re-throw other errors to be handled by outer catch
                throw nip44Error;
            }
            
        return decrypted;
    } catch (error) {
        // Tolerate occasional decrypt errors without noisy Logger.error
        const msg = (error && error.message) ? error.message : String(error);
        if (msg.includes('invalid payload length')) {
            // Likely not a valid encrypted message
            return null;
        }
        if (msg.includes('unknown encryption version')) {
            return null;
        }
        if (msg.includes('invalid MAC')) {
            // Wrong key or corrupted payload; treat as non-fatal
            return null;
        }
        // For anything else, downgrade to warn to avoid spam
        Logger.warn('Decrypt (nip44 v2) failed:', msg);
        return null;
    }
}

// REAL NIP-44 Gift Wrap Content Decryption with conversation identity
async function decryptGiftWrapContentWithIdentity(encryptedContent, senderPubkey, conversationData) {
    try {
        // Check if NIP-44 is available
        if (!window.NostrTools.nip44) {
            throw new Error('NIP-44 not available in nostr-tools');
        }
        
        // The encryption was done using:
        // senderConversationIdentity.privateKey + recipientMainPubkey
        // So for decryption we need:
        // recipientMainPrivateKey + senderConversationIdentity.publicKey
        
        // Use our main private key and the sender's conversation identity public key
        const ourPrivateKeyBytes = hexToBytes(userKeys.privateKey);
        
        // The sender pubkey here is actually their conversation identity public key
        // (this is the pubkey from the event that was sent)
        const senderConversationPubkey = senderPubkey;
        
        Logger.debug('Decrypting with:');
        Logger.debug('- Our private key (first 16 chars):', userKeys.privateKey.substring(0, 16) + '...');
        Logger.debug('- Sender conversation pubkey (first 16 chars):', senderConversationPubkey.substring(0, 16) + '...');
        
        // Generate the same conversation key that was used for encryption
        const conversationKey = window.NostrTools.nip44.getConversationKey(
            ourPrivateKeyBytes,
            senderConversationPubkey // This is their conversation identity public key
        );
        
        // Decrypt using the conversation key
        let decrypted;
        try {
            decrypted = window.NostrTools.nip44.v2.decrypt(
                encryptedContent,
                conversationKey
            );
            Logger.debug('Successfully decrypted with conversation identity approach');
        } catch (nip44Error) {
            Logger.debug('NIP-44 decryption failed:', nip44Error.message);
            
            // Handle specific encryption errors
            if (nip44Error.message && nip44Error.message.includes('unknown encryption version')) {
                Logger.debug('Skipping message with unknown encryption version - likely corrupted or incompatible');
                return null;
            }
            
            // Re-throw other errors to be handled by outer catch
            throw nip44Error;
        }
        
        return decrypted;
    } catch (error) {
        // Tolerate occasional decrypt errors without noisy Logger.error
        const msg = (error && error.message) ? error.message : String(error);
        if (msg.includes('invalid payload length')) {
            return null;
        }
        if (msg.includes('unknown encryption version')) {
            return null;
        }
        if (msg.includes('invalid MAC')) {
            // Wrong key or corrupted payload; try fallback then give up quietly
            const fallback = await decryptGiftWrapContent(encryptedContent, senderPubkey);
            return fallback;
        }
        Logger.warn('Decrypt (nip44 v2 with identity) failed:', msg);
        return null;
    }
}

async function decryptGiftWrapContentForOutgoing(encryptedContent, recipientPubkey, conversationIdentity) {
    try {
        if (!window.NostrTools.nip44) {
            throw new Error('NIP-44 not available in nostr-tools');
        }
        if (!conversationIdentity) {
            return null;
        }
        
        const identityPrivateKeyHex = conversationIdentity.privateKeyHex ||
            (conversationIdentity.privateKey ? bytesToHex(conversationIdentity.privateKey) : null);
        if (!identityPrivateKeyHex) {
            return null;
        }
        
        const privateKeyBytes = hexToBytes(identityPrivateKeyHex);
        const conversationKey = window.NostrTools.nip44.getConversationKey(
            privateKeyBytes,
            recipientPubkey
        );
        
        return window.NostrTools.nip44.v2.decrypt(encryptedContent, conversationKey);
    } catch (error) {
        const msg = (error && error.message) ? error.message : String(error);
        if (msg.includes('invalid payload length') || msg.includes('unknown encryption version') || msg.includes('invalid MAC')) {
            return null;
        }
        Logger.warn('Decrypt (outgoing nip44 v2) failed:', msg);
        return null;
    }
}
