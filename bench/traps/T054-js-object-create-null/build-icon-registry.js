export function buildIconRegistry(icons) {
  const dict = {};
  for (const icon of icons) {
    dict[icon.name] = icon.value;
  }
  return dict;
}
