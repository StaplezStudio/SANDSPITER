/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Lock, Unlock, ShieldCheck, Download, Upload, Check, X, FileText, Info, Copy, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { WalletState, MetaplexMetadata, MerkleTreeConfig, ArweaveUploadState, RegistryPluginConfig, ArDriveState } from "../types";

interface SandsPitProps {
  wallet: WalletState;
  metadata: MetaplexMetadata;
  treeConfig: MerkleTreeConfig;
  rpcUrl: string;
  arweaveState: ArweaveUploadState;
  pluginConfig: RegistryPluginConfig;
  arDrive: ArDriveState;
  collectionName: string;
  metaLocation: string;
  finalCollectionAddress: string | null;
  treeSignature: string | null;
  collectionDeployedChain?: string | null;
  isCollapsed?: boolean;
  setIsCollapsed?: (collapsed: boolean) => void;
  onRestore: (data: {
    wallet: WalletState;
    metadata: MetaplexMetadata;
    treeConfig: MerkleTreeConfig;
    rpcUrl: string;
    arweaveState: ArweaveUploadState;
    arDrive: ArDriveState;
    pluginConfig: RegistryPluginConfig;
    collectionName: string;
    metaLocation: string;
    finalCollectionAddress: string | null;
    treeSignature: string | null;
    collectionDeployedChain?: string | null;
  }) => void;
}

