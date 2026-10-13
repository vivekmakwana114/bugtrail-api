import { PROJECT_KEY_PATTERN } from '../models/project.model.js';

/*
 * A project can be referenced by its database id or by its key (BT, CHK). The web app puts the
 * key in its URLs (/projects/BT/bugs/BT-1) so database ids never show in the address bar; ids
 * still work, so old links (and old notifications) keep opening. Keys are unique and never
 * change, and are stored uppercase, so "bt" finds "BT".
 */

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * @param {string} ref
 * @returns {boolean} true for a 24-hex database id (a key is at most 10 characters)
 */
const isObjectIdRef = (ref) => OBJECT_ID.test(String(ref));

/**
 * @param {string} ref
 * @returns {boolean} true for a project key in any case ("bt", "BT", "Chk2")
 */
const isProjectKeyRef = (ref) => PROJECT_KEY_PATTERN.test(String(ref).toUpperCase());

/**
 * The Mongo filter for a project referenced by id or key.
 * @param {string} ref
 * @returns {Object}
 */
const projectRefFilter = (ref) => (isObjectIdRef(ref) ? { _id: ref } : { key: String(ref).toUpperCase() });

export { isObjectIdRef, isProjectKeyRef, projectRefFilter };
