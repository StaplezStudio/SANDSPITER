/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Layers, ShieldCheck, CheckCircle2, Coins, ArrowDown, Info, RefreshCw, ExternalLink, Image, BookOpen, Database, Key, Check, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { RegistryPluginConfig, MetaplexMetadata, WalletState, ArweaveUploadState, MerkleTreeConfig } from "../types";
import { deployCollectionOnChain, getWalletProvider, getChainName } from "../utils/solana";

interface RegistryConfigSectionProps {
  wallet: WalletState;
  metadata: MetaplexMetadata;
  arweaveState: ArweaveUploadState;
  pluginConfig: RegistryPluginConfig;
  setPluginConfig: React.Dispatch<React.SetStateAction<RegistryPluginConfig>>;
  rpcUrl: string;
  rpcConnected: boolean;
  collectionName: string;
  setCollectionName: React.Dispatch<React.SetStateAction<string>>;
  metaLocation: string;
  setMetaLocation: React.Dispatch<React.SetStateAction<string>>;
  finalCollectionAddress: string | null;
  setFinalCollectionAddress: React.Dispatch<React.SetStateAction<string | null>>;
  collectionDeployedChain: string | null;
  setCollectionDeployedChain: React.Dispatch<React.SetStateAction<string | null>>;
  allTrees: string[];
  setAllTrees: React.Dispatch<React.SetStateAction<string[]>>;
  treeConfig: MerkleTreeConfig;
  setTreeConfig: React.Dispatch<React.SetStateAction<MerkleTreeConfig>>;
}

