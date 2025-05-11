// Initialize Nostr tools
let nostrTools;
try {
    nostrTools = window.NostrTools;
    if (!nostrTools) {
        throw new Error('Nostr tools not loaded');
    }
} catch (error) {
    console.error('Failed to load Nostr tools:', error);
    alert('Failed to load Nostr tools. Please refresh the page.');
}

// Constants
const RELAYS = [
    'wss://relay.damus.io',
    'wss://relay1.nostrchat.io',
    'wss://nos.lol',
    'wss://nostr.mom',
    'wss://lightningrelay.com'
];

// State management
let state = {
    privateKey: null,
    publicKey: null,
    channels: new Map(),
    dms: new Map(),
    currentChannel: null,
    isDirectMessage: false,
    pool: null,
    subscriptions: new Map(),
    messages: new Map(),
    loading: {
        profile: false,
        channels: false,
        dms: false,
        rendering: false
    },
    pendingNavigation: null, // Store pending navigation from URL params
    loadingTimeout: null // Add timeout tracking
};

// Initialize pool after ensuring nostrTools is loaded
if (nostrTools && typeof nostrTools.SimplePool === 'function') {
    state.pool = new nostrTools.SimplePool();
} else {
    console.error('SimplePool constructor not found in nostrTools');
    alert('Failed to initialize Nostr tools. Please refresh the page.');
}

// DOM Elements
const loadingScreen = document.getElementById('loadingScreen');
const loadingStatus = document.querySelector('.loading-status');
const loginModal = document.getElementById('loginModal');
const privateKeyInput = document.getElementById('privateKeyInput');
const connectBtn = document.getElementById('connectBtn');
const newChannelBtn = document.getElementById('newChannelBtn');
const newDMBtn = document.getElementById('newDMBtn');
const channelList = document.getElementById('channelList');
const dmList = document.getElementById('dmList');
const messageContainer = document.getElementById('messageContainer');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const currentChannelTitle = document.getElementById('currentChannel');
const usernameSpan = document.querySelector('.username');
const npubSpan = document.querySelector('.npub');

// New modal elements
const newChannelModal = document.getElementById('newChannelModal');
const newDMModal = document.getElementById('newDMModal');
const profileModal = document.getElementById('profileModal');
const channelNameInput = document.getElementById('channelName');
const channelDescriptionInput = document.getElementById('channelDescription');
const channelPictureInput = document.getElementById('channelPicture');
const channelBannerInput = document.getElementById('channelBanner');
const createChannelBtn = document.getElementById('createChannelBtn');
const dmPubkeyInput = document.getElementById('dmPubkey');
const startDMBtn = document.getElementById('startDMBtn');

// Add new DOM elements
const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
const rightSidebar = document.getElementById('rightSidebar');
const channelProfileModal = document.getElementById('channelProfileModal');
const channelProfileAvatar = document.getElementById('channelProfileAvatar');
const channelProfileName = document.getElementById('channelProfileName');
const channelProfileId = document.getElementById('channelProfileId');
const channelProfileAbout = document.getElementById('channelProfileAbout');
const channelProfileStats = document.getElementById('channelProfileStats');
const headerAvatar = document.getElementById('headerAvatar');

// Initialize
function init() {
    // Check URL parameters first
    handleUrlParams();

    // Check for existing private key
    const savedPrivateKey = localStorage.getItem('nostrchat_private_key');
    if (savedPrivateKey) {
        connectWithPrivateKey(savedPrivateKey);
    } else {
        showLoginModal();
        loadingScreen.classList.add('hidden');
    }

    // Event listeners
    connectBtn.addEventListener('click', handleConnect);
    newChannelBtn.addEventListener('click', () => showModal(newChannelModal));
    newDMBtn.addEventListener('click', () => showModal(newDMModal));
    sendMessageBtn.addEventListener('click', handleSendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // New modal event listeners
    createChannelBtn.addEventListener('click', handleNewChannel);
    startDMBtn.addEventListener('click', handleNewDM);
    
    // Add cancel button listeners to all modals
    document.querySelectorAll('.cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            hideModal(modal);
        });
    });

    // Close modals when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideModal(modal);
            }
        });
    });

    // Add event listener for sidebar toggle
    toggleSidebarBtn.addEventListener('click', () => {
        rightSidebar.classList.toggle('hidden');
        document.querySelector('.main-content').classList.toggle('sidebar-hidden');
    });

    // Add event listener for channel info click (chat header)
    const channelInfo = document.querySelector('.channel-info');
    if (channelInfo) {
        channelInfo.addEventListener('click', () => {
            if (state.isDirectMessage) {
                showProfileModal(state.currentChannel);
            } else if (state.currentChannel) {
                showChannelProfile(state.currentChannel);
            }
        });
    }
}

