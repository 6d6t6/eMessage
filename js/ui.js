// UI functions and status management
let profilePanelTransitionToken = 0;

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
        
        // Open own profile on click
        profileAvatar.style.cursor = 'pointer';
        profileAvatar.onclick = () => showUserProfile(userKeys.publicKey);

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
    const miniProfile = document.getElementById('miniProfile');
    if (miniProfile && !miniProfile.dataset.listenerAdded) {
        miniProfile.addEventListener('click', (e) => {
            // Only trigger if not clicking the settings button or its icon
            if (!e.target.closest('.profile-settings-btn')) {
                showUserProfile(userKeys.publicKey);
            }
        });
        miniProfile.dataset.listenerAdded = 'true';
        miniProfile.style.cursor = 'pointer';
    }
    
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
        setTextWithEmoji(profileName, getDisplayNameForPubkey(userKeys.publicKey) || 'Your Profile');
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
        showSection('profile');
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

    const settingsModal = document.querySelector('#settingsModal .settings-modal');
    if (settingsModal) {
        const isMobile = window.innerWidth <= 900;
        if (isMobile) {
            settingsModal.classList.add('section-active');
        }
        const sidebar = settingsModal.querySelector('.settings-sidebar');
        const content = settingsModal.querySelector('.settings-content');
        if (typeof setPanelAccessibility === 'function') {
            setPanelAccessibility(content, true);
            setPanelAccessibility(sidebar, !isMobile);
        }
    }
}

function showSettingsHome() {
    const settingsModal = document.querySelector('#settingsModal .settings-modal');
    if (!settingsModal) return;
    settingsModal.classList.remove('section-active');
    const sidebar = settingsModal.querySelector('.settings-sidebar');
    const content = settingsModal.querySelector('.settings-content');
    if (typeof setPanelAccessibility === 'function') {
        setPanelAccessibility(sidebar, true);
        setPanelAccessibility(content, false);
    }
}

function closeSettings() {
    const settingsOverlay = document.getElementById('settingsModal');
    if (!settingsOverlay) return;
    chatState.showSettings = false;
    settingsOverlay.classList.remove('active');
    const settingsModal = settingsOverlay.querySelector('.settings-modal');
    if (settingsModal) {
        settingsModal.classList.remove('section-active');
        const sidebar = settingsModal.querySelector('.settings-sidebar');
        const content = settingsModal.querySelector('.settings-content');
        if (typeof setPanelAccessibility === 'function') {
            setPanelAccessibility(sidebar, false);
            setPanelAccessibility(content, false);
        }
    }
}

function openSettings() {
    const settingsOverlay = document.getElementById('settingsModal');
    if (!settingsOverlay) return;
    chatState.showSettings = true;
    settingsOverlay.classList.add('active');
    showSection('profile');
    if (window.innerWidth <= 900) {
        showSettingsHome();
    }
}

function handleSettingsBack() {
    const settingsModal = document.querySelector('#settingsModal .settings-modal');
    if (!settingsModal) return;
    const isMobile = window.innerWidth <= 900;
    if (!isMobile) {
        closeSettings();
        return;
    }
    if (settingsModal.classList.contains('section-active')) {
        showSettingsHome();
    } else {
        closeSettings();
    }
}

