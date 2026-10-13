import Joi from 'joi';
import { isObjectIdRef, isProjectKeyRef } from '../utils/projectRef.js';

const objectId = (value, helpers) => {
  if (!value.match(/^[0-9a-fA-F]{24}$/)) {
    return helpers.message('{{#label}} must be a valid mongo id');
  }
  return value;
};

/** A project's database id or its key (BT, CHK), in any case. See utils/projectRef.js. */
const projectRef = (value, helpers) => {
  if (!isObjectIdRef(value) && !isProjectKeyRef(value)) {
    return helpers.message('{{#label}} must be a project id or key');
  }
  return value;
};

const password = (value, helpers) => {
  if (value.length < 8) {
    return helpers.message('password must be at least 8 characters');
  }
  if (!value.match(/\d/) || !value.match(/[a-zA-Z]/)) {
    return helpers.message('password must contain at least 1 letter and 1 number');
  }
  return value;
};

/**
 * sortBy=field:asc|desc[,field:asc|desc], limited to the given fields. An open sortBy lets a caller
 * order rows by any field, including ones they can't read (sorting users by password hash leaks
 * information about the hashes), and sorting on unindexed fields is a cheap way to load the DB.
 * @param {string[]} fields
 * @returns {Joi.StringSchema}
 */
const sortBy = (fields) => {
  const one = `(${fields.join('|')}):(asc|desc)`;
  // Fields are fixed identifiers from our own code, never user input.
  // eslint-disable-next-line security/detect-non-literal-regexp
  return Joi.string().pattern(new RegExp(`^${one}(,${one})*$`), {
    name: `field:asc|desc, field one of ${fields.join(', ')}`,
  });
};

const DRIVE_HOSTS = ['drive.google.com', 'docs.google.com'];

/**
 * Attachments are Google Drive / Docs links only: BugTrail stores links, never files.
 * Parsed with URL (not a regex) so "https://drive.google.com.evil.com" or
 * "https://evil.com/?drive.google.com" don't slip through.
 */
const driveUrl = (value, helpers) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    return helpers.message('{{#label}} must be a valid URL');
  }
  if (url.protocol !== 'https:' || !DRIVE_HOSTS.includes(url.hostname)) {
    return helpers.message('{{#label}} must be a Google Drive link (https://drive.google.com/... or docs.google.com)');
  }
  return value;
};

export { objectId, projectRef, password, sortBy, driveUrl };