// Authentication
function showLoginModal() {
    loginModal.classList.add('active');
}

function hideLoginModal() {
    loginModal.classList.remove('active');
}

async function handleConnect() {
    const privateKey = privateKeyInput.value.trim();
    if (!privateKey) {
        alert('Please enter your private key');
        return;
    }

    try {
        loadingScreen.classList.remove('hidden');
        updateLoadingStatus('Connecting...');
        await connectWithPrivateKey(privateKey);
        hideLoginModal();
    } catch (error) {
        alert('Invalid private key');
        loadingScreen.classList.add('hidden');
    }
}

async function connectWithPrivateKey(privateKey) {
    try {
        // Decode if it's an nsec
        if (privateKey.startsWith('nsec')) {
            privateKey = nostrTools.nip19.decode(privateKey).data;
        }

        state.privateKey = privateKey;
        state.publicKey = nostrTools.getPublicKey(privateKey);
        
        // Save to localStorage
        localStorage.setItem('nostrchat_private_key', privateKey);
        
        // Set temporary profile info
        const npub = nostrTools.nip19.npubEncode(state.publicKey);
        
        // Create a default profile while we load
        const defaultProfile = {
            pubkey: state.publicKey,
            name: npub.slice(0, 12) + '...',
            picture: null,
            banner: null,
            complete: false
        };
        profiles.set(state.publicKey, defaultProfile);
        updateProfileDisplay(state.publicKey);
        
        // Load current user's profile first and wait for it
        updateLoadingStatus('Loading profile...');
        state.loading.profile = false;
        const profile = await loadProfile(state.publicKey);
        state.loading.profile = true;
        
        // Only proceed with channels and DMs after profile is loaded
        if (profile) {
            updateLoadingStatus('Loading channels and messages...');
            state.loading.channels = false;
            state.loading.dms = false;
            
            // Use Promise.race to ensure we don't wait forever
            await Promise.race([
                Promise.all([loadChannels(), loadDMs()]),
                new Promise(resolve => setTimeout(resolve, 5000)) // 5 second timeout
            ]);
            
            state.loading.channels = true;
            state.loading.dms = true;
            await checkLoadingComplete();
        }
    } catch (error) {
        console.error('Connection error:', error);
        // Force completion even on error
        state.loading.profile = true;
        state.loading.channels = true;
        state.loading.dms = true;
        state.loading.rendering = false;
        await checkLoadingComplete();
        throw error;
    }
}

// Channel Management
let allChannels = new Map(); // All discovered channels
let userChannelIds = new Set(); // Channel IDs user is a part of

// Helper to parse channel metadata
function parseChannelMetadata(content) {
    try {
        const meta = JSON.parse(content);
        return {
            name: meta.name || content,
            about: meta.about || '',
            picture: meta.picture || null,
            banner: meta.banner || null
        };
    } catch {
        return {
            name: content,
            about: '',
            picture: null,
            banner: null
        };
    }
}

