// @ts-check

/**
 * @type {<T extends {}, K extends keyof T = keyof T>(o: T, propertyName: K) => o is T & Required<Pick<T, K>>}
 */
function hasIn(o, propertyName) {
  return propertyName in o;
}

module.exports = {
  hasIn,
};
