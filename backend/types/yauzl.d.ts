declare module "yauzl" {
  interface ReadableEntry {
    destroy(): void;
    [Symbol.asyncIterator](): AsyncIterator<Uint8Array>;
  }

  export interface Entry {
    fileName: string;
    uncompressedSize: number;
    compressedSize: number;
    isEncrypted(): boolean;
  }

  export interface ZipFile {
    close(): void;
    eachEntry(): AsyncIterable<Entry>;
    openReadStreamPromise(entry: Entry): Promise<ReadableEntry>;
  }

  export function fromBufferPromise(buffer: Buffer, options?: object): Promise<ZipFile>;
  export function validateFileName(fileName: string): string | null;
}
