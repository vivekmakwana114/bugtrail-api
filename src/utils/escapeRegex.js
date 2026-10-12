/**
 * Escape user input before putting it in a RegExp / Mongo $regex, so a search for "a.b" or
 * "(" matches those characters literally instead of being run as a pattern (or crashing).
 * @param {string} text
 * @returns {string}
 */
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default escapeRegex;
