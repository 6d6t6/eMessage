// Incognito messaging functions (NIP-TBD implementation)

const INCOGNITO_BACKUP_TAG = 'emessage-incognito';
const INCOGNITO_BACKUP_DEBOUNCE_MS = 5000;
let incognitoBackupTimer = null;
let incognitoBackupPending = false;

const READ_MARKERS_TAG = 'emessage-read-markers';
const READ_MARKERS_DEBOUNCE_MS = 10000; // 10 seconds to batch multiple reads
let readMarkersTimer = null;
let readMarkersPending = false;

// Generate disposable identity for a conversation
function generateDisposableIdentity(recipientPubkey, identityIndex = 0, conversationCounter = null) {
    try {
        if (!incognitoState.seed) {
            throw new Error('Incognito state not initialized');
        }
        
        // Use provided counter or current counter
        const counter = conversationCounter !== null ? conversationCounter : incognitoState.conversationCounter;
        
        // Create deterministic key using seed + recipient + conversation counter + identity index
        const derivationString = `${incognitoState.seed}:${recipientPubkey}:${counter}:${identityIndex}`;
        
        // Use built-in crypto API for hashing
        const encoder = new TextEncoder();
        const data = encoder.encode(derivationString);
        
        // Create a simple hash using the existing private key as entropy
        const seedBytes = hexToBytes(incognitoState.seed);
        const derivationBytes = encoder.encode(`${recipientPubkey}:${counter}:${identityIndex}`);
        
        // XOR the seed with the derivation data to create a new private key
        const disposablePrivateKey = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            disposablePrivateKey[i] = seedBytes[i] ^ derivationBytes[i % derivationBytes.length];
        }
        
        const disposablePublicKey = window.NostrTools.getPublicKey(disposablePrivateKey);
        
        return {
            privateKey: disposablePrivateKey, // Keep as Uint8Array for NIP-44
            privateKeyHex: bytesToHex(disposablePrivateKey), // Hex for signing
            publicKey: disposablePublicKey
        };
    } catch (error) {
        Logger.error('Error generating disposable identity:', error);
        throw error;
    }
}

function parseInvitationPayload(content) {
    if (!content) return null;
    const lines = content.split('\n');
    const inviteLine = lines.find(line => line.trim().startsWith('invite:'));
    if (!inviteLine) return null;
    
    const parts = inviteLine.trim().split(':');
    if (parts.length < 5) return null;
    if (parts[0] !== 'invite') return null;
    
    const senderPubkey = parts[1];
    const conversationPubkey = parts[2];
    if (!/^[a-f0-9]{64}$/i.test(senderPubkey) || !/^[a-f0-9]{64}$/i.test(conversationPubkey)) {
        return null;
    }
    
    const possibleCounter = parts[parts.length - 2];
    const signature = parts[parts.length - 1];
    const hasCounter = /^\d+$/.test(possibleCounter);
    const relayParts = parts.slice(3, hasCounter ? parts.length - 2 : parts.length - 1);
    const relay = relayParts.join(':');
    
    if (!relay || !/^wss?:\/\//i.test(relay)) {
        return null;
    }
    if (!/^[a-f0-9]+$/i.test(signature || '')) {
        return null;
    }
    
    return {
        senderPubkey,
        conversationPubkey,
        relay,
        conversationCounter: hasCounter ? parseInt(possibleCounter, 10) : 0,
        signature
    };
}

// Create conversation for incognito messaging
function createIncognitoConversation(recipientPubkey) {
    try {
        Logger.debug('Creating incognito conversation for:', recipientPubkey);
        
        // Generate two disposable identities for this conversation
        const senderIdentity = generateDisposableIdentity(recipientPubkey, 0); // For sending invitation
        const conversationIdentity = generateDisposableIdentity(recipientPubkey, 1); // For actual messaging
        
        const conversationData = {
            recipient: recipientPubkey,
            conversationPubkey: conversationIdentity.publicKey, // Add this field!
            senderIdentity: senderIdentity,
            conversationIdentity: conversationIdentity,
            conversationIndex: incognitoState.conversationCounter,
            createdAt: Math.floor(Date.now() / 1000),
            status: 'pending', // pending, active, expired
            role: 'initiator',
            relay: (typeof getConnectedRelayUrls === 'function' && getConnectedRelayUrls().length
                ? getConnectedRelayUrls()[0]
                : (typeof getEnabledRelayUrls === 'function' ? getEnabledRelayUrls()[0] : DEFAULT_RELAYS[0]))
        };
        
        // Store conversation
        incognitoState.conversations.set(recipientPubkey, conversationData);
        incognitoState.disposableKeys.set(`${recipientPubkey}:sender`, senderIdentity);
        incognitoState.disposableKeys.set(`${recipientPubkey}:conversation`, conversationIdentity);
        if (typeof requestProfileMetadata === 'function') {
            requestProfileMetadata(recipientPubkey);
        }
        
        // Increment conversation counter
        incognitoState.conversationCounter++;
        
        saveIncognitoState();
        scheduleIncognitoBackup();
        
        Logger.debug('Incognito conversation created successfully');
        return conversationData;
    } catch (error) {
        Logger.error('Error creating incognito conversation:', error);
        throw error;
    }
}

// Create invitation signature for authentication
async function createInvitationSignature(recipientPubkey, conversationPubkey) {
    try {
        // Create signature event template as per NIP-TBD spec
        const eventTemplate = {
            kind: 0,
            created_at: 0, // Must be 0
            tags: [
                ["p", recipientPubkey],
                ["p", conversationPubkey]
            ],
            content: ""
        };
        
        // Use the shared signer to properly sign the event
        const signedEvent = await signNostrEvent(eventTemplate);
        return signedEvent.sig;
    } catch (error) {
        Logger.error('Error creating invitation signature:', error);
        throw error;
    }
}

