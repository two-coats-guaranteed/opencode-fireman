export function buildShortcutTable(shortcuts) {
  const dict = {};
  for (const shortcut of shortcuts) {
    dict[shortcut.name] = shortcut.value;
  }
  return dict;
}
