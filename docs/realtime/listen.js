/* eslint-disable no-console */
// A developer tool, never run by the API in production: socket.io-client is a devDependency on purpose.
/* eslint-disable import/no-extraneous-dependencies */
/**
 * Watch BugTrail's live events in a terminal.
 *
 *   npm run realtime:listen -- <accessToken> [bugIdOrKey]
 *
 * Get an access token from Postman (Auth → Login, the `accessToken` variable) or the login response.
 * Prints every event this user receives: notification:new always; and, if you pass a bug,
 * message:new / message:updated / message:deleted / bug:updated for that bug.
 * Set SOCKET_URL if the API isn't on http://localhost:5000.
 */
import { io } from 'socket.io-client';

const [token, bugRef] = process.argv.slice(2);
if (!token) {
  console.error('Usage: npm run realtime:listen -- <accessToken> [bugIdOrKey]');
  process.exit(1);
}

const url = process.env.SOCKET_URL || 'http://localhost:5000';
const socket = io(url, { auth: { token } });

socket.on('connect', () => {
  console.log(`connected to ${url} as socket ${socket.id}`);
  if (bugRef) {
    socket.emit('bug:join', bugRef, (reply) => console.log('bug:join →', reply));
  }
});
socket.on('connect_error', (error) => {
  console.error(`connection refused: ${error.message} (expired token? run Auth → Login again)`);
  process.exit(1);
});
socket.on('disconnect', (reason) => console.log(`disconnected: ${reason}`));
socket.onAny((event, payload) => {
  console.log(`\n[${new Date().toLocaleTimeString()}] ${event}`);
  console.dir(payload, { depth: 4, colors: true });
});