// Settings panel management
function toggleSettings() {
    if (chatState.showSettings) {
        closeSettings();
    } else {
        openSettings();
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

    // Increment token to cancel any pending transitions
    const currentToken = ++profilePanelTransitionToken;
    
    const isActive = panel.classList.contains('active');
    if (isActive) {
        if (isMobile && chatArea) {
            chatArea.style.display = 'flex';
            // Force a reflow to ensure the transition from the current transform (-10%) works
            chatArea.offsetHeight;
        }
        panel.classList.remove('active');
        if (typeof setPanelAccessibility === 'function') {
            setPanelAccessibility(panel, false);
        }
        if (chatInterface) {
            chatInterface.classList.remove('profile-panel-open');
        }
        if (isMobile && chatArea) {
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
                // Check both transform and opacity just in case
                if (event.propertyName !== 'transform' && event.propertyName !== 'opacity') return;
                // If token changed, this is a stale animation
                if (currentToken !== profilePanelTransitionToken) return;
                
                chatArea.style.display = 'none';
                if (typeof setPanelAccessibility === 'function') {
                    setPanelAccessibility(chatArea, false);
                }
            };
            chatArea.addEventListener('transitionend', handleFadeEnd, { once: true });
            setTimeout(() => {
                if (currentToken !== profilePanelTransitionToken) return;
                
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

    // Sync Settings Modal Accessibility
    const settingsModal = document.querySelector('#settingsModal .settings-modal');
    if (settingsModal) {
        const sidebar = settingsModal.querySelector('.settings-sidebar');
        const content = settingsModal.querySelector('.settings-content');
        const isSectionActive = settingsModal.classList.contains('section-active');
        
        if (typeof setPanelAccessibility === 'function') {
            if (!isMobile) {
                // On desktop, both are always accessible if the modal is open
                setPanelAccessibility(sidebar, true);
                setPanelAccessibility(content, true);
            } else {
                // On mobile, depends on whether we're in a section or home
                setPanelAccessibility(sidebar, !isSectionActive);
                setPanelAccessibility(content, isSectionActive);
            }
        }
    }

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
        setTextWithEmoji(chatTitle, 'Select a conversation');
        return;
    }
    const displayName = getDisplayNameForPubkey(conversationId);
    setTextWithEmoji(chatTitle, displayName);
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
    const avatarMarkup = getAvatarMarkupForPubkey(pubkey, 80);
    
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
                <h3 onclick="showUserProfile('${pubkey}')">${escapeHtml(displayName)}</h3>
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

    // Make avatar and banner clickable in panel
    const panelAvatar = panelBanner.querySelector('.profile-panel-avatar');
    if (panelAvatar) {
        panelAvatar.onclick = () => showUserProfile(pubkey);
    }
    panelBanner.style.cursor = 'pointer';
    panelBanner.onclick = (e) => {
        // Only trigger if not clicking the avatar (to avoid double trigger, though it doesn't matter much)
        if (!e.target.closest('.profile-panel-avatar')) {
            showUserProfile(pubkey);
        }
    };
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
        unreadCount: conversation.id !== chatState.currentConversation
            ? messages.filter(m => !m.sent && m.timestamp * 1000 > (conversation.lastReadTime || 0)).length
            : 0,
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
    if (!messagesList) {
        return;
    }
    
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
    Logger.debug('Updating message status:', eventId, status, error);
    
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
    
    Logger.debug('Message not found for status update:', eventId);
}

// Generic swipe back utility for mobile
function initSwipeBack(element, onBack, options = {}) {
    if (!element) return;
    
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isDragging = false;
    let isScrolling = false;
    const threshold = options.threshold || 100;
    const isMobile = () => window.innerWidth <= 900;

    element.addEventListener('touchstart', (e) => {
        if (!isMobile()) return;
        if (options.condition && !options.condition()) return;
        
        // Prevent horizontal swipes from bubbling up to parent swipe listeners
        e.stopPropagation();

        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isDragging = false;
        isScrolling = false;
        
        // Don't set transition yet, wait for move
    }, { passive: false });

    element.addEventListener('touchmove', (e) => {
        // Prevent bubbling to parents
        e.stopPropagation();

        const currentX_coord = e.touches[0].clientX;
        const currentY_coord = e.touches[0].clientY;
        const dx = currentX_coord - startX;
        const dy = currentY_coord - startY;

        if (!isDragging && !isScrolling) {
            // Block scrolling early if horizontal intent is clear
            if (Math.abs(dx) > 2 && Math.abs(dx) > Math.abs(dy)) {
                if (e.cancelable) e.preventDefault();
            }

            // Determine if this is a swipe or a scroll
            // Only allow right swipe (dx > 10)
            if (dx > 10 && dx > Math.abs(dy)) {
                isDragging = true;
                element.style.transition = 'none';
                if (options.bgElement) {
                    options.bgElement.style.transition = 'none';
                    options.bgElement.style.visibility = 'visible';
                    options.bgElement.style.display = 'flex';
                }
            } else if (Math.abs(dy) > 10 || (dx < -10)) {
                isScrolling = true;
            }
        }

        if (isDragging) {
            if (e.cancelable) e.preventDefault(); // Prevent scrolling during swipe
            currentX = currentX_coord;
            // Cap movement at 0 to prevent swiping left
            const moveX = Math.max(0, dx);
            element.style.transform = `translateX(${moveX}px)`;
            
            if (options.bgElement) {
                const progress = Math.min(moveX / window.innerWidth, 1);
                const startTranslate = options.bgStartTranslate !== undefined ? options.bgStartTranslate : -10;
                const bgTranslate = startTranslate * (1 - progress);
                options.bgElement.style.transform = `translateX(${bgTranslate}%)`;
            }
        }
    }, { passive: false });

    element.addEventListener('touchend', (e) => {
        e.stopPropagation();
        if (!isDragging || isScrolling) {
            isDragging = false;
            isScrolling = false;
            return;
        }
        isDragging = false;
        
        const deltaX = currentX - startX;
        const duration = 250;
        
        if (deltaX > threshold) {
            // Animate completion of the swipe
            element.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.1, 0.25, 1)`;
            element.style.transform = `translateX(100%)`;
            
            if (options.bgElement) {
                options.bgElement.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.1, 0.25, 1)`;
                options.bgElement.style.transform = 'translateX(0)';
            }

            setTimeout(() => {
                onBack();
                // Reset styles after the callback has updated the DOM state
                setTimeout(() => {
                    element.style.transform = '';
                    element.style.transition = '';
                    if (options.bgElement) {
                        options.bgElement.style.transform = '';
                        options.bgElement.style.transition = '';
                        options.bgElement.style.visibility = '';
                        options.bgElement.style.display = '';
                    }
                }, 50);
            }, duration);
        } else {
            // Animate snap back
            element.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.1, 0.25, 1)`;
            element.style.transform = '';
            
            if (options.bgElement) {
                options.bgElement.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.1, 0.25, 1)`;
                options.bgElement.style.transform = '';
            }
            
            setTimeout(() => {
                element.style.transition = '';
                if (options.bgElement) {
                    options.bgElement.style.transition = '';
                    options.bgElement.style.visibility = '';
                    options.bgElement.style.display = '';
                }
            }, duration);
        }
        
        startX = 0;
        currentX = 0;
    });

    element.addEventListener('touchcancel', (e) => {
        e.stopPropagation();
        if (isDragging) {
            const duration = 250;
            element.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.1, 0.25, 1)`;
            element.style.transform = '';
            
            if (options.bgElement) {
                options.bgElement.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.1, 0.25, 1)`;
                options.bgElement.style.transform = '';
            }
            
            setTimeout(() => {
                element.style.transition = '';
                if (options.bgElement) {
                    options.bgElement.style.transition = '';
                    options.bgElement.style.visibility = '';
                    options.bgElement.style.display = '';
                }
            }, duration);
        }
        isDragging = false;
        isScrolling = false;
        startX = 0;
        currentX = 0;
    });
}

