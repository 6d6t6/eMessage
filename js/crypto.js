// NIP-44 encryption and decryption functions

// Test NIP-44 functionality
function testNip44() {
    console.log('=== TESTING NIP-44 FUNCTIONALITY ===');
    
    if (!window.NostrTools.nip44) {
        console.error('NIP-44 not available');
        return false;
    }
    
    // Create test keys using the new API
    const testPrivateKey = window.NostrTools.generateSecretKey();
    const testPublicKey = window.NostrTools.getPublicKey(testPrivateKey);
    
    console.log('Test private key type:', typeof testPrivateKey);
    console.log('Test private key:', testPrivateKey);
    console.log('Test public key type:', typeof testPublicKey);
    console.log('Test public key:', testPublicKey);
    
    // Test message
    const testMessage = 'Hello, NIP-44!';
    console.log('Test message:', testMessage);
    
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
        console.log('Testing encryption...');
        const conversationKey = window.NostrTools.nip44.getConversationKey(
            privateKeyBytes,
            testPublicKey // Use hex string
        );
        
        const encrypted = window.NostrTools.nip44.v2.encrypt(
            testMessage,
            conversationKey
        );
        
        console.log('NIP-44 encryption successful with conversation key');
        console.log('NIP-44 encryption test successful');
        console.log('Encrypted length:', encrypted.length);
        console.log('Encrypted preview:', encrypted.substring(0, 50) + '...');
        
        // Test decryption
        console.log('Testing decryption...');
        const decrypted = window.NostrTools.nip44.v2.decrypt(
            encrypted,
            conversationKey
        );
        
        console.log('NIP-44 decryption test successful');
        console.log('Decrypted message:', decrypted);
        
        if (decrypted === testMessage) {
            console.log('NIP-44 test PASSED - encryption/decryption works correctly');
            return true;
        } else {
            console.log('NIP-44 test FAILED - decrypted message does not match original');
            return false;
        }
    } catch (error) {
        console.error('NIP-44 test FAILED:', error);
        return false;
    }
}

// REAL NIP-44 Gift Wrap Content Encryption
async function encryptGiftWrapContent(content, recipientPubkey) {
    try {
        console.log('=== NIP-44 ENCRYPTION START ===');
        console.log('Encrypting with REAL NIP-44 for:', recipientPubkey);
        console.log('Content to encrypt:', content);
        console.log('Content length:', content.length);
        console.log('Private key type:', typeof userKeys.privateKey);
        console.log('Private key:', userKeys.privateKey);
        console.log('Recipient pubkey:', recipientPubkey.substring(0, 10) + '...');
        
        // Check if NIP-44 is available
        if (!window.NostrTools.nip44) {
            console.error('NIP-44 not available in nostr-tools');
            throw new Error('NIP-44 not available in nostr-tools');
        }
        
        console.log('NIP-44 module found:', !!window.NostrTools.nip44);
        console.log('NIP-44 encrypt method:', !!window.NostrTools.nip44.encrypt);
        
        // Convert keys to Uint8Array for NIP-44
        const privateKeyBytes = hexToBytes(userKeys.privateKey); // Convert hex to Uint8Array
        const recipientPubkeyBytes = hexToBytes(recipientPubkey);
        
        console.log('Private key bytes length:', privateKeyBytes.length);
        console.log('Recipient pubkey bytes length:', recipientPubkeyBytes.length);
        
        // Use the correct NIP-44 API with conversation key
        let encrypted;
        try {
            console.log('Attempting NIP-44 encryption with conversation key...');
            
            // Get conversation key using the correct API
            console.log('Generating conversation key for encryption with:');
            console.log('- Our private key:', privateKeyBytes);
            console.log('- Recipient pubkey:', recipientPubkey);
            
            const conversationKey = window.NostrTools.nip44.getConversationKey(
                privateKeyBytes,
                recipientPubkey // Use hex string, not Uint8Array
            );
            
            console.log('Conversation key generated for encryption:', !!conversationKey);
            console.log('Conversation key length:', conversationKey ? conversationKey.length : 'N/A');
            
            // Encrypt using the conversation key
            encrypted = window.NostrTools.nip44.v2.encrypt(
                content,
                conversationKey
            );
            
            console.log('NIP-44 encryption successful with conversation key');
        } catch (encryptError) {
            console.error('NIP-44 encrypt error:', encryptError);
            console.error('Error details:', encryptError.message);
            console.error('Error stack:', encryptError.stack);
            throw new Error('NIP-44 encryption failed');
        }
        
        console.log('Successfully encrypted content with REAL NIP-44');
        console.log('Encrypted content type:', typeof encrypted);
        console.log('Encrypted content length:', encrypted.length);
        console.log('Encrypted content preview:', encrypted.substring(0, 50) + '...');
        console.log('=== NIP-44 ENCRYPTION END ===');
        
        // Return the encrypted content
        return encrypted;
    } catch (error) {
        console.error('=== NIP-44 ENCRYPTION FAILED ===');
        console.error('Error encrypting gift wrap content:', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
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
        console.error('Error encrypting gift wrap content with identity:', error);
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
                console.log('NIP-44 decryption failed:', nip44Error.message);
                
                // Handle specific encryption errors
                if (nip44Error.message && nip44Error.message.includes('unknown encryption version')) {
                    console.log('Skipping message with unknown encryption version - likely corrupted or incompatible');
                    return null;
                }
                
                // Re-throw other errors to be handled by outer catch
                throw nip44Error;
            }
            
        return decrypted;
    } catch (error) {
        // Tolerate occasional decrypt errors without noisy console.error
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
        console.warn('Decrypt (nip44 v2) failed:', msg);
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
        
        console.log('Decrypting with:');
        console.log('- Our private key (first 16 chars):', userKeys.privateKey.substring(0, 16) + '...');
        console.log('- Sender conversation pubkey (first 16 chars):', senderConversationPubkey.substring(0, 16) + '...');
        
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
            console.log('Successfully decrypted with conversation identity approach');
        } catch (nip44Error) {
            console.log('NIP-44 decryption failed:', nip44Error.message);
            
            // Handle specific encryption errors
            if (nip44Error.message && nip44Error.message.includes('unknown encryption version')) {
                console.log('Skipping message with unknown encryption version - likely corrupted or incompatible');
                return null;
            }
            
            // Re-throw other errors to be handled by outer catch
            throw nip44Error;
        }
        
        return decrypted;
    } catch (error) {
        // Tolerate occasional decrypt errors without noisy console.error
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
        console.warn('Decrypt (nip44 v2 with identity) failed:', msg);
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
        console.warn('Decrypt (outgoing nip44 v2) failed:', msg);
        return null;
    }
}
