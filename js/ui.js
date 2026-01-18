// UI functions and status management


// Show notification to user
function showNotification(message, type = 'info') {
    // Create notification element if it doesn't exist
    let notification = document.getElementById('notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.className = 'notification';
        document.body.appendChild(notification);
    }
    
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
        // Remove from DOM after animation completes
        setTimeout(() => {
            if (notification && notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Update profile avatar
function updateProfileAvatar() {
    const profileAvatar = document.querySelector('.profile-avatar');
    if (profileAvatar && userKeys) {
        profileAvatar.innerHTML = getAvatarMarkupForPubkey(userKeys.publicKey, 40);
        
        // Add context menu for avatar download
        profileAvatar.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showAvatarContextMenu(e, profileAvatar);
        });
    } else if (profileAvatar) {
        profileAvatar.innerHTML = '<span class="material-symbols-rounded">person</span>';
    }
}

// Update application status displays
function updateStatus() {
    const connectionStatus = document.getElementById('connectionStatus');
    const keysStatus = document.getElementById('keysStatus');
    const messagesStatus = document.getElementById('messagesStatus');
    const connectionDot = document.getElementById('connectionDot');
    const connectionText = document.getElementById('connectionText');
    const settingsConnectionStatus = document.getElementById('connectionStatusSettings');
    const profileNpub = document.getElementById('profileNpub');
    
    // Update connection status
    const connectedCount = typeof getConnectedRelays === 'function' ? getConnectedRelays().length : 0;
    if (connectedCount > 0) {
        const connectedLabel = `Connected (${connectedCount})`;
        if (connectionStatus) connectionStatus.textContent = connectedLabel;
        if (connectionText) connectionText.textContent = connectedLabel;
        if (connectionDot) {
            connectionDot.classList.remove('disconnected');
            connectionDot.classList.add('connected');
        }
        if (settingsConnectionStatus) {
            settingsConnectionStatus.querySelector('.status-value').textContent = connectedLabel;
            settingsConnectionStatus.querySelector('.status-value').classList.remove('error');
        }
    } else {
        if (connectionStatus) connectionStatus.textContent = 'Disconnected';
        if (connectionText) connectionText.textContent = 'Disconnected';
        if (connectionDot) {
            connectionDot.classList.add('disconnected');
            connectionDot.classList.remove('connected');
        }
        if (settingsConnectionStatus) {
            settingsConnectionStatus.querySelector('.status-value').textContent = 'Disconnected';
            settingsConnectionStatus.querySelector('.status-value').classList.add('error');
        }
    }
    
    // Update keys status
    if (userKeys) {
        if (keysStatus) keysStatus.textContent = 'Set';
        // Update mini profile with npub
        if (profileNpub) {
            try {
                const npub = window.NostrTools.nip19.npubEncode(userKeys.publicKey);
                profileNpub.textContent = npub.substring(0, 9) + '...' + npub.substring(npub.length - 5);
                profileNpub.title = npub; // Show full npub on hover
                
                // Add context menu to profile npub
                addPubkeyContextMenu(profileNpub, userKeys.publicKey, 'Your Public Key');
            } catch (error) {
                profileNpub.textContent = formatPubkeyForDisplay(userKeys.publicKey);
                
                // Add context menu to profile npub (fallback)
                addPubkeyContextMenu(profileNpub, userKeys.publicKey, 'Your Public Key');
            }
        }
    } else {
        if (keysStatus) keysStatus.textContent = 'Not Set';
        if (profileNpub) profileNpub.textContent = 'Not set';
    }

    const profileName = document.querySelector('.profile-name');
    if (profileName && userKeys) {
        profileName.textContent = getDisplayNameForPubkey(userKeys.publicKey) || 'Your Profile';
    }
    
    // Update messages count
    if (messagesStatus) {
        messagesStatus.textContent = receivedMessages.length;
    }
    
    // Update relay button state
    if (typeof updateRelayButtonState === 'function') {
        updateRelayButtonState();
    }
}

// Navigation functions
function initializeNavigation() {
    // In the new Discord-like interface, we don't need to show any section by default
    // The chat interface is shown by default, and settings are accessed via the gear icon
    // Only initialize navigation if we're in settings mode
    if (chatState.showSettings) {
        showSection('keys');
    }
}

function showSection(sectionName) {
    // Hide all sections
    const sections = document.querySelectorAll('.content-section');
    sections.forEach(section => {
        section.classList.remove('active');
    });
    
    // Remove active class from all nav items
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
    });
    
    // Show selected section
    const targetSection = document.getElementById(sectionName + '-section');
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Update nav item
    const targetNavItem = document.querySelector(`[onclick="showSection('${sectionName}')"]`);
    if (targetNavItem) {
        targetNavItem.classList.add('active');
    }
}

