# FriendGPS

A mobile-friendly web app that allows two users to share their real-time locations and track each other using a compass-based arrow.

## Features

- Real-time location sharing between two users
- Compass-based direction arrow
- Distance calculation in meters/kilometers
- Session management with 6-digit codes
- Dark mode UI
- Mobile-optimized interface

## Live Demo

Visit the live app at: [Your Railway URL after deployment]

## Local Development

1. Clone the repository:
```bash
git clone https://github.com/Tushar1058/FriendGPS.git
cd FriendGPS
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open http://localhost:3000 in your browser

## Deployment to Railway

1. Create a Railway account at https://railway.app/

2. Install Railway CLI:
```bash
npm i -g @railway/cli
```

3. Login to Railway:
```bash
railway login
```

4. Create a new project:
```bash
railway init
```

5. Deploy the app:
```bash
railway up
```

6. The app will be deployed and you'll get a URL where it's accessible.

## Technical Details

- Frontend: HTML5, CSS3, JavaScript
- Backend: Node.js with Express
- Real-time communication: Socket.IO
- Database: SQLite (in-memory for Railway deployment)
- APIs used:
  - Geolocation API
  - DeviceOrientation API

## Important Notes

- The app uses in-memory SQLite for Railway deployment, so sessions will be cleared when the server restarts
- Sessions automatically expire after 24 hours
- The app requires HTTPS for Geolocation and DeviceOrientation APIs to work
- Mobile browsers must support the required APIs

## License

MIT License 