// Initialize all gesture navigation
function initGestures() {
    // 1. Chat Area Swipe Back (reveals conversations list)
    const chatArea = document.querySelector('.chat-area');
    const conversationsSidebar = document.querySelector('.conversations-sidebar');
    const chatInterface = document.getElementById('chatInterface');
    
    initSwipeBack(chatArea, showConversationsList, {
        bgElement: conversationsSidebar,
        condition: () => chatInterface && chatInterface.classList.contains('conversation-open') && !document.getElementById('profilePanel').classList.contains('active')
    });

    // 2. Profile Panel Swipe Back (reveals chat area)
    const profilePanel = document.getElementById('profilePanel');
    initSwipeBack(profilePanel, () => {
        if (profilePanel.classList.contains('active')) {
            toggleProfilePanel();
        }
    }, {
        bgElement: chatArea
    });

    // 3. Settings Content Swipe Back (reveals settings sidebar)
    const settingsModal = document.querySelector('#settingsModal .settings-modal');
    const settingsContent = document.querySelector('#settingsModal .settings-content');
    const settingsSidebar = document.querySelector('#settingsModal .settings-sidebar');
    initSwipeBack(settingsContent, handleSettingsBack, {
        bgElement: settingsSidebar,
        condition: () => settingsModal && settingsModal.classList.contains('section-active')
    });
    
    // 4. Settings Modal Swipe Back (reveals app container)
    const settingsModalOverlay = document.getElementById('settingsModal');
    const appContainer = document.querySelector('.app-container');
    initSwipeBack(settingsModal, closeSettings, {
        bgElement: appContainer,
        bgStartTranslate: 0,
        condition: () => settingsModal && !settingsModal.classList.contains('section-active') && settingsModalOverlay.classList.contains('active')
    });

    // 5. User Profile Modal Swipe Down (Vertical)
    initProfileModalSwipe();
}

// Initialize swipe to close for profile modal
function initProfileModalSwipe() {
    const overlay = document.getElementById('userProfileModal');
    const modal = overlay ? overlay.querySelector('.user-profile-modal') : null;
    if (!modal) return;

    BottomSheetGestures.init({
        element: modal,
        overlay: overlay,
        onClose: () => {
            closeUserProfile();
        },
        canDrag: (e) => {
            const body = modal.querySelector('.user-profile-body');
            const header = modal.querySelector('.user-profile-header');
            const isHeader = e.target.closest('.user-profile-header') || e.target.closest('.user-profile-drag-handle');
            
            if (isHeader) return true;
            return body && body.scrollTop <= 0;
        }
    });
}

