import logger from '../config/logger.js';

/*
 * The only way the rest of the app talks to Socket.IO.
 *
 * Services call emitToUser / emitToBug after they've saved something. This file holds the server
 * reference and nothing else (no service imports), so services can import it without a circular
 * dependency on the socket handlers, which import services.
 *
 * Before initSockets() runs (tests, the seed script) `io` is null and every helper is a no-op:
 * REST works the same with or without the realtime layer.
 *
 * Rooms:
 *   user:<userId> → every tab of that user (notifications)
 *   bug:<bugId>   → everyone looking at that bug right now (chat, live status)
 */

let io = null;

/** @param {import('socket.io').Server|null} server */
const setIo = (server) => {
  io = server;
};

const userRoom = (userId) => `user:${userId}`;
const bugRoom = (bugId) => `bug:${bugId}`;

/**
 * @param {Array<ObjectId|string>|ObjectId|string} userIds
 * @param {string} event
 * @param {Object} payload
 */
const emitToUsers = (userIds, event, payload) => {
  if (!io) return;
  [userIds].flat().forEach((userId) => io.to(userRoom(userId)).emit(event, payload));
};

/**
 * @param {ObjectId|string} bugId
 * @param {string} event
 * @param {Object} payload
 */
const emitToBug = (bugId, event, payload) => {
  if (!io) return;
  io.to(bugRoom(bugId)).emit(event, payload);
};

/**
 * Who has this bug open right now. They see new chat messages live, so they aren't notified.
 * @param {ObjectId|string} bugId
 * @returns {Promise<Set<string>>} user ids
 */
const getUserIdsViewingBug = async (bugId) => {
  if (!io) return new Set();
  const sockets = await io.in(bugRoom(bugId)).fetchSockets();
  return new Set(sockets.map((socket) => socket.data.userId));
};

/**
 * Drop every connection of a user. Used when their access changes (suspended, role changed,
 * removed from a project, deleted): rooms they joined earlier would otherwise keep streaming
 * data they may no longer see. The web app reconnects and re-joins only what it's still allowed.
 * @param {ObjectId|string} userId
 */
const disconnectUser = (userId) => {
  if (!io) return;
  io.in(userRoom(userId)).disconnectSockets(true);
  logger.debug(`Disconnected sockets of user ${userId}`);
};

export { setIo, userRoom, bugRoom, emitToUsers, emitToBug, getUserIdsViewingBug, disconnectUser };