// Send incognito invitation using NIP-04 (regular DM)
async function sendIncognitoInvitation(recipientPubkey, conversationData) {
    try {
        Logger.debug('Sending incognito invitation to:', recipientPubkey);
        
        // Create invitation signature
        const invitationSig = await createInvitationSignature(recipientPubkey, conversationData.conversationIdentity.publicKey);
        
        // Create invitation content - include conversation counter so recipient can verify
        const inviteCode = `invite:${userKeys.publicKey}:${conversationData.conversationIdentity.publicKey}:${conversationData.relay}:${conversationData.conversationIndex}:${invitationSig}`;
        
        let invitationContent = `Someone wants to start an incognito conversation with you. Your client may not support this behavior, you can find a list of clients here who support incognito messaging: https://nostrincognito.com/clients

${inviteCode}`;
        if (profileState && profileState.metadata) {
            invitationContent += `\nprofile:${JSON.stringify(profileState.metadata)}`;
        }

        // Encrypt invitation using the sender's disposable identity key
        // This way the recipient can decrypt it using the disposable pubkey from the event
        const senderPrivateKeyHex = conversationData.senderIdentity.privateKeyHex || 
                                    (conversationData.senderIdentity.privateKey ? 
                                     bytesToHex(conversationData.senderIdentity.privateKey) : 
                                     null);
        
        if (!senderPrivateKeyHex) {
            throw new Error('Unable to get private key for sender identity');
        }
        
        // Always use NIP-44 for invitation encryption to match decryption
        let encryptedContent;
        const senderPrivateKeyBytes = hexToBytes(senderPrivateKeyHex);
        const recipientPubkeyBytes = hexToBytes(recipientPubkey);
        
        // Get conversation key for encryption
        const conversationKey = window.NostrTools.nip44.getConversationKey(
            senderPrivateKeyBytes,
            recipientPubkey // Use hex string
        );
        
        // Encrypt using NIP-44
            encryptedContent = window.NostrTools.nip44.v2.encrypt(invitationContent, conversationKey);
        
        // Create invitation event from sender's disposable identity
        const invitationEvent = {
            kind: 4, // Regular DM for invitation
            pubkey: conversationData.senderIdentity.publicKey,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['p', recipientPubkey]
            ],
            content: encryptedContent
        };
        
        // Use the same senderPrivateKeyHex from above for signing
        if (!senderPrivateKeyHex) {
            throw new Error('Unable to get private key for sender identity');
        }
        
        const signedInvitation = await signNostrEvent(invitationEvent, senderPrivateKeyHex);
        
        // Send invitation
        const sendMessage = JSON.stringify([
            'EVENT',
            signedInvitation
        ]);
        
        sendToRelays(sendMessage);
        
        Logger.debug('Incognito invitation sent successfully');
        showNotification('Incognito invitation sent!', 'success');
        
        return signedInvitation;
    } catch (error) {
        Logger.error('Error sending incognito invitation:', error);
        throw error;
    }
}

