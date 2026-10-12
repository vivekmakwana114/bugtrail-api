import mongoose from 'mongoose';

/**
 * A chat message on a bug. Saved through REST first, then broadcast over Socket.IO,
 * so the database is always the source of truth and a reconnecting client never misses one.
 */
const bugMessageSchema = mongoose.Schema(
  {
    bug: { type: mongoose.SchemaTypes.ObjectId, ref: 'Bug', required: true, immutable: true },
    // Copied from the bug: scope checks and per-project cleanup without a join.
    project: { type: mongoose.SchemaTypes.ObjectId, ref: 'Project', required: true, immutable: true },
    sender: { type: mongoose.SchemaTypes.ObjectId, ref: 'User', required: true, immutable: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    // Project members @mentioned in the message (they get a "mentioned" notification).
    mentions: { type: [{ type: mongoose.SchemaTypes.ObjectId, ref: 'User' }], default: [] },
    editedAt: { type: Date, default: null },
    // Soft delete: the message stays in the thread as "message deleted", so replies keep their context.
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

// Loading a thread page by page: newest first, before a cursor (_id is time-ordered).
bugMessageSchema.index({ bug: 1, _id: -1 });

/**
 * @typedef BugMessage
 */
const BugMessage = mongoose.model('BugMessage', bugMessageSchema);

export default BugMessage;
