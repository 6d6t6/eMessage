// Main application initialization and coordination

let appBootstrapped = false;

function bootstrapApp() {
    if (appBootstrapped) return;
    appBootstrapped = true;
    
    initializeIncognitoState();
    initializeChatState();
    updateStatus();
    updateProfileAvatar();
    updateConversationsDisplay();
    
    const chatInterface = document.getElementById('chatInterface');
    const chatTitle = document.getElementById('chatTitle');
    
    if (chatInterface) chatInterface.style.display = 'flex';
    if (chatTitle) chatTitle.textContent = 'Select a conversation';
    
    if (!chatState.currentConversation) {
        const chatPlaceholder = document.getElementById('chatPlaceholder');
        const messagesArea = document.getElementById('messagesArea');
        const messageInputContainer = document.getElementById('messageInputContainer');
        
        if (chatPlaceholder) chatPlaceholder.style.display = 'flex';
        if (messagesArea) messagesArea.style.display = 'none';
        if (messageInputContainer) messageInputContainer.style.display = 'none';
    }

    const profilePanel = document.getElementById('profilePanel');
    if (profilePanel && !profilePanel.classList.contains('active')) {
        if (typeof setPanelAccessibility === 'function') {
            setPanelAccessibility(profilePanel, false);
        }
    }
    
    if (typeof updateRelayButtonState === 'function') {
        updateRelayButtonState();
    }
    
    if (userKeys) {
        setTimeout(() => {
            connectRelays();
        }, 1000);
    }

    syncResponsiveLayout();
}

// Initialize the app shell
document.addEventListener('DOMContentLoaded', function() {
    if (!checkNostrTools()) {
        return;
    }
    
    testNip44();
    initializeAuthFlow();
    window.addEventListener('resize', syncResponsiveLayout);
});

// Legacy gift wrap functions (kept for compatibility)
async function handleGiftWrapEvent(event) {
    try {
        console.log('Received gift wrap event:', event);
        
        // Check if this gift wrap is for us
        const recipientTag = event.tags.find(tag => tag[0] === 'p');
        if (recipientTag && recipientTag[1] === userKeys.publicKey) {
            // This gift wrap is for us, try to unwrap it
            const unwrappedEvent = await unwrapGiftWrap(event);
            
            if (unwrappedEvent) {
                const message = {
                    id: unwrappedEvent.id,
                    sender: unwrappedEvent.pubkey,
                    content: unwrappedEvent.content,
                    timestamp: unwrappedEvent.created_at,
                    decrypted: true
                };
                
                receivedMessages.unshift(message);
                updateMessagesDisplay();
                updateStatus();
                showNotification('New encrypted message received!', 'success');
                saveMessages(); // Save messages after adding new ones
            }
        }
    } catch (error) {
        console.error('Error handling gift wrap event:', error);
        showNotification('Error decrypting message: ' + error.message, 'error');
    }
}