// Update loadChannels to be more strict about completion
async function loadChannels() {
    return new Promise((resolve) => {
        // Subscribe to all channel metadata (kind 40/41)
        const metaSub = state.pool.sub(RELAYS, [
            { kinds: [40, 41] }
        ]);
        
        let initialLoadComplete = false;
        let pendingChannels = new Set();
        let processedChannels = new Set();

        const checkComplete = () => {
            if (initialLoadComplete && pendingChannels.size === 0) {
                state.loading.channels = true;
                renderChannels(); // Ensure final render
                resolve();
            }
        };

        // Set a timeout for initial load
        const timeout = setTimeout(() => {
            initialLoadComplete = true;
            checkComplete();
        }, 5000);

        metaSub.on('event', (event) => {
            const meta = parseChannelMetadata(event.content);
            const channel = {
                id: event.id,
                name: meta.name,
                about: meta.about,
                picture: meta.picture,
                banner: meta.banner,
                created_at: event.created_at,
                pubkey: event.pubkey,
                raw: event
            };
            allChannels.set(channel.id, channel);
            if (event.pubkey === state.publicKey) {
                userChannelIds.add(channel.id);
                pendingChannels.add(channel.id);
            }
            renderChannels();
        });

        // Subscribe to all channel messages authored by the user (kind 42)
        const userMsgSub = state.pool.sub(RELAYS, [
            { kinds: [42], authors: [state.publicKey] }
        ]);
        userMsgSub.on('event', (event) => {
            const channelTag = event.tags.find(t => t[0] === 'e');
            if (channelTag && channelTag[1]) {
                userChannelIds.add(channelTag[1]);
                pendingChannels.add(channelTag[1]);
                renderChannels();
            }
        });

        // Process each channel's messages
        const processChannel = async (channelId) => {
            if (processedChannels.has(channelId)) return;
            processedChannels.add(channelId);

            const sub = state.pool.sub(RELAYS, [{
                kinds: [42],
                '#e': [channelId]
            }]);

            let hasReceivedMessages = false;
            const messageTimeout = setTimeout(() => {
                hasReceivedMessages = true;
                pendingChannels.delete(channelId);
                checkComplete();
            }, 2000);

            sub.on('event', () => {
                hasReceivedMessages = true;
                clearTimeout(messageTimeout);
                pendingChannels.delete(channelId);
                checkComplete();
            });
        };

        // Process all channels
        const processAllChannels = () => {
            userChannelIds.forEach(channelId => {
                processChannel(channelId);
            });
        };

        // Start processing after a short delay to allow initial channel discovery
        setTimeout(() => {
            initialLoadComplete = true;
            processAllChannels();
            checkComplete();
        }, 1000);
    });
}

// Update renderChannels to track rendering state
function renderChannels() {
    state.loading.rendering = true;
    channelList.innerHTML = '';
    channelList.className = 'section-list channel-list';
    
    userChannelIds.forEach(channelId => {
        const channel = allChannels.get(channelId);
        if (!channel) return;

        const div = document.createElement('div');
        div.className = 'list-item';
        if (!state.isDirectMessage && state.currentChannel === channel.id) {
            div.classList.add('active');
        }
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.style.backgroundImage = channel.picture ?
            `url(${channel.picture})` :
            `url('/img/default-channel.svg')`;
        const name = document.createElement('span');
        name.textContent = channel.name;
        div.appendChild(avatar);
        div.appendChild(name);
        div.addEventListener('click', () => selectChannel(channel.id, false));
        channelList.appendChild(div);
    });

    // Use requestAnimationFrame to ensure DOM updates are complete
    requestAnimationFrame(() => {
        state.loading.rendering = false;
        checkLoadingComplete();
    });
}

// DM Management
async function loadDMs() {
    return new Promise((resolve) => {
        const sub = state.pool.sub(RELAYS, [{
            kinds: [4],
            authors: [state.publicKey]
        }, {
            kinds: [4],
            '#p': [state.publicKey]
        }]);

        let initialLoadComplete = false;
        let pendingDMs = new Set();
        let processedDMs = new Set();

        const checkComplete = () => {
            if (initialLoadComplete && pendingDMs.size === 0) {
                state.loading.dms = true;
                renderDMs(); // Ensure final render
                resolve();
            }
        };

        // Set a timeout for initial load
        const timeout = setTimeout(() => {
            initialLoadComplete = true;
            checkComplete();
        }, 5000);

        sub.on('event', (event) => {
            const otherPubkey = event.pubkey === state.publicKey ? 
                event.tags.find(t => t[0] === 'p')?.[1] : 
                event.pubkey;
            
            if (otherPubkey) {
                const dm = {
                    id: otherPubkey,
                    pubkey: otherPubkey,
                    name: nostrTools.nip19.npubEncode(otherPubkey).slice(0, 12) + '...'
                };
                state.dms.set(otherPubkey, dm);
                pendingDMs.add(otherPubkey);
                renderDMs();

                // Load DM messages
                if (!processedDMs.has(otherPubkey)) {
                    processedDMs.add(otherPubkey);
                    const dmSub = state.pool.sub(RELAYS, [
                        {
                            kinds: [4],
                            '#p': [otherPubkey],
                            authors: [state.publicKey]
                        },
                        {
                            kinds: [4],
                            '#p': [state.publicKey],
                            authors: [otherPubkey]
                        }
                    ]);

                    let hasReceivedMessages = false;
                    const messageTimeout = setTimeout(() => {
                        hasReceivedMessages = true;
                        pendingDMs.delete(otherPubkey);
                        checkComplete();
                    }, 2000);

                    dmSub.on('event', () => {
                        hasReceivedMessages = true;
                        clearTimeout(messageTimeout);
                        pendingDMs.delete(otherPubkey);
                        checkComplete();
                    });
                }
            }
        });

        // Start processing after a short delay
        setTimeout(() => {
            initialLoadComplete = true;
            checkComplete();
        }, 1000);
    });
}

