// Connect to Socket.IO server
const socket = io();

// DOM elements
const sessionSetupScreen = document.getElementById('session-setup');
const locationSharingScreen = document.getElementById('location-sharing');
const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');
const leaveBtn = document.getElementById('leave-btn');
const sessionCodeInput = document.getElementById('session-code-input');
const sessionCodeDisplay = document.getElementById('session-code-display');
const codeDisplay = document.getElementById('code-display');
const statusDisplay = document.getElementById('status');
const distanceDisplay = document.getElementById('distance');
const arrow = document.getElementById('arrow');

// State variables
let currentSession = null;
let watchId = null;
let otherUserLocation = null;
let deviceOrientation = 0;
let isConnected = false;

// Connection status handling
socket.on('connect', () => {
    console.log('Connected to server');
    updateConnectionStatus(true);
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    updateConnectionStatus(false);
});

function updateConnectionStatus(connected) {
    isConnected = connected;
    if (!connected) {
        statusDisplay.textContent = 'Disconnected from server. Trying to reconnect...';
        statusDisplay.style.color = '#f44336';
    } else if (currentSession) {
        statusDisplay.style.color = '';
    }
}

// Utility functions
function showScreen(screenElement) {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    screenElement.classList.add('active');
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
}

function calculateBearing(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const λ1 = lon1 * Math.PI / 180;
    const λ2 = lon2 * Math.PI / 180;

    const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
    const θ = Math.atan2(y, x);
    
    return (θ * 180 / Math.PI + 360) % 360; // Bearing in degrees
}

function updateArrowDirection(currentLocation) {
    if (!otherUserLocation) return;

    const bearing = calculateBearing(
        currentLocation.latitude,
        currentLocation.longitude,
        otherUserLocation.lat,
        otherUserLocation.lng
    );

    // Adjust arrow direction based on device orientation and bearing
    const arrowAngle = bearing - deviceOrientation;
    arrow.style.transform = `rotate(${arrowAngle}deg)`;

    // Update distance
    const distance = calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        otherUserLocation.lat,
        otherUserLocation.lng
    );

    distanceDisplay.textContent = distance < 1000 
        ? `${Math.round(distance)}m`
        : `${(distance/1000).toFixed(1)}km`;
}

// Location tracking
function startLocationTracking() {
    if ('geolocation' in navigator) {
        watchId = navigator.geolocation.watchPosition(
            position => {
                const location = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };

                // Send location update to server
                if (currentSession && isConnected) {
                    socket.emit('update-location', {
                        code: currentSession,
                        ...location
                    });
                }

                // Update arrow direction
                updateArrowDirection(position.coords);
            },
            error => {
                console.error('Geolocation error:', error);
                statusDisplay.textContent = 'Error getting location. Please enable GPS.';
                statusDisplay.style.color = '#f44336';
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 5000
            }
        );
    } else {
        statusDisplay.textContent = 'Geolocation not supported';
        statusDisplay.style.color = '#f44336';
    }
}

// Device orientation handling
function handleOrientation(event) {
    // Use webkitCompassHeading for iOS devices
    const heading = event.webkitCompassHeading || event.alpha;
    if (heading != null) {
        deviceOrientation = heading;
        // Force arrow update
        navigator.geolocation.getCurrentPosition(position => {
            updateArrowDirection(position.coords);
        });
    }
}

// Request necessary permissions
async function requestPermissions() {
    try {
        // Request geolocation permission
        await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });

        // Request device orientation permission (iOS)
        if (typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            await DeviceOrientationEvent.requestPermission();
        }

        return true;
    } catch (error) {
        console.error('Permission error:', error);
        return false;
    }
}

// Copy session code to clipboard
function copySessionCode() {
    const code = codeDisplay.textContent;
    navigator.clipboard.writeText(code).then(() => {
        const originalText = codeDisplay.textContent;
        codeDisplay.textContent = 'Copied!';
        setTimeout(() => {
            codeDisplay.textContent = originalText;
        }, 1000);
    }).catch(err => {
        console.error('Failed to copy code:', err);
    });
}

