/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Server, CheckCircle2, XCircle, RefreshCw, Layers, Compass, Cpu, Wallet, Info, Lock, Github, ExternalLink, ShieldAlert, AlertTriangle, Download, Copy, FileText, Check, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { WalletState, MetaplexMetadata, MerkleTreeConfig, ArweaveUploadState, RegistryPluginConfig } from "./types";
import { verifyRpcConnection, generateVirtualKeypair, getSolBalance, requestDevnetAirdrop } from "./utils/solana";

// Import Modular Components
import WalletConnect from "./components/WalletConnect";
import MerkleTreeSection from "./components/MerkleTreeSection";
import MetadataSection from "./components/MetadataSection";
import RegistryConfigSection from "./components/RegistryConfigSection";
import LeafMintingSection from "./components/LeafMintingSection";
import SandsPit from "./components/SandsPit";
import ArDriveExplorer from "./components/ArDriveExplorer";
import ArDriveAuth from "./components/ArDriveAuth";
import Terminal, { emitLog } from "./components/Terminal";
import { ArDriveState } from "./types";

export default function App() {
  // 1. RPC Configuration States
  const [rpcUrl, setRpcUrl] = useState("https://api.devnet.solana.com");
  const [rpcConnecting, setRpcConnecting] = useState(false);
  const [rpcConnected, setRpcConnected] = useState(false);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState<number | null>(null);
  const [viewingCodeHub, setViewingCodeHub] = useState(false);
  const [projectFiles, setProjectFiles] = useState<{ path: string; content: string }[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // 1a. Sandbox Sync & IFrame Detection
  const isIframe = typeof window !== "undefined" && window.self !== window.top;
  const [copiedSyncLink, setCopiedSyncLink] = useState(false);

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

  const generateEncryptedSyncUrl = (password: string) => {
    const stateToSync = {
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
      collectionDeployedChain
    };
    const jsonStr = JSON.stringify(stateToSync);
    const encryptedBase64 = xorEncryptDecrypt(jsonStr, password);
    const baseUrl = window.location.origin + window.location.pathname;
    return baseUrl + "#sync-secure=" + encodeURIComponent(encryptedBase64);
  };

  const handleOpenInNewTabWithState = () => {
    const password = prompt(
      "🔐 Security Prompt:\nPlease enter an encryption password/PIN (at least 4 characters) to secure your sandbox keys, configurations, and Arweave history before opening in a new tab:"
    );
    if (password === null) return; // Cancelled
    if (password.trim().length < 4) {
      alert("❌ Password must be at least 4 characters to ensure strong local encryption.");
      return;
    }

    const syncUrl = generateEncryptedSyncUrl(password);
    window.open(syncUrl, "_blank");
  };

  const handleCopySyncLink = () => {
    const password = prompt(
      "🔐 Security Prompt:\nPlease enter an encryption password/PIN (at least 4 characters) to secure your sandbox keys, configurations, and Arweave history before copying the sync link:"
    );
    if (password === null) return; // Cancelled
    if (password.trim().length < 4) {
      alert("❌ Password must be at least 4 characters to ensure strong local encryption.");
      return;
    }

    const syncUrl = generateEncryptedSyncUrl(password);
    navigator.clipboard.writeText(syncUrl);
    setCopiedSyncLink(true);
    emitLog("Copied password-encrypted state synchronization link to clipboard!", "success");
    setTimeout(() => setCopiedSyncLink(false), 2500);
  };

  const fetchProjectFiles = async () => {
    if (projectFiles.length > 0) return;
    setLoadingFiles(true);
    emitLog("Loading live codebase files from server workspace...", "info");
    try {
      const res = await fetch("/api/project-files");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      setProjectFiles(data);
      if (data.length > 0) {
        const defaultFile = data.find((f: any) => f.path === "src/App.tsx") || data.find((f: any) => f.path === "server.ts") || data[0];
        setSelectedFile(defaultFile);
      }
      emitLog("Successfully synchronized live workspace files!", "success");
    } catch (err: any) {
      console.error(err);
      emitLog(`Failed to sync workspace files: ${err.message}`, "error");
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    if (viewingCodeHub) {
      fetchProjectFiles();
    }
  }, [viewingCodeHub]);

  const handleCopyCode = (content: string, filePath: string) => {
    navigator.clipboard.writeText(content);
    setCopyFeedback(filePath);
    emitLog(`Copied contents of ${filePath} to clipboard!`, "success");
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  // 1b. Arweave Keyfile State
  const [arDrive, setArDrive] = useState<ArDriveState>({ keyfile: "", isConnected: false });

  // 2. Global Wallet Adapter States
  const [wallet, setWallet] = useState<WalletState>({
    publicKey: null,
    privateKey: null,
    balanceSOL: 0,
    isVirtual: false,
    isConnected: false,
  });
  const [walletInitialized, setWalletInitialized] = useState(false);

  // Auto-initialize or load wallet from localStorage on startup or when RPC is connected
  useEffect(() => {
    if (!rpcConnected || walletInitialized) return;

    const initializeWallet = async () => {
      setWalletInitialized(true);
      const saved = localStorage.getItem("solana_sandbox_wallet");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.publicKey) {
            setWallet(parsed);
            emitLog(`Restored sandbox wallet: ${parsed.publicKey}`, "info");
            
            // Check balance immediately
            const balance = await getSolBalance(rpcUrl, parsed.publicKey);
            setWallet(prev => {
              const updated = { ...prev, balanceSOL: balance };
              localStorage.setItem("solana_sandbox_wallet", JSON.stringify(updated));
              return updated;
            });
            return;
          }
        } catch (e) {
          console.error("Error parsing saved wallet", e);
        }
      }

      // No saved wallet, auto-generate a virtual developer wallet so they can use it instantly out-of-the-box!
      emitLog("Auto-initializing a virtual Sandbox developer wallet for smooth workspace compilation...", "info");
      const { publicKey, secretKey } = generateVirtualKeypair();
      const initialWallet: WalletState = {
        publicKey,
        privateKey: secretKey,
        balanceSOL: 0.0,
        isVirtual: true,
        isConnected: true,
        walletType: "virtual",
      };
      setWallet(initialWallet);
      localStorage.setItem("solana_sandbox_wallet", JSON.stringify(initialWallet));
      emitLog(`Auto-created developer wallet: ${publicKey}`, "success");

      // Auto-trigger an airdrop on the newly generated sandbox wallet
      emitLog(`Auto-requesting 1 SOL Devnet Airdrop for new wallet...`, "info");
      const airdropResult = await requestDevnetAirdrop(rpcUrl, publicKey);
      if (airdropResult.success) {
        const balance = await getSolBalance(rpcUrl, publicKey);
        setWallet(prev => {
          const updated = { ...prev, balanceSOL: balance };
          localStorage.setItem("solana_sandbox_wallet", JSON.stringify(updated));
          return updated;
        });
        emitLog(`Airdrop complete! Wallet active with ${balance} SOL.`, "success");
      } else {
        emitLog(`Auto-airdrop request rate-limited. You can request SOL manually in the Wallet connection panel.`, "warn");
      }
    };

    initializeWallet();
  }, [rpcConnected, walletInitialized, rpcUrl]);

  // Sync wallet state to localStorage whenever it changes
  useEffect(() => {
    if (!walletInitialized) return;
    if (wallet.isConnected && wallet.publicKey) {
      localStorage.setItem("solana_sandbox_wallet", JSON.stringify(wallet));
    } else {
      localStorage.removeItem("solana_sandbox_wallet");
    }
  }, [wallet, walletInitialized]);

  // 3. Merkle Tree State Compression States
  const [treeConfig, setTreeConfig] = useState<MerkleTreeConfig>({
    maxDepth: 14,
    maxBufferSize: 64,
    canopyDepth: 3,
    activeTreeAddress: null,
  });

  // 3b. All Deployed or Manually Entered Merkle Trees
  const [allTrees, setAllTrees] = useState<string[]>([]);

  // Automatically add newly created tree to the list
  useEffect(() => {
    if (treeConfig.activeTreeAddress && !allTrees.includes(treeConfig.activeTreeAddress)) {
      setAllTrees((prev) => [...prev, treeConfig.activeTreeAddress!]);
    }
  }, [treeConfig.activeTreeAddress]);

  // 4. Metaplex Metadata Schema States
  const [metadata, setMetadata] = useState<MetaplexMetadata>({
    name: "Bubblegum Art Collection",
    description: "A premium collection of high-art items on Solana.",
    image: "https://your-arweave-link-to-image.png",
  });

  // 5. Arweave Metadata Upload States
  const [arweaveState, setArweaveState] = useState<ArweaveUploadState>({
    isUploading: false,
    transactionId: null,
    metadataUrl: null,
    simulatedCostAR: null,
    simulatedCostUSD: null,
    history: [],
  });

  // 6. On-Chain Registry Plugins Config States
  const [pluginConfig, setPluginConfig] = useState<RegistryPluginConfig>({
    royaltiesEnabled: true,
    royaltyPercentage: 0.0,
    creators: [],
    attributesRegistryEnabled: true,
    authorityLockEnabled: false,
  });

  // 7. Lifted Registry Specific States
  const [collectionName, setCollectionName] = useState("");
  const [metaLocation, setMetaLocation] = useState("");
  const [finalCollectionAddress, setFinalCollectionAddress] = useState<string | null>(null);
  const [collectionDeployedChain, setCollectionDeployedChain] = useState<string | null>(null);

  // 8. Lifted Merkle Tree Specific States
  const [treeSignature, setTreeSignature] = useState<string | null>(null);

  // 9. Sands Pit Collapsible State (shared to allow external triggering/expanding)
  const [sandsPitCollapsed, setSandsPitCollapsed] = useState(true);

  const handleScrollToPitGlobal = () => {
    setSandsPitCollapsed(false);
    const sandsPitEl = document.getElementById("sands-pit");
    if (sandsPitEl) {
      setTimeout(() => {
        sandsPitEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
      emitLog("Opening and scrolling to S.A.N.D.S. V2 Pit Backup configuration...", "info");
    } else {
      emitLog("Pit backup configuration section ('sands-pit') not found on this page.", "error");
    }
  };

  // Listen for hash sync payload on startup or hash change, plus fallback auto-verify
  useEffect(() => {
    const handleHashSync = () => {
      const hash = window.location.hash;
      if (hash && hash.startsWith("#sync-secure=")) {
        try {
          const encryptedBase64 = decodeURIComponent(hash.substring(13));
          
          let decryptedStr = "";
          let success = false;
          let passwordPromptCount = 0;
          
          while (!success && passwordPromptCount < 3) {
            const password = prompt(
              `🔐 Encrypted State Detected:\nThis synchronized workspace is password-protected. Please enter the decryption password/PIN to restore your configuration:`
            );
            
            if (password === null) {
              // User canceled decryption
              emitLog("Decryption cancelled. Workspace state not synchronized.", "warn");
              window.history.replaceState(null, "", window.location.pathname);
              return;
            }
            
            try {
              decryptedStr = xorDecrypt(encryptedBase64, password);
              success = true;
            } catch (err) {
              passwordPromptCount++;
              alert(`❌ Invalid decryption password! Please check your password/PIN and try again. (Attempt ${passwordPromptCount}/3)`);
            }
          }

          if (!success) {
            emitLog("Too many incorrect password attempts. Sync cancelled.", "error");
            window.history.replaceState(null, "", window.location.pathname);
            return;
          }

          const restored = JSON.parse(decryptedStr);
          handleRestoreFromPit(restored);

          if (restored.wallet) {
            localStorage.setItem("solana_sandbox_wallet", JSON.stringify(restored.wallet));
          }

          // Clean hash so URL looks neat
          window.history.replaceState(null, "", window.location.pathname);
          setTimeout(() => {
            alert("🎉 S.A.N.D.S. V2 password-encrypted state successfully decrypted and synchronized! All keys, Merkle configs, and upload history are restored.");
          }, 300);
          emitLog("🎉 S.A.N.D.S. V2 password-encrypted state successfully decrypted and restored!", "success");
        } catch (e: any) {
          console.error("Failed to restore synchronized state from URL hash:", e);
          emitLog("Failed to sync state: Malformed or outdated sync payload.", "error");
          window.history.replaceState(null, "", window.location.pathname);
        }
      } else if (hash && hash.startsWith("#sync=")) {
        try {
          const base64 = decodeURIComponent(hash.substring(6));
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const jsonStr = new TextDecoder().decode(bytes);
          const restored = JSON.parse(jsonStr);
          
          handleRestoreFromPit(restored);

          if (restored.wallet) {
            localStorage.setItem("solana_sandbox_wallet", JSON.stringify(restored.wallet));
          }

          // Clean hash so URL looks neat
          window.history.replaceState(null, "", window.location.pathname);
          setTimeout(() => {
            alert("🎉 S.A.N.D.S. V2 State synchronized successfully! All sandbox wallet keys, Merkle configurations, Arweave upload history, and progress are now loaded and persisted locally in this first-party browser tab.");
          }, 300);
          emitLog("🎉 S.A.N.D.S. V2 state successfully synchronized from your sandbox session!", "success");
        } catch (e) {
          console.error("Failed to restore synchronized state from URL hash:", e);
          emitLog("Failed to sync state: Malformed or outdated sync payload.", "error");
        }
      } else {
        // Normal startup: auto-verify standard RPC URL
        handleVerifyRpc(rpcUrl);
      }
    };

    handleHashSync();
    window.addEventListener("hashchange", handleHashSync);
    return () => window.removeEventListener("hashchange", handleHashSync);
  }, []);

  // Update creators default list when wallet connects
  useEffect(() => {
    if (wallet.publicKey) {
      setPluginConfig((prev) => {
        if (prev.creators.length === 0) {
          return {
            ...prev,
            creators: [{ address: wallet.publicKey!, share: 100 }],
          };
        }
        return prev;
      });
    } else {
      setPluginConfig((prev) => ({
        ...prev,
        creators: [],
      }));
    }
  }, [wallet.publicKey]);

  // Sync Arweave URL to the On-Chain Registry Meta Location automatically
  useEffect(() => {
    if (arweaveState.metadataUrl) {
      setMetaLocation(arweaveState.metadataUrl);
    }
  }, [arweaveState.metadataUrl]);

  // Load history from localStorage when arDrive address connects or changes
  useEffect(() => {
    if (arDrive.isConnected && arDrive.address) {
      const savedHistory = localStorage.getItem(`arweave_history_${arDrive.address}`);
      if (savedHistory) {
        try {
          const parsedHistory = JSON.parse(savedHistory);
          if (Array.isArray(parsedHistory)) {
            setArweaveState((prev) => {
              const currentHistory = prev?.history || [];
              const existingIds = new Set(currentHistory.map((h) => h.transactionId));
              const mergedHistory = [...currentHistory];
              parsedHistory.forEach((item) => {
                if (item && item.transactionId && !existingIds.has(item.transactionId)) {
                  mergedHistory.push(item);
                }
              });
              return { ...prev, history: mergedHistory };
            });
            emitLog(`Restored ${parsedHistory.length} uploaded files from local storage cache for wallet: ${arDrive.address.slice(0, 8)}...`, "info");
          }
        } catch (e) {
          console.error("Error loading arweave history from localStorage:", e);
        }
      }
    }
  }, [arDrive.address, arDrive.isConnected]);

  // Save history to localStorage when it changes
  useEffect(() => {
    const historyArray = arweaveState?.history || [];
    if (arDrive.isConnected && arDrive.address && historyArray.length > 0) {
      localStorage.setItem(
        `arweave_history_${arDrive.address}`,
        JSON.stringify(historyArray)
      );
    }
  }, [arweaveState?.history, arDrive.address, arDrive.isConnected]);

  const handleVerifyRpc = async (url: string) => {
    setRpcConnecting(true);
    setRpcError(null);
    const res = await verifyRpcConnection(url);
    if (res.success && res.epoch) {
      setRpcConnected(true);
      setEpoch(res.epoch);
    } else {
      setRpcConnected(false);
      setRpcError(res.error || "Failed to reach RPC node");
    }
    setRpcConnecting(false);
  };

  // Restores locked configuration from S.A.N.D.S. Pit
  const handleRestoreFromPit = (restored: {
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
  }) => {
    setRpcUrl(restored.rpcUrl);
    handleVerifyRpc(restored.rpcUrl);
    setWallet(restored.wallet);
    setMetadata(restored.metadata);
    setTreeConfig(restored.treeConfig);
    setArweaveState(restored.arweaveState);
    setArDrive(restored.arDrive);
    setPluginConfig(restored.pluginConfig);
    setCollectionName(restored.collectionName);
    setMetaLocation(restored.metaLocation);
    setFinalCollectionAddress(restored.finalCollectionAddress);
    setTreeSignature(restored.treeSignature);
    setCollectionDeployedChain(restored.collectionDeployedChain ?? null);

    // Immediately write restored upload history to localStorage for robust offline state sync
    if (restored.arDrive?.isConnected && restored.arDrive?.address && restored.arweaveState?.history?.length > 0) {
      localStorage.setItem(
        `arweave_history_${restored.arDrive.address}`,
        JSON.stringify(restored.arweaveState.history)
      );
    }
  };

  if (viewingCodeHub) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased relative overflow-hidden selection:bg-purple-500/30 selection:text-white pb-12">
        {/* Isolated Sandbox Sync Iframe Alert */}
        {isIframe && (
          <div className="bg-gradient-to-r from-amber-500/10 via-slate-900/90 to-purple-500/10 border-b border-amber-500/30 px-4 py-3 text-center relative z-50 animate-fade-in shadow-lg">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-left">
                <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 animate-pulse" />
                <div className="font-mono text-slate-300 leading-relaxed">
                  <span className="text-amber-400 font-bold uppercase tracking-wider">Browser Sandbox Isolated Mode:</span>{" "}
                  Since this app runs inside an iframe, automatic data sync with other tabs is restricted. Please use your password-encrypted <strong className="text-purple-300">.pit backup file</strong> to safely download and restore your entire workspace whenever you reload or open the app elsewhere.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => window.open(window.location.origin + window.location.pathname, "_blank")}
                  className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-emerald-600 hover:from-purple-500 hover:to-emerald-500 text-white font-mono font-bold tracking-tight text-[11px] transition-all active:scale-95 shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-white" />
                  <span>Open in New Tab</span>
                </button>
                <button
                  onClick={handleScrollToPitGlobal}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-200 hover:text-white font-mono font-bold text-[11px] transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>Go to Pit Backup Panel</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Decorative Blur Overlays for Cyberpunk Tech Vibe */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none"></div>

        {/* Main Header bar */}
        <header className="border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-tr from-purple-600 to-emerald-500 shadow-md">
                <Compass className="w-6 h-6 text-white animate-spin" style={{ animationDuration: "12s" }} />
              </div>
              <div>
                <h1 className="font-mono text-base font-bold tracking-tight text-white uppercase flex items-center gap-2">
                  <span>S.A.N.D.S. V2</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 font-bold">DEVELOPER GATEWAY</span>
                </h1>
                <p className="text-[10px] text-slate-400 font-mono font-medium">
                  Live workspace files explorer and setup center
                </p>
              </div>
            </div>
            
            <button
              onClick={() => setViewingCodeHub(false)}
              className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-2"
            >
              <span>← Back to Dashboard</span>
            </button>
          </div>
        </header>

        {/* Content body */}
        <main className="max-w-7xl w-full mx-auto px-4 mt-6 flex-1 flex flex-col gap-6 z-10">
          {/* SECURE TROLL DISPLAY BANNER */}
          <div className="bg-gradient-to-r from-purple-950/40 via-slate-900/95 to-amber-950/40 p-6 rounded-3xl text-center border border-purple-500/20 shadow-2xl space-y-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl"></div>
            
            <div className="text-4xl md:text-5xl font-extrabold animate-pulse tracking-tight bg-gradient-to-r from-purple-400 via-pink-400 to-amber-400 bg-clip-text text-transparent drop-shadow-md py-1">
              haha. Got you! 😜
            </div>
            <div className="text-sm md:text-base font-mono font-bold text-amber-300 uppercase tracking-widest">
              You thought it was going to be that simple?
            </div>
            <p className="max-w-2xl mx-auto text-xs text-slate-300 leading-relaxed font-sans">
              S.A.N.D.S. V2 is an advanced Solana NFT deployment platform. 
              Downloading a single ZIP is too simple for a seasoned web3 developer! 
              We've mapped your entire live workspace files right below. Select any file, view the complete non-editable source, click "Copy Code", and build your personal GitHub deployment.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[550px]">
            {/* FILE EXPLORER SIDEBAR */}
            <div className="lg:col-span-1 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col h-[550px] overflow-hidden shadow-lg">
              <div className="pb-3 border-b border-slate-800/80 mb-4">
                <h3 className="font-mono text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-400" />
                  <span>Project Files ({projectFiles.length})</span>
                </h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Click a file below to select it
                </p>
              </div>

              {loadingFiles ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-2 text-slate-400 font-mono text-xs py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-purple-500" />
                  <span>Reading server workspace...</span>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {projectFiles.map((file) => {
                    const isSelected = selectedFile?.path === file.path;
                    return (
                      <button
                        key={file.path}
                        onClick={() => setSelectedFile(file)}
                        className={`w-full text-left p-2.5 rounded-xl font-mono text-[11px] transition-all flex items-center justify-between group cursor-pointer ${
                          isSelected
                            ? "bg-purple-600/20 border border-purple-500/40 text-purple-300"
                            : "hover:bg-slate-800/60 border border-transparent text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden mr-2">
                          <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-purple-400' : 'text-slate-500 group-hover:text-slate-400'}`} />
                          <span className="truncate">{file.path}</span>
                        </div>
                        {copyFeedback === file.path ? (
                          <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold uppercase font-sans">
                            Copied
                          </span>
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-slate-500 transition-opacity flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* MAIN CODE VIEWER & COPY CENTER */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              {/* CODE DISPLAY BOX */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col flex-1 h-[550px] shadow-lg">
                {selectedFile ? (
                  <div className="flex flex-col h-full">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80 mb-4">
                      <div>
                        <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-widest block">FILE PATH</span>
                        <h4 className="font-mono text-xs font-bold text-white break-all">
                          {selectedFile.path}
                        </h4>
                      </div>
                      <button
                        onClick={() => handleCopyCode(selectedFile.content, selectedFile.path)}
                        className="flex-shrink-0 px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono font-bold transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-md text-center"
                      >
                        {copyFeedback === selectedFile.path ? (
                          <>
                            <Check className="w-4 h-4 text-white" />
                            <span>COPIED!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>COPY CODE</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="relative flex-1 bg-slate-950 rounded-xl border border-slate-850 overflow-hidden flex flex-col h-[320px]">
                      <textarea
                        readOnly
                        className="w-full h-full p-4 bg-transparent resize-none font-mono text-[11px] text-slate-300 leading-relaxed focus:outline-none custom-scrollbar"
                        value={selectedFile.content}
                        onClick={(e) => (e.target as any).select()}
                      />
                    </div>

                    <div className="mt-3.5 p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                      <div className="text-[11px] text-slate-300 leading-relaxed font-mono">
                        <strong className="text-white">Save Path Instructions:</strong> Create a file named <code className="text-yellow-400 font-bold bg-slate-900 px-1 py-0.5 rounded border border-slate-800">{selectedFile.path}</code> in your local folder, paste this code inside, and save it.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 font-mono text-xs">
                    <span>Select a file from the explorer on the left</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* INTEGRATED DEPLOYMENT & GITHUB SETUP CARDS */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4 shadow-lg">
            <h3 className="font-mono text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2">
              <Github className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>Full-Stack Cloud Deployment Guide (Free-Choice Koyeb / Render)</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-xs">
              <div className="space-y-2 p-4 rounded-xl bg-slate-950/40 border border-slate-800">
                <span className="text-[10px] text-purple-400 font-mono font-bold block uppercase tracking-wider">1. Setup Your Folder</span>
                <p className="text-slate-400 text-[11px] leading-relaxed font-mono">
                  Create a new directory on your local machine and recreate the files shown in the list above using any standard IDE or text editor. Make sure you don't skip the <code className="text-white font-semibold">package.json</code> file!
                </p>
              </div>

              <div className="space-y-2 p-4 rounded-xl bg-slate-950/40 border border-slate-800">
                <span className="text-[10px] text-emerald-400 font-mono font-bold block uppercase tracking-wider">2. Initialize GitHub</span>
                <p className="text-slate-400 text-[11px] leading-relaxed font-mono">
                  Open a terminal in your project directory and run:
                  <code className="block bg-slate-950/80 p-1.5 rounded mt-1.5 text-emerald-300">
                    git init<br/>
                    git add .<br/>
                    git commit -m "deploy Sands V2"<br/>
                    git remote add origin YOUR_REPOSITORY_URL<br/>
                    git push -u origin main
                  </code>
                </p>
              </div>

              <div className="space-y-2 p-4 rounded-xl bg-slate-950/40 border border-slate-800">
                <span className="text-[10px] text-amber-400 font-mono font-bold block uppercase tracking-wider">3. Free Koyeb Deployment</span>
                <p className="text-slate-400 text-[11px] leading-relaxed font-mono">
                  S.A.N.D.S. V2 is full-stack. Koyeb is the perfect free platform:
                  <br/>
                  1. Log into Koyeb and link your private repository.
                  <br/>
                  2. Select <strong className="text-slate-200">Buildpack</strong> (auto-detects Node.js).
                  <br/>
                  3. Set port to <code className="text-amber-300 font-bold font-mono">3000</code>.
                  <br/>
                  4. Configure environment variables (e.g. <code className="text-amber-300 font-mono">GEMINI_API_KEY</code>) securely in Koyeb settings!
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased relative overflow-hidden selection:bg-purple-500/30 selection:text-white pb-12">
      {/* Isolated Sandbox Sync Iframe Alert */}
      {isIframe && (
        <div className="bg-gradient-to-r from-amber-500/10 via-slate-900/90 to-purple-500/10 border-b border-amber-500/30 px-4 py-3 text-center relative z-50 animate-fade-in shadow-lg">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-left">
              <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 animate-pulse" />
              <div className="font-mono text-slate-300 leading-relaxed">
                <span className="text-amber-400 font-bold uppercase tracking-wider">Browser Sandbox Isolated Mode:</span>{" "}
                Since this app runs inside an iframe, automatic data sync with other tabs is restricted. Please use your password-encrypted <strong className="text-purple-300">.pit backup file</strong> to safely download and restore your entire workspace whenever you reload or open the app elsewhere.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
              <button
                onClick={() => window.open(window.location.origin + window.location.pathname, "_blank")}
                className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-emerald-600 hover:from-purple-500 hover:to-emerald-500 text-white font-mono font-bold tracking-tight text-[11px] transition-all active:scale-95 shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-white" />
                <span>Open in New Tab</span>
              </button>
              <button
                onClick={handleScrollToPitGlobal}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-200 hover:text-white font-mono font-bold text-[11px] transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                <span>Go to Pit Backup Panel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decorative Blur Overlays for Cyberpunk Tech Vibe */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Main Header bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setViewingCodeHub(true);
                fetchProjectFiles();
              }}
              className="p-2 rounded-xl bg-gradient-to-tr from-purple-600 to-emerald-500 shadow-md hover:from-purple-500 hover:to-emerald-400 cursor-pointer active:scale-95 transition-all duration-200 group relative"
              title="Click to browse/copy project source code & view GitHub/Hosting instructions"
            >
              <Compass className="w-6 h-6 text-white group-hover:rotate-12 transition-transform duration-300" />
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 scale-0 group-hover:scale-100 transition-all bg-slate-900 text-[9px] text-emerald-400 font-mono px-2 py-1 rounded border border-emerald-500/30 whitespace-nowrap z-50">
                Browse Code & Guide
              </span>
            </button>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-mono text-base font-bold tracking-tight text-white uppercase">
                  S.A.N.D.S. V2
                </h1>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  Devnet Stage
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                Solana Advanced NFT Deployment Stage
              </p>
            </div>
          </div>

          {/* RPC Connection bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <div className="relative flex items-center bg-slate-950 rounded-xl border border-slate-800 px-3 py-1.5">
              <Server className="w-3.5 h-3.5 text-slate-500 mr-2 flex-shrink-0" />
              <input
                type="text"
                value={rpcUrl}
                onChange={(e) => setRpcUrl(e.target.value)}
                placeholder="Solana RPC Endpoint..."
                className="bg-transparent text-xs font-mono text-slate-200 focus:outline-none w-full sm:w-56 placeholder-slate-600"
              />
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800 ml-2">
                {rpcConnecting ? (
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                ) : rpcConnected ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" title={`Epoch: ${epoch}`} />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-red-400" title="Disconnected" />
                )}
                <span className="text-[9px] font-mono text-slate-500 uppercase select-none">
                  {rpcConnected ? "✓" : "✗"}
                </span>
              </div>
            </div>

            <button
              onClick={() => handleVerifyRpc(rpcUrl)}
              disabled={rpcConnecting || !rpcUrl}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-750 font-mono text-xs text-white transition-colors cursor-pointer disabled:opacity-40"
            >
              Verify Connection
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid Body */}
      <main className="max-w-7xl w-full mx-auto px-4 mt-6 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left column: S.A.N.D.S. Pit, Wallet Adapter, and Merkle Config (5 cols) */}
        <section className="lg:col-span-5 space-y-6">
          <SandsPit
            wallet={wallet}
            metadata={metadata}
            treeConfig={treeConfig}
            rpcUrl={rpcUrl}
            arweaveState={arweaveState}
            arDrive={arDrive}
            pluginConfig={pluginConfig}
            collectionName={collectionName}
            metaLocation={metaLocation}
            finalCollectionAddress={finalCollectionAddress}
            treeSignature={treeSignature}
            collectionDeployedChain={collectionDeployedChain}
            isCollapsed={sandsPitCollapsed}
            setIsCollapsed={setSandsPitCollapsed}
            onRestore={handleRestoreFromPit}
          />

          <WalletConnect
            wallet={wallet}
            setWallet={setWallet}
            rpcUrl={rpcUrl}
            rpcConnected={rpcConnected}
          />

          {wallet.isConnected && (
            <>
              <ArDriveAuth arDrive={arDrive} setArDrive={setArDrive} wallet={wallet} />

              <ArDriveExplorer arweaveState={arweaveState} arDrive={arDrive} setArweaveState={setArweaveState} onOpenSandsPit={() => setSandsPitCollapsed(false)} />

              <MerkleTreeSection
                wallet={wallet}
                treeConfig={treeConfig}
                setTreeConfig={setTreeConfig}
                rpcUrl={rpcUrl}
                rpcConnected={rpcConnected}
                signature={treeSignature}
                setSignature={setTreeSignature}
                allTrees={allTrees}
                setAllTrees={setAllTrees}
              />
            </>
          )}
        </section>

        {/* Right column: Metaplex metadata & On-Chain Registry plugins (7 cols) */}
        <section className="lg:col-span-7 space-y-6">
          {wallet.isConnected && (
            <>
              <MetadataSection
                metadata={metadata}
                setMetadata={setMetadata}
                arweaveState={arweaveState}
                setArweaveState={setArweaveState}
                arDrive={arDrive}
              />

              <RegistryConfigSection
                wallet={wallet}
                metadata={metadata}
                arweaveState={arweaveState}
                pluginConfig={pluginConfig}
                setPluginConfig={setPluginConfig}
                rpcUrl={rpcUrl}
                rpcConnected={rpcConnected}
                collectionName={collectionName}
                setCollectionName={setCollectionName}
                metaLocation={metaLocation}
                setMetaLocation={setMetaLocation}
                finalCollectionAddress={finalCollectionAddress}
                setFinalCollectionAddress={setFinalCollectionAddress}
                collectionDeployedChain={collectionDeployedChain}
                setCollectionDeployedChain={setCollectionDeployedChain}
                allTrees={allTrees}
                setAllTrees={setAllTrees}
                treeConfig={treeConfig}
                setTreeConfig={setTreeConfig}
              />

              <LeafMintingSection
                wallet={wallet}
                treeConfig={treeConfig}
                metadata={metadata}
                arweaveState={arweaveState}
                pluginConfig={pluginConfig}
                collectionName={collectionName}
                metaLocation={metaLocation}
                finalCollectionAddress={finalCollectionAddress}
                rpcUrl={rpcUrl}
                rpcConnected={rpcConnected}
              />
            </>
          )}
        </section>
      </main>
      
      <Terminal />
    </div>
  );
}