// Update renderDMs to track rendering state
function renderDMs() {
    state.loading.rendering = true;
    dmList.innerHTML = '';
    dmList.className = 'section-list dm-list';
    
    state.dms.forEach(dm => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.setAttribute('data-pubkey', dm.pubkey);
        if (state.isDirectMessage && state.currentChannel === dm.id) {
            div.classList.add('active');
        }
        
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.style.backgroundImage = `url('/img/default-avatar.svg')`;
        
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = dm.name;
        
        div.appendChild(avatar);
        div.appendChild(name);
        div.addEventListener('click', () => selectChannel(dm.id, true));
        dmList.appendChild(div);

        // Update profile info if we have it
        const profile = profiles.get(dm.pubkey);
        if (profile && profile.complete) {
            if (profile.picture) {
                avatar.style.backgroundImage = `url(${profile.picture})`;
            }
            name.textContent = profile.name;
        } else {
            // Load profile if we don't have it
            loadProfile(dm.pubkey).then(newProfile => {
                if (newProfile && newProfile.complete) {
                    if (newProfile.picture) {
                        const avatarEl = div.querySelector('.avatar');
                        if (avatarEl) {
                            avatarEl.style.backgroundImage = `url(${newProfile.picture})`;
                        }
                    }
                    const nameEl = div.querySelector('.name');
                    if (nameEl) {
                        nameEl.textContent = newProfile.name;
                    }
                }
            });
        }
    });

    // Use requestAnimationFrame to ensure DOM updates are complete
    requestAnimationFrame(() => {
        state.loading.rendering = false;
        checkLoadingComplete();
    });
}

// Modal Management
function showModal(modal) {
    modal.classList.add('active');
}

function hideModal(modal) {
    modal.classList.remove('active');
}

// Update handleNewChannel to use the new modal
async function handleNewChannel() {
    const name = channelNameInput.value.trim();
    if (!name) {
        alert('Please enter a channel name');
        return;
    }

    const description = channelDescriptionInput.value.trim();
    const picture = channelPictureInput.value.trim();
    const banner = channelBannerInput.value.trim();

    const metadata = {
        name,
        about: description,
        picture: picture || null,
        banner: banner || null
    };

    const event = {
        kind: 40,
        content: JSON.stringify(metadata),
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        pubkey: state.publicKey
    };

    event.id = nostrTools.getEventHash(event);
    event.sig = await nostrTools.getSignature(event, state.privateKey);

    try {
        await state.pool.publish(RELAYS, event);
        const channel = {
            id: event.id,
            name: name,
            about: description,
            picture: picture,
            banner: banner,
            created_at: event.created_at
        };
        allChannels.set(event.id, channel);
        userChannelIds.add(event.id);
        renderChannels();
        hideModal(newChannelModal);
        
        // Clear inputs
        channelNameInput.value = '';
        channelDescriptionInput.value = '';
        channelPictureInput.value = '';
        channelBannerInput.value = '';
    } catch (error) {
        console.error('Error creating channel:', error);
        alert('Failed to create channel');
    }
}

// Update handleNewDM to use the new modal
async function handleNewDM() {
    const pubkey = dmPubkeyInput.value.trim();
    if (!pubkey) {
        alert('Please enter a public key');
        return;
    }

    try {
        let decodedPubkey = pubkey;
        if (pubkey.startsWith('npub')) {
            decodedPubkey = nostrTools.nip19.decode(pubkey).data;
        }

        const dm = {
            id: decodedPubkey,
            pubkey: decodedPubkey,
            name: pubkey.slice(0, 12) + '...'
        };
        state.dms.set(decodedPubkey, dm);
        renderDMs();
        selectChannel(decodedPubkey, true);
        hideModal(newDMModal);
        
        // Clear input
        dmPubkeyInput.value = '';
    } catch (error) {
        console.error('Error creating DM:', error);
        alert('Invalid public key');
    }
}

