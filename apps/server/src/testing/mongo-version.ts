/**
 * The `mongod` version `mongodb-memory-server` downloads.
 *
 * Left unpinned, the package resolves "the latest supported version" at install
 * time, so the same commit can be tested against a different server on two
 * machines and CI can break for a reason unrelated to the change. Pinning keeps
 * the integration suite reproducible, and matches the MongoDB major the
 * deployment targets.
 */
export const MONGO_MEMORY_SERVER_VERSION = '8.2.6';