// Send incognito message using conversation identity
async function sendIncognitoMessage(recipientPubkey, messageText) {
    try {
        Logger.debug('=== SENDING INCOGNITO MESSAGE ===');
        Logger.debug('Recipient:', recipientPubkey.substring(0, 16) + '...');
        Logger.debug('Message text:', messageText);
        Logger.debug('Message length:', messageText.length);
        
        // Get or create conversation
        let conversationData = incognitoState.conversations.get(recipientPubkey);
        if (!conversationData) {
            Logger.debug('No existing conversation, creating new one...');
            conversationData = createIncognitoConversation(recipientPubkey);
            
            // Send invitation first
            Logger.debug('Sending invitation...');
            await sendIncognitoInvitation(recipientPubkey, conversationData);
        
        // Add a delay to ensure invitation is processed before sending message
        await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
            Logger.debug('Using existing conversation');
            // Check if existing conversation has proper key formats (for backward compatibility)
            if (!conversationData.conversationIdentity.privateKeyHex) {
                Logger.debug('Regenerating conversation identity for backward compatibility');
                conversationData.conversationIdentity = generateDisposableIdentity(recipientPubkey, 1);
                // Also regenerate sender identity if needed
                if (!conversationData.senderIdentity.privateKeyHex) {
                    conversationData.senderIdentity = generateDisposableIdentity(recipientPubkey, 0);
                }
                // Save the updated conversation
                incognitoState.conversations.set(recipientPubkey, conversationData);
                saveIncognitoState();
            }
        }
        
        Logger.debug('Using conversation identity for sending:', conversationData.conversationIdentity.publicKey);
        
        if (conversationData.relay && typeof ensureRelayEnabled === 'function') {
            ensureRelayEnabled(conversationData.relay);
        }
        
        // Ensure conversation is properly established
        if (!conversationData.conversationIdentity.privateKeyHex) {
            throw new Error('Conversation identity not properly initialized');
        }
        
        // Create the original message event (kind 4)
        const originalMessage = {
            kind: 4,
            pubkey: userKeys.publicKey, // Original sender identity inside
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['p', recipientPubkey]
            ],
            content: messageText
        };
        
        Logger.debug('Created original message event:', originalMessage.id || 'no-id-yet');
        
        // Sign the original message
        const signedOriginalMessage = await signNostrEvent(originalMessage);
        Logger.debug('Signed original message ID:', signedOriginalMessage.id);
        
        // Wrap it as incognito message using conversation identity
        Logger.debug('Encrypting message content...');
        let payload = signedOriginalMessage;
        if (profileState && profileState.metadata) {
            payload = {
                event: signedOriginalMessage,
                profile: profileState.metadata,
                profileUpdatedAt: profileState.updatedAt || null
            };
        }
        // 1. CREATE RECIPIENT WRAP (Standard NIP-17)
        const recipientEncrypted = await encryptGiftWrapContentWithIdentity(JSON.stringify(payload), recipientPubkey, conversationData.conversationIdentity);
        
        const recipientWrapEvent = {
            kind: 1059,
            pubkey: conversationData.conversationIdentity.publicKey,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['p', recipientPubkey]],
            content: recipientEncrypted
        };
        
        // Sign with conversation identity
        const privKeyHex = conversationData.conversationIdentity.privateKeyHex || 
                          (conversationData.conversationIdentity.privateKey ? 
                           bytesToHex(conversationData.conversationIdentity.privateKey) : 
                           null);
        
        if (!privKeyHex) {
            throw new Error('Unable to get private key for conversation identity');
        }
        
        const signedRecipientWrap = await signNostrEvent(recipientWrapEvent, privKeyHex);
        
        // 2. CREATE SELF WRAP (Sealed Outbox with Jitter & Anonymity)
        // We use a one-time random identity for the self-copy so it can't be linked to your main account or ghost identity by authors.
        const oneTimeSecret = window.NostrTools.generateSecretKey();
        const oneTimePubkey = window.NostrTools.getPublicKey(oneTimeSecret);
        const selfEncrypted = await encryptGiftWrapContent(JSON.stringify(payload), userKeys.publicKey);
        
        const selfWrapEvent = {
            kind: 1059,
            pubkey: oneTimePubkey,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['p', userKeys.publicKey]],
            content: selfEncrypted
        };
        
        const signedSelfWrap = await signNostrEvent(selfWrapEvent, bytesToHex(oneTimeSecret));
        
        // Check relay connection before sending
        if (!hasActiveRelayConnection()) {
            throw new Error('Relay connection is not open');
        }
        
        // Publish Recipient Wrap immediately
        Logger.debug('Publishing Recipient Wrap...');
        sendToRelays(JSON.stringify(['EVENT', signedRecipientWrap]));
        
        // Jitter: Publish Self-Wrap after a random delay (5-25 seconds) to prevent traffic correlation
        const jitterMs = 5000 + (Math.random() * 20000);
        Logger.debug(`Scheduling Self-Copy with ${Math.round(jitterMs/1000)}s jitter for anonymity...`);
        setTimeout(() => {
            if (hasActiveRelayConnection()) {
                sendToRelays(JSON.stringify(['EVENT', signedSelfWrap]));
                Logger.debug('Untraceable Self-Copy sent successfully');
            }
        }, jitterMs);
        
        // Track message sending status using the recipient wrap
        messageSendingStatus.set(signedRecipientWrap.id, {
            status: 'pending',
            error: null,
            retryCount: 0,
            timestamp: Date.now(),
            originalMessageId: signedOriginalMessage.id,
            pendingRelays: typeof getConnectedRelayUrls === 'function' ? getConnectedRelayUrls() : [],
            relayAcks: {},
            acceptedRelays: [],
            rejectedRelays: [],
            payload: JSON.stringify(['EVENT', signedRecipientWrap]),
            event: signedRecipientWrap,
            retryTimer: null
        });
        scheduleSendRetry(signedIncognitoMessage.id);
        
        if (typeof saveMessageSendingStatus === 'function') {
            saveMessageSendingStatus();
        }
        
        showNotification('Incognito message sent!', 'success');
        
        // Add sent message locally for immediate display (but not to legacy system)
        const conversationId = recipientPubkey;
        if (chatState.messages.has(conversationId)) {
            const conversationMessages = chatState.messages.get(conversationId);
            
            // Check for duplicate messages
            const isDuplicate = conversationMessages.some(existing => existing.id === signedOriginalMessage.id);
            if (!isDuplicate) {
                conversationMessages.push({
            id: signedOriginalMessage.id,
            content: messageText,
            timestamp: signedOriginalMessage.created_at,
            sent: true,
            incognito: true,
            status: 'pending', // Initially pending until we get relay response
            wrapperEventId: signedIncognitoMessage.id, // Store wrapper ID for status tracking
            nostrEvent: signedIncognitoMessage // Store the Nostr event for context menu
                });
                conversationMessages.sort((a, b) => {
                    if (a.timestamp === b.timestamp) {
                        return (a.id || '').localeCompare(b.id || '');
                    }
                    return a.timestamp - b.timestamp;
                });
                chatState.messages.set(conversationId, conversationMessages);
                Logger.debug('Added sent message to conversation for immediate display:', signedOriginalMessage.id);
            } else {
                Logger.debug('Skipping duplicate sent message:', signedOriginalMessage.id);
            }
            
            // Update conversation
            const conversation = chatState.conversations.find(c => c.id === conversationId);
            if (conversation) {
                conversation.lastMessage = messageText;
                conversation.lastMessageTime = typeof signedOriginalMessage.created_at === 'number'
                    ? signedOriginalMessage.created_at * 1000
                    : Date.now();
            }
            
            // Update displays if this is the current conversation
            if (chatState.currentConversation === conversationId) {
                displayConversationMessages(conversationId);
            }
            
            updateConversationsDisplay();
            saveChatState();
            
            Logger.debug('Sent message displayed locally');
        }
        
        Logger.debug('=== MESSAGE SENDING COMPLETE ===');
        return signedIncognitoMessage;
    } catch (error) {
        Logger.error('=== ERROR SENDING INCOGNITO MESSAGE ===');
        Logger.error('Error sending incognito message:', error);
        Logger.error('Error stack:', error.stack);
        throw error;
    }
}

async function sendIncognitoProfileSync(recipientPubkey) {
    if (!profileState || !profileState.metadata) {
        return;
    }
    
    const conversationData = incognitoState.conversations.get(recipientPubkey);
    if (!conversationData || !conversationData.conversationIdentity) {
        return;
    }
    
    if (conversationData.relay && typeof ensureRelayEnabled === 'function') {
        ensureRelayEnabled(conversationData.relay);
    }
    
    if (!hasActiveRelayConnection()) {
        return;
    }
    
    const payload = {
        type: 'profile',
        profile: profileState.metadata,
        profileUpdatedAt: profileState.updatedAt || null
    };
    
    const encryptedContent = await encryptGiftWrapContentWithIdentity(
        JSON.stringify(payload),
        recipientPubkey,
        conversationData.conversationIdentity
    );
    
    const incognitoWrapEvent = {
        kind: 4,
        pubkey: conversationData.conversationIdentity.publicKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', recipientPubkey]],
        content: encryptedContent
    };
    
    const privateKeyHex = conversationData.conversationIdentity.privateKeyHex ||
        (conversationData.conversationIdentity.privateKey
            ? bytesToHex(conversationData.conversationIdentity.privateKey)
            : null);
    if (!privateKeyHex) {
        return;
    }
    
    const signedIncognitoMessage = await signNostrEvent(incognitoWrapEvent, privateKeyHex);
    sendToRelays(JSON.stringify(['EVENT', signedIncognitoMessage]));
}