// Settings panel management
function toggleSettings() {
    const settingsModal = document.getElementById('settingsModal');
    const chatInterface = document.getElementById('chatInterface');
    
    chatState.showSettings = !chatState.showSettings;
    
    if (chatState.showSettings) {
        settingsModal.classList.add('active');
        // Initialize navigation for settings
        showSection('keys');
    } else {
        settingsModal.classList.remove('active');
    }
}

// Show conversation details modal
function showConversationDetails() {
    if (!chatState.currentConversation) {
        showNotification('No conversation selected', 'error');
        return;
    }
    
    const conversation = chatState.conversations.find(c => c.id === chatState.currentConversation);
    if (!conversation) {
        showNotification('Conversation not found', 'error');
        return;
    }
    
    showConversationDetailsModal(conversation);
}

function toggleProfilePanel() {
    const panel = document.getElementById('profilePanel');
    const chatInterface = document.getElementById('chatInterface');
    const chatArea = document.querySelector('.chat-area');
    const isMobile = window.innerWidth <= 900;
    if (!panel) return;
    const isActive = panel.classList.contains('active');
    if (isActive) {
        panel.classList.remove('active');
        if (typeof setPanelAccessibility === 'function') {
            setPanelAccessibility(panel, false);
        }
        if (chatInterface) {
            chatInterface.classList.remove('profile-panel-open');
        }
        if (isMobile && chatArea) {
            chatArea.style.display = 'flex';
            if (typeof setPanelAccessibility === 'function') {
                setPanelAccessibility(chatArea, true);
            }
        }
    } else {
        if (typeof setPanelAccessibility === 'function') {
            setPanelAccessibility(panel, true);
        }
        panel.classList.add('active');
        if (chatInterface) {
            chatInterface.classList.add('profile-panel-open');
        }
        if (isMobile && chatArea) {
            const handleFadeEnd = (event) => {
                if (event.propertyName !== 'opacity') return;
                chatArea.style.display = 'none';
                if (typeof setPanelAccessibility === 'function') {
                    setPanelAccessibility(chatArea, false);
                }
            };
            chatArea.addEventListener('transitionend', handleFadeEnd, { once: true });
            setTimeout(() => {
                chatArea.style.display = 'none';
                if (typeof setPanelAccessibility === 'function') {
                    setPanelAccessibility(chatArea, false);
                }
            }, 300);
        }
    }
    renderProfilePanel();
    updateChatHeaderProfile();
}

function syncResponsiveLayout() {
    const isMobile = window.innerWidth <= 900;
    const chatInterface = document.getElementById('chatInterface');
    const chatArea = document.querySelector('.chat-area');
    const conversationsSidebar = document.querySelector('.conversations-sidebar');
    const panel = document.getElementById('profilePanel');
    if (!chatInterface) return;

    if (!isMobile) {
        if (chatArea) {
            chatArea.style.display = '';
            if (typeof setPanelAccessibility === 'function') {
                setPanelAccessibility(chatArea, true);
            }
        }
        if (conversationsSidebar) {
            conversationsSidebar.style.display = '';
            if (typeof setPanelAccessibility === 'function') {
                setPanelAccessibility(conversationsSidebar, true);
            }
        }
        if (panel) {
            panel.style.display = '';
            if (typeof setPanelAccessibility === 'function') {
                setPanelAccessibility(panel, panel.classList.contains('active'));
            }
        }
        return;
    }

    if (chatArea && chatInterface.classList.contains('conversation-open')) {
        chatArea.style.display = 'flex';
        if (typeof setPanelAccessibility === 'function') {
            setPanelAccessibility(chatArea, true);
        }
        if (conversationsSidebar) {
            conversationsSidebar.style.display = '';
            if (typeof setPanelAccessibility === 'function') {
                setPanelAccessibility(conversationsSidebar, false);
            }
        }
    } else if (conversationsSidebar) {
        conversationsSidebar.style.display = '';
        if (typeof setPanelAccessibility === 'function') {
            setPanelAccessibility(conversationsSidebar, true);
        }
        if (chatArea) {
            chatArea.style.display = 'none';
            if (typeof setPanelAccessibility === 'function') {
                setPanelAccessibility(chatArea, false);
            }
        }
    }

    if (panel) {
        panel.style.display = '';
        if (typeof setPanelAccessibility === 'function') {
            setPanelAccessibility(panel, panel.classList.contains('active'));
        }
    }
}

