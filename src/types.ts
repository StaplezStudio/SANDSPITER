/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MetaplexMetadata {
  name: string;
  description: string;
  image: string;
}

export interface WalletState {
  publicKey: string | null;
  privateKey: string | null; // Base58 encoded string
  balanceSOL: number;
  isVirtual: boolean;
  isConnected: boolean;
  walletType?: string;
}

export interface MerkleTreeConfig {
  maxDepth: number;
  maxBufferSize: number;
  canopyDepth: number;
  activeTreeAddress: string | null;
  deployedChain?: string;
}

export interface ArweaveUploadResult {
  fileName: string;
  transactionId: string;
  metadataUrl: string;
  simulatedCostAR: string;
  simulatedCostUSD: string;
  fictionalArDriveCredentials?: {
    username: string;
    token: string;
  } | null;
}

export interface ArweaveUploadState {
  isUploading: boolean;
  transactionId: string | null;
  metadataUrl: string | null;
  simulatedCostAR: string | null;
  simulatedCostUSD: string | null;
  fictionalArDriveCredentials?: {
    username: string;
    token: string;
  } | null;
  history: ArweaveUploadResult[];
}

export interface RegistryPluginConfig {
  royaltiesEnabled: boolean;
  royaltyPercentage: number;
  creators: { address: string; share: number }[];
  attributesRegistryEnabled: boolean;
  authorityLockEnabled: boolean;
}

export interface ArDriveState {
  keyfile: string;
  isConnected: boolean;
  address?: string;
  balance?: string;
}

export interface SavedConfig {
  encryptedWalletKey: string | null;
  encryptedMetadata: string | null;
  rpcUrl: string;
  treeConfig: Omit<MerkleTreeConfig, "activeTreeAddress">;
  pin: string | null;
}