function scheduleSendRetry(eventId) {
    const status = messageSendingStatus.get(eventId);
    if (!status || status.retryTimer) {
        return;
    }
    
    status.retryTimer = setTimeout(() => {
        const current = messageSendingStatus.get(eventId);
        if (!current) return;
        
        const hasAccepted = current.acceptedRelays && current.acceptedRelays.length > 0;
        if (hasAccepted) {
            current.retryTimer = null;
            messageSendingStatus.set(eventId, current);
            return;
        }
        
        const retryCount = current.retryCount || 0;
        if (retryCount >= 2) {
            current.status = 'failed';
            current.error = 'No relay accepted the message';
            current.retryTimer = null;
            messageSendingStatus.set(eventId, current);
            updateMessageStatus(eventId, 'failed', current.error);
            return;
        }
        
        current.retryCount = retryCount + 1;
        current.retryTimer = null;
        messageSendingStatus.set(eventId, current);
        
        try {
            sendToRelays(current.payload);
            scheduleSendRetry(eventId);
        } catch (error) {
            current.status = 'failed';
            current.error = error.message || 'Failed to resend';
            messageSendingStatus.set(eventId, current);
            updateMessageStatus(eventId, 'failed', current.error);
        }
    }, 5000);
    
    messageSendingStatus.set(eventId, status);
}

// Handle incognito invitation received
async function handleIncognitoInvitation(event) {
    try {
        Logger.debug('=== HANDLING INCOGNITO INVITATION ===');
        Logger.debug('Event ID:', event.id);
        Logger.debug('Event pubkey:', event.pubkey);
        Logger.debug('User private key available:', !!userKeys.privateKey);
        
        // Check if we've already processed this invitation
        const existingInvitation = Array.from(incognitoState.pendingInvitations.values())
            .find(inv => inv.conversationPubkey === event.pubkey);
        
        if (existingInvitation && existingInvitation.status === 'accepted') {
            Logger.debug('Invitation already accepted, ignoring duplicate');
            return;
        }
        
        // Check if we already have this conversation established
        if (incognitoState.conversations.has(event.pubkey)) {
            Logger.debug('Conversation already exists for:', event.pubkey, '- skipping invitation auto-accept');
            return;
        }
        
        // Decrypt invitation content using NIP-44 (invitations are encrypted with NIP-44)
        let decryptedContent;
        try {
            const privateKeyBytes = hexToBytes(userKeys.privateKey);
            
            // Get conversation key for decryption
            const conversationKey = window.NostrTools.nip44.getConversationKey(
                privateKeyBytes,
                event.pubkey // Use hex string
            );
            
            // Decrypt using NIP-44
                decryptedContent = window.NostrTools.nip44.v2.decrypt(event.content, conversationKey);
        } catch (error) {
            Logger.debug('DECRYPTION FAILED - not meant for us:', error.message);
            return;
        }
        
        let profilePayload = null;
        const profileIndex = decryptedContent.indexOf('\nprofile:');
        if (profileIndex !== -1) {
            profilePayload = decryptedContent.slice(profileIndex + 9).trim();
            decryptedContent = decryptedContent.slice(0, profileIndex);
        }
        
        const invitePayload = parseInvitationPayload(decryptedContent);
        
        if (invitePayload) {
            const {
                senderPubkey,
                conversationPubkey,
                relay,
                conversationCounter,
                signature
            } = invitePayload;
            // Verify invitation signature
            const isValidSignature = verifyInvitationSignature(senderPubkey, userKeys.publicKey, conversationPubkey, signature);
            
            if (isValidSignature) {
                if (profilePayload) {
                    try {
                        const metadata = JSON.parse(profilePayload);
                        upsertProfileCache(senderPubkey, metadata, event.created_at);
                    } catch (error) {
                        Logger.warn('Failed to parse profile payload:', error);
                    }
                }
                
                if (typeof requestProfileMetadata === 'function') {
                    requestProfileMetadata(senderPubkey);
                }
                
                if (relay && typeof ensureRelayEnabled === 'function') {
                    ensureRelayEnabled(relay);
                }
                
                // Store invitation
                const invitationData = {
                    senderPubkey,
                    conversationPubkey,
                    relay,
                    conversationCounter,
                    receivedAt: Math.floor(Date.now() / 1000),
                    status: 'received'
                };
                
                incognitoState.pendingInvitations.set(senderPubkey, invitationData);
                saveIncognitoState();
                
                // Rate limit notifications
                const now = Date.now();
                if (now - lastNotificationTime > NOTIFICATION_COOLDOWN) {
                    showNotification(`Incognito invitation received from ${formatPubkey(senderPubkey)}!`, 'info');
                    lastNotificationTime = now;
                }
                
                // Auto-accept for demo (in production, show UI for user confirmation)
                setTimeout(() => {
                    acceptIncognitoInvitation(senderPubkey);
                }, 500); // Increased delay to ensure invitation is fully processed
            } else {
                Logger.debug('Invalid signature for invitation from:', senderPubkey);
            }
        } else {
            Logger.debug('PARSING FAILED: No valid invitation format found');
            addPendingMessage(event);
        }
    } catch (error) {
        Logger.error('Error handling incognito invitation:', error);
    }
}

// Verify invitation signature
function verifyInvitationSignature(senderPubkey, recipientPubkey, conversationPubkey, signature) {
    try {
        // Recreate the signature event template
        const eventTemplate = {
            pubkey: senderPubkey,
            kind: 0,
            created_at: 0,
            tags: [
                ["p", recipientPubkey],
                ["p", conversationPubkey]
            ],
            content: "",
            sig: signature
        };
        
        // Calculate the event hash
        eventTemplate.id = window.NostrTools.getEventHash(eventTemplate);
        
        // Use verifyEvent to check the signature
        return window.NostrTools.verifyEvent(eventTemplate);
    } catch (error) {
        Logger.error('Error verifying invitation signature:', error);
        return false;
    }
}

