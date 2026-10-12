import mongoose from 'mongoose';
import { bugActivityTypes } from '../config/bugStatuses.js';

/**
 * Append-only audit trail of a bug. Never updated or deleted.
 * It powers the ticket timeline, time spent in each status, and (Phase 6) developer performance.
 *
 *   created         to: initial status
 *   status_changed  from / to: statuses
 *   assigned        from / to: user ids (or null)
 *   updated         fields: which fields changed (not their values: descriptions can be long)
 *   deleted         -
 */
const bugActivitySchema = mongoose.Schema(
  {
    bug: { type: mongoose.SchemaTypes.ObjectId, ref: 'Bug', required: true },
    // Copied from the bug so per-project reports don't need a join.
    project: { type: mongoose.SchemaTypes.ObjectId, ref: 'Project', required: true },
    actor: { type: mongoose.SchemaTypes.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(bugActivityTypes), required: true },
    from: { type: mongoose.SchemaTypes.Mixed, default: null },
    to: { type: mongoose.SchemaTypes.Mixed, default: null },
    fields: { type: [String], default: undefined },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// A bug's timeline, oldest first.
bugActivitySchema.index({ bug: 1, createdAt: 1 });
// Dashboard reports per project and period.
bugActivitySchema.index({ project: 1, type: 1, createdAt: 1 });

/**
 * @typedef BugActivity
 */
const BugActivity = mongoose.model('BugActivity', bugActivitySchema);

export default BugActivity;