// Event listeners
createBtn.addEventListener('click', async () => {
    if (!isConnected) {
        alert('Not connected to server. Please check your internet connection.');
        return;
    }

    console.log('Requesting permissions...');
    if (await requestPermissions()) {
        console.log('Permissions granted, creating session...');
        createBtn.disabled = true;
        createBtn.textContent = 'Creating...';
        socket.emit('create-session');
    } else {
        console.log('Permission denied');
        statusDisplay.textContent = 'Please grant necessary permissions';
        statusDisplay.style.color = '#f44336';
    }
});

joinBtn.addEventListener('click', async () => {
    if (!isConnected) {
        alert('Not connected to server. Please check your internet connection.');
        return;
    }

    const code = sessionCodeInput.value.trim();
    if (code.length !== 6) {
        alert('Please enter a valid 6-digit code');
        return;
    }

    if (await requestPermissions()) {
        joinBtn.disabled = true;
        joinBtn.textContent = 'Joining...';
        socket.emit('join-session', code);
    } else {
        statusDisplay.textContent = 'Please grant necessary permissions';
        statusDisplay.style.color = '#f44336';
    }
});

leaveBtn.addEventListener('click', () => {
    if (currentSession) {
        socket.emit('leave-session', currentSession);
        endSession();
    }
});

// Make session code clickable to copy
codeDisplay.addEventListener('click', copySessionCode);

// Socket event handlers
socket.on('session-created', (code) => {
    console.log('Session created with code:', code);
    currentSession = code;
    codeDisplay.textContent = code;
    sessionCodeDisplay.classList.remove('hidden');
    statusDisplay.textContent = 'Waiting for other user to join...';
    statusDisplay.style.color = '#FFA000';
    showScreen(locationSharingScreen);
    startLocationTracking();
    createBtn.disabled = false;
    createBtn.textContent = 'Create New Session';
});

socket.on('session-joined', (code) => {
    currentSession = code;
    showScreen(locationSharingScreen);
    statusDisplay.textContent = 'Connecting to other user...';
    statusDisplay.style.color = '#FFA000';
    startLocationTracking();
    joinBtn.disabled = false;
    joinBtn.textContent = 'Join Session';
});

socket.on('session-ready', () => {
    statusDisplay.textContent = 'Connected! Tracking location...';
    statusDisplay.style.color = '#4CAF50';
});

socket.on('location-updated', (location) => {
    otherUserLocation = location;
    navigator.geolocation.getCurrentPosition(position => {
        updateArrowDirection(position.coords);
    });
});

socket.on('session-ended', () => {
    endSession();
    alert('Session ended');
});

socket.on('error', (message) => {
    console.error('Socket error:', message);
    alert(message);
    createBtn.disabled = false;
    createBtn.textContent = 'Create New Session';
    joinBtn.disabled = false;
    joinBtn.textContent = 'Join Session';
});

function endSession() {
    currentSession = null;
    otherUserLocation = null;
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    showScreen(sessionSetupScreen);
    sessionCodeDisplay.classList.add('hidden');
    sessionCodeInput.value = '';
    createBtn.disabled = false;
    createBtn.textContent = 'Create New Session';
    joinBtn.disabled = false;
    joinBtn.textContent = 'Join Session';
}

// Start listening for device orientation
if ('ondeviceorientationabsolute' in window) {
    window.addEventListener('deviceorientationabsolute', handleOrientation);
} else {
    window.addEventListener('deviceorientation', handleOrientation);
}

// Add visible feedback for connection status
const connectionStatus = document.createElement('div');
connectionStatus.id = 'connection-status';
connectionStatus.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: #f44336;
    transition: background-color 0.3s;
`;
document.body.appendChild(connectionStatus);

// Update connection status indicator
function updateConnectionStatus(connected) {
    isConnected = connected;
    connectionStatus.style.backgroundColor = connected ? '#4CAF50' : '#f44336';
    if (!connected) {
        statusDisplay.textContent = 'Disconnected from server. Trying to reconnect...';
        statusDisplay.style.color = '#f44336';
    } else if (currentSession) {
        statusDisplay.style.color = '';
    }
} 