// Show User Profile Modal
function showUserProfile(pubkey) {
    if (!pubkey) return;
    
    const modal = document.getElementById('userProfileModal');
    const banner = document.getElementById('userProfileBanner');
    const avatar = document.getElementById('userProfileAvatar');
    const name = document.getElementById('userProfileName');
    const npub = document.getElementById('userProfileNpub');
    const content = document.getElementById('userProfileContent');
    const messageBtn = document.getElementById('userProfileMessageBtn');
    
    if (!modal || !banner || !avatar || !name || !npub || !content || !messageBtn) return;
    
    // Clear any lingering inline animation override (can be set by closeUserProfile cleanup)
    // so the CSS animation re-fires cleanly on this open.
    const modalContent = modal.querySelector('.user-profile-modal');
    if (modalContent) {
        modalContent.style.animation = '';
        modalContent.style.transform = '';
        modalContent.style.transition = '';
    }
    
    ensureProfileFetched(pubkey);
    const metadata = getProfileMetadata(pubkey) || {};
    const displayName = getDisplayNameForPubkey(pubkey);
    
    // Set banner and avatar
    banner.innerHTML = getBannerMarkupForPubkey(pubkey);
    avatar.innerHTML = getAvatarMarkupForPubkey(pubkey, 80);
    
    // Set basic info
    setTextWithEmoji(name, displayName);
    try {
        const fullNpub = window.NostrTools.nip19.npubEncode(pubkey);
        npub.textContent = formatPubkeyForDisplay(pubkey);
        npub.setAttribute('data-full-text', fullNpub);
    } catch (e) {
        npub.textContent = formatPubkey(pubkey);
        npub.setAttribute('data-full-text', pubkey);
    }
    
    // Set content (About, Details)
    let contentHtml = '';
    
    if (metadata.about) {
        contentHtml += `
            <div class="user-profile-section">
                <h4>About Me</h4>
                <p>${escapeHtml(metadata.about)}</p>
            </div>
        `;
    }
    
    const details = [
        { label: 'Username', value: metadata.name },
        { label: 'Website', value: metadata.website },
        { label: 'NIP-05', value: metadata.nip05 },
        { label: 'Lightning', value: metadata.lud16 }
    ].filter(d => d.value);
    
    if (details.length > 0) {
        contentHtml += `
            <div class="user-profile-section">
                <h4>Details</h4>
                <div class="user-profile-details">
                    ${details.map(d => `
                        <div class="user-profile-detail">
                            <span>${d.label}</span>
                            <span>${escapeHtml(d.value)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    if (!metadata.about && details.length === 0) {
        contentHtml = '<div class="user-profile-section"><p>No profile details found yet.</p></div>';
    }
    
    content.innerHTML = contentHtml;
    
    // Message and Edit button logic
    if (userKeys && pubkey === userKeys.publicKey) {
        messageBtn.style.display = 'none';
        
        // Add Edit button for own profile
        let editBtn = document.getElementById('userProfileEditBtn');
        if (!editBtn) {
            editBtn = document.createElement('button');
            editBtn.id = 'userProfileEditBtn';
            editBtn.className = 'btn btn-secondary';
            editBtn.innerHTML = '<span class="material-symbols-rounded">edit</span> Edit Profile';
            messageBtn.parentNode.appendChild(editBtn);
        }
        editBtn.style.display = 'inline-flex';
        editBtn.onclick = () => {
            closeUserProfile();
            openSettings();
        };
    } else {
        messageBtn.style.display = 'inline-flex';
        messageBtn.onclick = () => {
            closeUserProfile();
            selectConversation(pubkey, 'user');
        };
        
        // Hide Edit button if it exists
        const editBtn = document.getElementById('userProfileEditBtn');
        if (editBtn) editBtn.style.display = 'none';
    }
    
    modal.classList.add('active');
}

// Close User Profile Modal
function closeUserProfile() {
    const modalOverlay = document.getElementById('userProfileModal');
    const modalContent = modalOverlay ? modalOverlay.querySelector('.user-profile-modal') : null;
    
    if (modalOverlay) {
        modalOverlay.classList.remove('active');
        if (modalContent) {
            // Reset inline styles after the overlay finishes closing (300ms)
            // This clears any swipe-gesture transforms (mobile) AND resets the
            // animation so it re-fires cleanly on the next open (desktop).
            setTimeout(() => {
                modalContent.style.transform = '';
                modalContent.style.transition = '';
                // Force animation reset so it re-triggers on next open
                modalContent.style.animation = 'none';
                // Void reflow to flush the animation reset before clearing it
                void modalContent.offsetWidth;
                modalContent.style.animation = '';
            }, 300);
        }
    }
}

// Close modal on click outside
window.addEventListener('click', (event) => {
    const userProfileModal = document.getElementById('userProfileModal');
    if (event.target === userProfileModal) {
        closeUserProfile();
    }
    
    const settingsModal = document.getElementById('settingsModal');
    if (event.target === settingsModal) {
        closeSettings();
    }
    
    const newChatModal = document.getElementById('newChatModal');
    if (event.target === newChatModal) {
        closeNewChatModal();
    }
});
