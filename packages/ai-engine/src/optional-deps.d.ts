/**
 * Ambient declarations for optional peer dependencies.
 * These prevent TypeScript errors when the packages aren't installed.
 * At runtime, the adapters use dynamic imports with proper error handling.
 */

declare module 'onnxruntime-node' {
  export class InferenceSession {
    static create(path: string, options?: any): Promise<InferenceSession>;
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>;
    release(): void;
  }
  export class Tensor {
    constructor(type: string, data: Float32Array | number[], dims: number[]);
    data: Float32Array | number[];
    dims: number[];
  }
}

declare module 'sharp' {
  interface Sharp {
    resize(width: number, height: number, options?: any): Sharp;
    removeAlpha(): Sharp;
    raw(): Sharp;
    toBuffer(): Promise<Buffer>;
    metadata(): Promise<{ width?: number; height?: number }>;
  }
  function sharp(path: string): Sharp;
  export default sharp;
}

declare module 'expo-image-manipulator' {
  export enum SaveFormat {
    JPEG = 'jpeg',
    PNG = 'png',
    RAW = 'raw',
  }
  export function manipulateAsync(
    uri: string,
    actions: any[],
    options?: any,
  ): Promise<{ uri: string; base64?: string; width: number; height: number }>;
}

declare module 'expo-file-system' {
  export enum EncodingType {
    Base64 = 'base64',
    UTF8 = 'utf8',
  }
  export function readAsStringAsync(
    uri: string,
    options?: { encoding?: EncodingType },
  ): Promise<string>;
}