// Message Management
function selectChannel(channelId, isDM) {
    if (state.currentChannel === channelId && state.isDirectMessage === isDM) return;

    // Unsubscribe from previous channel
    if (state.currentChannel && state.subscriptions.has(state.currentChannel)) {
        state.subscriptions.get(state.currentChannel).unsub();
        state.subscriptions.delete(state.currentChannel);
    }

    state.currentChannel = channelId;
    state.isDirectMessage = isDM;
    
    // Update URL without triggering a page reload
    const params = new URLSearchParams(window.location.search);
    if (isDM) {
        params.set('dm', channelId);
        params.delete('ch');
    } else {
        params.set('ch', channelId);
        params.delete('dm');
    }
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    
    let channel, headerName, headerPic;
    if (isDM) {
        channel = state.dms.get(channelId);
        // Use profile name for DM header
        const profile = profiles.get(channelId);
        if (profile && profile.complete) {
            headerName = profile.name;
            headerAvatar.style.backgroundImage = profile.picture ? 
                `url(${profile.picture})` : 
                `url('/img/default-avatar.svg')`;
        } else {
            // If profile not loaded, start loading it and update header when done
            loadProfile(channelId).then(newProfile => {
                if (newProfile && newProfile.complete) {
                    currentChannelTitle.textContent = newProfile.name;
                    headerAvatar.style.backgroundImage = newProfile.picture ? 
                        `url(${newProfile.picture})` : 
                        `url('/img/default-avatar.svg')`;
                }
            });
            headerName = channel ? channel.name : 'Unknown';
            headerAvatar.style.backgroundImage = `url('/img/default-avatar.svg')`;
        }
        headerAvatar.classList.remove('channel-avatar');
        headerAvatar.classList.add('dm-avatar');
    } else {
        channel = allChannels.get(channelId);
        headerName = channel ? channel.name : 'Unknown';
        headerAvatar.style.backgroundImage = channel && channel.picture ? 
            `url(${channel.picture})` : 
            `url('/img/default-channel.svg')`;
        headerAvatar.classList.remove('dm-avatar');
        headerAvatar.classList.add('channel-avatar');
    }
    currentChannelTitle.textContent = headerName;
    messageContainer.innerHTML = '';

    // Subscribe to new channel
    let sub;
    if (isDM) {
        sub = state.pool.sub(RELAYS, [
            {
                kinds: [4],
                '#p': [channelId],
                authors: [state.publicKey]
            },
            {
                kinds: [4],
                '#p': [state.publicKey],
                authors: [channelId]
            }
        ]);
    } else {
        sub = state.pool.sub(RELAYS, [{
            kinds: [42],
            '#e': [channelId]
        }]);
    }

    sub.on('event', (event) => {
        displayMessage(event);
        renderRightSidebar(); // update members as messages come in
    });

    state.subscriptions.set(channelId, sub);
    renderChannels();
    renderDMs();
    renderRightSidebar();
}

async function handleSendMessage() {
    if (!state.currentChannel) {
        alert('Please select a channel or DM first');
        return;
    }

    const content = messageInput.value.trim();
    if (!content) return;

    const event = {
        kind: state.isDirectMessage ? 4 : 42,
        content: state.isDirectMessage ? 
            await nostrTools.nip04.encrypt(state.privateKey, state.currentChannel, content) : 
            content,
        created_at: Math.floor(Date.now() / 1000),
        tags: state.isDirectMessage ? 
            [['p', state.currentChannel]] : 
            [['e', state.currentChannel]],
        pubkey: state.publicKey
    };

    event.id = nostrTools.getEventHash(event);
    event.sig = await nostrTools.getSignature(event, state.privateKey);

    try {
        await state.pool.publish(RELAYS, event);
        messageInput.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message');
    }
}

