/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import { FileCode, UploadCloud, RefreshCw, Check, Image as ImageIcon, Copy, ExternalLink, AlertCircle, Upload, ChevronDown, ChevronUp } from "lucide-react";
import { MetaplexMetadata, ArweaveUploadState, ArDriveState } from "../types";
import { emitLog } from "./Terminal";

interface MetadataSectionProps {
  metadata: MetaplexMetadata;
  setMetadata: React.Dispatch<React.SetStateAction<MetaplexMetadata>>;
  arweaveState: ArweaveUploadState;
  setArweaveState: React.Dispatch<React.SetStateAction<ArweaveUploadState>>;
  arDrive: ArDriveState;
}

export default function MetadataSection({ metadata, setMetadata, arweaveState, setArweaveState, arDrive }: MetadataSectionProps) {
  const [copied, setCopied] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [optimizeImage, setOptimizeImage] = useState(true);
  const [provideLinkMyself, setProvideLinkMyself] = useState(false);
  const [imageRefreshTimestamp, setImageRefreshTimestamp] = useState(Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const compressImageToUnder100KB = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new window.Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) {
             reject(new Error("Failed to get canvas context"));
             return;
          }
          
          let width = img.width;
          let height = img.height;
          let quality = 0.9;
          const targetSize = 99 * 1024; // 99 KB to be safe

          const compress = () => {
             canvas.width = width;
             canvas.height = height;
             ctx.drawImage(img, 0, 0, width, height);
             const dataUrl = canvas.toDataURL("image/jpeg", quality);
             const size = Math.round((dataUrl.length * 3) / 4);
             
             if (size <= targetSize || (width < 100 && quality < 0.1)) {
                 resolve(dataUrl);
             } else {
                 if (quality > 0.5) {
                     quality -= 0.1;
                 } else {
                     width *= 0.9;
                     height *= 0.9;
                 }
                 compress();
             }
          };
          compress();
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!arDrive.isConnected) {
      emitLog("Upload rejected: Arweave wallet not connected.", "error");
      return;
    }

    setIsUploadingImage(true);
    try {
      let base64Data: string;
      let contentType = file.type;
      
      if (optimizeImage) {
        emitLog("Optimizing image for Free Tier (<100KB)...");
        base64Data = await compressImageToUnder100KB(file);
        contentType = "image/jpeg";
      } else {
        base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
      }
      
      const currentHistory = arweaveState.history || [];
      const extension = contentType.split("/")[1] || "png";
      const fileName = `image${currentHistory.length + 1}.${extension}`;

      emitLog("Uploading image to Arweave via Irys...");
      const jwk = JSON.parse(arDrive.keyfile);
      const res = await fetch("/api/arweave/upload-image", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ imageBase64: base64Data, jwk, contentType, fileName, ownerAddress: arDrive.address })
      });
      
      const result = await res.json();
      if (!res.ok) {
         throw new Error(result.error || `Upload failed with status ${res.status}`);
      }
      
      emitLog(`Image uploaded successfully! Size: ${(result.sizeBytes / 1024).toFixed(2)} KB. TxID: ${result.transactionId}`, "success");
      handleInputChange("image", result.imageUrl);
      
      const newUpload = {
        fileName,
        transactionId: result.transactionId,
        metadataUrl: result.imageUrl,
        simulatedCostAR: result.simulatedCostAR || "0.0001",
        simulatedCostUSD: result.simulatedCostUSD || "0.001",
      };

      setArweaveState((prev) => ({
        ...prev,
        history: [...(prev.history || []), newUpload],
      }));
    } catch (err: any) {
      emitLog(`Image upload failed: ${err.message}`, "error");
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleInputChange = (field: keyof MetaplexMetadata, value: any) => {
    setMetadata((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Upload JSON to Arweave via server API (using Irys)
  const handleArweaveUpload = async () => {
    if (!arDrive.isConnected) {
      emitLog("Upload rejected: Arweave wallet not connected.", "error");
      return;
    }

    emitLog("Initiating Irys permanent upload...");
    setArweaveState((prev) => ({ ...prev, isUploading: true }));

    try {
      const payloadString = JSON.stringify(metadata);
      const payloadSize = payloadString.length;
      emitLog(`Packaging payload... ${payloadSize} bytes.`);

      const jwk = JSON.parse(arDrive.keyfile);
      const currentHistory = arweaveState.history || [];
      const fileName = `collection${currentHistory.length + 1}.json`;

      emitLog("Sending to server for Irys signing & upload...");
      const res = await fetch("/api/arweave/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata, jwk, fileName, ownerAddress: arDrive.address }),
      });

      const result = await res.json();
      
      if (!res.ok) {
        throw new Error(result.error || `Upload failed with status ${res.status}`);
      }
      
      emitLog(`Upload successful! TxID: ${result.transactionId}`, "success");
      
      const newUpload = {
        fileName,
        transactionId: result.transactionId,
        metadataUrl: result.metadataUrl,
        simulatedCostAR: result.simulatedCostAR,
        simulatedCostUSD: result.simulatedCostUSD,
      };

      setArweaveState((prev) => ({
        ...prev,
        isUploading: false,
        transactionId: result.transactionId,
        metadataUrl: result.metadataUrl,
        simulatedCostAR: result.simulatedCostAR,
        simulatedCostUSD: result.simulatedCostUSD,
        fictionalArDriveCredentials: null,
        history: [...(prev.history || []), newUpload],
      }));
    } catch (err: any) {
      emitLog(`Upload failed: ${err.message}`, "error");
      console.error(err);
      setArweaveState((prev) => ({ ...prev, isUploading: false }));
    }
  };

  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isMetadataWarningCollapsed, setIsMetadataWarningCollapsed] = useState(true);

  return (
    <div id="metadata-configuration" className="p-5 rounded-2xl bg-slate-900/80 border border-teal-500/30 shadow-xl backdrop-blur-md">
      <div 
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <FileCode className="w-5 h-5 text-teal-400" />
          <h2 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
            Collection Account Metadata Producer
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-950/40 text-teal-400 border border-teal-500/20 font-bold uppercase">
            Metaplex JSON (v2)
          </span>
          {isCollapsed ? <ChevronDown className="w-4.5 h-4.5 text-slate-400 hover:text-white" /> : <ChevronUp className="w-4.5 h-4.5 text-slate-400 hover:text-white" />}
        </div>
      </div>

      {!isCollapsed && (
        <div className="mt-4 space-y-4 animate-fadeIn">

      <p className="text-xs text-slate-300 leading-relaxed">
        Format your digital asset details according to the Metaplex collection account v2 standard. This JSON contains the properties needed for your collection asset.
      </p>

      {/* Standard Schema Inputs */}
      <div className="space-y-3">
        {/* Name */}
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Collection Name</label>
          <input
            type="text"
            placeholder="E.g. S.A.N.D.S. Genesis"
            value={metadata.name}
            onChange={(e) => handleInputChange("name", e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 focus:outline-none rounded-lg px-2.5 py-1.5 text-xs text-white"
          />
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Lore / Description</label>
          <textarea
            placeholder="E.g. The premier configuration tier deployed live on Solana devnet."
            rows={2.5}
            value={metadata.description}
            onChange={(e) => handleInputChange("description", e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500 focus:outline-none rounded-lg px-2.5 py-1.5 text-xs text-white leading-relaxed resize-none"
          />
        </div>

        {/* Image Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Image Asset URL / Upload</label>
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                id="provideLinkMyself"
                checked={provideLinkMyself}
                onChange={(e) => setProvideLinkMyself(e.target.checked)}
                className="w-3 h-3 rounded border-slate-700 text-teal-500 focus:ring-teal-500 focus:ring-1 bg-slate-900 cursor-pointer"
              />
              <label htmlFor="provideLinkMyself" className="text-[10px] font-mono text-slate-500 cursor-pointer select-none">
                Provide the link myself
              </label>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="https://images.unsplash.com/photo-..."
              value={metadata.image}
              onChange={(e) => handleInputChange("image", e.target.value)}
              disabled={!provideLinkMyself}
              className={`flex-1 bg-slate-950 border border-slate-800 focus:outline-none rounded-lg px-2.5 py-1.5 text-xs text-white ${!provideLinkMyself ? 'opacity-50 cursor-not-allowed' : 'focus:border-teal-500'}`}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={provideLinkMyself || isUploadingImage || !arDrive.isConnected}
              title={provideLinkMyself ? "Uncheck 'Provide the link myself' to upload" : (!arDrive.isConnected ? "Connect ArDrive to upload images" : "Upload Image to Arweave")}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 rounded-lg text-xs font-mono text-white flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
            >
              {isUploadingImage ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Upload Image
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              className="hidden"
            />
          </div>
          <div className={`flex items-center gap-2 pl-1 ${provideLinkMyself ? 'opacity-50' : ''}`}>
            <input
              type="checkbox"
              id="optimizeImage"
              checked={optimizeImage}
              onChange={(e) => setOptimizeImage(e.target.checked)}
              disabled={provideLinkMyself}
              className="w-3 h-3 rounded border-slate-700 text-teal-500 focus:ring-teal-500 focus:ring-1 bg-slate-900 cursor-pointer disabled:cursor-not-allowed"
            />
            <label htmlFor="optimizeImage" className={`text-[10px] font-mono text-slate-500 select-none ${provideLinkMyself ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              Downscale for cost-efficient free-tier storage ({"<"} 100KB)
            </label>
          </div>
        </div>
      </div>

      {/* Grid: Preview & Live JSON block */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2">
        {/* Visual Preview */}
        <div className="md:col-span-5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Visual Asset Preview</span>
            {metadata.image && (
              <button
                onClick={() => setImageRefreshTimestamp(Date.now())}
                className="text-slate-500 hover:text-teal-400 p-0.5 rounded transition-colors"
                title="Refresh Image Preview"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="w-full aspect-square rounded-xl bg-slate-950 border border-slate-850 flex flex-col items-center justify-center overflow-hidden relative group">
            {metadata.image ? (
              <>
                <img
                  key={imageRefreshTimestamp}
                  src={metadata.image.startsWith('data:') ? metadata.image : `${metadata.image}${metadata.image.includes('?') ? '&' : '?'}t=${imageRefreshTimestamp}`}
                  alt={metadata.name || "NFT Preview"}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950 to-transparent p-2 text-[10px] font-mono text-slate-300">
                  <div className="font-bold truncate text-white">{metadata.name || "Untitled NFT"}</div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1 text-slate-500 p-4 text-center">
                <ImageIcon className="w-8 h-8 text-slate-600 animate-pulse" />
                <span className="text-[10px] font-mono">Awaiting image URL...</span>
              </div>
            )}
          </div>
        </div>

        {/* JSON Schema */}
        <div className="md:col-span-7 space-y-1.5">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Metaplex JSON Standard (v2)</span>
          <div className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-[9px] font-mono text-slate-400 h-[190px] overflow-auto scrollbar-thin">
            <pre className="text-emerald-400 leading-normal select-all">
              {JSON.stringify(metadata, null, 2)}
            </pre>
          </div>
        </div>
      </div>

      {/* Arweave Upload Simulation button */}
      <div className="pt-2">
        {!arDrive.isConnected && (
          <div className="mb-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px]">
            <div 
              className="flex items-center justify-between cursor-pointer select-none"
              onClick={() => setIsMetadataWarningCollapsed(!isMetadataWarningCollapsed)}
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="font-bold">Permanent Upload Restricted</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-amber-500/60 lowercase font-sans font-normal">click to expand</span>
                {isMetadataWarningCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-amber-500/60" /> : <ChevronUp className="w-3.5 h-3.5 text-amber-500/60" />}
              </div>
            </div>
            {!isMetadataWarningCollapsed && (
              <div className="mt-1.5 pt-1.5 border-t border-amber-500/10 animate-fadeIn text-[10px] leading-relaxed">
                Connect to ArDrive / Arweave (above) to enable permanent uploads of your collection account metadata on-chain.
              </div>
            )}
          </div>
        )}
        <button
          onClick={handleArweaveUpload}
          disabled={arweaveState.isUploading || !metadata.name || !arDrive.isConnected}
          className="w-full py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-40 rounded-xl font-mono text-xs text-white font-bold transition-all shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
        >
          {arweaveState.isUploading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Anchoring metadata on Arweave gateway...
            </>
          ) : (
            <>
              <UploadCloud className="w-4 h-4" />
              Upload Metadata to Arweave
            </>
          )}
        </button>

        {arweaveState.metadataUrl && (
          <div className="mt-3 p-3 bg-slate-950 border border-teal-500/20 rounded-xl space-y-2 animate-fadeIn">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-mono text-teal-400 uppercase font-bold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Permanent AR Link Anchored
              </span>
              <span className="text-[9px] font-mono text-emerald-400 font-bold bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/10">Cost: {arweaveState.simulatedCostAR} AR</span>
            </div>
            <div className="flex gap-2 items-center">
              <div className="flex-1 text-xs font-mono text-teal-300 truncate bg-slate-900 p-2 rounded border border-slate-800">
                {arweaveState.metadataUrl}
              </div>
              <button
                onClick={async () => {
                  if (arweaveState.metadataUrl) {
                    try {
                      await navigator.clipboard.writeText(arweaveState.metadataUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch (e) {
                      console.error("Clipboard write failed", e);
                    }
                  }
                }}
                title="Copy Link to Clipboard"
                className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-teal-500/40 rounded-lg text-slate-400 hover:text-teal-400 transition-all flex items-center justify-center cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
              {arweaveState.metadataUrl && (
                <a
                  href={arweaveState.metadataUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in new tab"
                  className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-teal-500/40 rounded-lg text-slate-400 hover:text-teal-400 transition-all flex items-center justify-center cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
            <div className="flex justify-between items-center text-[9px] text-slate-500">
              <span>Arweave TX: {arweaveState.transactionId?.slice(0, 16)}...</span>
              <span className="italic">Decentralized persistent storage verified</span>
            </div>
          </div>
        )}
      </div>
        </div>
      )}
    </div>
  );
}
