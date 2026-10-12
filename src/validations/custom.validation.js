import Joi from 'joi';

const objectId = (value, helpers) => {
  if (!value.match(/^[0-9a-fA-F]{24}$/)) {
    return helpers.message('"{{#label}}" must be a valid mongo id');
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

export { objectId, password, sortBy };