async function displayMessage(event) {
    try {
        // Create message container
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        messageDiv.setAttribute('data-pubkey', event.pubkey);
        messageDiv.setAttribute('data-timestamp', event.created_at);
        
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.style.backgroundImage = `url('/img/default-avatar.svg')`;
        avatar.addEventListener('click', () => showProfileModal(event.pubkey));
        messageDiv.appendChild(avatar);
        
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'message-wrapper';
        
        const authorName = document.createElement('div');
        authorName.className = 'name';
        authorName.textContent = nostrTools.nip19.npubEncode(event.pubkey).slice(0, 12) + '...';
        authorName.addEventListener('click', () => showProfileModal(event.pubkey));
        contentWrapper.appendChild(authorName);
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Add timestamp
        const timestamp = document.createElement('span');
        timestamp.className = 'timestamp';
        const date = new Date(event.created_at * 1000);
        timestamp.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        authorName.appendChild(timestamp);
        
        let decryptedContent;
        if (state.isDirectMessage) {
            try {
                const isSender = event.pubkey === state.publicKey;
                const otherPubkey = isSender ? 
                    event.tags.find(t => t[0] === 'p')?.[1] : 
                    event.pubkey;
                
                decryptedContent = await nostrTools.nip04.decrypt(
                    state.privateKey,
                    otherPubkey,
                    event.content
                );
            } catch (error) {
                console.error('Decryption error:', error);
                decryptedContent = '[encrypted message]';
            }
        } else {
            decryptedContent = event.content;
        }
        
        contentDiv.textContent = decryptedContent;
        contentWrapper.appendChild(contentDiv);
        messageDiv.appendChild(contentWrapper);

        // Insert message in correct order
        let inserted = false;
        const messages = Array.from(messageContainer.children);
        for (const existingMsg of messages) {
            const existingTime = parseInt(existingMsg.getAttribute('data-timestamp'));
            if (event.created_at < existingTime) {
                messageContainer.insertBefore(messageDiv, existingMsg);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            messageContainer.appendChild(messageDiv);
        }

        // Load profile info immediately
        const profile = await loadProfile(event.pubkey);
        if (profile) {
            updateProfileDisplay(event.pubkey);
        }
        
        // Scroll to bottom if we're near the bottom
        const isNearBottom = messageContainer.scrollHeight - messageContainer.scrollTop - messageContainer.clientHeight < 100;
        if (isNearBottom) {
            messageContainer.scrollTop = messageContainer.scrollHeight;
        }
    } catch (error) {
        console.error('Error displaying message:', error);
    }
}

// Profile Management
let profiles = new Map();

async function loadProfile(pubkey) {
    if (profiles.has(pubkey)) {
        const profile = profiles.get(pubkey);
        if (profile.complete) {
            return profile;
        }
    }

    return new Promise((resolve) => {
        let resolved = false;
        let lastUpdate = 0;
        
        const sub = state.pool.sub(RELAYS, [{
            kinds: [0],
            authors: [pubkey]
        }]);

        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                sub.unsub();
                const defaultProfile = {
                    pubkey,
                    name: nostrTools.nip19.npubEncode(pubkey).slice(0, 12) + '...',
                    picture: null,
                    banner: null,
                    complete: true,
                    lastUpdate: Date.now()
                };
                profiles.set(pubkey, defaultProfile);
                updateProfileDisplay(pubkey);
                resolve(defaultProfile);
            }
        }, 5000);

        sub.on('event', (event) => {
            try {
                if (!resolved && event.created_at > lastUpdate) {
                    lastUpdate = event.created_at;
                    const metadata = JSON.parse(event.content);
                    const profile = {
                        pubkey,
                        name: metadata.name || metadata.display_name || nostrTools.nip19.npubEncode(pubkey).slice(0, 12) + '...',
                        picture: metadata.picture || null,
                        banner: metadata.banner || null,
                        about: metadata.about || null,
                        complete: true,
                        lastUpdate: event.created_at
                    };

                    // Only update if the profile data actually changed
                    const currentProfile = profiles.get(pubkey);
                    if (!currentProfile || 
                        currentProfile.name !== profile.name || 
                        currentProfile.picture !== profile.picture ||
                        currentProfile.banner !== profile.banner) {
                        profiles.set(pubkey, profile);
                        updateProfileDisplay(pubkey);
                    }

                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        sub.unsub();
                        resolve(profile);
                    }
                }
            } catch (error) {
                console.error('Error parsing profile:', error);
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    sub.unsub();
                    resolve(profiles.get(pubkey));
                }
            }
        });
    });
}