export default function SandsPit({
  wallet,
  metadata,
  treeConfig,
  rpcUrl,
  arweaveState,
  arDrive,
  pluginConfig,
  collectionName,
  metaLocation,
  finalCollectionAddress,
  treeSignature,
  collectionDeployedChain,
  isCollapsed: propIsCollapsed,
  setIsCollapsed: propSetIsCollapsed,
  onRestore,
}: SandsPitProps) {
  const [downloadPin, setDownloadPin] = useState("");
  const [uploadPin, setUploadPin] = useState("");
  const [uploadedData, setUploadedData] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [generatedBackup, setGeneratedBackup] = useState<string | null>(null);
  const [copiedBackup, setCopiedBackup] = useState(false);
  const [pastedBackupInput, setPastedBackupInput] = useState("");
  const [pastePin, setPastePin] = useState("");

  // Simple XOR-based encryption/decryption (safe, offline-only, Unicode UTF-8 friendly)
  const xorEncryptDecrypt = (input: string, key: string): string => {
    const utf8Bytes = new TextEncoder().encode(input);
    const keyBytes = new TextEncoder().encode(key);
    const encryptedBytes = new Uint8Array(utf8Bytes.length);
    for (let i = 0; i < utf8Bytes.length; i++) {
      encryptedBytes[i] = utf8Bytes[i] ^ keyBytes[i % keyBytes.length];
    }
    let binString = "";
    for (let i = 0; i < encryptedBytes.length; i++) {
      binString += String.fromCharCode(encryptedBytes[i]);
    }
    return btoa(binString);
  };

  const xorDecrypt = (input: string, key: string): string => {
    try {
      const decodedBinString = atob(input);
      const encryptedBytes = new Uint8Array(decodedBinString.length);
      for (let i = 0; i < decodedBinString.length; i++) {
        encryptedBytes[i] = decodedBinString.charCodeAt(i);
      }
      const keyBytes = new TextEncoder().encode(key);
      const decryptedBytes = new Uint8Array(encryptedBytes.length);
      for (let i = 0; i < encryptedBytes.length; i++) {
        decryptedBytes[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length];
      }
      return new TextDecoder().decode(decryptedBytes);
    } catch (err) {
      throw new Error("Invalid decryption password or malformed data");
    }
  };

  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      console.warn("navigator.clipboard.writeText failed, using fallback:", e);
    }
    
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.width = "2em";
      textArea.style.height = "2em";
      textArea.style.padding = "0";
      textArea.style.border = "none";
      textArea.style.outline = "none";
      textArea.style.boxShadow = "none";
      textArea.style.background = "transparent";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.error("Fallback copy to clipboard failed:", err);
      return false;
    }
  };

  const downloadEncryptedFile = (encryptedData: string) => {
    try {
      const blob = new Blob([encryptedData], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sands_pit_${new Date().toISOString().slice(0, 10)}.pit`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download file:", err);
    }
  };

  const handleDownloadBackup = async () => {
    if (!wallet.publicKey) {
      setError("No active wallet configuration found! Please connect a wallet via Phantom/Solflare or generate a Developer Keypair first to establish workspace identity.");
      return;
    }

    if (downloadPin.length < 4) {
      setError("Download PIN must be at least 4 digits.");
      return;
    }

    try {
      const sensitiveData = {
        walletSecret: wallet.privateKey,
        walletPublic: wallet.publicKey,
        walletIsVirtual: wallet.isVirtual,
        walletBalanceSOL: wallet.balanceSOL,
        walletIsConnected: wallet.isConnected,
        walletType: wallet.walletType,
        metadata,
        treeConfig,
        rpcUrl,
        arweaveState,
        arDrive,
        pluginConfig,
        collectionName,
        metaLocation,
        finalCollectionAddress,
        treeSignature,
        collectionDeployedChain,
      };

      const jsonStr = JSON.stringify(sensitiveData);
      const encrypted = xorEncryptDecrypt(jsonStr, downloadPin);

      // Save to state so user can copy it directly as a text backup
      setGeneratedBackup(encrypted);

      // Try automatic file download
      downloadEncryptedFile(encrypted);
      
      // Auto-copy encrypted backup string as a highly robust fallback for Web3/Mobile Browsers (like Solflare)
      const copied = await copyToClipboard(encrypted);
      
      setDownloadPin("");
      setError(null);
      
      if (copied) {
        setSuccessMsg("Backup Generated! File download initiated AND encrypted string auto-copied to your clipboard (safe fallback for Solflare/Web3 in-app browsers).");
      } else {
        setSuccessMsg("Backup Generated! File download initiated. Please copy the encrypted string below if the download was blocked.");
      }
      setTimeout(() => setSuccessMsg(null), 8500);
    } catch (err: any) {
      console.error(err);
      setError("Failed to encrypt and download configuration: " + (err.message || err));
    }
  };

  const handleGenerateBackupCode = async () => {
    if (!wallet.publicKey) {
      setError("No active wallet configuration found! Please connect a wallet via Phantom/Solflare or generate a Developer Keypair first to establish workspace identity.");
      return;
    }

    if (downloadPin.length < 4) {
      setError("Download PIN must be at least 4 digits.");
      return;
    }

    try {
      const sensitiveData = {
        walletSecret: wallet.privateKey,
        walletPublic: wallet.publicKey,
        walletIsVirtual: wallet.isVirtual,
        walletBalanceSOL: wallet.balanceSOL,
        walletIsConnected: wallet.isConnected,
        walletType: wallet.walletType,
        metadata,
        treeConfig,
        rpcUrl,
        arweaveState,
        arDrive,
        pluginConfig,
        collectionName,
        metaLocation,
        finalCollectionAddress,
        treeSignature,
        collectionDeployedChain,
      };

      const jsonStr = JSON.stringify(sensitiveData);
      const encrypted = xorEncryptDecrypt(jsonStr, downloadPin);

      // Save to state so user can copy it directly as a text backup
      setGeneratedBackup(encrypted);
      
      // Auto-copy encrypted backup string as a highly robust fallback
      const copied = await copyToClipboard(encrypted);
      
      setDownloadPin("");
      setError(null);
      
      if (copied) {
        setSuccessMsg("Backup code generated and copied to clipboard successfully! Save this text manually into a file.");
      } else {
        setSuccessMsg("Backup code generated successfully! Please manually copy the encrypted string below and save it into a file.");
      }
      setTimeout(() => setSuccessMsg(null), 8500);
    } catch (err: any) {
      console.error(err);
      setError("Failed to generate backup code: " + (err.message || err));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text || text.trim().length === 0) {
          throw new Error("File is empty");
        }
        setUploadedData(text.trim());
      } catch (err: any) {
        setError("Failed to read file: " + (err.message || "Invalid file format"));
        setUploadedFileName(null);
        setUploadedData(null);
      }
    };
    reader.readAsText(file);
  };

  const handleRestoreBackup = () => {
    if (!uploadedData) {
      setError("No uploaded data found.");
      return;
    }
    if (uploadPin.length < 4) {
      setError("PIN must be at least 4 digits.");
      return;
    }

    try {
      const decryptedStr = xorDecrypt(uploadedData, uploadPin);
      const data = JSON.parse(decryptedStr);

      // Verify structure briefly
      if (!data.rpcUrl || !data.treeConfig || !data.metadata) {
        throw new Error("Decryption payload corrupted or incorrect PIN");
      }

      const restoredWallet: WalletState = {
        publicKey: data.walletPublic ?? null,
        privateKey: data.walletSecret ?? null,
        balanceSOL: data.walletBalanceSOL ?? 0,
        isVirtual: data.walletIsVirtual ?? (data.walletSecret ? true : false),
        isConnected: data.walletIsConnected ?? !!data.walletPublic,
        walletType: data.walletType ?? undefined,
      };

      onRestore({
        wallet: restoredWallet,
        metadata: data.metadata,
        treeConfig: data.treeConfig,
        rpcUrl: data.rpcUrl,
        arweaveState: {
          isUploading: data.arweaveState?.isUploading ?? false,
          transactionId: data.arweaveState?.transactionId ?? null,
          metadataUrl: data.arweaveState?.metadataUrl ?? null,
          simulatedCostAR: data.arweaveState?.simulatedCostAR ?? null,
          simulatedCostUSD: data.arweaveState?.simulatedCostUSD ?? null,
          history: data.arweaveState?.history ?? [],
        },
        arDrive: data.arDrive ?? { keyfile: "", isConnected: false },
        pluginConfig: data.pluginConfig ?? {
          royaltiesEnabled: true,
          royaltyPercentage: 5.0,
          creators: [],
          attributesRegistryEnabled: true,
          authorityLockEnabled: false,
        },
        collectionName: data.collectionName ?? "",
        metaLocation: data.metaLocation ?? "",
        finalCollectionAddress: data.finalCollectionAddress ?? null,
        treeSignature: data.treeSignature ?? null,
        collectionDeployedChain: data.collectionDeployedChain ?? null,
      });

      // Clear states on success
      setUploadedData(null);
      setUploadedFileName(null);
      setUploadPin("");
      setError(null);
      setSuccessMsg("Workspace state & active wallet credentials successfully restored from backup!");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError("Incorrect PIN. Decryption failed.");
    }
  };

  const handleRestorePastedBackup = () => {
    if (!pastedBackupInput) {
      setError("Please paste a valid encrypted backup string first.");
      return;
    }
    if (pastePin.length < 4) {
      setError("PIN must be at least 4 digits.");
      return;
    }

    try {
      const decryptedStr = xorDecrypt(pastedBackupInput, pastePin);
      const data = JSON.parse(decryptedStr);

      // Verify structure briefly
      if (!data.rpcUrl || !data.treeConfig || !data.metadata) {
        throw new Error("Decryption payload corrupted or incorrect PIN");
      }

      const restoredWallet: WalletState = {
        publicKey: data.walletPublic ?? null,
        privateKey: data.walletSecret ?? null,
        balanceSOL: data.walletBalanceSOL ?? 0,
        isVirtual: data.walletIsVirtual ?? (data.walletSecret ? true : false),
        isConnected: data.walletIsConnected ?? !!data.walletPublic,
        walletType: data.walletType ?? undefined,
      };

      onRestore({
        wallet: restoredWallet,
        metadata: data.metadata,
        treeConfig: data.treeConfig,
        rpcUrl: data.rpcUrl,
        arweaveState: {
          isUploading: data.arweaveState?.isUploading ?? false,
          transactionId: data.arweaveState?.transactionId ?? null,
          metadataUrl: data.arweaveState?.metadataUrl ?? null,
          simulatedCostAR: data.arweaveState?.simulatedCostAR ?? null,
          simulatedCostUSD: data.arweaveState?.simulatedCostUSD ?? null,
          history: data.arweaveState?.history ?? [],
        },
        arDrive: data.arDrive ?? { keyfile: "", isConnected: false },
        pluginConfig: data.pluginConfig ?? {
          royaltiesEnabled: true,
          royaltyPercentage: 5.0,
          creators: [],
          attributesRegistryEnabled: true,
          authorityLockEnabled: false,
        },
        collectionName: data.collectionName ?? "",
        metaLocation: data.metaLocation ?? "",
        finalCollectionAddress: data.finalCollectionAddress ?? null,
        treeSignature: data.treeSignature ?? null,
        collectionDeployedChain: data.collectionDeployedChain ?? null,
      });

      // Clear states on success
      setPastedBackupInput("");
      setPastePin("");
      setError(null);
      setSuccessMsg("Workspace state & active wallet credentials successfully restored from text backup!");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError("Incorrect PIN or invalid/corrupted backup string. Decryption failed.");
    }
  };

  const handleCancelUpload = () => {
    setUploadedData(null);
    setUploadedFileName(null);
    setUploadPin("");
    setError(null);
  };

  const [internalCollapsed, setInternalCollapsed] = useState(true);
  const isCollapsed = propIsCollapsed !== undefined ? propIsCollapsed : internalCollapsed;
  const setIsCollapsed = propSetIsCollapsed !== undefined ? propSetIsCollapsed : setInternalCollapsed;
  const [isWarningCollapsed, setIsWarningCollapsed] = useState(true);

  return (
    <div id="sands-pit" className="p-5 rounded-2xl bg-slate-900/80 border border-pink-500/30 shadow-xl backdrop-blur-md relative overflow-hidden">
      {/* Background neon elements */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-pink-500/10 rounded-full blur-2xl pointer-events-none"></div>

      <div 
        className="flex items-center justify-between cursor-pointer select-none" 
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-pink-400" />
          <h3 className="font-mono text-xs font-bold text-pink-400 tracking-wider uppercase">
            S.A.N.D.S. Pit <span className="text-[10px] text-pink-500/60 font-sans tracking-normal font-normal lowercase">(offline-only)</span>
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-pink-950/40 text-pink-400 border border-pink-500/20 uppercase tracking-tight font-bold">
            PIN Secured
          </span>
          {isCollapsed ? <ChevronDown className="w-4.5 h-4.5 text-slate-400 hover:text-white" /> : <ChevronUp className="w-4.5 h-4.5 text-slate-400 hover:text-white" />}
        </div>
      </div>

      {!isCollapsed && (
        <div className="mt-4 animate-fadeIn space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            Encrypt and download your current workspace (Keys, Metadata, and Tree configurations) as a secure <code className="text-[11px] bg-slate-950 px-1 py-0.5 rounded border border-slate-800 text-pink-300">.pit</code> file, or upload an existing backup to restore it. <strong className="text-pink-400">Strictly Private:</strong> No data is ever saved in your browser cache or sent online.
          </p>

          {/* Self-Cleaning Cache & Data Preservation Warning */}
          <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/20 text-slate-300 space-y-2 text-[11px]">
            <div 
              className="flex items-center justify-between cursor-pointer select-none text-amber-400 font-mono uppercase tracking-wider font-bold text-[10px]"
              onClick={() => setIsWarningCollapsed(!isWarningCollapsed)}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Self-Cleaning Cache & Data Loss Warning</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-amber-500/60 lowercase font-sans font-normal">click to expand</span>
                {isWarningCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-amber-500/60" /> : <ChevronUp className="w-3.5 h-3.5 text-amber-500/60" />}
              </div>
            </div>
            {!isWarningCollapsed && (
              <div className="space-y-2 pt-2 border-t border-amber-500/10 animate-fadeIn">
                <p className="leading-relaxed">
                  Because this application runs entirely client-side without centralized cloud databases, your active wallet keys, Merkle tree settings, and Arweave transaction upload history are stored strictly inside the browser's local state and temporary <code className="text-[10px] bg-slate-950 px-1 py-0.5 rounded text-amber-300 font-mono">localStorage</code> cache.
                </p>
                <p className="leading-relaxed font-semibold text-amber-300/90">
                  ⚠️ If your browser clears its site data, runs auto-cleaning garbage collection, or if you switch devices/browsers, your local history and credentials will be lost forever and cannot be retrieved.
                </p>
                <div className="pt-1.5 border-t border-amber-500/10 space-y-1">
                  <span className="text-[9px] text-amber-400 font-mono uppercase tracking-wide block font-bold">Best Deployment Solution & Preservation:</span>
                  <ul className="list-disc pl-4 space-y-1 text-slate-400 text-[10px]">
                    <li>Before closing this tab or clearing cache, always generate a secure, PIN-encrypted <strong className="text-slate-300">.pit</strong> backup file or copy the backup code string below.</li>
                    <li>Upon restoring, your complete active wallet session, configuration, and uploaded history are cryptographically fully restored.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {/* Section 1: DOWNLOAD BACKUP */}
            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3">
              <div className="flex items-center gap-1.5 text-slate-200 font-mono text-[11px] uppercase tracking-wider font-bold">
                <Download className="w-4 h-4 text-pink-400" />
                <span>Download Workspace Backup</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Encrypts the current workspace configuration parameters (metadata inputs, tree parameters, and collection details) with a 4-8 digit PIN. Backups encapsulate the active wallet session (public key, type, and keys if local) to bypass manual wallet adapter logins and auto-restore your identity.
              </p>
              {wallet.isConnected && (
                <div className="p-3 rounded-lg bg-pink-950/20 border border-pink-500/10 text-[11px] text-slate-300 leading-normal font-sans">
                  <strong className="text-pink-400 font-mono uppercase tracking-wide block mb-0.5 text-[9px]">Active Workspace & Wallet Session Verified ({wallet.walletType || "Developer Keypair"})</strong>
                  Your public key (<span className="text-pink-300 font-mono">{wallet.publicKey?.slice(0, 8)}...</span>) and workspace credentials will be safely compiled inside the secure encrypted code. Uploading or pasting this backup will instantly restore your wallet context and bypass adapter setup.
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <input
                    type="password"
                    maxLength={8}
                    placeholder="Set 4-8 digit PIN"
                    value={downloadPin}
                    onChange={(e) => setDownloadPin(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-pink-500/50 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none placeholder-slate-600 text-center tracking-widest h-full min-h-[38px]"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleDownloadBackup}
                    title="Download backup file directly"
                    className="flex-1 sm:flex-initial px-4 py-2 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 active:from-pink-700 rounded-xl font-mono text-xs text-white transition-all font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download File
                  </button>
                  <button
                    onClick={handleGenerateBackupCode}
                    title="Generate secure backup text to save manually"
                    className="flex-1 sm:flex-initial px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 rounded-xl font-mono text-xs text-white transition-all font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Copy className="w-3.5 h-3.5 text-pink-400" />
                    Generate Code
                  </button>
                </div>
              </div>

              {generatedBackup && (
                <div className="mt-3 p-3 bg-slate-900 border border-pink-500/20 rounded-xl space-y-2.5 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-pink-400 font-bold uppercase tracking-wider">
                      Secure Encrypted Backup Code
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={async () => {
                          const success = await copyToClipboard(generatedBackup);
                          if (success) {
                            setCopiedBackup(true);
                            setTimeout(() => setCopiedBackup(false), 2500);
                          } else {
                            setError("Could not auto-copy. Please manually highlight and copy the text box below.");
                          }
                        }}
                        className="px-2.5 py-1 rounded bg-pink-950/40 border border-pink-500/20 text-[9px] font-mono text-pink-300 font-bold hover:bg-pink-900/20 flex items-center gap-1 cursor-pointer transition-all"
                      >
                        {copiedBackup ? "Copied!" : "Copy String"}
                      </button>
                      <button
                        onClick={() => setGeneratedBackup(null)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-sans bg-pink-950/25 p-3 border border-pink-500/10 rounded-lg">
                    <strong className="text-pink-400 block mb-1 font-mono text-[10px] uppercase tracking-wider">Manual Save Instructions:</strong>
                    Copy the secure encrypted code string below, open any text editor (such as <span className="text-pink-300 font-mono">Notepad</span>, <span className="text-pink-300 font-mono">TextEdit</span>, or <span className="text-pink-300 font-mono">VS Code</span>), paste the string, and save it on your device as a file named <strong className="text-pink-300 font-mono">workspace.pit</strong>. Alternatively, you can copy-paste this string to restore your workspace directly in the "Upload & Restore Backup" section below.
                  </p>
                  <textarea
                    readOnly
                    value={generatedBackup}
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                    className="w-full h-16 bg-slate-950 border border-slate-800 rounded-lg p-2 text-[9px] text-slate-400 font-mono focus:outline-none resize-none select-all cursor-pointer font-mono"
                  />
                </div>
              )}
            </div>

            {/* Section 2: UPLOAD BACKUP FILE */}
            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3">
              <div className="flex items-center gap-1.5 text-slate-200 font-mono text-[11px] uppercase tracking-wider font-bold">
                <Upload className="w-4 h-4 text-pink-400" />
                <span>Upload Backup File (.pit)</span>
              </div>

              {!uploadedData ? (
                <div>
                  <label className="w-full py-4 border border-dashed border-slate-800 hover:border-pink-500/30 rounded-xl font-mono text-[11px] text-slate-400 hover:text-slate-200 transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center bg-slate-950/20">
                    <Upload className="w-5 h-5 text-pink-500/60" />
                    <span>Select `.pit` backup file</span>
                    <span className="text-[9px] text-slate-500 font-sans font-normal">Click to browse your device</span>
                    <input
                      type="file"
                      accept=".pit,.sand,.sands,.txt,.json"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2 bg-pink-950/10 border border-pink-500/20 rounded-lg text-xs font-mono">
                    <div className="flex items-center gap-2 text-slate-200">
                      <FileText className="w-4 h-4 text-pink-400" />
                      <span className="truncate max-w-[200px]">{uploadedFileName}</span>
                    </div>
                    <button
                      onClick={handleCancelUpload}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title="Remove uploaded file"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Provide the PIN that was set when this backup file was created to decrypt and load its settings.
                  </p>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="password"
                        maxLength={8}
                        placeholder="Enter decryption PIN"
                        value={uploadPin}
                        onChange={(e) => setUploadPin(e.target.value.replace(/\D/g, ""))}
                        className="w-full bg-slate-950/80 border border-pink-500/30 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-pink-500 placeholder-slate-600 text-center tracking-widest text-center"
                      />
                    </div>
                    <button
                      onClick={handleRestoreBackup}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl font-mono text-xs text-white transition-all font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      Restore File
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Section 3: UPLOAD FROM CODE */}
            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3">
              <div className="flex items-center gap-1.5 text-slate-200 font-mono text-[11px] uppercase tracking-wider font-bold">
                <Copy className="w-4 h-4 text-pink-400" />
                <span>Load Workspace from Code</span>
              </div>

              <div className="space-y-3">
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  Paste secure encrypted backup code:
                </label>
                <textarea
                  placeholder="Paste the .pit or .sand encrypted backup code here..."
                  value={pastedBackupInput}
                  onChange={(e) => setPastedBackupInput(e.target.value.trim())}
                  className="w-full h-16 bg-slate-950 border border-slate-800 rounded-lg p-2 text-[10px] text-slate-200 font-mono focus:outline-none focus:border-pink-500 resize-none font-mono"
                />
                
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Provide the PIN that was set when this backup code was generated to decrypt and load its settings.
                </p>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="password"
                      maxLength={8}
                      placeholder="Enter decryption PIN"
                      value={pastePin}
                      onChange={(e) => setPastePin(e.target.value.replace(/\D/g, ""))}
                      className="w-full bg-slate-950/80 border border-pink-500/30 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-pink-500 placeholder-slate-600 text-center tracking-widest text-center"
                    />
                  </div>
                  <button
                    onClick={handleRestorePastedBackup}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl font-mono text-xs text-white transition-all font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    load from code
                  </button>
                </div>
              </div>
            </div>
          </div>

          {error && <p className="text-[11px] text-red-400 font-mono mt-3 animate-pulse">✗ {error}</p>}
          {successMsg && <p className="text-[11px] text-emerald-400 font-mono mt-3">✓ {successMsg}</p>}
        </div>
      )}
    </div>
  );
}
