import React, { useState } from "react";
import Arweave from "arweave";
import { 
  HardDrive, 
  Key, 
  Check, 
  ShieldCheck, 
  Upload, 
  FileJson, 
  ExternalLink, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  Lightbulb, 
  Sparkles, 
  RefreshCw,
  AlertTriangle,
  ShieldAlert
} from "lucide-react";
import { ArDriveState, WalletState } from "../types";
import { emitLog } from "./Terminal";

interface ArDriveAuthProps {
  arDrive: ArDriveState;
  setArDrive: React.Dispatch<React.SetStateAction<ArDriveState>>;
  wallet?: WalletState;
}

export default function ArDriveAuth({ arDrive, setArDrive, wallet }: ArDriveAuthProps) {
  const [walletInput, setWalletInput] = useState("");
  const [showGuide, setShowGuide] = useState(false); // Collapsed by default as requested

  const handleConnect = () => {
    if (!walletInput.trim()) return;
    
    emitLog("Validating Arweave wallet keyfile...");
    
    try {
      const parsedWallet = JSON.parse(walletInput);
      
      // Basic validation to check if it's an Arweave JWK
      if (!parsedWallet.kty || parsedWallet.kty !== "RSA") {
        throw new Error("Invalid keyfile format. Expected RSA JWK.");
      }
      
      const ArweaveClass = (Arweave as any).default || Arweave;
      const arweave = ArweaveClass.init({ host: "arweave.net", port: 443, protocol: "https" });
      arweave.wallets.jwkToAddress(parsedWallet).then((address: string) => {
        arweave.wallets.getBalance(address).then((balance: any) => {
          const arBalance = arweave.ar.winstonToAr(balance);
          setArDrive({
            keyfile: walletInput.trim(),
            isConnected: true,
            address,
            balance: arBalance
          });
          emitLog(`Arweave Wallet Authenticated. Address: ${address}`, "success");
        });
      });
    } catch (err: any) {
      emitLog(`Wallet validation failed: ${err.message}`, "error");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setWalletInput(content);
      emitLog("Loaded keyfile from disk.");
    };
    reader.readAsText(file);
  };

  const handleDisconnect = () => {
    setArDrive({ keyfile: "", isConnected: false });
    setWalletInput("");
    emitLog("Arweave Wallet Disconnected.");
  };

  const [isCollapsed, setIsCollapsed] = useState(true);

  return (
    <div id="ardrive-auth" className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-md">
      <div 
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-teal-400" />
          <h2 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
            ArDrive / Arweave Authentication
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {arDrive.isConnected ? (
            <span className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-teal-950 text-teal-400 border border-teal-500/25 uppercase font-bold">
              Connected
            </span>
          ) : (
            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-red-950/50 text-red-400 border border-red-500/20 uppercase tracking-wider font-bold">
              Required
            </span>
          )}
          {isCollapsed ? <ChevronDown className="w-4.5 h-4.5 text-slate-400 hover:text-white" /> : <ChevronUp className="w-4.5 h-4.5 text-slate-400 hover:text-white" />}
        </div>
      </div>

      {!isCollapsed && (
        <div className="mt-4 space-y-4 animate-fadeIn">
          {arDrive.isConnected ? (
            <div className="p-4 rounded-xl bg-teal-950/20 border border-teal-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-500/20 border border-teal-500/40 rounded-lg shrink-0">
                  <ShieldCheck className="w-5 h-5 text-teal-400" />
                </div>
                <div>
                  <h3 className="font-mono text-sm font-bold text-teal-400 uppercase flex items-center gap-2">
                    Arweave Wallet Connected
                  </h3>
                  {arDrive.address ? (
                    <div className="text-xs text-slate-400 font-mono mt-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Address:</span>
                        <span className="text-slate-300 truncate max-w-[200px]" title={arDrive.address}>{arDrive.address}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Balance:</span>
                        <span className="text-slate-300 font-bold">{arDrive.balance} AR</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 font-mono mt-0.5">Keyfile active for permanent storage</p>
                  )}
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold font-mono text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                Upload your Arweave keyfile (arweave-keyfile-xxxx.json) or paste the JSON content to sign permanent storage metadata/asset transactions.
              </p>
              
              <div className="flex flex-col gap-3">
            <div className="relative">
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-slate-800 border-dashed rounded-xl cursor-pointer bg-slate-950 hover:bg-slate-900 hover:border-teal-500/50 transition-all">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <FileJson className="w-6 h-6 mb-2 text-slate-500" />
                  <p className="mb-1 text-xs font-mono text-slate-400">
                    <span className="font-semibold">Click to upload keyfile</span> or drag and drop
                  </p>
                </div>
                <input type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
            
            <div className="flex items-center gap-2 text-xs font-mono text-slate-500 my-1">
              <div className="h-px bg-slate-800 flex-1"></div>
              <span>OR PASTE JSON</span>
              <div className="h-px bg-slate-800 flex-1"></div>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Key className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <textarea
                  value={walletInput}
                  onChange={(e) => setWalletInput(e.target.value)}
                  placeholder='{"kty":"RSA","n":"..."}'
                  className="w-full h-10 min-h-[40px] max-h-[120px] bg-slate-950 border border-slate-800 rounded-xl py-2 pl-9 pr-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-teal-500/50 transition-colors placeholder:text-slate-600 scrollbar-thin resize-y"
                />
              </div>
              <button
                onClick={handleConnect}
                disabled={!walletInput.trim()}
                className="px-4 py-2 h-10 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 disabled:hover:bg-teal-500 text-slate-950 font-bold font-mono text-sm rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap self-start"
              >
                Connect
              </button>
            </div>

            {/* Cryptographic Key Anti-Theft & Static Hosting Warning */}
            <div className="p-3.5 rounded-xl bg-red-950/25 border border-red-500/30 text-slate-300 space-y-2 text-[11px] animate-fadeIn mt-2">
              <div className="flex items-center gap-2 text-red-400 font-mono uppercase tracking-wider font-bold text-[10px]">
                <ShieldAlert className="w-4 h-4 animate-bounce text-red-400" />
                <span>🚨 CRITICAL SECURITY & KEY THEFT ADVISORY</span>
              </div>
              <p className="leading-relaxed">
                Your uploaded Arweave JWK keyfile is processed strictly in your local browser's memory and is <strong className="text-red-300">NEVER cached, stored in local storage, or tracked in repository logs</strong>.
              </p>
              <div className="space-y-1 text-slate-400 text-[10px] pt-1.5 border-t border-red-500/10">
                <span className="text-[9px] text-red-400 font-mono uppercase tracking-wide block font-bold">⚠️ DANGER OF STATIC HOSTING (E.G. GITHUB PAGES):</span>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    <strong className="text-slate-300">API Gateway Requirement:</strong> This application relies on a secure Express backend server to proxy your file uploads to Irys/Arweave. Static hosts like <strong className="text-red-400">GitHub Pages, Netlify, or Vercel static</strong> do NOT support backend servers. Direct API routes like <code className="bg-slate-950 px-1 py-0.5 rounded text-red-300 font-mono">/api/arweave/upload</code> will return 404 on those platforms.
                  </li>
                  <li>
                    <strong className="text-red-300">Never Hardcode Keys:</strong> To fix 404s, <strong className="text-red-400">NEVER hardcode your keyfile</strong> or private credentials into your client-side code, or include them in environment variables prefixed with <code className="bg-slate-950 px-1 py-0.5 rounded text-slate-300">VITE_</code>. If you push these keys to a public GitHub repository, automated scraping bots will steal them and drain your funds in seconds!
                  </li>
                  <li>
                    <strong className="text-emerald-400 font-bold">Safe Hosting Solutions:</strong> To keep your uploads functional and secure, deploy to platforms supporting custom container servers such as <strong className="text-emerald-400">Google Cloud Run, Railway, or Render</strong>.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ArDrive & Arweave Connection Guide */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg backdrop-blur-md">
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="w-full flex items-center justify-between text-left text-xs font-mono font-bold text-slate-300 hover:text-teal-400 transition-colors"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-teal-400" />
            <span>📖 ARDRIVE & ARWEAVE CONNECTION GUIDE</span>
          </div>
          {showGuide ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>

        {showGuide && (
          <div className="mt-4 space-y-4 border-t border-slate-800/60 pt-3.5 text-[11px] leading-relaxed">
            <div className="space-y-1">
              <h4 className="font-mono text-xs font-bold text-teal-400 uppercase tracking-wide flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-400 animate-pulse" /> What is ArDrive & Arweave?
              </h4>
              <p className="text-slate-300">
                Arweave is a permanent, decentralized hard drive that stores files forever for a one-time fee. 
                <strong className="text-slate-100"> ArDrive</strong> is the premier application built on Arweave to organize those files into clean, shareable drives and folders. 
                SANDS integrates with ArDrive to seamlessly store permanent NFT metadata and assets.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-800/60 pt-3">
              <div className="space-y-1.5">
                <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  🔗 ArDrive & Wallet Links
                </span>
                <ul className="space-y-2">
                  <li className="p-2 rounded-lg bg-slate-950/40 border border-slate-800/40">
                    <a
                      href="https://app.ardrive.io"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-teal-400 hover:text-teal-300 font-bold hover:underline"
                    >
                      Official ArDrive Web App <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="block text-slate-400 text-[10px] mt-0.5">
                      Open ArDrive to view, rename, download, and organize your permanent drives, folders, and files.
                    </span>
                  </li>
                  <li className="p-2 rounded-lg bg-slate-950/40 border border-slate-800/40">
                    <a
                      href="https://arweave.app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-teal-400 hover:text-teal-300 font-bold hover:underline"
                    >
                      Create Arweave Wallet (JWK) <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="block text-slate-400 text-[10px] mt-0.5">
                      Instantly generate an Arweave wallet, export the key as a <code className="text-slate-200">.json</code> file, and drag/paste it above.
                    </span>
                  </li>
                  <li className="p-2 rounded-lg bg-slate-950/40 border border-slate-800/40">
                    <a
                      href="https://www.arconnect.io"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-teal-400 hover:text-teal-300 font-bold hover:underline"
                    >
                      Install ArConnect Extension <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="block text-slate-400 text-[10px] mt-0.5">
                      The secure browser extension to manage Arweave keys and authorize web transactions.
                    </span>
                  </li>
                </ul>
              </div>

              <div className="space-y-1.5 md:border-l md:border-slate-800/60 md:pl-4">
                <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  ⚙️ Options for Fixing & Syncing Uploaded Files
                </span>
                <ul className="space-y-2">
                  <li className="p-2 rounded-lg bg-slate-950/40 border border-slate-800/40 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></div>
                      <span className="font-bold text-slate-200">Free Devnet Gateway Fallback Mode</span>
                    </div>
                    <p className="text-slate-400 text-[10px] pl-3">
                      If you connect an unfunded key (0 AR), we automatically route uploads through the <strong className="text-teal-400">Free Live Irys Devnet Gateway</strong>. Uploads succeed instantly and cost you zero fees!
                    </p>
                  </li>
                  <li className="p-2 rounded-lg bg-slate-950/40 border border-slate-800/40 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0"></div>
                      <span className="font-bold text-slate-200">Persistent Local DB Sync</span>
                    </div>
                    <p className="text-slate-400 text-[10px] pl-3">
                      We store all uploaded metadata and assets in our permanent SQL database mapped to your wallet. If you refresh, they restore automatically into the Explorer below.
                    </p>
                  </li>
                  <li className="p-2 rounded-lg bg-slate-950/40 border border-slate-800/40 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0"></div>
                      <span className="font-bold text-slate-200">Arweave GraphQL Indexer Sync</span>
                    </div>
                    <p className="text-slate-400 text-[10px] pl-3">
                      Click <strong className="text-teal-400">"Fetch Content"</strong> in the Explorer below. It queries the live decentralized network and gateway indexes to recover any missing live transactions for your address!
                    </p>
                  </li>
                </ul>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-teal-950/20 border border-teal-500/20 text-slate-300 font-mono text-[10px] flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-teal-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-teal-400 uppercase block">Pro Tip for Solana Minting:</span>
                The URLs generated here are fully compliant for Solana Compressed NFT (cNFT) Merkle tree configurations. You can use these metadata and image links directly to mint.
              </div>
            </div>
          </div>
        )}
      </div>
        </div>
      )}
    </div>
  );
}

