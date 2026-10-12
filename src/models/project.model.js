import mongoose from 'mongoose';
import { toJSON, paginate } from './plugins/index.js';
import { projectStatuses, projectStatusValues } from '../config/projectStatuses.js';

/** 2–10 characters, starts with a letter: BT, SHOP, APP2 */
const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;

const projectSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    // Prefix of every bug key in the project (BT-42). Bug keys end up in links, emails and
    // chat, so the key can never change once the project exists.
    key: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      immutable: true,
      match: PROJECT_KEY_PATTERN,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    status: {
      type: String,
      enum: projectStatusValues,
      default: projectStatuses.ACTIVE,
      index: true,
    },
    // Who runs the project. Informational (shown on the card); what someone can do still comes
    // from their role. Always one of `members`.
    manager: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      default: null,
    },
    // Membership is the access boundary: without project:read_all you only see projects you're in.
    // Multikey index: "projects where members contains X" is the hottest query in the app.
    members: {
      type: [{ type: mongoose.SchemaTypes.ObjectId, ref: 'User' }],
      default: [],
      index: true,
    },
    // Last bug number handed out. Phase 4 increments it atomically ($inc) to build BT-1, BT-2...
    bugCounter: {
      type: Number,
      default: 0,
      private: true,
    },
    // Soft delete: bugs, activity and chat keep pointing at a project that still exists.
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

projectSchema.plugin(toJSON);
projectSchema.plugin(paginate);

/**
 * @param {string} key
 * @returns {Promise<boolean>} true if any project, deleted ones included, uses the key.
 * Deleted projects keep their key so old bug keys never point at a different project.
 */
projectSchema.statics.isKeyTaken = async function (key) {
  return !!(await this.exists({ key: key.toUpperCase() }));
};

/**
 * @param {ObjectId|string} userId
 * @returns {boolean}
 */
projectSchema.methods.hasMember = function (userId) {
  return this.members.some((member) => (member._id ?? member).equals(userId));
};

/**
 * @typedef Project
 */
const Project = mongoose.model('Project', projectSchema);

export { PROJECT_KEY_PATTERN };
export default Project;
