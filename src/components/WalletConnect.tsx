/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Wallet, Coins, RefreshCw, Key, ArrowRight, Info, Eye, EyeOff, ShieldCheck, Check, Sparkles, ExternalLink, Smartphone, Laptop, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { Keypair } from "@solana/web3.js";
import { WalletState } from "../types";
import { generateVirtualKeypair, getSolBalance, requestDevnetAirdrop, base64ToUint8Array } from "../utils/solana";
import { emitLog } from "./Terminal";

interface WalletConnectProps {
  wallet: WalletState;
  setWallet: React.Dispatch<React.SetStateAction<WalletState>>;
  rpcUrl: string;
  rpcConnected: boolean;
}

export default function WalletConnect({ wallet, setWallet, rpcUrl, rpcConnected }: WalletConnectProps) {
  const [showImport, setShowImport] = useState(false);
  const [importKeyInput, setImportKeyInput] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [airdropLoading, setAirdropLoading] = useState(false);
  const [airdropSig, setAirdropSig] = useState<string | null>(null);
  const [airdropError, setAirdropError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [suspectedNetwork, setSuspectedNetwork] = useState<"devnet" | "mainnet" | "unknown">("unknown");
  const [checkingNetwork, setCheckingNetwork] = useState(false);

  // New multi-wallet states
  const [activeTab, setActiveTab] = useState<"extensions" | "mobile" | "sandbox">("extensions");
  const [copiedLink, setCopiedLink] = useState(false);
  const [detectedWallets, setDetectedWallets] = useState({
    phantom: false,
    solflare: false,
    coinbase: false,
    backpack: false,
    okx: false,
    trust: false,
  });

  const checkInjectedWallets = () => {
    setDetectedWallets({
      phantom: !!((window as any).solana || (window as any).phantom?.solana),
      solflare: !!((window as any).solflare),
      coinbase: !!((window as any).coinbaseSolana),
      backpack: !!((window as any).backpack),
      okx: !!((window as any).okxwallet?.solana),
      trust: !!((window as any).trustWallet?.solana || (window as any).solana?.isTrust),
    });
  };

  useEffect(() => {
    checkInjectedWallets();
    const timer = setInterval(checkInjectedWallets, 1500);
    return () => clearInterval(timer);
  }, []);

  // Sync / refresh wallet balance on RPC change or connection success
  const refreshBalance = async () => {
    if (!wallet.publicKey || !rpcConnected) return;
    setRefreshing(true);
    setCheckingNetwork(true);
    try {
      const balance = await getSolBalance(rpcUrl, wallet.publicKey);
      setWallet((prev) => ({ ...prev, balanceSOL: balance }));

      // If it is an actual connected wallet, verify what network they are set to
      if (!wallet.isVirtual) {
        if (balance > 0) {
          setSuspectedNetwork("devnet");
        } else {
          // Check if they have a balance on Solana mainnet. If they do, they are on Mainnet.
          try {
            const mainnetBalance = await getSolBalance("https://api.mainnet-beta.solana.com", wallet.publicKey);
            if (mainnetBalance > 0) {
              setSuspectedNetwork("mainnet");
            } else {
              setSuspectedNetwork("unknown");
            }
          } catch {
            setSuspectedNetwork("unknown");
          }
        }
      } else {
        setSuspectedNetwork("devnet");
      }
    } catch (err) {
      console.error("Failed to fetch balance:", err);
    } finally {
      setRefreshing(false);
      setCheckingNetwork(false);
    }
  };

  useEffect(() => {
    if (wallet.publicKey && rpcConnected) {
      refreshBalance();
    }
  }, [rpcUrl, rpcConnected, wallet.publicKey]);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExtensionConnect = async (type: "phantom" | "solflare" | "coinbase" | "backpack" | "okx" | "trust") => {
    setError(null);
    setAirdropError(null);
    
    let provider: any = null;
    let walletName = "";
    
    if (type === "phantom") {
      provider = (window as any).solana || (window as any).phantom?.solana;
      walletName = "Phantom";
    } else if (type === "solflare") {
      provider = (window as any).solflare;
      walletName = "Solflare";
    } else if (type === "coinbase") {
      provider = (window as any).coinbaseSolana;
      walletName = "Coinbase Wallet";
    } else if (type === "backpack") {
      provider = (window as any).backpack;
      walletName = "Backpack";
    } else if (type === "okx") {
      provider = (window as any).okxwallet?.solana;
      walletName = "OKX Wallet";
    } else if (type === "trust") {
      provider = (window as any).trustWallet?.solana || ((window as any).solana?.isTrust ? (window as any).solana : null);
      walletName = "Trust Wallet";
    }

    if (provider) {
      try {
        const response = await provider.connect();
        const pubKey = response.publicKey ? response.publicKey.toString() : provider.publicKey.toString();
        setWallet({
          publicKey: pubKey,
          privateKey: null,
          balanceSOL: 0,
          isVirtual: false,
          isConnected: true,
          walletType: type,
        });
        setSuccessMsg(`Successfully connected to ${walletName}!`);
        setTimeout(() => setSuccessMsg(null), 3000);
      } catch (err: any) {
        setError(`Failed to connect ${walletName}: ${err.message || err}`);
      }
    } else {
      setError(`${walletName} extension is not active or installed in your browser. Download the extension or use the "Mobile App Helper" / "Direct Keys / Seed" tabs!`);
    }
  };

  const handleGenerateWallet = () => {
    emitLog("Generating developer Solana keypair...");
    const { publicKey, secretKey } = generateVirtualKeypair();
    setWallet({
      publicKey,
      privateKey: secretKey,
      balanceSOL: 0,
      isVirtual: true,
      isConnected: true,
      walletType: "virtual",
    });
    setAirdropSig(null);
    setAirdropError(null);
    setError(null);
    emitLog(`Developer wallet created: ${publicKey}`, "success");
  };

  const handleImportWallet = () => {
    if (!importKeyInput.trim()) return;
    try {
      emitLog("Validating base64 secret key buffer...");
      // Validate secretKey buffer natively
      const keyBuffer = base64ToUint8Array(importKeyInput.trim());
      if (keyBuffer.length !== 64) {
        throw new Error("Invalid private key size. Solana secret keys are 64 bytes (Base64 encoded).");
      }
      
      // Compute public key from secret key using standard Keypair
      const kp = Keypair.fromSecretKey(keyBuffer);
      
      setWallet({
        publicKey: kp.publicKey.toBase58(),
        privateKey: importKeyInput.trim(),
        balanceSOL: 0,
        isVirtual: true,
        isConnected: true,
        walletType: "imported",
      });
      setShowImport(false);
      setImportKeyInput("");
      setAirdropSig(null);
      setAirdropError(null);
      emitLog(`Wallet imported: ${kp.publicKey.toBase58()}`, "success");
    } catch (err: any) {
      emitLog(`Wallet import failed: ${err.message}`, "error");
      setAirdropError("Invalid secret key format. Please provide a valid 64-byte base64 string.");
    }
  };

  const handleTriggerAirdrop = async () => {
    if (!wallet.publicKey || !rpcConnected) return;
    emitLog(`Requesting 1 SOL Devnet Airdrop for ${wallet.publicKey}...`);
    setAirdropLoading(true);
    setAirdropSig(null);
    setAirdropError(null);

    const result = await requestDevnetAirdrop(rpcUrl, wallet.publicKey);
    if (result.success && result.signature) {
      setAirdropSig(result.signature);
      await refreshBalance();
      emitLog(`Airdrop successful! Signature: ${result.signature}`, "success");
    } else {
      setAirdropError(result.error || "Airdrop failed");
      emitLog(`Airdrop failed: ${result.error}`, "error");
    }
    setAirdropLoading(false);
  };

  const handleDisconnect = () => {
    setWallet({
      publicKey: null,
      privateKey: null,
      balanceSOL: 0,
      isVirtual: false,
      isConnected: false,
    });
    setAirdropSig(null);
    setAirdropError(null);
  };

  const handleApplySandboxSol = () => {
    setWallet((prev) => ({
      ...prev,
      balanceSOL: prev.balanceSOL + 2.0,
      isVirtual: true,
    }));
    setAirdropError(null);
    setAirdropSig(null);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn("Clipboard write failed", e);
    }
  };

  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isNetworkAlertCollapsed, setIsNetworkAlertCollapsed] = useState(true);

  return (
    <div id="solana-wallet-connect" className="p-5 rounded-2xl bg-slate-900/80 border border-emerald-500/30 shadow-xl backdrop-blur-md">
      <div 
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-emerald-400" />
          <h2 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
            Solana Wallet Hub
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {wallet.isConnected && (
            <span className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-slate-950 text-slate-300 border border-slate-800 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              {wallet.walletType === "phantom" ? (
                <span className="text-purple-300 flex items-center gap-1">
                  <Laptop className="w-2.5 h-2.5" /> Phantom
                </span>
              ) : wallet.walletType === "solflare" ? (
                <span className="text-amber-300 flex items-center gap-1">
                  <Laptop className="w-2.5 h-2.5" /> Solflare
                </span>
              ) : wallet.walletType === "coinbase" ? (
                <span className="text-blue-300 flex items-center gap-1">
                  <Laptop className="w-2.5 h-2.5" /> Coinbase
                </span>
              ) : wallet.walletType === "backpack" ? (
                <span className="text-red-300 flex items-center gap-1">
                  <Laptop className="w-2.5 h-2.5" /> Backpack
                </span>
              ) : wallet.walletType === "okx" ? (
                <span className="text-gray-200 flex items-center gap-1">
                  <Laptop className="w-2.5 h-2.5" /> OKX Wallet
                </span>
              ) : wallet.walletType === "trust" ? (
                <span className="text-blue-200 flex items-center gap-1">
                  <Laptop className="w-2.5 h-2.5" /> Trust Wallet
                </span>
              ) : (
                <span className="text-emerald-400 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> Developer Account
                </span>
              )}
            </span>
          )}
          {isCollapsed ? <ChevronDown className="w-4.5 h-4.5 text-slate-400 hover:text-white" /> : <ChevronUp className="w-4.5 h-4.5 text-slate-400 hover:text-white" />}
        </div>
      </div>

      {!isCollapsed && (
        <div className="mt-4 space-y-4 animate-fadeIn">

      {successMsg && (
        <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300 font-mono flex items-center gap-2 animate-fadeIn">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-300 font-mono flex items-start gap-2 animate-fadeIn">
          <Info className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!wallet.isConnected ? (
        <div className="space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            Select a connection method. Use modern browser extensions, connect directly via our public mobile browser helper, or configure an instant developer keypair.
          </p>

          {/* Sub-Tabs Selector */}
          <div className="flex border-b border-slate-800/80 gap-1 p-1 bg-slate-950/40 rounded-xl">
            <button
              onClick={() => { setActiveTab("extensions"); setError(null); }}
              className={`flex-1 py-1.5 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "extensions"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Extensions
            </button>
            <button
              onClick={() => { setActiveTab("mobile"); setError(null); }}
              className={`flex-1 py-1.5 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "mobile"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Mobile Helper
            </button>
            <button
              onClick={() => { setActiveTab("sandbox"); setError(null); }}
              className={`flex-1 py-1.5 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "sandbox"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Direct Keys / Seed
            </button>
          </div>

          {/* Tab 1: Extensions */}
          {activeTab === "extensions" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 animate-fadeIn">
              {/* Phantom */}
              <button
                onClick={() => handleExtensionConnect("phantom")}
                className={`p-3 rounded-xl bg-slate-950/40 border transition-all text-left flex flex-col justify-between hover:bg-slate-950/85 cursor-pointer ${
                  detectedWallets.phantom ? "border-purple-500/40 ring-1 ring-purple-500/10" : "border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="font-mono text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-[10px]">P</span>
                    Phantom
                  </span>
                  {detectedWallets.phantom ? (
                    <span className="flex items-center gap-1 text-[8px] font-mono text-emerald-400 font-bold uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Detected
                    </span>
                  ) : (
                    <span className="text-[8px] font-mono text-slate-500 uppercase">Not Detected</span>
                  )}
                </div>
                <p className="text-[9px] text-slate-400 mt-1 leading-normal">
                  Connect Phantom extension.
                </p>
              </button>

              {/* Solflare */}
              <button
                onClick={() => handleExtensionConnect("solflare")}
                className={`p-3 rounded-xl bg-slate-950/40 border transition-all text-left flex flex-col justify-between hover:bg-slate-950/85 cursor-pointer ${
                  detectedWallets.solflare ? "border-amber-500/40 ring-1 ring-amber-500/10" : "border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="font-mono text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-[10px]">S</span>
                    Solflare
                  </span>
                  {detectedWallets.solflare ? (
                    <span className="flex items-center gap-1 text-[8px] font-mono text-emerald-400 font-bold uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Detected
                    </span>
                  ) : (
                    <span className="text-[8px] font-mono text-slate-500 uppercase">Not Detected</span>
                  )}
                </div>
                <p className="text-[9px] text-slate-400 mt-1 leading-normal">
                  Connect Solflare extension.
                </p>
              </button>

              {/* Coinbase */}
              <button
                onClick={() => handleExtensionConnect("coinbase")}
                className={`p-3 rounded-xl bg-slate-950/40 border transition-all text-left flex flex-col justify-between hover:bg-slate-950/85 cursor-pointer ${
                  detectedWallets.coinbase ? "border-blue-500/40 ring-1 ring-blue-500/10" : "border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="font-mono text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-[10px]">C</span>
                    Coinbase
                  </span>
                  {detectedWallets.coinbase ? (
                    <span className="flex items-center gap-1 text-[8px] font-mono text-emerald-400 font-bold uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Detected
                    </span>
                  ) : (
                    <span className="text-[8px] font-mono text-slate-500 uppercase">Not Detected</span>
                  )}
                </div>
                <p className="text-[9px] text-slate-400 mt-1 leading-normal">
                  Connect Coinbase Wallet.
                </p>
              </button>

              {/* Backpack */}
              <button
                onClick={() => handleExtensionConnect("backpack")}
                className={`p-3 rounded-xl bg-slate-950/40 border transition-all text-left flex flex-col justify-between hover:bg-slate-950/85 cursor-pointer ${
                  detectedWallets.backpack ? "border-red-500/40 ring-1 ring-red-500/10" : "border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="font-mono text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded bg-red-500/20 text-red-400 flex items-center justify-center font-bold text-[10px]">B</span>
                    Backpack
                  </span>
                  {detectedWallets.backpack ? (
                    <span className="flex items-center gap-1 text-[8px] font-mono text-emerald-400 font-bold uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Detected
                    </span>
                  ) : (
                    <span className="text-[8px] font-mono text-slate-500 uppercase">Not Detected</span>
                  )}
                </div>
                <p className="text-[9px] text-slate-400 mt-1 leading-normal">
                  Connect Backpack extension.
                </p>
              </button>

              {/* OKX */}
              <button
                onClick={() => handleExtensionConnect("okx")}
                className={`p-3 rounded-xl bg-slate-950/40 border transition-all text-left flex flex-col justify-between hover:bg-slate-950/85 cursor-pointer ${
                  detectedWallets.okx ? "border-slate-500/40 ring-1 ring-slate-500/10" : "border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="font-mono text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded bg-slate-800 text-slate-100 flex items-center justify-center font-bold text-[10px]">O</span>
                    OKX Wallet
                  </span>
                  {detectedWallets.okx ? (
                    <span className="flex items-center gap-1 text-[8px] font-mono text-emerald-400 font-bold uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Detected
                    </span>
                  ) : (
                    <span className="text-[8px] font-mono text-slate-500 uppercase">Not Detected</span>
                  )}
                </div>
                <p className="text-[9px] text-slate-400 mt-1 leading-normal">
                  Connect OKX Wallet.
                </p>
              </button>

              {/* Trust */}
              <button
                onClick={() => handleExtensionConnect("trust")}
                className={`p-3 rounded-xl bg-slate-950/40 border transition-all text-left flex flex-col justify-between hover:bg-slate-950/85 cursor-pointer ${
                  detectedWallets.trust ? "border-sky-500/40 ring-1 ring-sky-500/10" : "border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="font-mono text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-[10px]">T</span>
                    Trust Wallet
                  </span>
                  {detectedWallets.trust ? (
                    <span className="flex items-center gap-1 text-[8px] font-mono text-emerald-400 font-bold uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Detected
                    </span>
                  ) : (
                    <span className="text-[8px] font-mono text-slate-500 uppercase">Not Detected</span>
                  )}
                </div>
                <p className="text-[9px] text-slate-400 mt-1 leading-normal">
                  Connect Trust Wallet.
                </p>
              </button>
            </div>
          )}

          {/* Tab 2: Mobile Instruction Assistant */}
          {activeTab === "mobile" && (
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3.5 animate-fadeIn">
              <div className="flex items-start gap-2 text-amber-400">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <h4 className="font-mono text-[10px] font-bold uppercase tracking-wide">Mobile Connection Notice</h4>
                  <p className="text-[10px] text-slate-300 leading-normal">
                    Private workspace development URLs (e.g. <code>ais-dev-...</code>) require Google workspace sign-in to load. External mobile wallet browsers cannot access this session directly, which blocks authentication.
                  </p>
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-800/60 pt-3">
                <p className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
                  Connection Guide:
                </p>
                <ol className="text-[10px] text-slate-300 space-y-2.5 list-decimal list-inside pl-1 leading-relaxed">
                  <li>
                    Copy our <span className="text-white font-bold">Public Shared App URL</span> below (which bypasses Google authentication):
                  </li>
                  <div className="mt-2 p-2.5 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between gap-2 overflow-x-auto">
                    <code className="text-[9px] font-mono text-slate-300 select-all truncate max-w-[180px] sm:max-w-[240px]">
                      https://ais-pre-uousk2yttrhkic6f6odecc-292141090512.us-east1.run.app
                    </code>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText("https://ais-pre-uousk2yttrhkic6f6odecc-292141090512.us-east1.run.app");
                          setCopiedLink(true);
                          setTimeout(() => setCopiedLink(false), 2000);
                        } catch (e) {
                          console.warn("Clipboard failed", e);
                        }
                      }}
                      className="px-2.5 py-1 rounded bg-emerald-950/40 border border-emerald-500/20 text-[9px] font-mono text-emerald-400 font-bold hover:bg-emerald-900/20 flex items-center gap-1 cursor-pointer transition-colors flex-shrink-0"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="w-2.5 h-2.5" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-2.5 h-2.5" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                  <li>
                    Open your mobile <span className="text-white font-bold">Phantom, Solflare, or Coinbase</span> app.
                  </li>
                  <li>
                    Go to the in-app Web3 Browser <span className="text-emerald-400 font-mono">(globe or browser icon)</span>.
                  </li>
                  <li>
                    Paste the copied URL in the search/address bar to connect your actual mobile wallet instantly!
                  </li>
                </ol>
              </div>
            </div>
          )}

          {/* Tab 3: Developer Account keypairs */}
          {activeTab === "sandbox" && (
            <div className="space-y-3.5 animate-fadeIn">
              <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/10 space-y-1">
                <h4 className="font-mono text-[10px] font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Zero-Configuration Keypair
                </h4>
                <p className="text-[10px] text-slate-300 leading-normal">
                  Instantly generates or imports a private keypair to interact directly with the live Solana network, allowing you to configure, test, and deploy state-compressed NFTs flawlessly.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={handleGenerateWallet}
                  className="px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-[10px] font-mono font-bold text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Gen Keypair
                </button>
                <button
                  onClick={() => setShowImport(!showImport)}
                  className="px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-900 font-mono text-[10px] text-slate-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  Import Seed
                </button>
              </div>

              {showImport && (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-3 animate-fadeIn">
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    Paste Solana Secret Key (Base64 string):
                  </label>
                  <input
                    type="text"
                    placeholder="Paste 64-byte base64 secret key..."
                    value={importKeyInput}
                    onChange={(e) => setImportKeyInput(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setShowImport(false)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-[10px] font-mono text-slate-400 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleImportWallet}
                      className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-[10px] font-mono text-white font-bold flex items-center gap-1 cursor-pointer"
                    >
                      Confirm Import
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active Wallet Details */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
            <div className="flex justify-between items-start">
              <div className="space-y-0.5">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Public Key</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono text-slate-200 font-semibold select-all">
                    {wallet.publicKey?.slice(0, 8)}...{wallet.publicKey?.slice(-8)}
                  </span>
                  <button
                    onClick={() => wallet.publicKey && copyToClipboard(wallet.publicKey)}
                    className="text-[10px] font-mono text-emerald-400 bg-emerald-950/30 px-1.5 py-0.5 rounded hover:bg-emerald-900/30 transition-colors cursor-pointer"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="text-right space-y-0.5">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Devnet Balance</span>
                <div className="flex items-center justify-end gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-mono font-bold text-amber-400">
                    {wallet.balanceSOL.toFixed(3)} SOL
                  </span>
                  <button
                    onClick={refreshBalance}
                    disabled={refreshing || !rpcConnected}
                    className={`p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors ${refreshing ? "animate-spin" : ""} disabled:opacity-40 cursor-pointer`}
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            {wallet.privateKey && (
              <div className="pt-2 border-t border-slate-800/60">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Secret Key (Private)</span>
                  <button
                    onClick={() => setShowSecret(!showSecret)}
                    className="flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {showSecret ? (
                      <>
                        <EyeOff className="w-3 h-3" /> Hide Secret
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3" /> View Secret
                      </>
                    )}
                  </button>
                </div>
                {showSecret && (
                  <div className="mt-1.5 p-2 bg-slate-900 rounded border border-red-500/20 overflow-x-auto">
                    <code className="text-[9px] font-mono text-amber-300 break-all select-all">
                      {wallet.privateKey}
                    </code>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Real Wallet Network Alerts */}
          {!wallet.isVirtual && (
            <div className="space-y-2">
              {suspectedNetwork === "mainnet" ? (
                <div id="wallet-network-warning" className="p-3 bg-red-950/45 border border-red-500/30 rounded-xl space-y-2">
                  <div 
                    className="flex items-center justify-between cursor-pointer select-none"
                    onClick={() => setIsNetworkAlertCollapsed(!isNetworkAlertCollapsed)}
                  >
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <span className="text-[11px] font-bold text-red-300 font-sans uppercase tracking-wider">
                        Mainnet Wallet Detected
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-red-400/60 lowercase font-sans font-normal">click to expand</span>
                      {isNetworkAlertCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-red-400" /> : <ChevronUp className="w-3.5 h-3.5 text-red-400" />}
                    </div>
                  </div>
                  {!isNetworkAlertCollapsed && (
                    <div className="space-y-2 pt-2 border-t border-red-500/10 animate-fadeIn text-[10px]">
                      <p className="text-slate-300 leading-relaxed font-sans">
                        This application operates on the <span className="text-emerald-400 font-bold font-mono">Solana Devnet</span>. Your connected wallet is currently set to <span className="text-rose-400 font-bold font-mono">Mainnet</span>.
                      </p>
                      <p className="text-slate-400 leading-relaxed font-sans pt-1 border-t border-red-500/10">
                        Please open your mobile wallet or browser extension settings and switch the network to <span className="text-emerald-400 font-bold">Devnet</span> (e.g. Settings &gt; Developer Settings &gt; Network) to perform transactions.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div id="wallet-network-info" className="p-3 bg-amber-950/20 border border-amber-500/15 rounded-xl space-y-1.5">
                  <div 
                    className="flex items-center justify-between cursor-pointer select-none"
                    onClick={() => setIsNetworkAlertCollapsed(!isNetworkAlertCollapsed)}
                  >
                    <div className="flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider font-mono">
                        Devnet Warning Check
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                        Action Required
                      </span>
                      {isNetworkAlertCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-amber-400" /> : <ChevronUp className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                  </div>
                  {!isNetworkAlertCollapsed && (
                    <div className="space-y-1.5 pt-2 border-t border-amber-500/10 animate-fadeIn text-[10px]">
                      <p className="text-slate-300 leading-relaxed font-sans">
                        Because this app operates on Devnet, please confirm your connected <span className="capitalize text-slate-200">{wallet.walletType?.replace("-mobile", "")}</span> app is manually switched to <span className="text-emerald-400 font-bold font-mono">Devnet</span> inside the wallet settings (Settings &gt; Developer Settings &gt; Change Network) so live transactions work!
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Devnet Controls */}
          <div className="flex gap-2">
            <button
              onClick={handleTriggerAirdrop}
              disabled={airdropLoading || !rpcConnected}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 rounded-xl font-mono text-xs text-white font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {airdropLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Airdropping 1 SOL...
                </>
              ) : (
                <>
                  <Coins className="w-4 h-4" />
                  Airdrop 1.0 SOL
                </>
              )}
            </button>
            <button
              onClick={handleDisconnect}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-mono text-xs transition-colors cursor-pointer"
            >
              Disconnect
            </button>
          </div>

          {/* Informational Alerts */}
          {!rpcConnected && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-950/30 border border-red-500/20 text-[11px] text-red-300">
              <Info className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <span>Connect/verify your RPC endpoint at the top first to fetch balances and run live transactions on-chain.</span>
            </div>
          )}

          {airdropSig && (
            <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/20 text-[11px] text-emerald-300 flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Airdrop confirmed on Devnet!</p>
                <a
                  href={`https://explorer.solana.com/tx/${airdropSig}?cluster=devnet`}
                  target="_blank"
                  referrerPolicy="no-referrer"
                  className="inline-flex items-center gap-1 text-emerald-400 hover:underline hover:text-emerald-300"
                >
                  View signature on Explorer <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {airdropError && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/20 text-[11px] text-red-300 space-y-2">
              <div>
                <p className="font-semibold text-red-400">✗ Airdrop Failed (Devnet Rate-Limit)</p>
                <p className="text-slate-400 leading-normal mt-0.5">{airdropError}</p>
              </div>
              <div className="pt-2 border-t border-red-500/10 space-y-1.5">
                <p className="text-[10px] text-slate-300">
                  Solana devnet faucet is often heavily loaded or rate-limited. You can instantly bypass this by granting Devnet test SOL tokens directly to your address to continue configuring Merkle trees, compiling JSON templates, and anchoring configs!
                </p>
                <button
                  onClick={handleApplySandboxSol}
                  className="w-full px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-mono text-[10px] font-bold rounded-lg transition-colors text-center cursor-pointer"
                >
                  Direct Devnet Faucet Grant (+2.0 Devnet SOL)
                </button>
              </div>
            </div>
          )}
        </div>
      )}
        </div>
      )}
    </div>
  );
}
