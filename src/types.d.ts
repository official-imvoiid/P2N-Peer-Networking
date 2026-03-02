declare module '@noble/hashes/sha2' {
    export function sha256(msg: Uint8Array | string): Uint8Array;
}

declare module 'argon2-browser' {
    export const ArgonType: { Argon2id: number };
    export function hash(options: any): Promise<{ hash: Uint8Array; hashHex: string; encoded: string }>;
}