// Accept incognito invitation
function acceptIncognitoInvitation(senderPubkey) {
    try {
        Logger.debug('acceptIncognitoInvitation called for:', senderPubkey);
        const invitation = incognitoState.pendingInvitations.get(senderPubkey);
        Logger.debug('Found invitation:', invitation);
        
        if (!invitation) {
            throw new Error('Invitation not found');
        }
        
        Logger.debug('Accepting incognito invitation from:', senderPubkey);
        if (typeof requestProfileMetadata === 'function') {
            requestProfileMetadata(senderPubkey);
        }
        
        // The signature verification was already done in handleIncognitoInvitation,
        // so we just need to accept the conversation pubkey provided by the sender
        
        // For the receiver, we need to generate compatible identities
        // The sender used: generateDisposableIdentity(recipientPubkey, 0) and generateDisposableIdentity(recipientPubkey, 1)
        // So for us (the recipient), we should use our own pubkey to generate our side of the conversation
        
        // Generate our identities using our own pubkey as the base (for sending replies)
        const conversationIndex = Number.isFinite(invitation.conversationCounter)
            ? invitation.conversationCounter
            : 0;
        const ourSenderIdentity = generateDisposableIdentity(senderPubkey, 0, conversationIndex); // Our identity for sending replies
        const ourConversationIdentity = generateDisposableIdentity(senderPubkey, 1, conversationIndex); // Our identity for receiving messages
        
        // Store conversation data 
        const conversationData = {
            recipient: senderPubkey, // Their real pubkey
            conversationPubkey: invitation.conversationPubkey, // Their conversation identity (where their messages come from)
            senderIdentity: ourSenderIdentity, // Our identity for sending messages to them
            conversationIdentity: ourConversationIdentity, // Our identity for receiving messages from them
            relay: invitation.relay,
            createdAt: invitation.receivedAt,
            status: 'active',
            role: 'recipient',
            conversationIndex
        };
        
        Logger.debug('Verified and stored conversation:');
        Logger.debug('- Their conversation identity (messages from):', invitation.conversationPubkey);
        Logger.debug('- Our sender identity (messages to):', ourSenderIdentity.publicKey);
        Logger.debug('- Our conversation identity (receive):', ourConversationIdentity.publicKey);
        Logger.debug('- Stored conversation data:', conversationData);
        
        incognitoState.conversations.set(senderPubkey, conversationData);
        invitation.status = 'accepted';
        
        saveIncognitoState();
        scheduleIncognitoBackup();
        if (typeof ensureConversationEntry === 'function') {
            ensureConversationEntry(senderPubkey, { createdAt: invitation.receivedAt });
            saveChatState();
            updateConversationsDisplay();
        }
        
        // Restart subscription to include new conversation
        subscribeToIncognitoMessages();
        setTimeout(() => {
            sendIncognitoProfileSync(senderPubkey);
        }, 500);
        
        showNotification(`Incognito conversation with ${formatPubkey(senderPubkey)} is now active!`, 'success');
    } catch (error) {
        Logger.error('Error accepting incognito invitation:', error);
    }
}

