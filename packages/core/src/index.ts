export {
  VerifyErrorCode,
} from "./types.js";

export type {
  FrontMatter,
  PackageManifest,
  PackageMetadata,
  PublicKeyEntry,
  KeyManifest,
  VerifyResult,
  SignerResult,
  FileIntegrityResult,
  KeyPair,
  VerifyOptions,
  DnsTxtKeyRecord,
  SignatureEntry,
  SignFileOptions,
  ValidateSigningKeyOptions,
} from "./types.js";

export { generateKeyPair, derivePublicKey } from "./keys.js";
export { uint8ToBase64, base64ToUint8 } from "./utils.js";

// Unified API (preferred)
export { sign } from "./sign.js";
export { verify, verifyFromAuthor } from "./verify.js";

// Format-specific (use when you already know the input type)
export { signFile, signPackage, parseFile, buildSignablePayload, buildManifest, validateSigningKey } from "./sign.js";
export { verifyFile, verifyPackage } from "./verify.js";

// Key discovery & DNS
export {
  fetchPublicKey,
  fetchPublicKeys,
  parseDnsTxtRecord,
  formatDnsTxtRecord,
} from "./verify.js";

export {
  parse as parseFrontMatter,
  stringify as stringifyFrontMatter,
} from "./front-matter.js";