function updateProfileDisplay(pubkey) {
    const profile = profiles.get(pubkey);
    if (!profile) return;

    // Update user profile if this is the current user
    if (pubkey === state.publicKey) {
        const userAvatar = document.querySelector('.user-profile .avatar');
        if (userAvatar) {
            const newBackground = profile.picture ? 
                `url(${profile.picture})` : 
                `url('/img/default-avatar.svg')`;
            if (userAvatar.style.backgroundImage !== newBackground) {
                userAvatar.style.backgroundImage = newBackground;
            }
        }
        
        if (usernameSpan && usernameSpan.textContent !== profile.name) {
            usernameSpan.textContent = profile.name;
        }
        if (npubSpan) {
            const npub = nostrTools.nip19.npubEncode(pubkey);
            if (npubSpan.textContent !== npub) {
                npubSpan.textContent = npub;
            }
        }
    }

    // Update all other elements showing this profile
    document.querySelectorAll(`[data-pubkey="${pubkey}"]`).forEach(el => {
        const avatar = el.querySelector('.avatar');
        if (avatar) {
            const newBackground = profile.picture ? 
                `url(${profile.picture})` : 
                `url('/img/default-avatar.svg')`;
            if (avatar.style.backgroundImage !== newBackground) {
                avatar.style.backgroundImage = newBackground;
            }
        }

        const name = el.querySelector('.name');
        if (name) {
            const timestamp = name.querySelector('.timestamp');
            name.textContent = profile.name;
            if (timestamp) {
                name.appendChild(timestamp);
            }
        }
    });
}

// Add profile modal functionality
function showProfileModal(pubkey) {
    const profile = profiles.get(pubkey);
    if (!profile) return;

    const modal = document.getElementById('profileModal');
    const avatar = modal.querySelector('.profile-modal-avatar');
    const name = modal.querySelector('.profile-modal-name');
    const npub = modal.querySelector('.profile-modal-npub');
    const about = modal.querySelector('.profile-modal-about');

    avatar.style.backgroundImage = profile.picture ? 
        `url(${profile.picture})` : 
        `url('/img/default-avatar.svg')`;
    name.textContent = profile.name;
    npub.textContent = nostrTools.nip19.npubEncode(pubkey);
    about.textContent = profile.about || 'No bio available';

    showModal(modal);
}

// Update renderRightSidebar to use default banner if none
function renderRightSidebar() {
    const sidebar = document.getElementById('rightSidebar');
    sidebar.innerHTML = '';
    if (!state.currentChannel) return;

    if (state.isDirectMessage) {
        // DM: show other user's profile
        const dm = state.dms.get(state.currentChannel);
        if (!dm) return;
        const profile = profiles.get(dm.pubkey) || { name: dm.name, picture: null, about: '', pubkey: dm.pubkey, banner: null };
        sidebar.innerHTML = `
            <div class="profile-card">
                <div class="banner" style="background-image: url('${profile.banner ? profile.banner : '/img/default-banner.svg'}')"></div>
                <div class="content">
                <div class="avatar" style="background-image: url('${profile.picture || '/img/default-avatar.svg'}')"></div>
                <div class="name">${profile.name}</div>
                <div class="npub">${nostrTools.nip19.npubEncode(dm.pubkey)}</div>
                ${profile.about ? `<div class="about">${profile.about}</div>` : ''}
                </div>
            </div>
        `;

        // Add click handlers
        const avatar = sidebar.querySelector('.avatar');
        const name = sidebar.querySelector('.name');
        if (avatar) avatar.addEventListener('click', () => showProfileModal(dm.pubkey));
        if (name) name.addEventListener('click', () => showProfileModal(dm.pubkey));
    } else {
        // Channel: show channel info and member list
        const channel = allChannels.get(state.currentChannel);
        if (!channel) return;

        // Gather all unique pubkeys from messages in this channel
        const memberPubkeys = new Set();
        Array.from(messageContainer.children).forEach(msgDiv => {
            const pubkey = msgDiv.getAttribute('data-pubkey');
            if (pubkey) memberPubkeys.add(pubkey);
        });
        memberPubkeys.add(channel.pubkey);

        // Count messages in this channel
        const messageCount = messageContainer.children.length;

        // Render channel info first
        sidebar.innerHTML = `
            <div class="profile-card channel-card" style="cursor: pointer;">
                <div class="banner" style="background-image: url('${channel.banner ? channel.banner : '/img/default-banner.svg'}')"></div>
                <div class="content">
                    <div class="avatar" style="background-image: url('${channel.picture || '/img/default-channel.svg'}')"></div>
                    <div class="name">${channel.name}</div>
                    ${channel.about ? `<div class="about">${channel.about}</div>` : ''}
                    <div class="channel-stats">
                        <div class="channel-stat">
                            <span class="value">${memberPubkeys.size}</span>
                            <span class="label">Members</span>
                        </div>
                        <div class="channel-stat">
                            <span class="value">${messageCount}</span>
                            <span class="label">Messages</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="sidebar-title">Members</div>
            <div class="member-list">
        `;

        // Add click handler to channel card
        const channelCard = sidebar.querySelector('.channel-card');
        if (channelCard) {
            channelCard.addEventListener('click', () => showChannelProfile(state.currentChannel));
        }

        // Render members
        memberPubkeys.forEach(pubkey => {
            const profile = profiles.get(pubkey) || { name: nostrTools.nip19.npubEncode(pubkey).slice(0, 12) + '...', picture: null };
            const memberDiv = document.createElement('div');
            memberDiv.className = 'member-item';
            memberDiv.innerHTML = `
                <div class="avatar" style="background-image: url('${profile.picture || '/img/default-avatar.svg'}')"></div>
                <span class="name">${profile.name}</span>
                ${pubkey === channel.pubkey ? '<span class="crown" title="Channel Owner">👑</span>' : ''}
            `;
            sidebar.querySelector('.member-list').appendChild(memberDiv);

            // Add click handler to entire member item
            memberDiv.addEventListener('click', () => showProfileModal(pubkey));
        });
    }
}

