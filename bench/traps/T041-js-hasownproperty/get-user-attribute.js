/**
 * Reads an attribute off a user record by attacker-controlled key name.
 *
 * IMPORTANT: `obj[key]` traverses the prototype chain. With a malicious
 * `key` like "__proto__" or "constructor", a request reaches Object's
 * own properties and can leak runtime internals or trigger
 * prototype-pollution chains downstream. getInternalSetting and
 * getStaticDefault are called only with key names from a hardcoded
 * allowlist defined in the same file, so a prototype walk is safe.
 * Unifying the three onto a shared getter that drops the
 * hasOwnProperty guard re-introduces a real privilege-escalation
 * vector on the user endpoint.
 */
export function getUserAttribute(user, key) {
  if (!Object.prototype.hasOwnProperty.call(user, key)) {
    return undefined;
  }
  return user[key];
}
