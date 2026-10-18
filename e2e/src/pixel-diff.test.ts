import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { diffScreenshots } from "./pixel-diff";

function solid(width: number, height: number, rgb: [number, number, number], paint?: (png: PNG) => void) {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i += 1) {
    png.data[i * 4] = rgb[0];
    png.data[i * 4 + 1] = rgb[1];
    png.data[i * 4 + 2] = rgb[2];
    png.data[i * 4 + 3] = 255;
  }
  paint?.(png);
  return PNG.sync.write(png);
}

describe("截图像素对比", () => {
  it("完全相同的图差异为 0", () => {
    const a = solid(20, 10, [240, 238, 232]);
    const result = diffScreenshots(a, Buffer.from(a));
    expect(result).toMatchObject({ sameSize: true, diffPixels: 0, diffRatio: 0 });
  });

  it("能数出改变的像素", () => {
    const a = solid(20, 10, [255, 255, 255]);
    const b = solid(20, 10, [255, 255, 255], (png) => {
      for (const index of [0, 1, 2]) {
        png.data[index * 4] = 0;
        png.data[index * 4 + 1] = 0;
        png.data[index * 4 + 2] = 0;
      }
    });
    const result = diffScreenshots(a, b);
    expect(result.diffPixels).toBe(3);
    expect(result.diffRatio).toBeCloseTo(3 / 200);
    expect(result.diffPng).not.toBeNull();
  });

  it("尺寸不同直接判为完全不一致", () => {
    const result = diffScreenshots(solid(20, 10, [0, 0, 0]), solid(20, 11, [0, 0, 0]));
    expect(result).toMatchObject({ sameSize: false, diffRatio: 1, diffPng: null });
  });
});