// Handle incognito message received
async function handleIncognitoMessage(event) {
    try {
        // Check if we've already processed this message
        if (processedMessageIds.has(event.id)) {
            Logger.debug('Skipping already processed message:', event.id);
            return;
        }
        
        // Check if the message content is valid
        if (!event.content || event.content.length < 10) {
            Logger.debug('Skipping message with invalid content length:', event.content?.length);
            return;
        }
        
        // Check if this looks like encrypted content (should be base64-like)
        if (!event.content.match(/^[A-Za-z0-9+/=]+$/)) {
            Logger.debug('Skipping message that does not look like encrypted content');
            return;
        }
        
        // Defer marking as processed until after successful decrypt/process
        
        // Find which conversation this message belongs to
        let senderPubkey = null;
        let conversationData = null;
        
        Logger.debug('Looking for conversation for event pubkey:', event.pubkey);
        Logger.debug('Available conversations:', Array.from(incognitoState.conversations.entries()).map(([k, v]) => ({
            recipient: k,
            conversationPubkey: v.conversationPubkey,
            senderIdentity: v.senderIdentity?.publicKey,
            recipientReplyIdentity: v.recipientReplyIdentity?.publicKey
        })));
        
        for (const [recipient, data] of incognitoState.conversations) {
            // Check if this is our own outgoing message (conversation identity)
            if (data.conversationIdentity && data.conversationIdentity.publicKey === event.pubkey) {
                senderPubkey = recipient;
                conversationData = data;
                Logger.debug('Found conversation by conversationIdentity (outgoing):', recipient);
                break;
            }
            // Check if this is a message from their conversation identity (initial messages)
            if (data.conversationPubkey === event.pubkey) {
                senderPubkey = recipient;
                conversationData = data;
                Logger.debug('Found conversation by conversationPubkey:', recipient);
                break;
            }
            // Check if this is a reply from their sender identity (reply messages)
            if (data.senderIdentity && data.senderIdentity.publicKey === event.pubkey) {
                senderPubkey = recipient;
                conversationData = data;
                Logger.debug('Found conversation by senderIdentity:', recipient);
                break;
            }
            // Check if this is a reply from the recipient's reply identity
            if (data.recipientReplyIdentity && data.recipientReplyIdentity.publicKey === event.pubkey) {
                senderPubkey = recipient;
                conversationData = data;
                Logger.debug('Found conversation by recipientReplyIdentity:', recipient);
                break;
            }
        }
        
        let decryptedContentFromLookup = null;
        if (!senderPubkey) {
            try {
                const fallbackDecrypted = await decryptGiftWrapContentWithIdentity(event.content, event.pubkey, null);
                if (fallbackDecrypted) {
                    const payload = JSON.parse(fallbackDecrypted);
                    const originalMessage = payload && payload.event ? payload.event : payload;
                    if (originalMessage && originalMessage.pubkey) {
                        senderPubkey = originalMessage.pubkey;
                        const candidate = incognitoState.conversations.get(originalMessage.pubkey);
                        if (candidate) {
                            conversationData = candidate;
                        }
                        decryptedContentFromLookup = fallbackDecrypted;
                        Logger.debug('Resolved sender pubkey by decrypted payload:', senderPubkey);
                    }
                }
            } catch (error) {
                Logger.debug('Failed to resolve conversation from decrypted payload');
            }
        }
        
        // Additional check: if we still don't have a conversation, this might be a message from someone we don't have a conversation with yet
        if (!senderPubkey && incognitoState.conversations.size > 0) {
            Logger.debug('Still no conversation found, queueing for retry:', event.pubkey);
            addPendingMessage(event);
            return;
        }
        
        if (!senderPubkey || (!conversationData && !decryptedContentFromLookup)) {
            // Check if this might be a message that arrived before invitation processing
            // Store it temporarily and retry later
            addPendingMessage(event);
            
            // Retry processing pending messages after a short delay
            setTimeout(() => {
                retryPendingMessages();
            }, 2000);
            
            return; // Unknown conversation
        }
        
        // If this is a reply from the recipient's sender identity, update our conversation data
        if (conversationData && conversationData.conversationPubkey !== event.pubkey && !conversationData.recipientReplyIdentity) {
            // This is likely a reply from the recipient - store their reply identity
            conversationData.recipientReplyIdentity = {
                publicKey: event.pubkey
            };
            Logger.debug('Learned recipient reply identity:', event.pubkey, 'for conversation with:', senderPubkey);
            Logger.debug('Updated conversation data:', conversationData);
            saveIncognitoState();
        }
        
        // Decrypt the message using the correct conversation identity
        let decryptedContent = null;
        try {
            if (decryptedContentFromLookup) {
                decryptedContent = decryptedContentFromLookup;
            } else if (conversationData && conversationData.conversationIdentity && conversationData.conversationIdentity.publicKey === event.pubkey) {
                decryptedContent = await decryptGiftWrapContentForOutgoing(
                    event.content,
                    conversationData.recipient,
                    conversationData.conversationIdentity
                );
            } else {
                decryptedContent = await decryptGiftWrapContentWithIdentity(event.content, event.pubkey, conversationData);
            }
        } catch (decryptError) {
            Logger.warn('Decryption failed for message from:', event.pubkey);
            Logger.warn('- Reason:', decryptError.message);
            Logger.warn('- Event ID:', event.id);
            
            // Handle specific encryption errors
            if (decryptError.message && decryptError.message.includes('unknown encryption version')) {
                Logger.debug('Skipping message with unknown encryption version - likely corrupted or incompatible');
                return;
            }
            
            // For other decryption errors, just log and continue
            // We DON'T add to processedMessageIds so it can be retried if keys arrive later
            addPendingMessage(event);
            return;
        }
        
        if (decryptedContent) {
            Logger.debug('Successfully decrypted message from:', event.pubkey);
            Logger.debug('Decrypted content length:', decryptedContent.length);
            
            // Check if this is actually an invitation (starts with "Someone wants to start an incognito conversation")
            if (decryptedContent.startsWith('Someone wants to start an incognito conversation')) {
                Logger.debug('Received invitation content in message handler, ignoring (already processed)');
                return;
            }
            
            try {
                // Process message for conversation interface ONLY
                processIncomingMessageForConversation(event, decryptedContent, senderPubkey);
                
                // Mark this message as processed ONLY after successful handling
                processedMessageIds.add(event.id);
                
                // Clean up old message IDs (keep last 10,000 to handle deep history sync)
                if (processedMessageIds.size > 10000) {
                    const idsArray = Array.from(processedMessageIds);
                    processedMessageIds.clear();
                    idsArray.slice(-5000).forEach(id => processedMessageIds.add(id));
                }
                
                // Don't add to legacy system to avoid duplication
                
            } catch (parseError) {
                Logger.error('Error processing decrypted message:', parseError);
                Logger.error('Decrypted content length:', decryptedContent.length);
                // We don't mark as processed so we can retry later if it was a transient error
            }
        } else {
            Logger.debug('Failed to decrypt message content from:', event.pubkey);
            Logger.debug('Event content length:', event.content?.length);
            addPendingMessage(event);
        }
    } catch (error) {
        Logger.error('Error handling incognito message:', error);
        Logger.error('Error details:', error.message);
        Logger.error('Event pubkey:', event.pubkey);
        Logger.error('Event content length:', event.content ? event.content.length : 'undefined');
    }
}

// Debug functions for testing
function testIncognitoMessaging() {
    Logger.debug('=== TESTING INCOGNITO MESSAGING ===');
    
    if (!userKeys) {
        Logger.error('No user keys available');
        return false;
    }
    
    // Create a test recipient
    const testRecipientKey = window.NostrTools.generateSecretKey();
    const testRecipientPubkey = window.NostrTools.getPublicKey(testRecipientKey);
    
    Logger.debug('Test recipient pubkey:', testRecipientPubkey);
    
    // Test sending a message
    const testMessage = 'Hello, this is a test incognito message!';
    Logger.debug('Test message:', testMessage);
    
    // Simulate the encryption process
    try {
        const encrypted = encryptGiftWrapContent(testMessage, testRecipientPubkey);
        Logger.debug('Message encrypted successfully');
        Logger.debug('Encrypted length:', encrypted.length);
        
        // Now simulate decryption (as if we were the recipient)
        const decrypted = decryptGiftWrapContent(encrypted, userKeys.publicKey);
        Logger.debug('Message decrypted successfully');
        Logger.debug('Decrypted message:', decrypted);
        
        if (decrypted === testMessage) {
            Logger.debug('Incognito messaging test PASSED');
            return true;
        } else {
            Logger.debug('Incognito messaging test FAILED - decrypted message does not match');
            return false;
        }
    } catch (error) {
        Logger.error('Incognito messaging test FAILED:', error);
        return false;
    }
}

// Debug function to list all conversations
function listConversations() {
    Logger.debug('=== LISTING ALL CONVERSATIONS ===');
    Logger.debug('Total conversations:', incognitoState.conversations.size);
    
    for (const [recipient, data] of incognitoState.conversations) {
        Logger.debug('Conversation with:', recipient);
        Logger.debug('- Conversation pubkey:', data.conversationPubkey);
        Logger.debug('- Conversation identity:', data.conversationIdentity ? data.conversationIdentity.publicKey : 'none');
        Logger.debug('- Sender identity:', data.senderIdentity ? data.senderIdentity.publicKey : 'none');
        Logger.debug('- Status:', data.status);
        Logger.debug('---');
    }
}

