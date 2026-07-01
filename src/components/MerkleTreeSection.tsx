/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Cpu, Calculator, Info, Play, CheckCircle2, RefreshCw, ExternalLink, ChevronDown, ChevronUp, Search, History } from "lucide-react";
import { MerkleTreeConfig, WalletState } from "../types";
import { calculateMerkleTreeCost, getSolToCadRate, deployMerkleTreeOnChain, getWalletProvider, getChainName, scanWalletForMerkleTrees } from "../utils/solana";

interface MerkleTreeSectionProps {
  wallet: WalletState;
  treeConfig: MerkleTreeConfig;
  setTreeConfig: React.Dispatch<React.SetStateAction<MerkleTreeConfig>>;
  rpcUrl: string;
  rpcConnected: boolean;
  signature: string | null;
  setSignature: React.Dispatch<React.SetStateAction<string | null>>;
  allTrees: string[];
  setAllTrees: React.Dispatch<React.SetStateAction<string[]>>;
}

export default function MerkleTreeSection({
  wallet,
  treeConfig,
  setTreeConfig,
  rpcUrl,
  rpcConnected,
  signature,
  setSignature,
  allTrees,
  setAllTrees,
}: MerkleTreeSectionProps) {
  const [solToCad, setSolToCad] = useState(185.0);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployStep, setDeployStep] = useState<number>(0);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);

  // On-chain scan states
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Load SOL-CAD price feed on start
  useEffect(() => {
    getSolToCadRate().then((rate) => setSolToCad(rate));
  }, []);

  const handleScanTrees = async () => {
    if (!wallet.publicKey) return;
    setIsScanning(true);
    setScanError(null);
    try {
      const result = await scanWalletForMerkleTrees(rpcUrl, wallet.publicKey);
      if (result.success && result.trees) {
        // Add all discovered tree addresses to our persistent list
        const addresses = result.trees.map(t => t.address);
        setAllTrees((prev) => {
          const combined = [...prev];
          addresses.forEach(addr => {
            if (!combined.includes(addr)) {
              combined.push(addr);
            }
          });
          return combined;
        });
        if (result.trees.length === 0) {
          setScanError("No on-chain Merkle Tree creation transactions found for this wallet address on this RPC.");
        }
      } else {
        setScanError(result.error || "Failed to scan trees.");
      }
    } catch (err: any) {
      setScanError(err.message || "Unknown error occurred during scanning.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleSelectTree = (address: string) => {
    const chainName = getChainName(rpcUrl);
    setTreeConfig((prev) => ({
      ...prev,
      activeTreeAddress: address,
      deployedChain: chainName
    }));
  };

  const { bytes: treeBytes, sol: treeSol } = calculateMerkleTreeCost(
    treeConfig.maxDepth,
    treeConfig.maxBufferSize,
    treeConfig.canopyDepth
  );

  const treeCad = treeSol * solToCad;
  const maxCapacity = Math.pow(2, treeConfig.maxDepth);

  // Set predefined popular configurations
  const applyPreset = (depth: number, buffer: number, canopy: number) => {
    setTreeConfig((prev) => ({
      ...prev,
      maxDepth: depth,
      maxBufferSize: buffer,
      canopyDepth: canopy,
    }));
  };

  const handleDeployTree = async () => {
    if (!wallet.isConnected) return;
    setIsDeploying(true);
    setDeployStep(0);
    setDeployLogs([]);
    setSignature(null);

    const logs: string[] = [];
    const addLog = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
      setDeployLogs([...logs]);
    };

    // Step 1: Pre-requisites
    addLog(`Initializing Merkle Tree configuration (S.A.N.D.S. Engine V2)...`);
    addLog(`Max Depth: ${treeConfig.maxDepth} (Supports up to ${maxCapacity.toLocaleString()} compressed NFTs)`);
    addLog(`Max Buffer Size: ${treeConfig.maxBufferSize}, Canopy Depth: ${treeConfig.canopyDepth}`);
    addLog(`Allocating ${treeBytes.toLocaleString()} bytes of account space...`);
    setDeployStep(1);
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Step 2: Rent check
    addLog(`Rent Exemption fee required: ${treeSol} SOL (~$${treeCad.toFixed(2)} CAD).`);
    if (wallet.balanceSOL < treeSol) {
      addLog(`ERROR: Insufficient funds in connected wallet.`);
      addLog(`Deployment aborted. Airdrop more SOL first!`);
      setIsDeploying(false);
      return;
    }
    addLog(`Creating state keypair for Concurrent Merkle Tree...`);
    setDeployStep(2);
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Step 3: Broadcast
    addLog(`Broadcasting transaction to Solana Devnet...`);
    addLog(`Program StateCompression: allocating ConcurrentMerkleTree...`);
    setDeployStep(3);

    const provider = getWalletProvider(wallet.walletType);
    const result = await deployMerkleTreeOnChain(
      rpcUrl,
      wallet,
      treeConfig.maxDepth,
      treeConfig.maxBufferSize,
      treeConfig.canopyDepth,
      provider
    );

    // Step 4: Finalize
    if (result.success && result.treeAddress && result.signature) {
      setSignature(result.signature);
      const chainName = getChainName(rpcUrl);
      setTreeConfig((prev) => ({ 
        ...prev, 
        activeTreeAddress: result.treeAddress,
        deployedChain: chainName
      }));
      addLog(`SUCCESS: Concurrent Merkle Tree deployed successfully on ${chainName}!`);
      addLog(`On-Chain State Compression account initialized.`);
      addLog(`Active Tree Address: ${result.treeAddress}`);
      addLog(`TX Signature: ${result.signature}`);
      setDeployStep(4);
    } else {
      addLog(`ERROR: Deployment failed. ${result.error}`);
      setDeployStep(0);
    }
    setIsDeploying(false);
  };

  const [isCollapsed, setIsCollapsed] = useState(true);

  return (
    <div id="merkle-tree-minting" className="p-5 rounded-2xl bg-slate-900/80 border border-blue-500/30 shadow-xl backdrop-blur-md">
      <div 
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-blue-400" />
          <h2 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
            Merkle Tree Minting
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950/40 text-blue-400 border border-blue-500/20 font-bold uppercase">
            V2 State Compression
          </span>
          {isCollapsed ? <ChevronDown className="w-4.5 h-4.5 text-slate-400 hover:text-white" /> : <ChevronUp className="w-4.5 h-4.5 text-slate-400 hover:text-white" />}
        </div>
      </div>

      {!isCollapsed && (
        <div className="mt-4 space-y-4 animate-fadeIn">

      <p className="text-xs text-slate-300 leading-relaxed">
        Solana compressed NFTs (cNFTs) store metadata off-chain while keeping cryptographically verifiable proofs in an on-chain concurrent Merkle tree account.
      </p>

      {/* Configuration Presets */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Tree Presets</span>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={() => applyPreset(3, 8, 1)}
            disabled={isDeploying}
            className="px-2 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 disabled:opacity-40 text-[10px] font-mono text-slate-300 border border-slate-800 hover:border-blue-500/40 transition-all text-center cursor-pointer"
          >
            <div className="font-bold text-slate-200">Micro Tree</div>
            <div className="text-[9px] text-slate-400">Cap: 8 cNFTs</div>
          </button>
          <button
            onClick={() => applyPreset(14, 64, 3)}
            disabled={isDeploying}
            className="px-2 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 disabled:opacity-40 text-[10px] font-mono text-slate-300 border border-slate-800 hover:border-blue-500/40 transition-all text-center cursor-pointer"
          >
            <div className="font-bold text-blue-400">Standard V2</div>
            <div className="text-[9px] text-slate-400">Cap: 16.3k cNFTs</div>
          </button>
          <button
            onClick={() => applyPreset(20, 64, 5)}
            disabled={isDeploying}
            className="px-2 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 disabled:opacity-40 text-[10px] font-mono text-slate-300 border border-slate-800 hover:border-blue-500/40 transition-all text-center cursor-pointer"
          >
            <div className="font-bold text-slate-200">Max Capacity</div>
            <div className="text-[9px] text-slate-400">Cap: 1.04M cNFTs</div>
          </button>
        </div>
      </div>

      {/* Manual Sliders */}
      <div className="space-y-3.5 pt-1">
        {/* Max Depth Slider */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <label className="font-mono text-slate-400">Max Depth ({treeConfig.maxDepth})</label>
            <span className="font-mono text-[10px] text-blue-400">Cap: {maxCapacity.toLocaleString()} NFTs</span>
          </div>
          <input
            type="range"
            min={3}
            max={20}
            step={1}
            value={treeConfig.maxDepth}
            disabled={isDeploying}
            onChange={(e) => setTreeConfig((prev) => ({ ...prev, maxDepth: parseInt(e.target.value) }))}
            className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
          />
        </div>

        {/* Max Buffer Size Slider */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <label className="font-mono text-slate-400">Max Buffer Size ({treeConfig.maxBufferSize})</label>
            <span className="font-mono text-[10px] text-blue-400">Concurrency speed</span>
          </div>
          <select
            value={treeConfig.maxBufferSize}
            disabled={isDeploying}
            onChange={(e) => setTreeConfig((prev) => ({ ...prev, maxBufferSize: parseInt(e.target.value) }))}
            className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:outline-none rounded-lg px-2.5 py-1.5 font-mono text-xs text-white"
          >
            {[8, 16, 32, 64, 128].map((size) => (
              <option key={size} value={size}>
                BufferSize: {size}
              </option>
            ))}
          </select>
        </div>

        {/* Canopy Depth Slider */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <label className="font-mono text-slate-400">Canopy Depth ({treeConfig.canopyDepth})</label>
            <span className="font-mono text-[10px] text-blue-400">On-Chain cached proofs</span>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={treeConfig.canopyDepth}
            disabled={isDeploying}
            onChange={(e) => setTreeConfig((prev) => ({ ...prev, canopyDepth: Math.min(parseInt(e.target.value), treeConfig.maxDepth - 1) }))}
            className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
          />
        </div>
      </div>

      {/* Cost Estimator */}
      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-slate-400" />
          <div className="text-[11px] font-mono text-slate-400">Estimated Cost</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xs font-bold text-amber-400">
            {treeSol} SOL
          </div>
          <div className="text-[9px] font-mono text-slate-500">
            ${treeCad.toFixed(2)} CAD
          </div>
        </div>
      </div>

      {/* Deploy Button */}
      <button
        onClick={handleDeployTree}
        disabled={isDeploying || !wallet.isConnected}
        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:from-blue-700 disabled:opacity-40 text-white font-mono text-xs font-bold tracking-wider uppercase transition-all shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
      >
        {isDeploying ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            Configuring State Merkle Tree...
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            Deploy Tree Account
          </>
        )}
      </button>

      {/* Display Tree Address Result */}
      {treeConfig.activeTreeAddress && (
        <div className="p-3 bg-slate-950 border border-emerald-500/20 rounded-xl space-y-1.5">
          <div className="flex justify-between items-center text-emerald-400 font-mono text-[10px] uppercase font-bold tracking-wider">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Active Tree Address Loaded
            </div>
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
              className="flex items-center gap-1 text-[9px] text-blue-400 hover:text-blue-300 font-bold lowercase tracking-normal font-sans"
            >
              <ExternalLink className="w-3 h-3" />
              <span>view on explorer</span>
            </a>
          </div>
          <div className="flex justify-between items-center text-[9px] font-mono text-slate-400">
            <span>Deployed Chain:</span>
            <span className="text-emerald-400">{treeConfig.deployedChain || getChainName(rpcUrl)}</span>
          </div>
          <div className="text-xs font-mono text-slate-200 select-all break-all bg-slate-900 p-2 rounded border border-slate-800">
            {treeConfig.activeTreeAddress}
          </div>
          <p className="text-[9px] font-sans text-slate-500">
            This account is now registered on-chain for the state compression system. Copies of metadata and Merkle roots will be anchored to this tree authority.
          </p>
        </div>
      )}

      {/* Deploy Logs Display */}
      {isDeploying && (
        <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
          <div className="flex justify-between items-center border-b border-slate-800/60 pb-1.5">
            <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">Consensus Log</span>
            <span className="text-[9px] font-mono text-blue-400">Step {deployStep}/4</span>
          </div>
          <div className="max-h-[140px] overflow-y-auto space-y-1 font-mono text-[9px] text-slate-300 scrollbar-thin">
            {deployLogs.map((log, index) => (
              <div key={index} className="leading-relaxed border-l-2 border-blue-500/40 pl-1.5 py-0.5">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* On-Chain Merkle Tree Scanner */}
      <div className="pt-4 border-t border-slate-800/60 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <History className="w-4 h-4 text-purple-400" />
            <span className="text-[11px] font-mono font-bold uppercase text-slate-300">
              Tree Discovery & History
            </span>
          </div>
          <span className="text-[9px] font-mono text-slate-500">
            {allTrees.length} loaded
          </span>
        </div>

        <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800 space-y-2.5">
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Need to find past trees? Scan on-chain transactions for your wallet to auto-retrieve previously deployed state compression accounts.
          </p>

          <button
            onClick={handleScanTrees}
            disabled={isScanning || !wallet.publicKey}
            className="w-full py-2 rounded-lg bg-slate-850 hover:bg-slate-800 disabled:opacity-40 text-[10px] font-mono font-bold text-slate-200 hover:text-white border border-slate-700 hover:border-purple-500/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {isScanning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                Scanning recent transactions...
              </>
            ) : (
              <>
                <Search className="w-3.5 h-3.5 text-purple-400" />
                Scan Wallet for Merkle Trees
              </>
            )}
          </button>

          {scanError && (
            <div className="p-2 bg-rose-950/40 border border-rose-500/20 text-rose-400 text-[10px] font-mono rounded">
              ⚠️ {scanError}
            </div>
          )}

          {/* List scanned & loaded trees */}
          {allTrees.length > 0 && (
            <div className="space-y-1.5 pt-2.5 border-t border-slate-900">
              <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">
                Discovered Merkle Trees
              </span>
              <div className="max-h-[140px] overflow-y-auto space-y-1.5 scrollbar-thin pr-1">
                {allTrees.map((addr) => {
                  const isActive = treeConfig.activeTreeAddress === addr;
                  return (
                    <div
                      key={addr}
                      className={`p-2 rounded-lg border flex items-center justify-between gap-2 transition-all ${
                        isActive
                          ? "bg-blue-950/30 border-blue-500/40"
                          : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="font-mono text-[10px] text-slate-300 truncate font-medium select-all">
                          {addr}
                        </div>
                        {isActive && (
                          <div className="text-[8px] font-mono text-blue-400 uppercase tracking-wider font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                            Active Selection
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleSelectTree(addr)}
                        className={`px-2 py-1 rounded font-mono text-[9px] font-bold transition-all ${
                          isActive
                            ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 cursor-default"
                            : "bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                        }`}
                        disabled={isActive}
                      >
                        {isActive ? "Active" : "Select"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
        </div>
      )}
    </div>
  );
}
