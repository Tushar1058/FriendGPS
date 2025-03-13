const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Use Railway's PORT or fallback to 3000
const port = process.env.PORT || 3000;

// Use in-memory SQLite for Railway (since Railway's filesystem is ephemeral)
const db = new sqlite3.Database(':memory:', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to in-memory SQLite database');
        // Create tables immediately after connection
        createTables();
    }
});

// Create tables function
function createTables() {
    db.serialize(() => {
        // Create sessions table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS sessions (
            code TEXT PRIMARY KEY,
            user1_id TEXT,
            user2_id TEXT,
            user1_lat REAL,
            user1_lng REAL,
            user2_lat REAL,
            user2_lng REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Clean up old sessions (older than 24 hours)
        db.run(`DELETE FROM sessions WHERE datetime(created_at) < datetime('now', '-24 hours')`);
        
        console.log('Database tables created successfully');
    });
}

// Cleanup old sessions periodically (every hour)
setInterval(() => {
    db.run(`DELETE FROM sessions WHERE datetime(created_at) < datetime('now', '-24 hours')`);
    console.log('Cleaned up old sessions');
}, 3600000);

// Middleware
app.use(express.static(path.join(__dirname, '/')));
app.use(express.json());

// Generate random 6-digit code
function generateSessionCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create new session
    socket.on('create-session', async () => {
        try {
            let code;
            let attempts = 0;
            const maxAttempts = 5;

            // Generate a unique code
            do {
                code = generateSessionCode();
                attempts++;
                try {
                    await new Promise((resolve, reject) => {
                        db.get('SELECT code FROM sessions WHERE code = ?', [code], (err, row) => {
                            if (err) reject(err);
                            resolve(row);
                        });
                    });
                } catch (err) {
                    console.error('Error checking session code:', err);
                    socket.emit('error', 'Failed to create session');
                    return;
                }
            } while (row && attempts < maxAttempts);

            if (attempts >= maxAttempts) {
                socket.emit('error', 'Failed to generate unique session code');
                return;
            }

            // Create new session
            db.run('INSERT INTO sessions (code, user1_id) VALUES (?, ?)', 
                [code, socket.id], 
                (err) => {
                    if (err) {
                        console.error('Error creating session:', err);
                        socket.emit('error', 'Failed to create session');
                        return;
                    }
                    console.log('Session created:', code);
                    socket.join(code);
                    socket.emit('session-created', code);
                }
            );
        } catch (err) {
            console.error('Error in create-session:', err);
            socket.emit('error', 'Failed to create session');
        }
    });

    // Join session
    socket.on('join-session', (code) => {
        db.get('SELECT * FROM sessions WHERE code = ?', [code], (err, session) => {
            if (err) {
                console.error('Error finding session:', err);
                socket.emit('error', 'Failed to join session');
                return;
            }

            if (!session) {
                socket.emit('error', 'Invalid session code');
                return;
            }

            if (session.user2_id) {
                socket.emit('error', 'Session is full');
                return;
            }

            db.run('UPDATE sessions SET user2_id = ? WHERE code = ?',
                [socket.id, code],
                (err) => {
                    if (err) {
                        console.error('Error joining session:', err);
                        socket.emit('error', 'Failed to join session');
                        return;
                    }
                    console.log('User joined session:', code);
                    socket.join(code);
                    socket.emit('session-joined', code);
                    io.to(code).emit('session-ready');
                }
            );
        });
    });

    // Update location
    socket.on('update-location', (data) => {
        const { code, lat, lng } = data;
        
        db.get('SELECT * FROM sessions WHERE code = ?', [code], (err, session) => {
            if (err || !session) {
                console.error('Error updating location:', err);
                return;
            }

            const isUser1 = socket.id === session.user1_id;
            const updateQuery = isUser1 
                ? 'UPDATE sessions SET user1_lat = ?, user1_lng = ? WHERE code = ?'
                : 'UPDATE sessions SET user2_lat = ?, user2_lng = ? WHERE code = ?';

            db.run(updateQuery, [lat, lng, code], (err) => {
                if (err) {
                    console.error('Error saving location:', err);
                    return;
                }

                // Emit updated location to other user
                socket.to(code).emit('location-updated', { lat, lng });
            });
        });
    });

    // Leave session
    socket.on('leave-session', (code) => {
        db.get('SELECT * FROM sessions WHERE code = ?', [code], (err, session) => {
            if (err || !session) return;

            if (socket.id === session.user1_id || socket.id === session.user2_id) {
                db.run('DELETE FROM sessions WHERE code = ?', [code], (err) => {
                    if (err) {
                        console.error('Error deleting session:', err);
                        return;
                    }
                    console.log('Session ended:', code);
                    io.to(code).emit('session-ended');
                });
            }
        });
    });

    // Disconnect handling
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        db.all('SELECT * FROM sessions WHERE user1_id = ? OR user2_id = ?',
            [socket.id, socket.id],
            (err, sessions) => {
                if (err) {
                    console.error('Error handling disconnect:', err);
                    return;
                }

                if (sessions) {
                    sessions.forEach(session => {
                        db.run('DELETE FROM sessions WHERE code = ?', [session.code], (err) => {
                            if (err) {
                                console.error('Error cleaning up session:', err);
                                return;
                            }
                            console.log('Session cleaned up:', session.code);
                            io.to(session.code).emit('session-ended');
                        });
                    });
                }
            }
        );
    });
});

// Error handling for the server
http.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Please try a different port.`);
        process.exit(1);
    } else {
        console.error('Server error:', error);
    }
});

// Start server
http.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
}); 