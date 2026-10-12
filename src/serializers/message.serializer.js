import userSerializer from './user.serializer.js';

/**
 * A chat message. A deleted message stays in the thread as a tombstone (deleted: true, body null),
 * so the conversation around it still makes sense.
 * @param {BugMessage} message - sender and mentions populated
 * @returns {Object}
 */
const messageItem = (message) => {
  const deleted = !!message.deletedAt;
  return {
    id: message.id,
    bugId: message.bug.toString(),
    sender: userSerializer.userRef(message.sender),
    body: deleted ? null : message.body,
    mentions: deleted ? [] : message.mentions.map(userSerializer.userRef),
    editedAt: message.editedAt,
    deleted,
    createdAt: message.createdAt,
  };
};

/**
 * @param {{ messages: BugMessage[], nextCursor: string|null }} page - messages oldest first
 * @returns {Object}
 */
const messagePage = ({ messages, nextCursor }) => ({ messages: messages.map(messageItem), nextCursor });

export default { messageItem, messagePage };