function updateChatHeaderProfile() {
    const chatTitle = document.getElementById('chatTitle');
    if (!chatTitle) return;
    const conversationId = chatState.currentConversation;
    if (!conversationId) {
        chatTitle.textContent = 'Select a conversation';
        return;
    }
    const displayName = getDisplayNameForPubkey(conversationId);
    chatTitle.textContent = displayName;
}

function renderProfilePanel() {
    const panelBody = document.getElementById('profilePanelBody');
    const panelBanner = document.getElementById('profilePanelBanner');
    if (!panelBody || !panelBanner) return;
    
    const pubkey = chatState.currentConversation;
    if (!pubkey) {
        panelBody.innerHTML = '<p class="panel-empty">Select a conversation to view profile details.</p>';
        panelBanner.innerHTML = '';
        return;
    }
    
    ensureProfileFetched(pubkey);
    const metadata = getProfileMetadata(pubkey) || {};
    const hasMetadata = Object.keys(metadata).length > 0;
    const displayName = getDisplayNameForPubkey(pubkey);
    const secondary = getSecondaryIdentity(pubkey);
    const bannerMarkup = getBannerMarkupForPubkey(pubkey);
    const avatarMarkup = getAvatarMarkupForPubkey(pubkey, 64);
    
    panelBanner.innerHTML = `
        ${bannerMarkup}
        <div class="profile-panel-avatar profile-panel-banner-avatar">${avatarMarkup}</div>
    `;
    const detailsRows = [
        metadata.name ? `<div><span>Username:</span> ${escapeHtml(metadata.name)}</div>` : '',
        metadata.website ? `<div><span>Website:</span> ${escapeHtml(metadata.website)}</div>` : '',
        metadata.lud16 ? `<div><span>Lightning:</span> ${escapeHtml(metadata.lud16)}</div>` : '',
        metadata.nip05 ? `<div><span>NIP-05:</span> ${escapeHtml(metadata.nip05)}</div>` : ''
    ].filter(Boolean).join('');
    
    panelBody.innerHTML = `
        <div class="profile-panel-header">
            <div class="profile-panel-title">
                <h3>${escapeHtml(displayName)}</h3>
                ${secondary ? `<div class="profile-panel-subtitle">${escapeHtml(secondary)}</div>` : ''}
                <div class="profile-panel-npub">${formatPubkeyForDisplay(pubkey)}</div>
            </div>
        </div>
        ${metadata.about ? `<div class="profile-panel-section"><h4>About</h4><p>${escapeHtml(metadata.about)}</p></div>` : ''}
        ${detailsRows ? `<div class="profile-panel-section"><h4>Details</h4>${detailsRows}</div>` : ''}
        ${!hasMetadata ? `<div class="profile-panel-empty">No profile data found on connected relays yet.</div>` : ''}
        <div class="profile-panel-actions">
            <button class="btn btn-secondary" onclick="showConversationDetails()">Inspect Conversation</button>
        </div>
    `;
}