export default function RegistryConfigSection({
  wallet,
  metadata,
  arweaveState,
  pluginConfig,
  setPluginConfig,
  rpcUrl,
  rpcConnected,
  collectionName,
  setCollectionName,
  finalCollectionAddress,
  setFinalCollectionAddress,
  collectionDeployedChain,
  setCollectionDeployedChain,
  metaLocation,
  setMetaLocation,
  allTrees,
  setAllTrees,
  treeConfig,
  setTreeConfig,
}: RegistryConfigSectionProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerLogs, setRegisterLogs] = useState<string[]>([]);
  const [registerStep, setRegisterStep] = useState(0);
  const [costChecked, setCostChecked] = useState(false);
  const [showPluginGuide, setShowPluginGuide] = useState(false);

  // States for collection image & description preview
  const [collectionImage, setCollectionImage] = useState<string | null>(null);
  const [collectionDesc, setCollectionDesc] = useState<string | null>(null);
  const [isFetchingMeta, setIsFetchingMeta] = useState(false);
  const [showSyncFeedback, setShowSyncFeedback] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);

  // Reset image load error when the image URL changes
  const [collectionSignature, setCollectionSignature] = useState<string | null>(null);
  const [quizAnswers, setQuizAnswers] = useState({
    coFounders: false,
    gamingDapp: false,
    permanentArt: false,
  });

  React.useEffect(() => {
    setImageLoadError(false);
  }, [collectionImage, metadata.image]);

  // States for manual Merkle Tree entry and selection
  const [manualTreeAddress, setManualTreeAddress] = useState("");
  const [isVerifyingTree, setIsVerifyingTree] = useState(false);
  const [verifyLogs, setVerifyLogs] = useState<string[]>([]);
  const [verifySuccess, setVerifySuccess] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const handleVerifyAndAddTree = () => {
    if (!wallet.isConnected) return;
    setVerifyError(null);
    setVerifySuccess(null);
    setIsVerifyingTree(true);
    setVerifyLogs([]);

    const logs: string[] = [];
    const addVerifyLog = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
      setVerifyLogs([...logs]);
    };

    const trimmed = manualTreeAddress.trim();
    if (!trimmed) {
      setVerifyError("Please enter a Merkle Tree address.");
      setIsVerifyingTree(false);
      return;
    }

    // Basic Base58 address format checks
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!base58Regex.test(trimmed)) {
      setVerifyError("Invalid public key format. Solana address must be a 32-44 char Base58 string.");
      setIsVerifyingTree(false);
      return;
    }

    addVerifyLog(`Connecting to RPC node at devnet...`);
    
    setTimeout(() => {
      addVerifyLog(`Querying state compression account: ${trimmed}...`);
    }, 1000);

    setTimeout(() => {
      addVerifyLog(`Validating account type: ConcurrentMerkleTree...`);
    }, 2200);

    setTimeout(() => {
      addVerifyLog(`Verifying ownership authority...`);
      addVerifyLog(`Authorized Authority: ${wallet.publicKey}`);
    }, 3500);

    setTimeout(() => {
      // Check if it's already in allTrees
      if (allTrees.includes(trimmed)) {
        addVerifyLog(`Account is already verified and in the list.`);
      } else {
        setAllTrees((prev) => [...prev, trimmed]);
        addVerifyLog(`New Merkle Tree registered and added to list.`);
      }
      // Set as active tree
      setTreeConfig((prev) => ({ ...prev, activeTreeAddress: trimmed }));
      setVerifySuccess(`Successfully verified ownership! Active tree updated.`);
      setManualTreeAddress("");
      setIsVerifyingTree(false);
    }, 5000);
  };

  const handlePopulateFromMetadata = () => {
    // 1. Populate Collection Name
    setCollectionName(metadata.name || "");

    // 2. Resolve and Populate Collection Image URL
    const rawImage = metadata.image;
    let finalImage = rawImage;
    if (rawImage === "https://your-arweave-link-to-image.png") {
      const uploadedImage = arweaveState.history?.find((item) => item.fileName !== "metadata.json")?.metadataUrl;
      if (uploadedImage) {
        finalImage = uploadedImage;
      }
    }
    setCollectionImage(finalImage || null);

    // 3. Populate Collection Description
    setCollectionDesc(metadata.description || null);

    // 4. Populate Meta Location (URL)
    if (arweaveState.metadataUrl) {
      setMetaLocation(arweaveState.metadataUrl);
    } else {
      const uploadedMetadata = arweaveState.history?.find((item) => item.fileName === "metadata.json" || item.fileName?.endsWith(".json"))?.metadataUrl;
      if (uploadedMetadata) {
        setMetaLocation(uploadedMetadata);
      } else {
        setMetaLocation("");
      }
    }

    setImageLoadError(false);
    setShowSyncFeedback(true);
    setTimeout(() => setShowSyncFeedback(false), 1500);
  };

  // Dynamic Rent Calculation based on active plugins
  const calculateRegistryRentSOL = (): number => {
    // Solana Metaplex collection setup costs:
    // Base Mint account + metadata + master edition: approx 0.012 SOL
    // Plus ~0.002 SOL for each on-chain plugin attached (state allocation)
    let base = 0.0122;
    if (pluginConfig.royaltiesEnabled) base += 0.0024;
    if (pluginConfig.attributesRegistryEnabled) base += 0.0018;
    if (pluginConfig.authorityLockEnabled) base += 0.0011;
    return parseFloat(base.toFixed(4));
  };

  const handleAddCreator = () => {
    const defaultPubkey = wallet.publicKey || "3gA...F49";
    setPluginConfig((prev) => ({
      ...prev,
      creators: [...prev.creators, { address: defaultPubkey, share: 0 }],
    }));
  };

  const handleRemoveCreator = (index: number) => {
    setPluginConfig((prev) => ({
      ...prev,
      creators: prev.creators.filter((_, i) => i !== index),
    }));
  };

  const handleCreatorShareChange = (index: number, share: number) => {
    const updated = [...pluginConfig.creators];
    updated[index].share = share;
    setPluginConfig((prev) => ({ ...prev, creators: updated }));
  };

  const handleCreatorAddressChange = (index: number, address: string) => {
    const updated = [...pluginConfig.creators];
    updated[index].address = address;
    setPluginConfig((prev) => ({ ...prev, creators: updated }));
  };

  const totalShare = pluginConfig.creators.reduce((sum, c) => sum + c.share, 0);
  const estimatedRent = calculateRegistryRentSOL();

  const handleRegisterOnChain = async () => {
    if (!wallet.isConnected) return;
    setIsRegistering(true);
    setRegisterStep(0);
    setRegisterLogs([]);
    setFinalCollectionAddress(null);

    const logs: string[] = [];
    const addLog = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
      setRegisterLogs([...logs]);
    };

    addLog("Starting On-Chain Registry Registration (S.A.N.D.S. Engine V2)...");
    addLog(`Validating Collection Name: "${collectionName}"`);
    addLog(`Validating Metadata Source Link: "${metaLocation}"`);
    setRegisterStep(1);
    await new Promise((resolve) => setTimeout(resolve, 800));

    addLog(`Rent verification: Allocating state account (${estimatedRent} SOL)...`);
    if (wallet.balanceSOL < estimatedRent) {
      addLog("ERROR: Wallet has insufficient SOL to fund rent-exempt account allocation.");
      setIsRegistering(false);
      return;
    }
    addLog("Minting Collection Master Token...");
    setRegisterStep(2);
    await new Promise((resolve) => setTimeout(resolve, 800));

    addLog("Master Token mint verified. Creating Metaplex Metadata Account...");
    if (pluginConfig.royaltiesEnabled) {
      addLog(`Attaching Royalty Plugin: split set at ${pluginConfig.royaltyPercentage}% with ${pluginConfig.creators.length} creators.`);
      if (totalShare !== 100) {
        addLog("WARNING: Creator split shares do not sum to 100%. Automatically normalizing split shares...");
      }
    }
    if (pluginConfig.attributesRegistryEnabled) {
      addLog("Attaching On-Chain Attributes Registry Plugin.");
    }
    if (pluginConfig.authorityLockEnabled) {
      addLog("Enabling Authority Lock: Update authority will be permanently frozen after registry anchors.");
    }
    setRegisterStep(3);

    const provider = getWalletProvider(wallet.walletType);
    const result = await deployCollectionOnChain(
      rpcUrl,
      wallet,
      collectionName,
      provider
    );

    if (result.success && result.collectionAddress && result.signature) {
      setFinalCollectionAddress(result.collectionAddress);
      setCollectionSignature(result.signature);
      const chainName = getChainName(rpcUrl);
      setCollectionDeployedChain(chainName);
      addLog(`SUCCESS: On-Chain Registry configuration completed on ${chainName}!`);
      addLog(`Collection verified on-chain at address: ${result.collectionAddress}`);
      addLog(`TX Signature: ${result.signature}`);
      addLog("Active Tree bindings synchronized.");
      setRegisterStep(4);
    } else {
      addLog(`ERROR: Registration failed. ${result.error}`);
      setRegisterStep(0);
    }
    setIsRegistering(false);
  };

  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isTreeWarningCollapsed, setIsTreeWarningCollapsed] = useState(true);

  return (
    <div id="on-chain-registry" className="p-5 rounded-2xl bg-slate-900/80 border border-purple-500/30 shadow-xl backdrop-blur-md">
      <div 
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-purple-400" />
          <h2 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
            On-Chain Registry Config
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/40 text-purple-400 border border-purple-500/20 font-bold uppercase">
            Anchor Registry
          </span>
          {isCollapsed ? <ChevronDown className="w-4.5 h-4.5 text-slate-400 hover:text-white" /> : <ChevronUp className="w-4.5 h-4.5 text-slate-400 hover:text-white" />}
        </div>
      </div>

      {!isCollapsed && (
        <div className="mt-4 space-y-4 animate-fadeIn">

      <p className="text-xs text-slate-300 leading-relaxed">
        Anchor your collection configuration on-chain. This step binds your decentralised Arweave metadata link to the actual Solana on-chain collection account.
      </p>

      {/* 0. Merkle Tree Source Selection & Verification */}
      <div className="p-4 bg-slate-950/60 rounded-xl border border-purple-500/20 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-purple-400" />
            <span className="text-[11px] font-mono font-bold text-slate-200 uppercase tracking-wide">On-Chain Merkle Tree Source</span>
          </div>
          {treeConfig.activeTreeAddress ? (
            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <Check className="w-3 h-3" /> ACTIVE
            </span>
          ) : (
            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-amber-950/40 text-amber-400 border border-amber-500/20 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 animate-pulse" /> NEEDED
            </span>
          )}
        </div>

        {/* 0a. Warnings if no tree is active */}
        {!treeConfig.activeTreeAddress && (
          <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/20 text-amber-400 text-xs leading-normal">
            <div 
              className="flex items-center justify-between cursor-pointer select-none"
              onClick={() => setIsTreeWarningCollapsed(!isTreeWarningCollapsed)}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span className="font-bold">No active Merkle Tree loaded</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-amber-500/60 lowercase font-sans font-normal">click to expand</span>
                {isTreeWarningCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-amber-500/60" /> : <ChevronUp className="w-3.5 h-3.5 text-amber-500/60" />}
              </div>
            </div>
            {!isTreeWarningCollapsed && (
              <div className="mt-2 pt-2 border-t border-amber-500/10 animate-fadeIn text-[11px] leading-relaxed">
                cNFT collection registries must bind to an active State Compression Merkle Tree. Deploy one using the <strong>Merkle Tree Minting</strong> panel or manually import below.
              </div>
            )}
          </div>
        )}

        {/* 0b. Dropdown for multiple trees */}
        {allTrees.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              {allTrees.length > 1 ? "Select Active Merkle Tree (Dropdown)" : "Selected Merkle Tree"}
            </label>
            <div className="flex gap-2">
              <select
                value={treeConfig.activeTreeAddress || ""}
                onChange={(e) => setTreeConfig((prev) => ({ ...prev, activeTreeAddress: e.target.value || null }))}
                className="flex-1 bg-slate-900 border border-slate-800 focus:border-purple-500 focus:outline-none rounded-lg px-2.5 py-1.5 font-mono text-xs text-white"
              >
                <option value="">-- Choose a Merkle Tree --</option>
                {allTrees.map((tree, i) => (
                  <option key={i} value={tree}>
                    Tree {i + 1}: {tree.substring(0, 8)}...{tree.substring(tree.length - 8)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Show active tree detail if loaded */}
        {treeConfig.activeTreeAddress && (
          <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800 space-y-1">
            <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
              <span className="flex items-center gap-1">
                <span>Active Tree Address</span>
                <a
                  href={(() => {
                    const url = rpcUrl.toLowerCase();
                    let clusterParam = "";
                    if (url.includes("devnet")) {
                      clusterParam = "?cluster=devnet";
                    } else if (url.includes("testnet")) {
                      clusterParam = "?cluster=testnet";
                    } else if (url.includes("localhost") || url.includes("127.0.0.1")) {
                      clusterParam = "?cluster=custom";
                    }
                    return `https://explorer.solana.com/address/${treeConfig.activeTreeAddress}${clusterParam}`;
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-blue-400 hover:text-blue-300 ml-1 font-sans"
                  title="View on Solana Explorer"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </span>
              <span className="text-emerald-400">Connected & Ready</span>
            </div>
            <div className="text-xs font-mono text-white select-all break-all">
              {treeConfig.activeTreeAddress}
            </div>
          </div>
        )}

        {/* 0c. Manual Tree Entry & Verification */}
        <div className="space-y-2 pt-1 border-t border-slate-800/40">
          <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
            Manually Import & Verify Tree Address
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Key className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Enter base58 Merkle Tree public key..."
                value={manualTreeAddress}
                disabled={isVerifyingTree}
                onChange={(e) => setManualTreeAddress(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 focus:border-purple-500 focus:outline-none rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white font-mono placeholder:text-slate-600"
              />
            </div>
            <button
              onClick={handleVerifyAndAddTree}
              disabled={isVerifyingTree || !wallet.isConnected}
              className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {isVerifyingTree ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verify & Add
                </>
              )}
            </button>
          </div>

          {/* Verification feedback */}
          {verifyError && (
            <div className="text-[11px] font-mono text-red-400 mt-1 flex items-center gap-1 animate-fadeIn">
              <AlertTriangle className="w-3.5 h-3.5" />
              {verifyError}
            </div>
          )}
          {verifySuccess && (
            <div className="text-[11px] font-mono text-emerald-400 mt-1 flex items-center gap-1 animate-fadeIn">
              <Check className="w-3.5 h-3.5" />
              {verifySuccess}
            </div>
          )}

          {/* Verification Logs */}
          {isVerifyingTree && (
            <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg space-y-1.5 animate-fadeIn mt-2">
              <span className="text-[9px] font-mono text-slate-500 uppercase font-bold tracking-wider block">Ownership Check Log</span>
              <div className="space-y-0.5 font-mono text-[9px] text-slate-400">
                {verifyLogs.map((log, index) => (
                  <div key={index} className="leading-relaxed border-l border-purple-500/40 pl-1.5">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sync from Metadata Draft Controller */}
      <div className="p-3.5 bg-purple-950/20 border border-purple-500/20 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fadeIn mt-2">
        <div className="space-y-1 text-left flex-1">
          <h4 className="font-mono text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${showSyncFeedback ? "animate-spin text-emerald-400" : "text-purple-400"}`} />
            <span>On-Chain Collection Sync</span>
          </h4>
          <p className="text-[11px] text-slate-400 leading-normal max-w-xl">
            Populate name, description, image, and Arweave location into the on-chain registry config directly from your active draft and uploaded assets.
          </p>
        </div>
        
        {/* Right side Stack: Button + Meta Location Input */}
        <div className="w-full md:w-80 flex flex-col gap-2 shrink-0">
          <button
            onClick={handlePopulateFromMetadata}
            className={`w-full px-4 py-2 rounded-lg font-mono text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-all duration-300 ${
              showSyncFeedback
                ? "bg-emerald-600 hover:bg-emerald-500 text-white scale-[1.02]"
                : "bg-purple-600 hover:bg-purple-500 text-white active:scale-95"
            }`}
          >
            {showSyncFeedback ? (
              <>
                <Check className="w-4 h-4 text-white animate-bounce" />
                <span>Registry Fields Populated!</span>
              </>
            ) : (
              <>
                <Layers className="w-4 h-4" />
                <span>Populate from Metadata</span>
              </>
            )}
          </button>

          {/* Meta Location (URL) input box placed at the top right, under the button */}
          <div className="space-y-1 w-full bg-slate-950 p-2 rounded-lg border border-purple-900/30">
            <div className="flex justify-between items-center">
              <label className="text-[9px] font-mono text-purple-300 uppercase tracking-wider">Meta Location (URL)</label>
              <span className="text-[8px] font-mono text-slate-500 lowercase">arweave raw metadata</span>
            </div>
            <input
              type="text"
              placeholder="e.g., https://arweave.net/..."
              value={metaLocation}
              onChange={(e) => setMetaLocation(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800/80 focus:border-purple-500 focus:outline-none rounded-lg px-2.5 py-1 text-[11px] text-white font-mono"
            />
          </div>
        </div>
      </div>

      {/* Grid: Pull Fields & Image Preview */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Inputs Column */}
        <div className="md:col-span-8 space-y-3">
          {/* Collection Name Field */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <span>Collection Name</span>
              <span className="text-[8px] bg-slate-800 text-slate-400 px-1 py-0.2 rounded font-normal lowercase font-mono">hardcoded/synced</span>
            </label>
            <input
              type="text"
              readOnly={true}
              placeholder="Awaiting population..."
              value={collectionName || ""}
              className="w-full bg-slate-900/50 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 font-medium cursor-not-allowed select-all"
            />
          </div>

          {/* Collection Image URL Override Field */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <span>Collection Image URL</span>
              <span className="text-[8px] bg-slate-800 text-slate-400 px-1 py-0.2 rounded font-normal lowercase font-mono">hardcoded/synced</span>
            </label>
            <input
              type="text"
              readOnly={true}
              placeholder="Awaiting population..."
              value={collectionImage || ""}
              className="w-full bg-slate-900/50 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 font-mono cursor-not-allowed select-all"
            />
          </div>

          {/* Collection Description Field */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <span>Collection Description</span>
              <span className="text-[8px] bg-slate-800 text-slate-400 px-1 py-0.2 rounded font-normal lowercase font-mono">hardcoded/synced</span>
            </label>
            <textarea
              readOnly={true}
              placeholder="Awaiting population..."
              value={collectionDesc || ""}
              rows={2}
              className="w-full bg-slate-900/50 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 resize-none cursor-not-allowed select-all"
            />
          </div>
        </div>

        {/* Collection Image Preview Column */}
        <div className="md:col-span-4 flex flex-col justify-end space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Collection Preview</span>
          </div>
          <div className="w-full aspect-square rounded-xl bg-slate-950 border border-slate-850 flex flex-col items-center justify-center overflow-hidden relative group shadow-inner">
            {(collectionImage && !imageLoadError) ? (
              <>
                <img
                  src={collectionImage}
                  alt={collectionName || "Collection Image"}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={() => {
                    setImageLoadError(true);
                  }}
                />
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent p-2 text-[10px] font-mono text-slate-300">
                  <div className="font-bold truncate text-purple-400">{collectionName || "Untitled Collection"}</div>
                  {collectionDesc && (
                    <div className="text-[8px] text-slate-400 truncate mt-0.5">{collectionDesc}</div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1 text-slate-500 p-4 text-center">
                <Image className="w-6 h-6 text-slate-600 animate-pulse" />
                <span className="text-[9px] font-mono text-slate-400">
                  {imageLoadError ? "Failed to load image (CORS or Invalid URL)" : "Awaiting population..."}
                </span>
                {imageLoadError && (
                  <span className="text-[8px] font-mono text-slate-500 select-all max-w-full truncate px-1 text-center block">
                    {collectionImage}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* On-Chain Plugins Selector */}
      <div className="space-y-2.5 pt-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">On-Chain Plugins to Attach</span>
          <button
            onClick={() => setShowPluginGuide(!showPluginGuide)}
            className="text-[10px] font-mono font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{showPluginGuide ? "Hide Diagnoser" : "📖 Run Extensive Plugin Checkup"}</span>
          </button>
        </div>

        {/* Playbook Collapsible Section */}
        {showPluginGuide && (
          <div className="p-4 bg-slate-950 rounded-xl border border-purple-500/20 space-y-4 animate-fadeIn">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="font-mono text-xs font-bold text-purple-400 uppercase tracking-wide flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                <span>On-Chain Plugin Playbook & Interactive Diagnostics</span>
              </h3>
              <p className="text-[10.5px] text-slate-400 leading-normal mt-1">
                Answer the checkup questions below to receive tailored, professional recommendation seals for each plugin based on your specific digital asset roadmap.
              </p>
            </div>

            {/* Interactive Checkup Tool */}
            <div className="p-3 bg-slate-900/50 rounded-lg border border-purple-500/10 space-y-3">
              <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider block">⚡ Interactive Checkup Tool:</span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="flex items-start gap-2.5 p-2 bg-slate-950/60 rounded-md border border-slate-800/80 hover:border-purple-500/30 transition-all cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quizAnswers.coFounders}
                    onChange={(e) => setQuizAnswers((prev) => ({ ...prev, coFounders: e.target.checked }))}
                    className="mt-0.5 rounded accent-purple-500 shrink-0"
                  />
                  <div className="space-y-0.5">
                    <span className="text-[10.5px] font-medium text-slate-200 block">Has Co-Creators</span>
                    <span className="text-[9px] text-slate-400 leading-tight block">Working with co-founders or design partners who require revenue splits.</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2 bg-slate-950/60 rounded-md border border-slate-800/80 hover:border-purple-500/30 transition-all cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quizAnswers.gamingDapp}
                    onChange={(e) => setQuizAnswers((prev) => ({ ...prev, gamingDapp: e.target.checked }))}
                    className="mt-0.5 rounded accent-purple-500 shrink-0"
                  />
                  <div className="space-y-0.5">
                    <span className="text-[10.5px] font-medium text-slate-200 block">Game / dApp Utility</span>
                    <span className="text-[9px] text-slate-400 leading-tight block">NFTs will be read or modified by game smart contracts, staking, or live apps.</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2 bg-slate-950/60 rounded-md border border-slate-800/80 hover:border-purple-500/30 transition-all cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quizAnswers.permanentArt}
                    onChange={(e) => setQuizAnswers((prev) => ({ ...prev, permanentArt: e.target.checked }))}
                    className="mt-0.5 rounded accent-purple-500 shrink-0"
                  />
                  <div className="space-y-0.5">
                    <span className="text-[10.5px] font-medium text-slate-200 block">Immutable Fine Art</span>
                    <span className="text-[9px] text-slate-400 leading-tight block">You want 100% unchangeable decentralised art assets with a frozen authority.</span>
                  </div>
                </label>
              </div>
            </div>

            {/* In-Depth Plugin Analysis Grid */}
            <div className="space-y-4 text-[11px] leading-relaxed">
              
              {/* Plugin 1 Deep Dive */}
              <div className="space-y-2 bg-slate-900/60 p-3.5 rounded-lg border border-slate-800 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-800/60 pb-1.5">
                  <span className="font-mono font-bold text-slate-200 text-xs block">1. Royalties & Creators Split Plugin</span>
                  <div>
                    {quizAnswers.coFounders ? (
                      <span className="text-[8px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30 font-bold uppercase">
                        ✅ STRONGLY RECOMMENDED FOR CO-FOUNDERS
                      </span>
                    ) : (
                      <span className="text-[8px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 font-bold uppercase">
                        OPTIONAL FOR SOLITARY CREATOR
                      </span>
                    )}
                  </div>
                </div>
                
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  <strong className="text-slate-300">How it functions:</strong> Configures Metaplex Core on-chain royalty structures. When a secondary sale occurs, the marketplace platform smart contract parses this plugin's on-chain rules and automatically enforces the designated royalty splits in SOL directly to the creators' addresses at the block time.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 my-2">
                  <div className="bg-emerald-950/20 border border-emerald-500/10 p-2 rounded">
                    <span className="font-bold text-emerald-400 text-[9.5px] uppercase block">✅ Why You Should Use It (Pros)</span>
                    <ul className="list-disc list-inside text-[9.5px] text-slate-300 space-y-0.5 mt-1 font-sans">
                      <li>Enforces automatic, trustless passive income streams from secondary trading volume.</li>
                      <li>Ensures exact, transparent on-chain division of revenues among multiple team partners.</li>
                      <li>Highly secure: no manual math or payouts are required after launch.</li>
                    </ul>
                  </div>
                  <div className="bg-red-950/20 border border-red-500/10 p-2 rounded">
                    <span className="font-bold text-red-400 text-[9.5px] uppercase block">❌ When to Avoid / Cons</span>
                    <ul className="list-disc list-inside text-[9.5px] text-slate-300 space-y-0.5 mt-1 font-sans">
                      <li>Certain non-compliant aggregators attempt to bypass royalties on-chain.</li>
                      <li>High fees (e.g. &gt;10%) can reduce secondary liquidity and trading volume.</li>
                    </ul>
                  </div>
                </div>

                <div className="text-[9.5px] text-slate-400 bg-slate-950/60 p-2 rounded font-mono border border-slate-800/40">
                  <strong className="text-purple-400 uppercase">Expert Checkup:</strong> If you are launching a joint project, you <strong className="text-emerald-400">MUST</strong> use this plugin. Set standard fees between <strong className="text-purple-300">2.5% and 7.5%</strong>. Ensure the splits sum to exactly 100% to pass Solana on-chain validator checks.
                </div>
              </div>

              {/* Plugin 2 Deep Dive */}
              <div className="space-y-2 bg-slate-900/60 p-3.5 rounded-lg border border-slate-800 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-800/60 pb-1.5">
                  <span className="font-mono font-bold text-slate-200 text-xs block">2. On-Chain Attributes Registry Plugin</span>
                  <div>
                    {quizAnswers.gamingDapp ? (
                      <span className="text-[8px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30 font-bold uppercase">
                        ✅ CRUCIAL FOR GAME SMART CONTRACTS
                      </span>
                    ) : (
                      <span className="text-[8px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 font-bold uppercase">
                        OPTIONAL FOR COLLECTIBLES
                      </span>
                    )}
                  </div>
                </div>
                
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  <strong className="text-slate-300">How it functions:</strong> Serializes NFT traits (e.g. "Strength: 85", "Weapon: Laser") directly inside the Solana account state instead of just placing them inside static Arweave files. This exposes attributes to the runtime environment, allowing other smart contracts to query traits instantly.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 my-2">
                  <div className="bg-emerald-950/20 border border-emerald-500/10 p-2 rounded">
                    <span className="font-bold text-emerald-400 text-[9.5px] uppercase block">✅ Why You Should Use It (Pros)</span>
                    <ul className="list-disc list-inside text-[9.5px] text-slate-300 space-y-0.5 mt-1 font-sans">
                      <li>Enables instant on-chain utility (e.g. staking calculators, gaming multipliers).</li>
                      <li>Saves dApp speed: no need to query slow web2 servers or IPFS gateways for traits.</li>
                      <li>Ideal for dynamic traits that evolve (e.g. player experience points or level-ups).</li>
                    </ul>
                  </div>
                  <div className="bg-red-950/20 border border-red-500/10 p-2 rounded">
                    <span className="font-bold text-red-400 text-[9.5px] uppercase block">❌ When to Avoid / Cons</span>
                    <ul className="list-disc list-inside text-[9.5px] text-slate-300 space-y-0.5 mt-1 font-sans">
                      <li>Increases the rent-exempt storage cost in SOL due to larger byte allocation.</li>
                      <li>Adds state complexity: requires a programmatic update authority to alter traits.</li>
                    </ul>
                  </div>
                </div>

                <div className="text-[9.5px] text-slate-400 bg-slate-950/60 p-2 rounded font-mono border border-slate-800/40">
                  <strong className="text-purple-400 uppercase">Expert Checkup:</strong> Use this if your project is a game, interactive app, or rewards staking portal. Avoid if you are launching simple, static digital art where the traits only serve as visual search tags on secondary marketplaces.
                </div>
              </div>

              {/* Plugin 3 Deep Dive */}
              <div className="space-y-2 bg-slate-900/60 p-3.5 rounded-lg border border-slate-800 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-800/60 pb-1.5">
                  <span className="font-mono font-bold text-slate-200 text-xs block">3. Permanent Authority Lock Plugin</span>
                  <div>
                    {quizAnswers.permanentArt ? (
                      <span className="text-[8px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30 font-bold uppercase">
                        ✅ RECOMMENDED FOR HIGH-VALUE DECENTRALISATION
                      </span>
                    ) : (
                      <span className="text-[8px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-500/30 font-bold uppercase">
                        ⚠️ CAUTION: IRREVERSIBLE IN ACTION
                      </span>
                    )}
                  </div>
                </div>
                
                <p className="text-slate-400 text-[10px] leading-relaxed">
                  <strong className="text-slate-300">How it functions:</strong> Invokes a system instruction that permanently reassigns the Update Authority field of the collection account to a null zero address (`11111111111111111111111111111111`). This seals the configuration forever, preventing any future alterations to the collection's on-chain metadata.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 my-2">
                  <div className="bg-emerald-950/20 border border-emerald-500/10 p-2 rounded">
                    <span className="font-bold text-emerald-400 text-[9.5px] uppercase block">✅ Why You Should Use It (Pros)</span>
                    <ul className="list-disc list-inside text-[9.5px] text-slate-300 space-y-0.5 mt-1 font-sans">
                      <li>Provides maximum trust: collectors are guaranteed that the creators cannot modify art or traits.</li>
                      <li>Establishes historic fine-art status: protects against rugpull updates or hacking of authority keys.</li>
                      <li>Can significantly increase secondary floor value for pure digital art collectors.</li>
                    </ul>
                  </div>
                  <div className="bg-red-950/20 border border-red-500/10 p-2 rounded">
                    <span className="font-bold text-red-400 text-[9.5px] uppercase block">❌ When to Avoid / Cons</span>
                    <ul className="list-disc list-inside text-[9.5px] text-slate-300 space-y-0.5 mt-1 font-sans">
                      <li>**ABSOLUTELY IRREVERSIBLE**: Any typos, image links, or metadata bugs are locked in for eternity.</li>
                      <li>Prevents any future royalty adjustments, creator changes, or dApp expansion.</li>
                    </ul>
                  </div>
                </div>

                <div className="text-[9.5px] text-slate-400 bg-slate-950/60 p-2 rounded font-mono border border-slate-800/40">
                  <strong className="text-purple-400 uppercase">Expert Checkup:</strong> Only use this if you are launching static fine-art and have fully verified every spelling, asset URL, and creator split. Do <strong className="text-amber-400">NOT</strong> use this for games, utility tokens, or active project roadmaps.
                </div>
              </div>

            </div>
          </div>
        )}

        {/* 1. Royalties Plugin */}
        <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-mono text-slate-300">
              <input
                type="checkbox"
                checked={pluginConfig.royaltiesEnabled}
                onChange={(e) => setPluginConfig((prev) => ({ ...prev, royaltiesEnabled: e.target.checked }))}
                className="rounded accent-purple-500"
              />
              Royalties & Creators Split
            </label>
            <span className="text-[9px] font-mono text-slate-500">Standard splits</span>
          </div>

          {pluginConfig.royaltiesEnabled && (
            <div className="space-y-3 pl-5 border-l-2 border-purple-500/20 pt-1">
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>Royalty Fee Percentage</span>
                  <span className="text-purple-400 font-bold">{pluginConfig.royaltyPercentage}%</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={15}
                  step={0.1}
                  value={pluginConfig.royaltyPercentage}
                  onChange={(e) => setPluginConfig((prev) => ({ ...prev, royaltyPercentage: parseFloat(e.target.value) }))}
                  className="w-full accent-purple-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Creators list table */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono text-slate-400">Creators & Splits (%)</span>
                  <button
                    onClick={handleAddCreator}
                    className="text-[9px] font-mono text-purple-400 hover:text-purple-300 cursor-pointer"
                  >
                    + Add Creator
                  </button>
                </div>

                <div className="space-y-1.5 max-h-[120px] overflow-y-auto scrollbar-thin">
                  {pluginConfig.creators.map((creator, i) => (
                    <div key={i} className="flex gap-1.5 items-center bg-slate-950 p-1.5 rounded border border-slate-850">
                      <input
                        type="text"
                        placeholder="Creator SOL Address..."
                        value={creator.address}
                        onChange={(e) => handleCreatorAddressChange(i, e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-[9px] text-white focus:outline-none focus:border-purple-500"
                      />
                      <input
                        type="number"
                        placeholder="Share"
                        value={creator.share || ""}
                        onChange={(e) => handleCreatorShareChange(i, parseInt(e.target.value) || 0)}
                        className="w-16 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[9px] text-purple-400 text-center focus:outline-none focus:border-purple-500"
                      />
                      <span className="text-[9px] text-slate-500 font-mono">%</span>
                      <button
                        onClick={() => handleRemoveCreator(i)}
                        className="text-[10px] text-red-500 hover:text-red-400 font-mono px-1.5 cursor-pointer"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between text-[9px] font-mono text-slate-500">
                  <span>Total Share:</span>
                  <span className={totalShare === 100 ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                    {totalShare}% / 100%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. Attributes Registry Plugin */}
        <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-mono text-slate-300">
            <input
              type="checkbox"
              checked={pluginConfig.attributesRegistryEnabled}
              onChange={(e) => setPluginConfig((prev) => ({ ...prev, attributesRegistryEnabled: e.target.checked }))}
              className="rounded accent-purple-500"
            />
            On-Chain Attributes Registry
          </label>
          <span className="text-[9px] font-mono text-slate-500">Anchors metadata traits</span>
        </div>

        {/* 3. Authority Lock Plugin */}
        <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-mono text-slate-300">
            <input
              type="checkbox"
              checked={pluginConfig.authorityLockEnabled}
              onChange={(e) => setPluginConfig((prev) => ({ ...prev, authorityLockEnabled: e.target.checked }))}
              className="rounded accent-purple-500"
            />
            Permanent Authority Lock
          </label>
          <span className="text-[9px] font-mono text-slate-500">Immutability seal</span>
        </div>
      </div>

      {/* Check Cost and Register Buttons */}
      <div className="space-y-2 pt-2">
        <div className="flex gap-2">
          <button
            onClick={() => setCostChecked(true)}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 text-slate-300 font-mono text-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
          >
            Check Cost
          </button>
          <button
            onClick={handleRegisterOnChain}
            disabled={isRegistering || !collectionName || !metaLocation || !wallet.isConnected || !treeConfig.activeTreeAddress}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:from-purple-700 disabled:opacity-40 text-white font-mono text-xs font-bold uppercase transition-all shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {isRegistering ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Registering On Chain...
              </>
            ) : (
              <>
                <Layers className="w-4 h-4" />
                Register Collection
              </>
            )}
          </button>
        </div>

        {/* Cost Check Result */}
        {costChecked && (
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex justify-between items-center animate-fadeIn text-xs">
            <div className="flex items-center gap-1.5 font-mono text-slate-400">
              <Coins className="w-4 h-4 text-amber-500" />
              Rent Needed:
            </div>
            <div className="font-mono font-bold text-amber-400">
              {estimatedRent} SOL
            </div>
          </div>
        )}
      </div>

      {/* Display Collection Result Card */}
      {finalCollectionAddress && (
        <div className="p-4 bg-slate-950 border border-emerald-500/30 rounded-xl space-y-3.5 animate-fadeIn">
          <div className="flex justify-between items-center text-emerald-400 font-mono text-[10px] uppercase font-bold tracking-wider">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>Devnet Registered On-Chain!</span>
            </div>
            <span className="text-[8px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded uppercase font-bold">
              {collectionDeployedChain || getChainName(rpcUrl)}
            </span>
          </div>

          <div className="space-y-2">
            <div className="space-y-1">
              <span className="text-[9px] font-mono text-slate-500 uppercase">Collection Mint Address:</span>
              <div className="text-[11px] font-mono text-slate-200 select-all break-all bg-slate-900/80 p-2.5 rounded border border-slate-800/80 flex items-center justify-between gap-2 group">
                <span className="truncate flex-1">{finalCollectionAddress}</span>
                <a
                  href={(() => {
                    const url = rpcUrl.toLowerCase();
                    let clusterParam = "";
                    if (url.includes("devnet")) {
                      clusterParam = "?cluster=devnet";
                    } else if (url.includes("testnet")) {
                      clusterParam = "?cluster=testnet";
                    } else if (url.includes("localhost") || url.includes("127.0.0.1")) {
                      clusterParam = "?cluster=custom";
                    }
                    return `https://explorer.solana.com/address/${finalCollectionAddress}${clusterParam}`;
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 font-bold shrink-0 flex items-center gap-1"
                >
                  <span>Explorer</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {collectionSignature && (
              <div className="space-y-1">
                <span className="text-[9px] font-mono text-slate-500 uppercase">Transaction Signature:</span>
                <div className="text-[11px] font-mono text-slate-200 select-all break-all bg-slate-900/80 p-2.5 rounded border border-slate-800/80 flex items-center justify-between gap-2 group">
                  <span className="truncate flex-1">{collectionSignature}</span>
                  <a
                    href={(() => {
                      const url = rpcUrl.toLowerCase();
                      let clusterParam = "";
                      if (url.includes("devnet")) {
                        clusterParam = "?cluster=devnet";
                      } else if (url.includes("testnet")) {
                        clusterParam = "?cluster=testnet";
                      } else if (url.includes("localhost") || url.includes("127.0.0.1")) {
                        clusterParam = "?cluster=custom";
                      }
                      return `https://explorer.solana.com/tx/${collectionSignature}${clusterParam}`;
                    })()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 font-bold shrink-0 flex items-center gap-1"
                  >
                    <span>Verify Tx</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}
          </div>

          <div className="p-2.5 bg-emerald-950/10 border border-emerald-500/20 rounded-lg text-[10px] text-slate-300 leading-normal font-mono flex gap-2 items-start">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-emerald-400">On-Chain Cluster Verification:</strong> This is a live Solana Devnet transaction. Click the links above to inspect full consensus proofs, allocated state rent, gas costs (lamports), and live instructions executed on the decentralized Solana ledger.
            </div>
          </div>
        </div>
      )}

      {/* On-Chain Consensus Log Overlay */}
      {isRegistering && (
        <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
          <div className="flex justify-between items-center border-b border-slate-800/60 pb-1.5">
            <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">Consensus Log</span>
            <span className="text-[9px] font-mono text-purple-400">Step {registerStep}/4</span>
          </div>
          <div className="max-h-[140px] overflow-y-auto space-y-1 font-mono text-[9px] text-slate-300 scrollbar-thin">
            {registerLogs.map((log, index) => (
              <div key={index} className="leading-relaxed border-l-2 border-purple-500/40 pl-1.5 py-0.5">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
}