// REAL NIP-17 Gift Wrap Unwrapping with REAL NIP-44
async function unwrapGiftWrap(event) {
    try {
        console.log('Unwrapping gift wrap with REAL NIP-44...');
        
        // Decrypt the gift wrap content using REAL NIP-44
        const decryptedContent = await decryptGiftWrapContent(event.content, event.pubkey);
        
        if (decryptedContent) {
            // Parse the decrypted content to extract the rumor
            const rumor = JSON.parse(decryptedContent);
            
            return {
                kind: 4, // The original message kind
                id: rumor.id,
                pubkey: rumor.pubkey,
                content: rumor.content,
                created_at: rumor.created_at
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error unwrapping gift wrap:', error);
        return null;
    }
}

// REAL NIP-17 Gift Wrap Creation with REAL NIP-44
async function createGiftWrap(originalMessage, recipientPubkey) {
    try {
        console.log('Creating REAL gift wrap with REAL NIP-44 encryption...');
        
        // Create the rumor (the original message)
        const rumor = {
            id: originalMessage.id,
            pubkey: originalMessage.pubkey,
            created_at: originalMessage.created_at,
            kind: originalMessage.kind,
            tags: originalMessage.tags,
            content: originalMessage.content,
            sig: originalMessage.sig
        };
        
        // Encrypt the rumor using REAL NIP-44
        const encryptedRumor = await encryptGiftWrapContent(JSON.stringify(rumor), recipientPubkey);
        
        // Create the gift wrap event
        const giftWrapEvent = {
            kind: 1059,
            pubkey: userKeys.publicKey,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['p', recipientPubkey], // Recipient
                ['gift', 'nip17'] // Gift wrap identifier
            ],
            content: encryptedRumor
        };
        
        // Sign the gift wrap event
        const signedGiftWrap = await signNostrEvent(giftWrapEvent);
        
        console.log('REAL gift wrap created successfully!');
        return signedGiftWrap;
    } catch (error) {
        console.error('Error creating gift wrap:', error);
        throw error;
    }
}

// Test functions for debugging
function testIncognitoMessage() {
    console.log('=== TESTING INCOGNITO MESSAGE SENDING ===');
    
    if (!userKeys) {
        console.error('No user keys available');
        return;
    }
    
    // Get the recipient pubkey from the input
    const recipientPubkey = document.getElementById('testRecipientInput')?.value.trim();
    if (!recipientPubkey) {
        console.error('No recipient pubkey entered');
        return;
    }
    
    const messageText = 'Test message from ' + new Date().toISOString();
    console.log('Sending test message:', messageText);
    console.log('To recipient:', recipientPubkey);
    
    // Send the message
    sendIncognitoMessage(recipientPubkey, messageText);
}

function testDecryption(encryptedContent, senderPubkey) {
    console.log('=== TESTING DECRYPTION ===');
    console.log('Encrypted content:', encryptedContent);
    console.log('Sender pubkey:', senderPubkey);
    
    decryptGiftWrapContent(encryptedContent, senderPubkey).then(decrypted => {
        console.log('Decryption result:', decrypted);
        if (decrypted) {
            try {
                const parsed = JSON.parse(decrypted);
                console.log('Parsed message:', parsed);
            } catch (e) {
                console.log('Could not parse as JSON:', e);
            }
        }
    });
}

function testConversationMatching(eventPubkey) {
    console.log('=== TESTING CONVERSATION MATCHING ===');
    console.log('Event pubkey:', eventPubkey);
    console.log('Number of conversations:', incognitoState.conversations.size);
    
    for (const [recipient, data] of incognitoState.conversations) {
        console.log('Conversation with:', recipient);
        console.log('- Conversation pubkey:', data.conversationPubkey);
        console.log('- Conversation identity:', data.conversationIdentity ? data.conversationIdentity.publicKey : 'none');
        console.log('- Sender identity:', data.senderIdentity ? data.senderIdentity.publicKey : 'none');
        console.log('- Match with event pubkey:', data.conversationPubkey === eventPubkey);
        console.log('---');
    }
}

function testProcessMessage(eventPubkey, encryptedContent) {
    console.log('=== TESTING MESSAGE PROCESSING ===');
    console.log('Event pubkey:', eventPubkey);
    console.log('Encrypted content:', encryptedContent);
    
    // Create a mock event
    const mockEvent = {
        pubkey: eventPubkey,
        content: encryptedContent
    };
    
    // Process the message
    handleIncognitoMessage(mockEvent);
}

function testConversationData() {
    console.log('=== TESTING CONVERSATION DATA INTEGRITY ===');
    console.log('Number of conversations:', incognitoState.conversations.size);
    
    for (const [recipient, data] of incognitoState.conversations) {
        console.log('Conversation with:', recipient);
        console.log('- Full data:', data);
        console.log('- conversationPubkey:', data.conversationPubkey);
        console.log('- recipient:', data.recipient);
        console.log('- status:', data.status);
        console.log('---');
    }
    
    // Also check localStorage directly
    const stored = localStorage.getItem('incognitoState');
    if (stored) {
        const data = JSON.parse(stored);
        console.log('Raw localStorage data:', data);
        if (data.conversations) {
            for (const [key, value] of Object.entries(data.conversations)) {
                console.log('Stored conversation for:', key.substring(0, 16) + '...');
                console.log('- conversationPubkey:', value.conversationPubkey);
            }
        }
    }
} 