// Show conversation details modal with conversation data
function showConversationDetailsModal(conversation) {
    const modal = document.getElementById('conversationDetailsModal');
    const body = document.getElementById('conversationDetailsBody');
    
    const messages = chatState.messages.get(conversation.id) || [];
    const sentMessages = messages.filter(msg => msg.sent);
    const receivedMessages = messages.filter(msg => !msg.sent);
    const lastMessage = messages.reduce((latest, current) => {
        if (!latest) return current;
        return current.timestamp > latest.timestamp ? current : latest;
    }, null);
    const lastMessageTime = lastMessage && typeof lastMessage.timestamp === 'number'
        ? new Date(lastMessage.timestamp * 1000).toISOString()
        : 'Never';
    
    // Format the conversation data for display
    const conversationData = {
        id: conversation.id,
        recipient: conversation.recipient,
        name: conversation.name,
        lastMessage: lastMessage ? lastMessage.content : 'No messages yet',
        lastMessageTime,
        unreadCount: conversation.unreadCount || 0,
        totalMessages: messages.length,
        sentMessages: sentMessages.length,
        receivedMessages: receivedMessages.length,
        created: conversation.created || 'Unknown'
    };

    const metadata = getProfileMetadata(conversation.recipient) || {};
    const displayName = getDisplayNameForPubkey(conversation.recipient);
    const username = metadata.name ? escapeHtml(metadata.name) : 'Not set';
    
    // Try to get npub format
    let npubDisplay = 'Invalid format';
    try {
        const npub = window.NostrTools.nip19.npubEncode(conversation.recipient);
        npubDisplay = npub;
    } catch (error) {
        npubDisplay = 'Invalid public key format';
    }
    
    // Create the HTML for the conversation details
    body.innerHTML = `
        <div class="conversation-details-section">
            <h4>Basic Information</h4>
            <div class="conversation-details-field">
                <div class="conversation-details-label">Conversation ID</div>
                <div class="conversation-details-value">${conversationData.id}</div>
            </div>
            <div class="conversation-details-field">
                <div class="conversation-details-label">Display Name</div>
                <div class="conversation-details-value">${escapeHtml(displayName)}</div>
            </div>
            <div class="conversation-details-field">
                <div class="conversation-details-label">Username</div>
                <div class="conversation-details-value">${username}</div>
            </div>
            <div class="conversation-details-field">
                <div class="conversation-details-label">Public Key (Hex)</div>
                <div class="conversation-details-value">${conversationData.recipient}</div>
            </div>
            <div class="conversation-details-field">
                <div class="conversation-details-label">Public Key (npub)</div>
                <div class="conversation-details-value">${npubDisplay}</div>
            </div>
        </div>
        
        <div class="conversation-details-section">
            <h4>Message Statistics</h4>
            <div class="conversation-details-field">
                <div class="conversation-details-label">Total Messages</div>
                <div class="conversation-details-value">${conversationData.totalMessages}</div>
            </div>
            <div class="conversation-details-field">
                <div class="conversation-details-label">Sent Messages</div>
                <div class="conversation-details-value">${conversationData.sentMessages}</div>
            </div>
            <div class="conversation-details-field">
                <div class="conversation-details-label">Received Messages</div>
                <div class="conversation-details-value">${conversationData.receivedMessages}</div>
            </div>
            <div class="conversation-details-field">
                <div class="conversation-details-label">Unread Count</div>
                <div class="conversation-details-value">${conversationData.unreadCount}</div>
            </div>
        </div>
        
        <div class="conversation-details-section">
            <h4>Recent Activity</h4>
            <div class="conversation-details-field">
                <div class="conversation-details-label">Last Message</div>
                <div class="conversation-details-value">${escapeHtml(conversationData.lastMessage)}</div>
            </div>
            <div class="conversation-details-field">
                <div class="conversation-details-label">Last Message Time</div>
                <div class="conversation-details-value">${conversationData.lastMessageTime}</div>
            </div>
        </div>
        
        <div class="conversation-details-section">
            <h4>Raw Conversation Data</h4>
            <div class="conversation-details-field">
                <div class="conversation-details-label">Complete Conversation Object</div>
                <div class="conversation-details-value json">${JSON.stringify(conversation, null, 2)}</div>
            </div>
        </div>
    `;
    
    modal.classList.add('show');
}

// Close conversation details modal
function closeConversationDetails() {
    const modal = document.getElementById('conversationDetailsModal');
    modal.classList.remove('show');
}

// Copy conversation details to clipboard
function copyConversationDetailsToClipboard() {
    if (!chatState.currentConversation) {
        showNotification('No conversation selected', 'error');
        return;
    }
    
    const conversation = chatState.conversations.find(c => c.id === chatState.currentConversation);
    if (!conversation) {
        showNotification('Conversation not found', 'error');
        return;
    }
    
    const detailsText = JSON.stringify(conversation, null, 2);
    
    navigator.clipboard.writeText(detailsText).then(() => {
        showNotification('Conversation details copied to clipboard', 'success');
    }).catch(() => {
        showNotification('Failed to copy conversation details', 'error');
    });
}

