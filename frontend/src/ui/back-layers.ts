// Dialogs register in visual order. Back closes the top layer, never a hidden one.
const layers: { id: symbol; close: () => void }[] = [];
export function registerBackLayer(close: () => void) {
  const entry = { id: Symbol(), close };
  layers.push(entry);
  return () => {
    const index = layers.indexOf(entry);
    if (index >= 0) layers.splice(index, 1);
  };
}
export function closeTopLayer() {
  const layer = layers.at(-1);
  if (!layer) return false;
  layer.close();
  return true;
}
