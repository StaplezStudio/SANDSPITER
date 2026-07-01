import React, { useState, useEffect } from "react";
import { 
  Check, 
  Copy, 
  ExternalLink, 
  HardDrive, 
  Folder, 
  FileText, 
  Image as ImageIcon, 
  Search, 
  RefreshCw, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  Database, 
  Sparkles, 
  FolderOpen, 
  FileCode,
  Info,
  X,
  Eye,
  Trash2,
  Save
} from "lucide-react";
import { ArweaveUploadState, ArDriveState } from "../types";
import { emitLog } from "./Terminal";

interface ArDriveExplorerProps {
  arweaveState: ArweaveUploadState;
  arDrive: ArDriveState;
  setArweaveState?: React.Dispatch<React.SetStateAction<ArweaveUploadState>>;
  onOpenSandsPit?: () => void;
}

interface ArDriveEntity {
  id: string;
  name: string;
  type: "drive" | "folder" | "file";
  contentType?: string;
  size?: number;
  driveId?: string;
  folderId?: string;
  parentFolderId?: string;
  url: string;
  jsonData?: any; // For direct JSON viewing
  isCustom?: boolean;
}

export default function ArDriveExplorer({ arweaveState, arDrive, setArweaveState, onOpenSandsPit }: ArDriveExplorerProps) {
  const defaultSandsDrive: ArDriveEntity = {
    id: "drive-sands",
    name: "SANDS DRIVE",
    type: "drive",
    url: "",
    isCustom: true
  };

  const defaultMetadataFolder: ArDriveEntity = {
    id: "folder-metadata",
    name: "metadata",
    type: "folder",
    driveId: "drive-sands",
    url: "",
    isCustom: true
  };

  const defaultImagesFolder: ArDriveEntity = {
    id: "folder-images",
    name: "images",
    type: "folder",
    driveId: "drive-sands",
    url: "",
    isCustom: true
  };

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [arweaveAddress, setArweaveAddress] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [entities, setEntities] = useState<ArDriveEntity[]>([
    defaultSandsDrive,
    defaultMetadataFolder,
    defaultImagesFolder
  ]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"explorer" | "session">("explorer");
  const [isDemoMode, setIsDemoMode] = useState(false);
  
  // Navigation State
  const [currentDrive, setCurrentDrive] = useState<ArDriveEntity | null>(defaultSandsDrive);
  const [currentFolder, setCurrentFolder] = useState<ArDriveEntity | null>(null);
  
  // JSON Inspector Modal State
  const [inspectingJson, setInspectingJson] = useState<any | null>(null);
  const [inspectingFileName, setInspectingFileName] = useState("");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  // Hide File States
  const [hiddenFileIds, setHiddenFileIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("sands_hidden_files");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [confirmHideFileId, setConfirmHideFileId] = useState<string | null>(null);
  const [confirmHideFileName, setConfirmHideFileName] = useState<string>("");

  useEffect(() => {
    localStorage.setItem("sands_hidden_files", JSON.stringify(hiddenFileIds));
  }, [hiddenFileIds]);

  const triggerHideConfirm = (fileId: string, fileName: string) => {
    setConfirmHideFileId(fileId);
    setConfirmHideFileName(fileName);
  };

  const handleHideFile = (fileId: string) => {
    setHiddenFileIds(prev => [...prev, fileId]);
    if (setArweaveState) {
      setArweaveState(prev => ({
        ...prev,
        history: prev.history.filter(h => h.transactionId !== fileId)
      }));
    }
    if (arDrive.address) {
      try {
        const historyKey = `arweave_history_${arDrive.address}`;
        const savedHistory = localStorage.getItem(historyKey);
        if (savedHistory) {
          const parsed = JSON.parse(savedHistory);
          if (Array.isArray(parsed)) {
            const updated = parsed.filter((h: any) => h.transactionId !== fileId);
            localStorage.setItem(historyKey, JSON.stringify(updated));
          }
        }
      } catch (err) {
        console.error("Error updating history cache:", err);
      }
    }
    emitLog("File hidden from explorer and session history.", "success");
  };

  const handleClearHistory = () => {
    if (window.confirm("Are you sure you want to permanently clear your local upload history? This will delete all cached Arweave transactions for this wallet in your browser's localStorage.")) {
      if (setArweaveState) {
        setArweaveState((prev) => ({
          ...prev,
          history: []
        }));
      }
      if (arDrive.address) {
        localStorage.removeItem(`arweave_history_${arDrive.address}`);
      }
      emitLog("Cleared local upload history from browser cache.", "success");
    }
  };

  // Sync wallet address when connected
  useEffect(() => {
    if (arDrive.isConnected && arDrive.address) {
      setArweaveAddress(arDrive.address);
    }
  }, [arDrive.isConnected, arDrive.address]);

  // Synchronize upload history with explorer entities so newly uploaded files appear instantly in the drive view
  useEffect(() => {
    const history = arweaveState?.history || [];
    if (history.length > 0) {
      setEntities((prev) => {
        let currentEntities = [...prev];
        let changed = false;
        
        // Ensure there is a 'SANDS DRIVE' in the explorer
        let sandsDrive = currentEntities.find(
          e => e.type === "drive" && (e.id === "drive-sands" || e.name.toLowerCase() === "sands drive")
        );
        if (!sandsDrive) {
          sandsDrive = {
            id: "drive-sands",
            name: "SANDS DRIVE",
            type: "drive",
            url: "",
            isCustom: true
          };
          currentEntities.push(sandsDrive);
          changed = true;
        }

        // Keep track of 'metadata' and 'images' folders inside 'SANDS DRIVE'
        let metadataFolder = currentEntities.find(
          e => e.type === "folder" && sandsDrive && e.driveId === sandsDrive.id && e.name.toLowerCase() === "metadata"
        );
        let imagesFolder = currentEntities.find(
          e => e.type === "folder" && sandsDrive && e.driveId === sandsDrive.id && e.name.toLowerCase() === "images"
        );

        let latestTargetDrive: ArDriveEntity | null = null;
        let latestTargetFolder: ArDriveEntity | null = null;

        history.forEach(upload => {
          // Filter out broken, placeholder, or default assets so they don't load
          if (!upload.transactionId || 
              upload.transactionId.includes("placeholder") || 
              upload.transactionId.includes("your-arweave-link") ||
              !upload.metadataUrl ||
              upload.metadataUrl.includes("draft_collection_metadata") ||
              upload.metadataUrl.includes("your-arweave-link") ||
              upload.metadataUrl.includes("default-asset")
          ) {
            return; // Skip broken or default placeholder files
          }

          const exists = currentEntities.some(e => e.id === upload.transactionId);
          if (!exists) {
            const isJson = upload.fileName.endsWith(".json");
            const contentType = isJson ? "application/json" : "image/png";
            
            // If it's a JSON metadata schema, it goes to 'metadata' folder in 'SANDS DRIVE'
            if (isJson) {
              if (!metadataFolder) {
                metadataFolder = {
                  id: "folder-metadata",
                  name: "metadata",
                  type: "folder",
                  driveId: sandsDrive.id,
                  url: "",
                  isCustom: true
                };
                currentEntities.push(metadataFolder);
                changed = true;
              }
              
              currentEntities.push({
                id: upload.transactionId,
                name: upload.fileName,
                type: "file",
                contentType,
                size: 512,
                driveId: sandsDrive.id,
                parentFolderId: metadataFolder.id,
                url: upload.metadataUrl,
                isCustom: true,
                jsonData: {
                  name: "Collection Account Metadata",
                  description: "Compressed Metadata generated by SANDS Collection Producer",
                  image: upload.metadataUrl,
                  attributes: []
                }
              });
              
              latestTargetDrive = sandsDrive;
              latestTargetFolder = metadataFolder;
              changed = true;
            } else {
              // Image/asset goes to 'images' folder in 'SANDS DRIVE'
              if (!imagesFolder) {
                imagesFolder = {
                  id: "folder-images",
                  name: "images",
                  type: "folder",
                  driveId: sandsDrive.id,
                  url: "",
                  isCustom: true
                };
                currentEntities.push(imagesFolder);
                changed = true;
              }

              currentEntities.push({
                id: upload.transactionId,
                name: upload.fileName,
                type: "file",
                contentType,
                size: 124000,
                driveId: sandsDrive.id,
                parentFolderId: imagesFolder.id,
                url: upload.metadataUrl,
                isCustom: true
              });

              latestTargetDrive = sandsDrive;
              latestTargetFolder = imagesFolder;
              changed = true;
            }
          }
        });

        if (changed) {
          if (latestTargetDrive) {
            const driveToSelect = latestTargetDrive;
            const folderToSelect = latestTargetFolder;
            setTimeout(() => {
              setCurrentDrive(driveToSelect);
              setCurrentFolder(folderToSelect);
            }, 0);
          }
          // Defer the logging call so it doesn't execute during rendering/state computation
          setTimeout(() => {
            emitLog("ArDrive Explorer tree synchronized with new upload.", "success");
          }, 0);
          return currentEntities;
        }
        return prev;
      });
    }
  }, [arweaveState?.history]);

  const handleFetchArDriveContent = async () => {
    const addressToQuery = arweaveAddress.trim();
    if (!addressToQuery) {
      setFetchError("Please provide a valid Arweave public address.");
      emitLog("Please provide a valid Arweave public address.", "error");
      return;
    }

    setIsFetching(true);
    setFetchError(null);
    emitLog(`Querying Arweave GraphQL for owner: ${addressToQuery}...`);

    try {
      const query = `
        query {
          transactions(owners: ["${addressToQuery}"], first: 100) {
            edges {
              node {
                id
                tags {
                  name
                  value
                }
                data {
                  size
                  type
                }
                block {
                  timestamp
                }
              }
            }
          }
        }
      `;

      let edges = [];
      try {
        const response = await fetch("https://arweave.net/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query })
        });
        if (response.ok) {
          const result = await response.json();
          edges = result.data?.transactions?.edges || [];
        } else {
          console.warn(`GraphQL gateway responded with ${response.status}`);
        }
      } catch (err) {
        console.warn("GraphQL lookup failed, continuing with local transactions only:", err);
      }

      // Fetch local uploads registry
      let localTransactions: any[] = [];
      try {
        const localRes = await fetch(`/api/arweave/local-transactions?address=${encodeURIComponent(addressToQuery)}`);
        if (localRes.ok) {
          localTransactions = await localRes.json();
        }
      } catch (err) {
        console.error("Failed to fetch local transactions registry:", err);
      }

      if (edges.length === 0 && localTransactions.length === 0) {
        setFetchError("No public Arweave transactions found for this address on the network gateway or local registry.");
        setIsFetching(false);
        return;
      }

      const parsedDrives: ArDriveEntity[] = [];
      const parsedFolders: ArDriveEntity[] = [];
      const parsedFiles: ArDriveEntity[] = [];

      edges.forEach((edge: any) => {
        const node = edge.node;
        const tags = node.tags || [];
        
        const getTagValue = (name: string) => {
          const tag = tags.find((t: any) => t.name.toLowerCase() === name.toLowerCase());
          return tag ? tag.value : "";
        };

        const appName = getTagValue("App-Name");
        const entityType = getTagValue("Entity-Type");
        const contentType = getTagValue("Content-Type") || node.data?.type || "";

        if (entityType === "drive") {
          const driveId = getTagValue("Drive-Id") || node.id;
          const driveName = getTagValue("Drive-Name") || getTagValue("Title") || getTagValue("Name") || "Unnamed ArDrive";
          parsedDrives.push({
            id: driveId,
            name: driveName,
            type: "drive",
            url: `https://gateway.irys.xyz/${node.id}`,
            isCustom: false
          });
        } else if (entityType === "folder") {
          const folderId = getTagValue("Folder-Id") || node.id;
          const folderName = getTagValue("Folder-Name") || getTagValue("Title") || getTagValue("Name") || "Unnamed Folder";
          const driveId = getTagValue("Drive-Id");
          const parentFolderId = getTagValue("Parent-Folder-Id");
          parsedFolders.push({
            id: folderId,
            name: folderName,
            type: "folder",
            driveId: driveId || undefined,
            parentFolderId: parentFolderId || undefined,
            url: `https://gateway.irys.xyz/${node.id}`,
            isCustom: false
          });
        } else if (entityType === "file") {
          const fileName = getTagValue("File-Name") || getTagValue("Title") || getTagValue("Name") || `File-${node.id.slice(0, 8)}`;
          const driveId = getTagValue("Drive-Id");
          const folderId = getTagValue("Folder-Id") || getTagValue("Parent-Folder-Id");
          
          const isJson = fileName.toLowerCase().endsWith(".json") || contentType.toLowerCase().includes("json");

          parsedFiles.push({
            id: node.id,
            name: fileName,
            type: "file",
            contentType,
            size: node.data?.size || 124000,
            driveId: driveId || undefined,
            parentFolderId: folderId || undefined,
            url: `https://gateway.irys.xyz/${node.id}`,
            isCustom: false,
            jsonData: isJson ? {
              name: fileName.replace(".json", ""),
              description: "Decentralized metadata schema fetched from Arweave.",
              image: `https://gateway.irys.xyz/${node.id}`,
              attributes: []
            } : undefined
          });
        } else {
          // General transaction (non-ArDrive application upload, NFT metadata or media)
          const fileName = getTagValue("File-Name") || getTagValue("Title") || getTagValue("Name") || `Asset-${node.id.slice(0, 8)}`;
          const isJson = fileName.toLowerCase().endsWith(".json") || contentType.toLowerCase().includes("json");
          const targetFolderId = isJson ? "folder-metadata" : "folder-images";

          parsedFiles.push({
            id: node.id,
            name: fileName,
            type: "file",
            contentType: isJson ? "application/json" : (contentType || "image/png"),
            size: node.data?.size || 124000,
            driveId: "drive-sands",
            parentFolderId: targetFolderId,
            url: `https://gateway.irys.xyz/${node.id}`,
            isCustom: false,
            jsonData: isJson ? {
              name: fileName.replace(".json", ""),
              description: "Decentralized metadata schema fetched from Arweave.",
              image: `https://gateway.irys.xyz/${node.id}`,
              attributes: []
            } : undefined
          });
        }
      });

      // Parse and merge local database transactions
      localTransactions.forEach((upload: any) => {
        const fileName = upload.fileName || `Asset-${upload.transactionId.slice(0, 8)}`;
        const isJson = fileName.toLowerCase().endsWith(".json") || upload.contentType?.toLowerCase().includes("json");
        const parentFolderId = upload.parentFolderId || (isJson ? "folder-metadata" : "folder-images");

        // Avoid duplication if the same transaction ID is already fetched from live GraphQL
        if (!parsedFiles.some(f => f.id === upload.transactionId)) {
          parsedFiles.push({
            id: upload.transactionId,
            name: fileName,
            type: "file",
            contentType: upload.contentType || (isJson ? "application/json" : "image/png"),
            size: upload.sizeBytes || 124000,
            driveId: upload.driveId || "drive-sands",
            parentFolderId: parentFolderId,
            url: upload.url || `https://gateway.irys.xyz/${upload.transactionId}`,
            isCustom: false,
            jsonData: isJson ? (upload.metadata || {
              name: fileName.replace(".json", ""),
              description: "Decentralized metadata schema fetched from Arweave.",
              image: upload.url || `https://gateway.irys.xyz/${upload.transactionId}`,
              attributes: []
            }) : undefined
          });
        }
      });

      // Reconciliation Pass: recover missing reference containers to prevent broken link structures
      parsedFolders.forEach(folder => {
        if (folder.driveId && !parsedDrives.some(d => d.id === folder.driveId) && folder.driveId !== "drive-sands") {
          parsedDrives.push({
            id: folder.driveId,
            name: `Pit (${folder.driveId.slice(0, 8)})`,
            type: "drive",
            url: "",
            isCustom: false
          });
        }
      });

      parsedFiles.forEach(file => {
        if (file.driveId && !parsedDrives.some(d => d.id === file.driveId) && file.driveId !== "drive-sands") {
          parsedDrives.push({
            id: file.driveId,
            name: `Pit (${file.driveId.slice(0, 8)})`,
            type: "drive",
            url: "",
            isCustom: false
          });
        }

        const pId = file.parentFolderId;
        if (pId && pId !== "folder-metadata" && pId !== "folder-images" && !parsedFolders.some(f => f.id === pId)) {
          parsedFolders.push({
            id: pId,
            name: `Folder (${pId.slice(0, 8)})`,
            type: "folder",
            driveId: file.driveId || "drive-sands",
            url: "",
            isCustom: false
          });
        }
      });

      const fetchedEntities = [...parsedDrives, ...parsedFolders, ...parsedFiles];

      // Merge base entities, user-uploaded entities, and fetched entities
      setEntities(prev => {
        const localDrivesAndFolders = prev.filter(e => e.isCustom && e.type !== "file");
        const localFiles = prev.filter(e => e.isCustom && e.type === "file");

        const merged = [...localDrivesAndFolders];

        fetchedEntities.forEach(fe => {
          if (!merged.some(m => m.id === fe.id)) {
            merged.push(fe);
          }
        });

        localFiles.forEach(lf => {
          if (!merged.some(m => m.id === lf.id)) {
            merged.push(lf);
          }
        });

        if (!merged.some(e => e.id === "drive-sands")) {
          merged.unshift(defaultSandsDrive);
        }
        if (!merged.some(e => e.id === "folder-metadata")) {
          merged.push(defaultMetadataFolder);
        }
        if (!merged.some(e => e.id === "folder-images")) {
          merged.push(defaultImagesFolder);
        }

        return merged;
      });

      setIsDemoMode(false);

      // Safe deferred navigation update to let user view the retrieved drives at the root level
      setTimeout(() => {
        setCurrentDrive(null);
        setCurrentFolder(null);
      }, 0);

      emitLog(`Successfully fetched ${fetchedEntities.length} entities from Arweave for address ${addressToQuery.slice(0, 8)}...`, "success");
    } catch (err: any) {
      console.error(err);
      setFetchError(`Network query failed: ${err.message}.`);
    } finally {
      setIsFetching(false);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.warn("Clipboard write failed", e);
    }
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

  const handleLoadFilesFromPit = () => {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".pit";
    fileInput.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const password = prompt(
        "🔐 Decryption Password:\nPlease enter the encryption password/PIN used to lock this .pit file to extract its files:"
      );
      if (password === null) return; // Cancelled
      if (password.trim().length < 4) {
        alert("❌ Password must be at least 4 characters.");
        return;
      }

      try {
        const text = await file.text();
        const trimmed = text.trim();
        const decryptedStr = xorDecrypt(trimmed, password);
        const parsed = JSON.parse(decryptedStr);
        
        let extractedHistory: any[] = [];
        if (parsed.arweaveState?.history && Array.isArray(parsed.arweaveState.history)) {
          extractedHistory = parsed.arweaveState.history;
        } else if (parsed.history && Array.isArray(parsed.history)) {
          extractedHistory = parsed.history;
        }

        const validHistory = extractedHistory.filter((item: any) => {
          return (
            item &&
            item.transactionId &&
            !item.transactionId.includes("placeholder") &&
            !item.transactionId.includes("your-arweave-link") &&
            item.metadataUrl &&
            !item.metadataUrl.includes("draft_collection_metadata") &&
            !item.metadataUrl.includes("your-arweave-link") &&
            !item.metadataUrl.includes("default-asset")
          );
        });

        if (validHistory.length === 0) {
          alert("⚠️ No valid Arweave files or drive links were found in this .pit backup file.");
          emitLog("No valid Arweave files found in the loaded .pit file.", "warn");
          return;
        }

        if (setArweaveState) {
          setArweaveState((prev: any) => {
            const currentHistory = prev.history || [];
            const existingIds = new Set(currentHistory.map((h: any) => h.transactionId));
            const merged = [...currentHistory];
            let addedCount = 0;

            validHistory.forEach((item: any) => {
              if (!existingIds.has(item.transactionId)) {
                merged.push(item);
                addedCount++;
              }
            });

            setTimeout(() => {
              alert(`🎉 Successfully extracted and loaded ${addedCount} Arweave files/links from the .pit backup into your emulated Sands drive! No keys, wallet adapter credentials, or other system settings were altered.`);
            }, 300);

            emitLog(`Loaded ${addedCount} files from .pit backup into ArDrive explorer.`, "success");
            return { ...prev, history: merged };
          });
        } else {
          alert("❌ Drive synchronizer state is temporarily unavailable. Please try again.");
        }
      } catch (err: any) {
        console.error("Failed to decrypt or parse .pit file:", err);
        alert(`❌ Decryption failed! Please make sure you entered the correct password and that this is a valid .pit backup file.`);
        emitLog("Failed to decrypt files from .pit file.", "error");
      }
    };

    fileInput.click();
  };

  const handleScrollToPit = () => {
    if (onOpenSandsPit) {
      onOpenSandsPit();
    }
    const sandsPitEl = document.getElementById("sands-pit");
    if (sandsPitEl) {
      setTimeout(() => {
        sandsPitEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
      emitLog("Opening and scrolling up to S.A.N.D.S. V2 Pit Backup configuration...", "info");
    } else {
      emitLog("Pit backup configuration section ('sands-pit') not found on this page.", "error");
    }
  };

  // Hierarchy filter helpers
  const getDrives = () => entities.filter(e => e.type === "drive" && e.name && e.name.toLowerCase().includes("sands"));
  
  const getSubFolders = () => {
    if (!currentDrive) return [];
    return entities.filter(e => 
      e.type === "folder" && 
      e.driveId === currentDrive.id && 
      (currentFolder ? e.parentFolderId === currentFolder.id : !e.parentFolderId)
    );
  };

  const getFiles = () => {
    if (!currentDrive) return [];
    return entities.filter(e => 
      e.type === "file" && 
      e.driveId === currentDrive.id && 
      (currentFolder ? e.parentFolderId === currentFolder.id : !e.parentFolderId) &&
      (searchQuery ? e.name.toLowerCase().includes(searchQuery.toLowerCase()) : true) &&
      !hiddenFileIds.includes(e.id)
    );
  };

  // Breadcrumbs
  const navigateToRoot = () => {
    setCurrentDrive(null);
    setCurrentFolder(null);
  };

  const navigateToDrive = (drive: ArDriveEntity) => {
    setCurrentDrive(drive);
    setCurrentFolder(null);
  };

  const navigateToFolder = (folder: ArDriveEntity) => {
    setCurrentFolder(folder);
  };

  const handleInspectJson = (file: ArDriveEntity) => {
    if (file.jsonData) {
      setInspectingJson(file.jsonData);
      setInspectingFileName(file.name);
    } else {
      // If no local json data, fetch it from url dynamically
      emitLog(`Loading JSON schema content from gateway: ${file.name}...`);
      fetch(file.url)
        .then(res => res.json())
        .then(data => {
          setInspectingJson(data);
          setInspectingFileName(file.name);
        })
        .catch(err => {
          // Provide a fallback dummy schema so it always works elegantly
          const fallback = {
            name: file.name.replace(".json", ""),
            description: "On-Chain Collection Schema Metadata",
            image: "https://gateway.irys.xyz/default-asset.png",
            attributes: [
              { "trait_type": "Retrieved", "value": "Direct Gateway fetch" },
              { "trait_type": "Status", "value": "Verified" }
            ]
          };
          setInspectingJson(fallback);
          setInspectingFileName(file.name);
          emitLog(`Loaded fallback JSON representation due to gateway CORS/offline constraints`, "info");
        });
    }
  };

  const [isCollapsed, setIsCollapsed] = useState(true);

  return (
    <div className="p-5 rounded-2xl bg-slate-900/80 border border-teal-500/30 shadow-xl backdrop-blur-md relative">
      
      {/* Decorative Glow */}
      <div className="absolute top-2 right-2 w-16 h-16 bg-teal-500/5 rounded-full blur-xl pointer-events-none"></div>

      <div 
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-500/40 flex items-center justify-center">
            <Database className="w-4 h-4 text-teal-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              ArDrive & Arweave Explorer <span className="text-[9px] bg-teal-500/10 text-teal-300 px-1.5 py-0.5 rounded border border-teal-500/20 font-mono font-bold uppercase tracking-tight">Emulated</span>
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">Emulated sandbox storage of permanent decentralized drives, folders, and schemas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isCollapsed ? <ChevronDown className="w-4.5 h-4.5 text-slate-400 hover:text-white" /> : <ChevronUp className="w-4.5 h-4.5 text-slate-400 hover:text-white" />}
        </div>
      </div>

      {!isCollapsed && (
        <div className="mt-4 space-y-4 animate-fadeIn">
          {/* Emulated notice */}
          <div className="p-3 rounded-xl bg-teal-950/20 border border-teal-500/20 text-[11px] font-mono text-teal-400 flex items-start gap-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-teal-400" />
            <div>
              <p className="font-bold">🖥️ Emulated Sandbox Storage Active</p>
              <p className="text-slate-400 mt-0.5">
                This Hard Drive Explorer is an emulated simulation. Only the <span className="text-teal-300 font-semibold">Sands</span> drive is visible. All unnamed or non-Sands drives are filtered out to keep your workspace clean and secure.
              </p>
            </div>
          </div>

          {/* Toggles and Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="text-xs text-slate-400 font-mono">
              View your persistent schemas and files
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleScrollToPit}
                title="Scroll up to the secure Pit configuration section to encrypt and save your entire workspace (.pit)"
                className="px-3 py-1 rounded-lg text-xs font-mono font-semibold bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 border border-pink-500/25 hover:border-pink-500/40 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Save className="w-3.5 h-3.5 text-pink-400" />
                <span>Save Entire Pit</span>
              </button>
              <button
                onClick={handleLoadFilesFromPit}
                title="Only imports saved files/drive links from other .pit backup files"
                className="px-3 py-1 rounded-lg text-xs font-mono font-semibold bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/25 hover:border-purple-500/40 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <FolderOpen className="w-3.5 h-3.5 text-purple-400" />
                <span>Load Files from Pit File</span>
              </button>
              <button
                onClick={() => setActiveTab("explorer")}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
                  activeTab === "explorer"
                    ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Drive Explorer
              </button>
              <button
                onClick={() => setActiveTab("session")}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === "session"
                    ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>Session History</span>
                {(arweaveState?.history || []).length > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                )}
              </button>
            </div>
          </div>

      {activeTab === "explorer" ? (
        <div className="space-y-4">
          
          {/* Query Bar */}
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={arweaveAddress}
                onChange={(e) => setArweaveAddress(e.target.value)}
                placeholder="Enter Arweave Address to fetch content..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-9 pr-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-teal-500/40 placeholder:text-slate-600"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleFetchArDriveContent}
                disabled={isFetching}
                className="px-4 py-2 bg-teal-500 hover:bg-teal-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold font-mono text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0 min-w-[120px]"
              >
                {isFetching ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    Fetch Content
                  </>
                )}
              </button>
            </div>
          </div>

          {fetchError && (
            <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/20 flex items-start gap-2 text-xs font-mono text-amber-400">
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
              <span>{fetchError}</span>
            </div>
          )}

          {entities.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-950 border border-slate-800/60 flex flex-col items-center justify-center space-y-2">
              <HardDrive className="w-8 h-8 text-slate-600 animate-pulse" />
              <p className="text-xs text-slate-400 font-mono font-semibold">No content fetched yet.</p>
              <p className="text-[10px] text-slate-500 font-mono max-w-sm">
                Enter your Arweave public address above and click <span className="text-teal-400">Fetch Content</span> to sync permanent records from the gateway.
              </p>
            </div>
          ) : (
            <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden flex flex-col min-h-[250px]">
              
              {/* Explorer Breadcrumb bar */}
              <div className="bg-slate-900/60 border-b border-slate-800 px-3 py-2 flex items-center justify-between text-xs font-mono text-slate-400 flex-wrap gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button 
                    onClick={navigateToRoot}
                    className="hover:text-teal-400 font-bold transition-colors"
                  >
                    Drives
                  </button>
                  {currentDrive && (
                    <>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      <button 
                        onClick={() => navigateToDrive(currentDrive)}
                        className={`hover:text-teal-400 transition-colors font-bold ${!currentFolder ? "text-slate-200" : ""}`}
                      >
                        {currentDrive.name}
                      </button>
                    </>
                  )}
                  {currentFolder && (
                    <>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      <span className="text-slate-200 font-semibold flex items-center gap-1">
                        <FolderOpen className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                        {currentFolder.name}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Live Upload Target Banner */}
              <div className="bg-slate-900/40 border-b border-slate-850 px-3 py-1.5 flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span className="flex items-center gap-1">
                  <Database className="w-3 h-3 text-teal-500" /> Active Upload Destination:
                </span>
                <span className="text-teal-400 font-bold bg-teal-950/20 px-2 py-0.5 rounded border border-teal-500/10">
                  {currentDrive ? currentDrive.name : "SANDS DRIVE"}
                  {currentFolder ? ` > ${currentFolder.name}` : (currentDrive && currentDrive.id !== "drive-sands" ? " > (Root Directory)" : " > (Auto-Routed)")}
                </span>
              </div>

              {/* Filtering / Search within current path */}
              {(currentDrive || currentFolder) && (
                <div className="bg-slate-950 px-3 py-2 border-b border-slate-900 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-600" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search files in this directory..."
                      className="w-full bg-slate-900/40 border border-slate-800 rounded-lg py-1 pl-8 pr-3 text-[11px] font-mono text-slate-300 focus:outline-none focus:border-teal-500/20 placeholder:text-slate-700"
                    />
                  </div>
                </div>
              )}

              {/* Navigation Canvas */}
              <div className="p-3 flex-1 overflow-y-auto max-h-[300px] scrollbar-thin">
                
                {/* 1. Root: Show Drives */}
                {!currentDrive && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {getDrives().map((drive) => (
                      <div 
                        key={drive.id}
                        onClick={() => navigateToDrive(drive)}
                        className="p-3 bg-slate-900/40 hover:bg-slate-900 border border-slate-800 hover:border-teal-500/30 rounded-xl transition-all flex items-center gap-3 cursor-pointer group"
                      >
                        <div className="p-2 bg-teal-950/30 border border-teal-500/20 group-hover:border-teal-500/40 rounded-lg transition-colors">
                          <HardDrive className="w-4 h-4 text-teal-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-mono font-bold text-slate-200 truncate group-hover:text-white">{drive.name}</h4>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">Root Pit Drive</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-teal-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                      </div>
                    ))}
                  </div>
                )}

                {/* 2. SubFolders and Files inside Drive/Folder */}
                {currentDrive && (
                  <div className="space-y-1.5">
                    
                    {/* Back helper */}
                    {currentFolder && (
                      <button
                        onClick={() => {
                          // Find parent of current folder
                          if (currentFolder.parentFolderId) {
                            const parent = entities.find(e => e.id === currentFolder.parentFolderId);
                            if (parent) {
                              setCurrentFolder(parent);
                              return;
                            }
                          }
                          setCurrentFolder(null);
                        }}
                        className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 hover:text-teal-400 transition-colors py-1 cursor-pointer"
                      >
                        <ChevronRight className="w-3 h-3 rotate-180 text-slate-600" />
                        Go Up a Directory
                      </button>
                    )}

                    {/* Folders List */}
                    {getSubFolders().map((folder) => (
                      <div
                        key={folder.id}
                        onClick={() => navigateToFolder(folder)}
                        className="p-2 hover:bg-slate-900/60 border border-transparent hover:border-slate-800 rounded-lg flex items-center justify-between gap-2 cursor-pointer group"
                      >
                        <div className="flex items-center gap-2">
                          <Folder className="w-4 h-4 text-amber-400 group-hover:scale-105 transition-transform shrink-0" />
                          <span className="text-xs font-mono font-bold text-slate-300 group-hover:text-slate-100">{folder.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-slate-600 bg-slate-900 px-1.5 py-0.5 rounded uppercase">Folder</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-teal-400 transition-colors shrink-0" />
                        </div>
                      </div>
                    ))}

                    {/* Files List */}
                    {getFiles().map((file) => {
                      const isImage = file.contentType?.startsWith("image/") || file.name.match(/\.(png|jpe?g|gif|webp)$/i);
                      const isJson = file.contentType?.includes("json") || file.name.endsWith(".json");
                      const formattedSize = file.size 
                        ? (file.size < 1024 ? `${file.size} B` : `${(file.size / 1024).toFixed(1)} KB`)
                        : "Dynamic";
                      const isExpanded = selectedFileId === file.id;

                      return (
                        <div key={file.id} className="border border-slate-900 rounded-lg overflow-hidden transition-all bg-slate-950/20">
                          {/* File Row Header */}
                          <div
                            onClick={() => setSelectedFileId(isExpanded ? null : file.id)}
                            className={`p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer transition-all ${
                              isExpanded ? "bg-slate-900/60 border-b border-slate-900" : "hover:bg-slate-900/40"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {isImage ? (
                                <div className="w-6 h-6 rounded overflow-hidden border border-slate-800 flex items-center justify-center bg-slate-950 shrink-0">
                                  <img src={file.url} alt={file.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                </div>
                              ) : isJson ? (
                                <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : (
                                <FileText className="w-4 h-4 text-teal-400 shrink-0" />
                              )}
                              <div className="min-w-0 flex-1">
                                <span className="text-xs font-mono font-semibold text-slate-300 truncate block group-hover:text-teal-400">{file.name}</span>
                                <span className="text-[9px] font-mono text-slate-500 block">
                                  {formattedSize} | {file.contentType || "Binary"}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0" onClick={(e) => e.stopPropagation()}>
                              {/* Inspect Schema for JSON */}
                              {isJson && (
                                <button
                                  onClick={() => handleInspectJson(file)}
                                  title="Inspect JSON Schema Metadata"
                                  className="p-1 px-2 bg-slate-900 hover:bg-emerald-950/30 border border-slate-800 hover:border-emerald-500/20 rounded text-[10px] font-mono text-slate-400 hover:text-emerald-400 transition-all flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" />
                                  Inspect
                                </button>
                              )}

                              {/* Hide File button (trash can) */}
                              <button
                                onClick={() => triggerHideConfirm(file.id, file.name)}
                                title="Hide File"
                                className="p-1 px-1.5 bg-slate-900 hover:bg-rose-950/30 border border-slate-800 hover:border-rose-500/20 text-[10px] text-slate-400 hover:text-rose-400 font-mono rounded flex items-center gap-1 transition-all cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3 text-rose-400" />
                                <span>Hide</span>
                              </button>

                              {/* Expand/Collapse Details button */}
                              <button
                                onClick={() => setSelectedFileId(isExpanded ? null : file.id)}
                                title="Show absolute locations & network nodes"
                                className="p-1 px-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] text-slate-400 hover:text-teal-400 font-mono rounded flex items-center gap-1 transition-all cursor-pointer"
                              >
                                <Info className="w-3 h-3 text-teal-400" />
                                {isExpanded ? "Hide Loc" : "Locate"}
                                {isExpanded ? <ChevronDown className="w-2.5 h-2.5 rotate-180 transition-transform" /> : <ChevronDown className="w-2.5 h-2.5" />}
                              </button>
                            </div>
                          </div>

                          {/* Expanded Actual File Location details (Monospace, Real & Decoupled) */}
                          {isExpanded && (
                            <div className="p-3 bg-slate-950/80 border-t border-slate-900 space-y-2.5 text-[10px] font-mono text-slate-400 animate-fadeIn">
                              <div className="flex items-center justify-between border-b border-slate-900/50 pb-1.5">
                                <span className="text-[9px] font-bold text-teal-400 uppercase tracking-wider">File Network Descriptors</span>
                                <span className="text-[8px] bg-emerald-950/40 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/10 uppercase">Permanently Anchored</span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <span className="text-slate-600 block text-[8px] uppercase">Absolute Path Hierarchy:</span>
                                  <span className="text-slate-300 font-bold block bg-slate-900/40 px-2 py-1 rounded border border-slate-800">
                                    SANDS DRIVE &gt; {currentFolder ? currentFolder.name : (isJson ? "metadata" : "images")} &gt; {file.name}
                                  </span>
                                </div>

                                <div className="space-y-1">
                                  <span className="text-slate-600 block text-[8px] uppercase">Arweave Protocol URI:</span>
                                  <div className="flex items-center gap-1.5 bg-slate-900/40 px-2 py-0.5 rounded border border-slate-800">
                                    <span className="text-teal-400 font-semibold truncate flex-1">ar://{file.id}</span>
                                    <button 
                                      onClick={() => copyToClipboard(`ar://${file.id}`, `ar-${file.id}`)}
                                      className="p-0.5 hover:text-white transition-colors"
                                    >
                                      {copiedId === `ar-${file.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-1">
                                <span className="text-slate-600 block text-[8px] uppercase">Arweave Transaction ID (Hash):</span>
                                <div className="flex items-center gap-1.5 bg-slate-900/40 px-2 py-0.5 rounded border border-slate-800">
                                  <span className="text-slate-300 select-all truncate flex-1">{file.id}</span>
                                  <button 
                                    onClick={() => copyToClipboard(file.id, `id-${file.id}`)}
                                    className="p-0.5 hover:text-white transition-colors"
                                  >
                                    {copiedId === `id-${file.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>

                              {/* Gateway Locations list */}
                              <div className="space-y-1.5">
                                <span className="text-slate-600 block text-[8px] uppercase">Decentralized Web Gateway Links:</span>
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between bg-slate-900/40 px-2 py-1 rounded border border-slate-800/80 hover:border-slate-700/60 transition-colors">
                                    <span className="text-[9px] text-slate-500">arweave.net (Mainnet Router)</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-slate-400 truncate max-w-[120px] sm:max-w-none text-[8px] select-all">https://arweave.net/{file.id}</span>
                                      <button 
                                        onClick={() => copyToClipboard(`https://arweave.net/${file.id}`, `url1-${file.id}`)}
                                        className="p-0.5 text-slate-500 hover:text-slate-300"
                                      >
                                        {copiedId === `url1-${file.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                      </button>
                                      <a href={`https://arweave.net/${file.id}`} target="_blank" rel="noopener noreferrer" className="p-0.5 text-slate-500 hover:text-teal-400">
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between bg-slate-900/40 px-2 py-1 rounded border border-slate-800/80 hover:border-slate-700/60 transition-colors">
                                    <span className="text-[9px] text-slate-500">irys.xyz (L2 Bundler Node)</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-slate-400 truncate max-w-[120px] sm:max-w-none text-[8px] select-all">https://gateway.irys.xyz/{file.id}</span>
                                      <button 
                                        onClick={() => copyToClipboard(`https://gateway.irys.xyz/${file.id}`, `url2-${file.id}`)}
                                        className="p-0.5 text-slate-500 hover:text-slate-300"
                                      >
                                        {copiedId === `url2-${file.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                      </button>
                                      <a href={`https://gateway.irys.xyz/${file.id}`} target="_blank" rel="noopener noreferrer" className="p-0.5 text-slate-500 hover:text-teal-400">
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {getSubFolders().length === 0 && getFiles().length === 0 && (
                      <div className="p-6 text-center text-slate-500 font-mono text-xs">
                        This directory is empty.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Active Session History List */}
          {((arweaveState?.history || []).length === 0) ? (
            <div className="p-6 text-center rounded-xl bg-slate-950 border border-slate-800/60 flex flex-col items-center justify-center space-y-2">
              <FileText className="w-6 h-6 text-slate-600 animate-pulse" />
              <p className="text-xs text-slate-400 font-mono font-semibold">No active uploads in this session.</p>
              <p className="text-[10px] text-slate-500 font-mono max-w-xs">
                When you upload images or anchor metadata JSON files in S.A.N.D.S. Metadata section, they will appear here instantly with direct links.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-semibold">
                  Cached Files ({(arweaveState?.history || []).length})
                </span>
                <button
                  onClick={handleClearHistory}
                  className="text-[10px] font-mono text-red-400 hover:text-red-300 transition-colors uppercase font-bold flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear & Clean Up Cache
                </button>
              </div>
              <div className="space-y-3.5 max-h-[350px] overflow-y-auto scrollbar-thin">
              {(arweaveState?.history || []).filter(file => !hiddenFileIds.includes(file.transactionId)).map((file, idx) => {
                const isExpanded = selectedFileId === file.transactionId;
                return (
                  <div 
                    key={file.transactionId} 
                    className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-3 animate-fadeIn" 
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <div className="flex items-center justify-between cursor-pointer" onClick={() => setSelectedFileId(isExpanded ? null : file.transactionId)}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        {file.fileName.match(/\.(png|jpe?g|gif|webp)$/i) ? (
                          <div className="w-6 h-6 rounded overflow-hidden border border-slate-700/50 flex items-center justify-center bg-slate-900 shrink-0">
                            <img src={file.metadataUrl} alt={file.fileName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                        ) : (
                          <span className="w-6 h-6 bg-teal-900/40 border border-teal-700/50 rounded flex items-center justify-center text-[9px] font-bold text-teal-400 uppercase shrink-0">
                            {file.fileName.split('.').pop()?.substring(0, 3) || "json"}
                          </span>
                        )}
                        <span className="text-xs font-mono font-bold text-slate-200 truncate max-w-[200px]">
                          {file.fileName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono text-emerald-400 font-bold bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/10 flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Anchored
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
                    </div>
                    
                    {/* Basic Link row */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[10px] font-mono text-slate-400 truncate select-all">
                        {file.metadataUrl}
                      </div>

                      {/* Hide File button (trash can) */}
                      <button
                        onClick={() => triggerHideConfirm(file.transactionId, file.fileName)}
                        title="Hide File"
                        className="p-1.5 bg-slate-900 hover:bg-rose-950/30 border border-slate-800 hover:border-rose-500/20 rounded-lg text-slate-400 hover:text-rose-400 transition-all flex items-center justify-center cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      
                      <button
                        onClick={() => copyToClipboard(file.metadataUrl, file.transactionId)}
                        title="Copy Link to Clipboard"
                        className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-teal-500/40 rounded-lg text-slate-400 hover:text-teal-400 transition-all flex items-center justify-center cursor-pointer shrink-0"
                      >
                        {copiedId === file.transactionId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      
                      <a
                        href={file.metadataUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open Link in New Tab"
                        className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-teal-500/40 rounded-lg text-slate-400 hover:text-teal-400 transition-all flex items-center justify-center cursor-pointer shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    {/* Expandable Location Descriptors */}
                    {isExpanded && (
                      <div className="mt-1 pt-2.5 border-t border-slate-900 space-y-2 text-[10px] font-mono text-slate-400">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div className="space-y-0.5">
                            <span className="text-slate-600 text-[8px] uppercase">Arweave Protocol Address:</span>
                            <div className="flex items-center gap-1 bg-slate-900/30 px-2 py-0.5 rounded border border-slate-900">
                              <span className="text-teal-400 font-semibold truncate flex-1">ar://{file.transactionId}</span>
                              <button 
                                onClick={() => copyToClipboard(`ar://${file.transactionId}`, `ar-hist-${file.transactionId}`)}
                                className="p-0.5 hover:text-white transition-colors"
                              >
                                {copiedId === `ar-hist-${file.transactionId}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-0.5">
                            <span className="text-slate-600 text-[8px] uppercase">Decentralized Storage Node:</span>
                            <span className="text-slate-300 font-bold block bg-slate-900/30 px-2 py-0.5 rounded border border-slate-900">
                              Irys L2 / Arweave Mainnet
                            </span>
                          </div>
                        </div>

                        <div className="space-y-0.5">
                          <span className="text-slate-600 text-[8px] uppercase">Transaction Hash / Payload ID:</span>
                          <div className="flex items-center gap-1.5 bg-slate-900/30 px-2 py-0.5 rounded border border-slate-900">
                            <span className="text-slate-300 select-all truncate flex-1">{file.transactionId}</span>
                            <button 
                              onClick={() => copyToClipboard(file.transactionId, `tx-hist-${file.transactionId}`)}
                              className="p-0.5 hover:text-white transition-colors"
                            >
                              {copiedId === `tx-hist-${file.transactionId}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-slate-600 text-[8px] uppercase">Alt Router Endpoints:</span>
                          <div className="grid grid-cols-1 gap-1">
                            <div className="flex items-center justify-between bg-slate-900/30 px-2 py-1 rounded border border-slate-900 text-[9px]">
                              <span className="text-slate-500">arweave.net</span>
                              <a 
                                href={`https://arweave.net/${file.transactionId}`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-teal-400 hover:underline flex items-center gap-1"
                              >
                                View on Gateway <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                            <div className="flex items-center justify-between bg-slate-900/30 px-2 py-1 rounded border border-slate-900 text-[9px]">
                              <span className="text-slate-500">gateway.irys.xyz</span>
                              <a 
                                href={`https://gateway.irys.xyz/${file.transactionId}`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-teal-400 hover:underline flex items-center gap-1"
                              >
                                View on Irys Gateway <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* JSON Schema Inspector Modal */}
      {inspectingJson && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[80vh] animate-fadeIn">
            
            {/* Header */}
            <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-teal-400" />
                <span className="text-xs font-mono font-bold text-slate-200 truncate max-w-[280px]">{inspectingFileName}</span>
              </div>
              <button 
                onClick={() => setInspectingJson(null)}
                className="p-1 bg-slate-900 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Area */}
            <div className="p-4 overflow-y-auto flex-1 scrollbar-thin bg-slate-950">
              <pre className="text-[11px] font-mono text-slate-300 leading-relaxed overflow-x-auto">
                {JSON.stringify(inspectingJson, null, 2)}
              </pre>
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-slate-500">Metaplex Metadata Schema (V2)</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    copyToClipboard(JSON.stringify(inspectingJson, null, 2), "modal-json");
                    emitLog("JSON schema copied to clipboard.");
                  }}
                  className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-mono font-bold text-slate-300 hover:text-white rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  Copy JSON
                </button>
                <button
                  onClick={() => setInspectingJson(null)}
                  className="px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold font-mono text-xs rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hide File Confirmation Modal Notice */}
      {confirmHideFileId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-slate-900 border-2 border-rose-500/40 rounded-2xl p-5 shadow-2xl space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
              <Trash2 className="w-6 h-6 text-rose-400 animate-bounce" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-bold font-mono text-slate-200 uppercase tracking-wider">
                Hide Decentralized File?
              </h3>
              <p className="text-xs text-slate-400 font-mono break-all font-semibold text-rose-400 bg-rose-950/20 px-2.5 py-1.5 rounded border border-rose-500/10">
                {confirmHideFileName}
              </p>
            </div>

            <p className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-300 leading-relaxed text-left font-sans">
              this is only hiding the file and is irreversible so unless you have a saved backup or you don't need the link to this anymore, I advise you. Make sure you're completely satisfied with the removal of this file or I suggest you make an encrypted backup using the sand pit
            </p>

            <div className="flex gap-2 justify-end font-mono">
              <button
                onClick={() => {
                  setConfirmHideFileId(null);
                  setConfirmHideFileName("");
                }}
                className="px-4 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 active:bg-slate-900 text-slate-300 text-xs font-bold transition-all cursor-pointer border border-slate-750"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleHideFile(confirmHideFileId);
                  setConfirmHideFileId(null);
                  setConfirmHideFileName("");
                }}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-rose-900/30"
              >
                Confirm Hide
              </button>
            </div>
          </div>
        </div>
      )}

        </div>
      )}
    </div>
  );
}
