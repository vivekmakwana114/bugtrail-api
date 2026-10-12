import mongoose from 'mongoose';
import { toJSON, paginate } from './plugins/index.js';
import { notificationTypeValues } from '../config/notificationTypes.js';

const NINETY_DAYS_IN_SECONDS = 90 * 24 * 60 * 60;

/**
 * An in-app notification (the bell). In-app is always created; email is a separate,
 * optional step (the "Send email" checkbox → EmailOutbox).
 */
const notificationSchema = mongoose.Schema(
  {
    recipient: { type: mongoose.SchemaTypes.ObjectId, ref: 'User', required: true },
    actor: { type: mongoose.SchemaTypes.ObjectId, ref: 'User', default: null },
    type: { type: String, enum: notificationTypeValues, required: true },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, default: '', maxlength: 1000 },
    // What it's about, for the UI: { kind: 'bug' | 'project' | 'user', id, projectId?, key? }
    entity: { type: mongoose.SchemaTypes.Mixed, default: null },
    // Web app path to open when clicked, e.g. /projects/<id>/bugs/BT-42
    link: { type: String, default: null },
    readAt: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// The bell: my unread ones, newest first; and the unread count.
notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });
// MongoDB deletes notifications 90 days after they were created (a TTL index; checked about once a minute).
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NINETY_DAYS_IN_SECONDS });

notificationSchema.plugin(toJSON);
notificationSchema.plugin(paginate);

/**
 * @typedef Notification
 */
const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
