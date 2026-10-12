import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import config from '../config/config.js';
import logger from '../config/logger.js';
import { tokenTypes } from '../config/tokens.js';
import { userStatuses } from '../config/userStatuses.js';
import { User } from '../models/index.js';
import { bugService } from '../services/index.js';
import { setIo, userRoom, bugRoom } from './emitter.js';

/*
 * Socket.IO server: authentication, the per-user room, and joining bug rooms.
 *
 * Client → server
 *   bug:join  (bugIdOrKey, ack)  → ack({ ok: true, bugId }) or ack({ ok: false, message })
 *   bug:leave (bugId)
 * Server → client
 *   notification:new                       (user room)
 *   message:new | message:updated | message:deleted, bug:updated   (bug room)
 *
 * Sockets only push. Every change still goes through REST (validated, permission-checked, saved),
 * then the service broadcasts it.
 */

/**
 * @param {string} token - access JWT from the handshake: io(url, { auth: { token } })
 * @returns {Promise<User|null>} the active user, or null
 */
const getActiveUser = async (token) => {
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    if (payload.type !== tokenTypes.ACCESS) {
      return null;
    }
    const user = await User.findById(payload.sub);
    return user && user.status === userStatuses.ACTIVE ? user : null;
  } catch {
    return null; // expired, malformed or wrong signature
  }
};

/**
 * Handshake check: no valid access token, no connection. The token is only checked here, so a
 * socket can outlive its 30-minute token; anything sensitive (bug:join) re-reads the user, and
 * access changes disconnect the user's sockets (see emitter.disconnectUser).
 */
const authenticate = async (socket, next) => {
  const user = await getActiveUser(socket.handshake.auth?.token);
  if (!user) {
    return next(new Error('Unauthorized'));
  }
  // socket.data is Socket.IO's documented place for per-connection state (fetchSockets() returns it).
  // eslint-disable-next-line no-param-reassign
  socket.data.userId = user.id;
  next();
};

/**
 * @param {import('socket.io').Socket} socket
 */
const onConnection = (socket) => {
  const { userId } = socket.data;
  socket.join(userRoom(userId));

  // Same scope check as GET /bugs/:id: a bug you can't see is "not found".
  socket.on('bug:join', async (bugRef, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      const user = await User.findById(userId); // fresh role and status, not the handshake's
      if (!user || user.status !== userStatuses.ACTIVE || !user.hasPermission('bug:read')) {
        return reply({ ok: false, message: 'Forbidden' });
      }
      const { bug } = await bugService.getBugOrThrow(user, bugRef);
      socket.join(bugRoom(bug.id));
      reply({ ok: true, bugId: bug.id });
    } catch (error) {
      reply({ ok: false, message: error.statusCode ? error.message : 'Could not join' });
    }
  });

  socket.on('bug:leave', (bugId) => {
    socket.leave(bugRoom(bugId));
  });
};

/**
 * Attach Socket.IO to the HTTP server (src/index.js). One process only: rooms live in this
 * process's memory, which is why PM2 runs a single instance (see docs/DEPLOYMENT.md).
 * @param {import('http').Server} httpServer
 * @returns {Server}
 */
const initSockets = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: config.clientUrl, credentials: true },
  });
  io.use(authenticate);
  io.on('connection', onConnection);
  setIo(io);
  logger.info('Socket.IO ready');
  return io;
};

export default initSockets;
