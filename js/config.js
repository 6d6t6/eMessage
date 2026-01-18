// Global variables and configuration
// Nostr client and connection state
let nostrClient = null;
let userKeys = null;
let relayConnection = null;
let relayConnections = new Map();
let receivedMessages = [];
let messageSubscription = null;

// Incognito DM state
let incognitoState = {
    conversations: new Map(), // Map of recipient -> conversation data
    disposableKeys: new Map(), // Map of conversation -> disposable keypairs
    pendingInvitations: new Map(), // Map of invitation ID -> invitation data
    seed: null, // HD derivation seed
    conversationCounter: 0 // Counter for new conversations
};

// Chat interface state
let chatState = {
    currentConversation: null,
    conversations: [], // Array of conversation objects
    messages: new Map(), // Map of conversationId -> messages array
    showSettings: false
};

// Event deduplication and rate limiting
const processedEventIds = new Set();
const MAX_PROCESSED_EVENTS = 1000; // Keep only the most recent 1000 events
let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN = 2000; // 2 seconds between notifications

// Global message deduplication
const processedMessageIds = new Set();

// Global state for tracking message sending status
const messageSendingStatus = new Map(); // eventId -> { status: 'pending'|'sent'|'failed', error: string, retryCount: number }

// Profile metadata state
let profileState = {
    metadata: null,
    nip05: {
        identifier: '',
        verified: false,
        lastChecked: null,
        error: null
    },
    pendingPublish: false
};

let profileCache = new Map();

// Relay defaults and settings
const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://relay.primal.net'
];

const DEPRECATED_RELAYS = [
    'wss://nostr.wine',
    'wss://relay.nostr.band'
];

let relaySettings = {
    relays: DEFAULT_RELAYS.map((url) => ({
        url,
        enabled: true,
        isDefault: true
    })),
    autoReconnect: true,
    reconnectBaseDelayMs: 1500,
    reconnectMaxDelayMs: 30000
};

// Export for ES6 modules compatibility (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        nostrClient,
        userKeys,
        relayConnection,
        relayConnections,
        receivedMessages,
        messageSubscription,
        incognitoState,
        chatState,
        processedEventIds,
        MAX_PROCESSED_EVENTS,
        lastNotificationTime,
        NOTIFICATION_COOLDOWN,
        processedMessageIds,
        messageSendingStatus,
        profileState,
        profileCache,
        DEFAULT_RELAYS,
        relaySettings,
        DEPRECATED_RELAYS
    };
}
