// Single layer/frame pixel grid. Project/File/Layer/Frame model arrives in later phases.
export function createCanvasModel(width, height) {
  return {
    width,
    height,
    pixels: new Array(width * height).fill(null), // null = transparent
  };
}

export function getPixel(model, x, y) {
  if (x < 0 || y < 0 || x >= model.width || y >= model.height) return null;
  return model.pixels[y * model.width + x];
}

export function setPixel(model, x, y, colorHex) {
  if (x < 0 || y < 0 || x >= model.width || y >= model.height) return;
  model.pixels[y * model.width + x] = colorHex;
}
