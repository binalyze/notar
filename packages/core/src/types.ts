export enum VerifyErrorCode {
  NO_SIGNATURES = "NO_SIGNATURES",
  MALFORMED_SIGNATURE = "MALFORMED_SIGNATURE",
  MISSING_KEY_ID = "MISSING_KEY_ID",
  SIGNATURE_MISMATCH = "SIGNATURE_MISMATCH",
  NO_MATCHING_SIGNATURE = "NO_MATCHING_SIGNATURE",
  KEY_NOT_FOUND = "KEY_NOT_FOUND",
  KEY_EXPIRED = "KEY_EXPIRED",
  KEY_REVOKED = "KEY_REVOKED",
  KEY_FETCH_FAILED = "KEY_FETCH_FAILED",
  MISSING_MANIFEST = "MISSING_MANIFEST",
  MISSING_FILE = "MISSING_FILE",
  HASH_MISMATCH = "HASH_MISMATCH",
  INVALID_FRONT_MATTER = "INVALID_FRONT_MATTER",
  NETWORK_ERROR = "NETWORK_ERROR",
  DNS_RESOLUTION_FAILED = "DNS_RESOLUTION_FAILED",
}

export interface SignatureEntry {
  keyId: string;
  publisher: string;
  value: string;
}

export interface FrontMatter {
  name: string;
  description: string;
  version: string;
  author?: string;
  signatures?: SignatureEntry[];
  [key: string]: unknown;
}

export interface PackageManifest {
  name: string;
  description: string;
  version: string;
  author: string;
  files: Record<string, string>;
  signatures?: SignatureEntry[];
}

export interface PackageMetadata {
  name: string;
  description: string;
  version: string;
  author: string;
  keyId?: string;
  publisher?: string;
}

export interface PublicKeyEntry {
  keyId: string;
  algorithm: "ed25519";
  publicKey: string;
  expires: string;
  revoked?: boolean;
}

export interface KeyManifest {
  keys: PublicKeyEntry[];
}

export interface SignerResult {
  keyId: string;
  publisher: string;
  valid: boolean;
  code?: VerifyErrorCode;
  reason?: string;
  keySource?: "https" | "dns";
  keyExpires?: string;
}

export interface FileIntegrityResult {
  path: string;
  valid: boolean;
  code?: VerifyErrorCode;
  expectedHash?: string;
  actualHash?: string;
}

export interface VerifyResult {
  valid: boolean;
  code?: VerifyErrorCode;
  reason?: string;
  details?: {
    name?: string;
    description?: string;
    version?: string;
    author?: string;
    signers?: SignerResult[];
    files?: FileIntegrityResult[];
  };
}

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface VerifyOptions {
  fetch?: typeof globalThis.fetch;
  now?: Date;
  resolveTxt?: boolean;
}

export interface DnsTxtKeyRecord {
  version: string;
  algorithm: string;
  publicKey: string;
  expires: number;
}

export interface SignFileOptions {
  keyId?: string;
  publisher?: string;
}

export interface ValidateSigningKeyOptions {
  fetch?: typeof globalThis.fetch;
  now?: Date;
}
