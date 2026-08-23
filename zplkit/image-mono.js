/* ZPL-Studio — image-mono: configurable RGBA image -> 1bpp monochrome
   pipeline (channel selection, optional Gaussian blur, levels, threshold,
   Floyd-Steinberg dithering, invert). Produces packed bits in the same
   MSB-first-per-byte convention gfa-codec.js's decode/encode already use, so
   the result is a drop-in {widthPx, heightPx, bytesPerRow, bytes}. */
(function (global) {
  'use strict';

  function grayscaleFromRGBA(imageData, channel) {
    const width = imageData.width, height = imageData.height, data = imageData.data;
    const gray = new Float32Array(width * height);
    for (let i = 0, p = 0; p < data.length; i++, p += 4) {
      const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3] / 255;
      // Flatten alpha onto a white background, matching the existing ^GF encoder.
      const or_ = 255 * (1 - a) + r * a;
      const og = 255 * (1 - a) + g * a;
      const ob = 255 * (1 - a) + b * a;
      let v;
      if (channel === 'red') v = or_;
      else if (channel === 'green') v = og;
      else if (channel === 'blue') v = ob;
      else if (channel === 'average') v = (or_ + og + ob) / 3;
      else v = 0.299 * or_ + 0.587 * og + 0.114 * ob; // luminance (default)
      gray[i] = v;
    }
    return gray;
  }

  // Separable Gaussian blur, kernel radius in whole pixels (0 = no-op).
  function gaussianBlur(gray, width, height, radius) {
    if (!radius || radius <= 0) return gray;
    const r = Math.floor(radius);
    const sigma = Math.max(0.6, r / 2);
    const size = r * 2 + 1;
    const kernel = new Float32Array(size);
    let sum = 0;
    for (let i = 0; i < size; i++) {
      const x = i - r;
      kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
      sum += kernel[i];
    }
    for (let i = 0; i < size; i++) kernel[i] /= sum;

    const tmp = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let acc = 0;
        for (let k = -r; k <= r; k++) {
          const xx = Math.min(width - 1, Math.max(0, x + k));
          acc += gray[y * width + xx] * kernel[k + r];
        }
        tmp[y * width + x] = acc;
      }
    }
    const out = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let acc = 0;
        for (let k = -r; k <= r; k++) {
          const yy = Math.min(height - 1, Math.max(0, y + k));
          acc += tmp[yy * width + x] * kernel[k + r];
        }
        out[y * width + x] = acc;
      }
    }
    return out;
  }

  // Levels: remap [blackPoint, whitePoint] -> [0, 255], clamped.
  function applyLevels(gray, blackPoint, whitePoint) {
    const range = Math.max(1, whitePoint - blackPoint);
    for (let i = 0; i < gray.length; i++) {
      gray[i] = Math.min(255, Math.max(0, (gray[i] - blackPoint) * 255 / range));
    }
    return gray;
  }

  function applyInvert(gray) {
    for (let i = 0; i < gray.length; i++) gray[i] = 255 - gray[i];
    return gray;
  }

  function packBits(width, height, isBlack) {
    const bytesPerRow = Math.ceil(width / 8);
    const bytes = new Uint8Array(bytesPerRow * height);
    for (let y = 0; y < height; y++) {
      const rowBase = y * bytesPerRow;
      for (let x = 0; x < width; x++) {
        if (isBlack(x, y)) {
          const byteIndex = rowBase + (x >> 3);
          const bitIndex = 7 - (x & 7);
          bytes[byteIndex] |= (1 << bitIndex);
        }
      }
    }
    return { bytes: bytes, bytesPerRow: bytesPerRow };
  }

  function thresholdFlat(gray, width, height, threshold) {
    return packBits(width, height, function (x, y) { return gray[y * width + x] < threshold; });
  }

  // Classic Floyd-Steinberg error diffusion (works on a copy of `gray` since
  // it distributes each pixel's quantization error into not-yet-visited
  // neighbors while scanning left-to-right, top-to-bottom).
  function ditherFloydSteinberg(gray, width, height, threshold) {
    const buf = Float32Array.from(gray);
    const black = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const old = buf[idx];
        const isBlack = old < threshold;
        black[idx] = isBlack ? 1 : 0;
        const err = old - (isBlack ? 0 : 255);
        if (x + 1 < width) buf[idx + 1] += err * 7 / 16;
        if (y + 1 < height) {
          if (x > 0) buf[idx + width - 1] += err * 3 / 16;
          buf[idx + width] += err * 5 / 16;
          if (x + 1 < width) buf[idx + width + 1] += err * 1 / 16;
        }
      }
    }
    return packBits(width, height, function (x, y) { return black[y * width + x] === 1; });
  }

  // opts: { channel: 'luminance'|'red'|'green'|'blue'|'average', blur: 0-8,
  //         blackPoint: 0-254, whitePoint: 1-255, threshold: 0-255,
  //         dither: 'none'|'floyd-steinberg', invert: boolean }
  function monochromize(imageData, opts) {
    opts = opts || {};
    const channel = opts.channel || 'luminance';
    const blur = opts.blur || 0;
    const blackPoint = opts.blackPoint != null ? opts.blackPoint : 0;
    const whitePoint = opts.whitePoint != null ? opts.whitePoint : 255;
    const threshold = opts.threshold != null ? opts.threshold : 128;
    const dither = opts.dither || 'none';
    const invert = !!opts.invert;

    const width = imageData.width, height = imageData.height;
    let gray = grayscaleFromRGBA(imageData, channel);
    gray = gaussianBlur(gray, width, height, blur);
    gray = applyLevels(gray, blackPoint, whitePoint);
    if (invert) gray = applyInvert(gray);

    const packed = dither === 'floyd-steinberg'
      ? ditherFloydSteinberg(gray, width, height, threshold)
      : thresholdFlat(gray, width, height, threshold);

    return { widthPx: width, heightPx: height, bytesPerRow: packed.bytesPerRow, bytes: packed.bytes };
  }

  global.ImageMono = { monochromize: monochromize };
})(typeof globalThis !== 'undefined' ? globalThis : this);
