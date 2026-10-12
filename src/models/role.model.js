import mongoose from 'mongoose';
import { toJSON, paginate } from './plugins/index.js';
import { allPermissions, isValidPermission } from '../config/permissions.js';
import { ADMIN_ROLE_SLUG } from '../config/defaultRoles.js';

/**
 * Slugify a role name: "Team Lead" -> "team-lead"
 * @param {string} name
 * @returns {string}
 */
const toSlug = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const roleSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      maxlength: 50,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      // Valid only when already in canonical form, e.g. "team-lead" (not "Team Lead" or "-lead-").
      validate: {
        validator: (slug) => slug === toSlug(slug),
        message: 'Slug may contain only lowercase letters, numbers and single hyphens',
      },
    },
    description: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: (perms) => perms.every(isValidPermission),
        message: (props) => `Unknown permission in: ${props.value.filter((p) => !isValidPermission(p)).join(', ')}`,
      },
    },
    // System roles are protected from edits and deletion (only Admin today).
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

roleSchema.plugin(toJSON);
roleSchema.plugin(paginate);

roleSchema.statics.toSlug = toSlug;

/** @returns {boolean} */
roleSchema.methods.isAdmin = function () {
  return this.slug === ADMIN_ROLE_SLUG;
};

/**
 * The permissions this role actually grants. Admin always gets the full catalog,
 * so a permission added to the catalog later is granted to Admin without a migration.
 * @returns {string[]}
 */
roleSchema.methods.getPermissions = function () {
  return this.isAdmin() ? [...allPermissions] : [...new Set(this.permissions)];
};

roleSchema.pre('validate', function (next) {
  if (!this.slug && this.name) {
    this.slug = this.constructor.toSlug(this.name);
  }
  // Keep the stored list honest for Admin too, so a raw DB read never shows a partial Admin.
  if (this.isAdmin()) {
    this.permissions = [...allPermissions];
    this.isSystem = true;
  }
  next();
});

/**
 * @typedef Role
 */
const Role = mongoose.model('Role', roleSchema);

export default Role;