function buildIncognitoBackupPayload() {
    const conversations = [];
    for (const [recipient, data] of incognitoState.conversations) {
        conversations.push({
            recipient,
            conversationPubkey: data.conversationPubkey || null,
            relay: data.relay || null,
            createdAt: data.createdAt || null,
            recipientReplyIdentity: data.recipientReplyIdentity ? data.recipientReplyIdentity.publicKey : null,
            conversationIndex: Number.isFinite(data.conversationIndex) ? data.conversationIndex : null,
            role: data.role || null,
            senderIdentityPrivateKeyHex: data.senderIdentity ? data.senderIdentity.privateKeyHex : null,
            conversationIdentityPrivateKeyHex: data.conversationIdentity ? data.conversationIdentity.privateKeyHex : null
        });
    }
    
    return {
        version: 1,
        seed: incognitoState.seed || null,
        conversationCounter: incognitoState.conversationCounter || 0,
        profile: profileState && profileState.metadata ? profileState.metadata : null,
        profileUpdatedAt: profileState ? profileState.updatedAt || null : null,
        conversations
    };
}

async function publishIncognitoBackup() {
    if (!userKeys) return;
    if (typeof hasActiveRelayConnection === 'function' && !hasActiveRelayConnection()) {
        incognitoBackupPending = true;
        return;
    }
    
    const payload = buildIncognitoBackupPayload();
    const encrypted = await encryptGiftWrapContent(JSON.stringify(payload), userKeys.publicKey);
    
    const eventTemplate = {
        kind: 30078,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['d', INCOGNITO_BACKUP_TAG]],
        content: encrypted
    };
    
    const signedEvent = await signNostrEvent(eventTemplate);
    sendToRelays(JSON.stringify(['EVENT', signedEvent]));
    incognitoBackupPending = false;
}

async function publishReadMarkers() {
    if (!userKeys || !chatState.conversations.length) return;
    
    Logger.debug('Preparing to sync read markers to relay...');
    
    const readMarkers = {};
    chatState.conversations.forEach(conv => {
        if (conv.lastReadTime) {
            readMarkers[conv.id] = conv.lastReadTime;
        }
    });
    
    if (Object.keys(readMarkers).length === 0) return;
    
    const encrypted = await encryptGiftWrapContent(JSON.stringify(readMarkers), userKeys.publicKey);
    
    const eventTemplate = {
        kind: 30078,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['d', READ_MARKERS_TAG]],
        content: encrypted
    };
    
    const signedEvent = await signNostrEvent(eventTemplate);
    
    // Add jitter (2-8 seconds) before sending read markers to avoid direct correlation with chat activity
    const jitterMs = 2000 + (Math.random() * 6000);
    Logger.debug(`Scheduling read marker sync with ${Math.round(jitterMs/1000)}s jitter...`);
    
    setTimeout(() => {
        if (hasActiveRelayConnection()) {
            sendToRelays(JSON.stringify(['EVENT', signedEvent]));
            Logger.debug('Read markers synced to network successfully');
        }
    }, jitterMs);
    
    readMarkersPending = false;
}

function scheduleReadMarkersSync() {
    if (!userKeys) return;
    if (readMarkersTimer) {
        clearTimeout(readMarkersTimer);
    }
    readMarkersTimer = setTimeout(() => {
        readMarkersTimer = null;
        publishReadMarkers().catch((error) => {
            Logger.warn('Failed to sync read markers:', error.message || error);
        });
    }, READ_MARKERS_DEBOUNCE_MS);
}

function scheduleIncognitoBackup() {
    if (!userKeys) return;
    if (incognitoBackupTimer) {
        clearTimeout(incognitoBackupTimer);
    }
    incognitoBackupTimer = setTimeout(() => {
        incognitoBackupTimer = null;
        publishIncognitoBackup().catch((error) => {
            Logger.warn('Failed to publish incognito backup:', error.message || error);
        });
    }, INCOGNITO_BACKUP_DEBOUNCE_MS);
}

function attemptPendingIncognitoBackup() {
    if (incognitoBackupPending) {
        scheduleIncognitoBackup();
    }
}

function retryPendingMessages() {
    if (!window.pendingMessages || !window.pendingMessages.length) {
        return;
    }
    
    const remaining = [];
    const now = Date.now();
    window.pendingMessages.forEach((pending) => {
        const isExpired = now - pending.timestamp > 10 * 60 * 1000;
        if (isExpired) {
            return;
        }
        
        const hasConversation = Array.from(incognitoState.conversations.values())
            .some(conv =>
                conv.conversationPubkey === pending.event.pubkey ||
                (conv.senderIdentity && conv.senderIdentity.publicKey === pending.event.pubkey) ||
                (conv.conversationIdentity && conv.conversationIdentity.publicKey === pending.event.pubkey) ||
                (conv.recipientReplyIdentity && conv.recipientReplyIdentity.publicKey === pending.event.pubkey)
            );
        
        if (hasConversation) {
            handleIncognitoMessage(pending.event);
        } else {
            remaining.push(pending);
        }
    });
    
    window.pendingMessages = remaining;
}

function addPendingMessage(event) {
    if (!event || !event.id) return;
    if (!window.pendingMessages) {
        window.pendingMessages = [];
    }
    const exists = window.pendingMessages.some((pending) => pending.event && pending.event.id === event.id);
    if (exists) {
        return;
    }
    window.pendingMessages.push({
        event,
        timestamp: Date.now()
    });
    window.pendingMessages = window.pendingMessages.filter(msg =>
        Date.now() - msg.timestamp < 10 * 60 * 1000
    );
}

function subscribeToIncognitoBackup(socket) {
    if (!socket || socket.readyState !== WebSocket.OPEN || !userKeys) {
        return;
    }
    
    const subscriptionId = 'incognito_backup_' + Date.now();
    const filter = {
        kinds: [30078],
        authors: [userKeys.publicKey],
        '#d': [INCOGNITO_BACKUP_TAG],
        limit: 1
    };
    
    socket.send(JSON.stringify(['REQ', subscriptionId, filter]));
}