// Legacy messages display (for settings panel)
function updateMessagesDisplay() {
    const messagesList = document.getElementById('messagesList');
    
    if (receivedMessages.length === 0) {
        messagesList.innerHTML = `
            <div class="no-messages">
            <span class="material-symbols-rounded">person_off</span>
                <p>No incognito messages yet...</p>
                <span>Anonymous messages with hidden identities will appear here when received</span>
            </div>
        `;
        return;
    }
    
    messagesList.innerHTML = receivedMessages.map(message => {
        // Format sender name for sent messages
        let senderName;
        if (message.sent) {
            try {
                const npub = window.NostrTools.nip19.npubEncode(userKeys.publicKey);
                senderName = npub.substring(0, 9) + '...' + npub.substring(npub.length - 5);
            } catch (error) {
                senderName = formatPubkeyForDisplay(userKeys.publicKey);
            }
        } else {
            senderName = formatPubkeyForDisplay(chatState.currentConversation);
        }
        const senderInitial = senderName.charAt(0).toUpperCase();
        const senderPubkey = message.sent ? userKeys.publicKey : chatState.currentConversation;
        const senderNpub = window.NostrTools.nip19.npubEncode(senderPubkey);
        const avatarSVG = getAvatarForPubkey(senderNpub, 40);
        
        // Determine message status and styling
        let statusClass = '';
        let statusIndicator = '';
        let retryButton = '';
        
        if (message.sent) {
            const status = message.status || 'sent';
            switch (status) {
                case 'pending':
                    statusClass = 'status-pending';
                    statusIndicator = '<span class="message-status pending" title="Sending..."><span class="material-symbols-rounded">schedule</span></span>';
                    break;
                case 'failed':
                    statusClass = 'status-failed';
                    statusIndicator = '<span class="message-status failed" title="Failed to send"><span class="material-symbols-rounded">error</span></span>';
                    retryButton = `<button class="retry-btn" onclick="retryMessage('${message.id}')" title="Retry sending">
                        <span class="material-symbols-rounded">refresh</span> Retry
                    </button>`;
                    break;
                case 'sent':
                default:
                    statusClass = 'status-sent';
                    statusIndicator = '<span class="message-status sent" title="Sent"><span class="material-symbols-rounded">check</span></span>';
                    break;
            }
        }
        
        return `
            <div class="message ${message.sent ? 'sent' : 'received'} ${statusClass}">
                <div class="message-avatar">
                    ${avatarSVG}
                </div>
                <div class="message-content">
                <div class="message-header">
                        <span class="message-author">${senderName}</span>
                    <span class="message-time">${formatTimestamp(message.timestamp)}</span>
                        ${statusIndicator}
                </div>
                    <div class="message-bubble">${escapeHtml(message.content)}</div>
                    <div class="message-footer">
                        ${message.incognito ? '<span class="incognito-tag">Incognito</span>' : ''}
                        ${message.error ? `<div class="error-info">${escapeHtml(message.error)}</div>` : ''}
                        ${retryButton}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Clear messages from legacy system
function clearMessages() {
    receivedMessages = [];
    updateMessagesDisplay();
    updateStatus();
    showNotification('Messages cleared', 'info');
    saveMessages(); // Save messages after clearing
}

// Update message status in the UI
function updateMessageStatus(eventId, status, error = null) {
    console.log('Updating message status:', eventId, status, error);
    
    // Find the message by wrapper event ID in all conversations
    for (const [conversationId, messages] of chatState.messages) {
        const messageIndex = messages.findIndex(msg => msg.wrapperEventId === eventId);
        
        if (messageIndex !== -1) {
            messages[messageIndex].status = status;
            messages[messageIndex].error = error;
            chatState.messages.set(conversationId, messages);
            
            // Refresh the conversation display if it's the current conversation
            if (chatState.currentConversation === conversationId) {
                displayConversationMessages(conversationId);
            }
            saveChatState();
            return;
        }
    }
    
    console.log('Message not found for status update:', eventId);
} 
