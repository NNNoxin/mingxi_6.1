import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export interface PixelDiff {
  width: number;
  height: number;
  /** 尺寸不同时无法逐像素比较，直接判为不一致。 */
  sameSize: boolean;
  diffPixels: number;
  diffRatio: number;
  /** 差异可视化（红色为不同像素）；尺寸不同时为 null。 */
  diffPng: Buffer | null;
}

/**
 * 逐像素比较两张截图。threshold 是 pixelmatch 的单像素颜色容差（0–1），
 * 用来吸收字体抗锯齿的细微差别；是否“一致”由调用方按 diffRatio 判断。
 */
export function diffScreenshots(expected: Buffer, actual: Buffer, threshold = 0.1): PixelDiff {
  const a = PNG.sync.read(expected);
  const b = PNG.sync.read(actual);
  if (a.width !== b.width || a.height !== b.height) {
    return {
      width: b.width,
      height: b.height,
      sameSize: false,
      diffPixels: b.width * b.height,
      diffRatio: 1,
      diffPng: null,
    };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold });
  return {
    width: a.width,
    height: a.height,
    sameSize: true,
    diffPixels,
    diffRatio: diffPixels / (a.width * a.height),
    diffPng: PNG.sync.write(diff),
  };
}
