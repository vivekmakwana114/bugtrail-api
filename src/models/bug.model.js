import mongoose from 'mongoose';
import { toJSON, paginate } from './plugins/index.js';
import { bugStatuses, bugStatusValues } from '../config/bugStatuses.js';

const attachmentSchema = mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 200, required: true },
    // Google Drive / Docs links only (checked in bug.validation.js). We store links, never files.
    url: { type: String, trim: true, maxlength: 2048, required: true },
  },
  { _id: false },
);

const bugSchema = mongoose.Schema(
  {
    project: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Project',
      required: true,
      immutable: true,
    },
    // Per-project sequence: with the project key it forms the bug key, BT-42.
    bugNumber: {
      type: Number,
      required: true,
      immutable: true,
    },

    /* ---------------- filled in by the reporter */
    title: { type: String, required: true, trim: true, maxlength: 200 },
    moduleName: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 10000, default: '' },
    attachments: { type: [attachmentSchema], default: [] },
    status: {
      type: String,
      enum: bugStatusValues,
      default: bugStatuses.REPORTED,
    },
    assignee: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      default: null,
    },

    /* ---------------- set by the system */
    reporter: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    // How many times QA sent it back (every move to `failed`).
    failCount: { type: Number, default: 0 },
    lastStatusChangedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null }, // last time it reached `resolved`
    passedAt: { type: Date, default: null }, // stops the age clock; cleared if reopened
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

// The ticket grid: one project, filtered by status.
bugSchema.index({ project: 1, status: 1 });
// "My tickets" and developer performance.
bugSchema.index({ assignee: 1, status: 1 });
// Bug keys are unique per project, and BT-42 lookups use this index.
bugSchema.index({ project: 1, bugNumber: 1 }, { unique: true });

bugSchema.plugin(toJSON);
bugSchema.plugin(paginate);

/**
 * Age in ms: from reported until passed, or until now while it's still open.
 * @param {Date} [now]
 * @returns {number}
 */
bugSchema.methods.getAgeMs = function (now = new Date()) {
  return (this.passedAt ?? now).getTime() - this.createdAt.getTime();
};

/**
 * @typedef Bug
 */
const Bug = mongoose.model('Bug', bugSchema);

export default Bug;