function subscribeToReadMarkers(socket) {
    if (!socket || socket.readyState !== WebSocket.OPEN || !userKeys) {
        return;
    }
    
    const subscriptionId = 'read_markers_' + Date.now();
    const filter = {
        kinds: [30078],
        authors: [userKeys.publicKey],
        '#d': [READ_MARKERS_TAG],
        limit: 1
    };
    
    socket.send(JSON.stringify(['REQ', subscriptionId, filter]));
}

async function handleReadMarkersEvent(event) {
    if (!event || !userKeys) return;
    const hasTag = Array.isArray(event.tags)
        && event.tags.some((tag) => tag[0] === 'd' && tag[1] === READ_MARKERS_TAG);
    if (!hasTag) return;
    
    Logger.debug('Received read markers from network, merging...');
    
    const decrypted = await decryptGiftWrapContent(event.content, event.pubkey);
    if (!decrypted) return;
    
    try {
        const remoteMarkers = JSON.parse(decrypted);
        let updated = false;
        
        chatState.conversations.forEach(conv => {
            const remoteTime = remoteMarkers[conv.id];
            if (remoteTime && (!conv.lastReadTime || remoteTime > conv.lastReadTime)) {
                conv.lastReadTime = remoteTime;
                conv.unreadCount = 0; // Reset unread if remote says we read it
                updated = true;
            }
        });
        
        if (updated) {
            Logger.debug('Chat state updated from remote read markers');
            updateConversationsDisplay();
            saveChatState();
        }
    } catch (e) {
        Logger.error('Error parsing remote read markers:', e);
    }
}

async function handleIncognitoBackupEvent(event) {
    if (!event || !userKeys) return;
    const hasTag = Array.isArray(event.tags)
        && event.tags.some((tag) => tag[0] === 'd' && tag[1] === INCOGNITO_BACKUP_TAG);
    if (!hasTag) return;
    
    const decrypted = await decryptGiftWrapContent(event.content, event.pubkey);
    if (!decrypted) return;
    
    let backup;
    try {
        backup = JSON.parse(decrypted);
    } catch (error) {
        Logger.warn('Failed to parse incognito backup payload');
        return;
    }
    
    if (!backup || backup.version !== 1) return;
    
    const shouldRestoreSeed = incognitoState.conversations.size === 0 && backup.seed;
    const shouldRestoreProfile = backup.profile
        && (!profileState.metadata || (backup.profileUpdatedAt && backup.profileUpdatedAt > (profileState.updatedAt || 0)));
    if (shouldRestoreSeed) {
        incognitoState.seed = backup.seed;
        incognitoState.conversationCounter = backup.conversationCounter || 0;
    }
    
    let updated = false;
    if (Array.isArray(backup.conversations)) {
        backup.conversations.forEach((entry) => {
            if (!entry || !entry.recipient) return;
            if (incognitoState.conversations.has(entry.recipient)) {
                return;
            }
            
            const conversationIndex = Number.isFinite(entry.conversationIndex) ? entry.conversationIndex : 0;
            let senderIdentity = null;
            let conversationIdentity = null;
            if (entry.senderIdentityPrivateKeyHex) {
                const senderPrivateKey = hexToBytes(entry.senderIdentityPrivateKeyHex);
                senderIdentity = {
                    privateKey: senderPrivateKey,
                    privateKeyHex: entry.senderIdentityPrivateKeyHex,
                    publicKey: window.NostrTools.getPublicKey(senderPrivateKey)
                };
            }
            if (entry.conversationIdentityPrivateKeyHex) {
                const conversationPrivateKey = hexToBytes(entry.conversationIdentityPrivateKeyHex);
                conversationIdentity = {
                    privateKey: conversationPrivateKey,
                    privateKeyHex: entry.conversationIdentityPrivateKeyHex,
                    publicKey: window.NostrTools.getPublicKey(conversationPrivateKey)
                };
            }
            if (!senderIdentity || !conversationIdentity) {
                const isInitiator = entry.role === 'initiator';
                const basePubkey = isInitiator ? entry.recipient : userKeys.publicKey;
                senderIdentity = senderIdentity || generateDisposableIdentity(basePubkey, 0, conversationIndex);
                conversationIdentity = conversationIdentity || generateDisposableIdentity(basePubkey, 1, conversationIndex);
            }
            
            const conversationData = {
                recipient: entry.recipient,
                conversationPubkey: entry.conversationPubkey || null,
                senderIdentity,
                conversationIdentity,
                relay: entry.relay || null,
                createdAt: entry.createdAt || Math.floor(Date.now() / 1000),
                status: 'active',
                role: entry.role || null,
                conversationIndex
            };
            
            if (entry.recipientReplyIdentity) {
                conversationData.recipientReplyIdentity = {
                    publicKey: entry.recipientReplyIdentity
                };
            }
            
            incognitoState.conversations.set(entry.recipient, conversationData);
            updated = true;
            if (typeof requestProfileMetadata === 'function') {
                requestProfileMetadata(entry.recipient);
            }
        });
    }
    
    if (updated || shouldRestoreSeed || shouldRestoreProfile) {
        saveIncognitoState();
        if (typeof syncConversationsFromIncognito === 'function') {
            syncConversationsFromIncognito();
        }
        if (chatState && chatState.currentConversation) {
            displayConversationMessages(chatState.currentConversation);
        }
        if (shouldRestoreProfile) {
            profileState.metadata = backup.profile;
            profileState.updatedAt = backup.profileUpdatedAt || Math.floor(Date.now() / 1000);
            saveProfileState();
            updateProfileAvatar();
            updateStatus();
            syncProfileForms();
            
            // Throttle profile syncs to avoid rate limits
            let delay = 1000;
            incognitoState.conversations.forEach((_, recipient) => {
                setTimeout(() => {
                    sendIncognitoProfileSync(recipient);
                }, delay);
                delay += 2000; // 2-second stagger between each sync
            });
        }
        if (typeof getConnectedRelays === 'function') {
            getConnectedRelays().forEach((state) => {
                subscribeToIncognitoMessages(state.socket, null, 0);
            });
        }
        retryPendingMessages();
    }
}