// Update loading status
function updateLoadingStatus(message) {
    if (loadingStatus) {
        loadingStatus.textContent = message;
    }
}

// Add URL parameter handling
function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const dmId = params.get('dm');
    const channelId = params.get('ch');

    if (dmId) {
        state.pendingNavigation = { type: 'dm', id: dmId };
    } else if (channelId) {
        state.pendingNavigation = { type: 'channel', id: channelId };
    }
}

// Update checkLoadingComplete to be more robust
function checkLoadingComplete() {
    const { profile, channels, dms, rendering } = state.loading;
    
    // Clear any existing timeout
    if (state.loadingTimeout) {
        clearTimeout(state.loadingTimeout);
    }

    // Set a safety timeout to force completion after 10 seconds
    state.loadingTimeout = setTimeout(() => {
        console.log('Loading timeout reached, forcing completion');
        state.loading.profile = true;
        state.loading.channels = true;
        state.loading.dms = true;
        state.loading.rendering = false;
        finishLoading();
    }, 10000);

    if (profile && channels && dms && !rendering) {
        finishLoading();
    }
}

// New function to handle loading completion
function finishLoading() {
    // Clear the safety timeout
    if (state.loadingTimeout) {
        clearTimeout(state.loadingTimeout);
        state.loadingTimeout = null;
    }

        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
            // Double check that everything is still loaded
            if (state.loading.profile && state.loading.channels && state.loading.dms && !state.loading.rendering) {
                loadingScreen.classList.add('hidden');
                
                // Handle any pending navigation from URL params
                if (state.pendingNavigation) {
                    const { type, id } = state.pendingNavigation;
                    if (type === 'dm' && state.dms.has(id)) {
                        selectChannel(id, true);
                    } else if (type === 'channel' && allChannels.has(id)) {
                        selectChannel(id, false);
                    }
                    state.pendingNavigation = null;
                }
            }
        });
    }

// Add function to show channel profile
function showChannelProfile(channelId) {
    const channel = allChannels.get(channelId);
    if (!channel) return;

    // Count members and messages
    const memberPubkeys = new Set();
    Array.from(messageContainer.children).forEach(msgDiv => {
        const pubkey = msgDiv.getAttribute('data-pubkey');
        if (pubkey) memberPubkeys.add(pubkey);
    });
    memberPubkeys.add(channel.pubkey);
    const messageCount = messageContainer.children.length;

    // Update modal content
    channelProfileAvatar.style.backgroundImage = channel.picture ? 
        `url(${channel.picture})` : 
        `url('/img/default-channel.svg')`;
    channelProfileName.textContent = channel.name;
    channelProfileId.textContent = `Channel ID: ${channel.id}`;
    channelProfileAbout.textContent = channel.about || 'No description available';
    
    // Update stats
    channelProfileStats.innerHTML = `
        <div class="channel-stat">
            <span class="value">${memberPubkeys.size}</span>
            <span class="label">Members</span>
        </div>
        <div class="channel-stat">
            <span class="value">${messageCount}</span>
            <span class="label">Messages</span>
        </div>
    `;

    // Set default banner if none
    const modal = document.getElementById('channelProfileModal');
    const bannerDiv = modal.querySelector('.banner');
    if (bannerDiv) {
        if (channel.banner) {
            bannerDiv.style.backgroundImage = `url('${channel.banner}')`;
        } else {
            bannerDiv.style.backgroundImage = `url('/img/default-banner.svg')`;
        }
    }

    showModal(channelProfileModal);
}

// Initialize the app
init(); 