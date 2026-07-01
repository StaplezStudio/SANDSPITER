import express from "express";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const UPLOADS_FILE_PATH = path.join(process.cwd(), "local_uploads.json");

// Helper to load local uploads
function loadLocalUploads(): any[] {
  try {
    if (fs.existsSync(UPLOADS_FILE_PATH)) {
      const data = fs.readFileSync(UPLOADS_FILE_PATH, "utf8");
      return JSON.parse(data) || [];
    }
  } catch (err) {
    console.error("Error reading local_uploads.json:", err);
  }
  return [];
}

// Helper to save a local upload
function saveLocalUpload(upload: any) {
  try {
    const uploads = loadLocalUploads();
    uploads.push(upload);
    fs.writeFileSync(UPLOADS_FILE_PATH, JSON.stringify(uploads, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing to local_uploads.json:", err);
  }
}

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Endpoint to read and return the actual project source code files as a JSON list for manual copy-pasting
app.get("/api/project-files", (req, res) => {
  try {
    const files: { path: string; content: string }[] = [];
    
    const readDirectoryRecursive = (localPath: string, relativePath: string) => {
      const items = fs.readdirSync(localPath);
      for (const item of items) {
        if (
          item === "node_modules" ||
          item === "dist" ||
          item === ".git" ||
          item === ".github" ||
          item === "local_uploads.json" ||
          item === ".env" ||
          item === "package-lock.json" ||
          item.endsWith(".sands") ||
          item.endsWith(".sand") ||
          item.endsWith(".pit") ||
          item.endsWith(".png") ||
          item.endsWith(".ico") ||
          item.endsWith(".jpg") ||
          item.endsWith(".jpeg")
        ) {
          continue;
        }

        const fullPath = path.join(localPath, item);
        const relativeItemPath = relativePath ? `${relativePath}/${item}` : item;
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          readDirectoryRecursive(fullPath, relativeItemPath);
        } else {
          // Read text files only
          const content = fs.readFileSync(fullPath, "utf-8");
          files.push({ path: relativeItemPath, content });
        }
      }
    };

    readDirectoryRecursive(process.cwd(), "");
    res.json(files);
  } catch (error: any) {
    console.error("Error reading project files:", error);
    res.status(500).json({ error: "Failed to read project files: " + error.message });
  }
});

// Endpoint to fetch local transactions for a given address
app.get("/api/arweave/local-transactions", (req, res) => {
  const { address } = req.query;
  if (!address) {
    return res.status(400).json({ error: "Address is required" });
  }
  const addressStr = (address as string).trim().toLowerCase();
  const allUploads = loadLocalUploads();
  const filtered = allUploads.filter(u => u.ownerAddress?.trim().toLowerCase() === addressStr);
  res.json(filtered);
});

// Endpoint to register local transactions manually
app.post("/api/arweave/register-upload", (req, res) => {
  const { ownerAddress, transactionId, fileName, contentType, sizeBytes, url, driveId, parentFolderId, metadata, isDevnet } = req.body;
  if (!ownerAddress || !transactionId) {
    return res.status(400).json({ error: "ownerAddress and transactionId are required" });
  }
  const newUpload = {
    ownerAddress,
    transactionId,
    fileName,
    contentType,
    sizeBytes: sizeBytes || 512,
    url,
    driveId: driveId || "drive-sands",
    parentFolderId: parentFolderId || (contentType === "application/json" ? "folder-metadata" : "folder-images"),
    timestamp: Date.now(),
    metadata,
    isDevnet: !!isDevnet
  };
  saveLocalUpload(newUpload);
  res.json({ success: true, upload: newUpload });
});

// Real Arweave Image Upload via Irys (Bundlr)
app.post("/api/arweave/upload-image", async (req, res) => {
  try {
    const { imageBase64, jwk, contentType, fileName, ownerAddress } = req.body;
    if (!imageBase64 || !jwk) {
      return res.status(400).json({ error: "Image data and JWK are required" });
    }

    // Dynamic import to avoid CJS/ESM issues with Irys in some environments
    const Irys = (await import("@irys/sdk")).default;

    // Remove data URI prefix if present (e.g. data:image/jpeg;base64,)
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");
    const payloadSize = imageBuffer.length;
    
    // Check mainnet balance to decide whether to use mainnet or fallback to free sandbox devnet
    let useDevnet = false;
    let mainnetIrys: any;
    let costAR = "0.000001"; // fallback placeholder cost estimate

    try {
      mainnetIrys = new (Irys as any)({
        url: "https://node1.irys.xyz",
        token: "arweave",
        key: jwk
      });
      const balance = await mainnetIrys.getLoadedBalance();
      const arBalance = mainnetIrys.utils.fromAtomic(balance).toString();
      
      const cost = await mainnetIrys.getPrice(payloadSize);
      costAR = mainnetIrys.utils.fromAtomic(cost).toString();

      if (parseFloat(arBalance) < parseFloat(costAR)) {
        console.warn(`Insufficient mainnet balance (${arBalance} AR < ${costAR} AR). Falling back to Free Irys Devnet.`);
        useDevnet = true;
      }
    } catch (err) {
      console.warn("Failed to query mainnet wallet balance or gateway, falling back to Irys Devnet:", err);
      useDevnet = true;
    }

    let txId = "";
    let isDevnet = false;
    let finalCostAR = costAR;

    if (useDevnet) {
      isDevnet = true;
      finalCostAR = "0 (Free Sandbox Node)";
      // Free upload on Devnet utilizing an ephemeral Ethereum key
      const { Wallet } = await import("ethers");
      const ephemeralWallet = Wallet.createRandom();
      const devnetIrys = new (Irys as any)({
        url: "https://devnet.irys.xyz",
        token: "ethereum",
        key: ephemeralWallet.privateKey,
        config: { providerUrl: "https://rpc.sepolia.org" }
      });

      const receipt = await devnetIrys.upload(imageBuffer, {
        tags: [
          { name: "Content-Type", value: contentType || "image/png" },
          { name: "App-Name", value: "S.A.N.D.S." },
          { name: "Entity-Type", value: "file" },
          { name: "File-Name", value: fileName || "image.png" },
          { name: "Drive-Id", value: "drive-sands" },
          { name: "Folder-Id", value: "folder-images" },
          { name: "Parent-Folder-Id", value: "folder-images" }
        ]
      });
      txId = receipt.id;
    } else {
      // Execute live paid Mainnet upload
      const receipt = await mainnetIrys.upload(imageBuffer, {
        tags: [
          { name: "Content-Type", value: contentType || "image/png" },
          { name: "App-Name", value: "S.A.N.D.S." },
          { name: "Entity-Type", value: "file" },
          { name: "File-Name", value: fileName || "image.png" },
          { name: "Drive-Id", value: "drive-sands" },
          { name: "Folder-Id", value: "folder-images" },
          { name: "Parent-Folder-Id", value: "folder-images" }
        ]
      });
      txId = receipt.id;
    }

    const imageUrl = `https://gateway.irys.xyz/${txId}`;

    // Automatically register the transaction locally for persistence
    if (ownerAddress) {
      saveLocalUpload({
        ownerAddress,
        transactionId: txId,
        fileName: fileName || "image.png",
        contentType: contentType || "image/png",
        sizeBytes: payloadSize,
        url: imageUrl,
        driveId: "drive-sands",
        parentFolderId: "folder-images",
        timestamp: Date.now(),
        isDevnet
      });
    }

    res.json({
      success: true,
      transactionId: txId,
      imageUrl: imageUrl,
      simulatedCostAR: finalCostAR,
      simulatedCostUSD: useDevnet ? "Free" : "Live Cost",
      sizeBytes: payloadSize,
      isDevnet
    });
  } catch (error: any) {
    console.error("Irys image upload failed:", error);
    res.status(500).json({ error: error.message || "Failed to upload image to Arweave via Irys" });
  }
});

// Real Arweave Upload via Irys (Bundlr)
app.post("/api/arweave/upload", async (req, res) => {
  try {
    const { metadata, jwk, fileName, ownerAddress } = req.body;
    if (!metadata || !jwk) {
      return res.status(400).json({ error: "Metadata and JWK are required" });
    }

    // Dynamic import to avoid CJS/ESM issues with Irys in some environments
    const Irys = (await import("@irys/sdk")).default;

    const payloadString = JSON.stringify(metadata);
    const payloadSize = Buffer.byteLength(payloadString, 'utf8');
    
    // Check mainnet balance to decide whether to use mainnet or fallback to free sandbox devnet
    let useDevnet = false;
    let mainnetIrys: any;
    let costAR = "0.000001"; // fallback placeholder cost estimate

    try {
      mainnetIrys = new (Irys as any)({
        url: "https://node1.irys.xyz",
        token: "arweave",
        key: jwk
      });
      const balance = await mainnetIrys.getLoadedBalance();
      const arBalance = mainnetIrys.utils.fromAtomic(balance).toString();
      
      const cost = await mainnetIrys.getPrice(payloadSize);
      costAR = mainnetIrys.utils.fromAtomic(cost).toString();

      if (parseFloat(arBalance) < parseFloat(costAR)) {
        console.warn(`Insufficient mainnet balance (${arBalance} AR < ${costAR} AR). Falling back to Free Irys Devnet.`);
        useDevnet = true;
      }
    } catch (err) {
      console.warn("Failed to query mainnet wallet balance or gateway, falling back to Irys Devnet:", err);
      useDevnet = true;
    }

    let txId = "";
    let isDevnet = false;
    let finalCostAR = costAR;

    if (useDevnet) {
      isDevnet = true;
      finalCostAR = "0 (Free Sandbox Node)";
      // Free upload on Devnet utilizing an ephemeral Ethereum key
      const { Wallet } = await import("ethers");
      const ephemeralWallet = Wallet.createRandom();
      const devnetIrys = new (Irys as any)({
        url: "https://devnet.irys.xyz",
        token: "ethereum",
        key: ephemeralWallet.privateKey,
        config: { providerUrl: "https://rpc.sepolia.org" }
      });

      const receipt = await devnetIrys.upload(payloadString, {
        tags: [
          { name: "Content-Type", value: "application/json" },
          { name: "App-Name", value: "S.A.N.D.S." },
          { name: "Entity-Type", value: "file" },
          { name: "File-Name", value: fileName || "metadata.json" },
          { name: "Drive-Id", value: "drive-sands" },
          { name: "Folder-Id", value: "folder-metadata" },
          { name: "Parent-Folder-Id", value: "folder-metadata" }
        ]
      });
      txId = receipt.id;
    } else {
      // Execute live paid Mainnet upload
      const receipt = await mainnetIrys.upload(payloadString, {
        tags: [
          { name: "Content-Type", value: "application/json" },
          { name: "App-Name", value: "S.A.N.D.S." },
          { name: "Entity-Type", value: "file" },
          { name: "File-Name", value: fileName || "metadata.json" },
          { name: "Drive-Id", value: "drive-sands" },
          { name: "Folder-Id", value: "folder-metadata" },
          { name: "Parent-Folder-Id", value: "folder-metadata" }
        ]
      });
      txId = receipt.id;
    }

    const metadataUrl = `https://gateway.irys.xyz/${txId}`;

    // Automatically register the transaction locally for persistence
    if (ownerAddress) {
      saveLocalUpload({
        ownerAddress,
        transactionId: txId,
        fileName: fileName || "metadata.json",
        contentType: "application/json",
        sizeBytes: payloadSize,
        url: metadataUrl,
        driveId: "drive-sands",
        parentFolderId: "folder-metadata",
        timestamp: Date.now(),
        metadata,
        isDevnet
      });
    }

    res.json({
      success: true,
      transactionId: txId,
      metadataUrl: metadataUrl,
      simulatedCostAR: finalCostAR,
      simulatedCostUSD: useDevnet ? "Free" : "Live Cost",
      fictionalArDriveCredentials: null,
      isDevnet
    });
  } catch (error: any) {
    console.error("Irys upload failed:", error);
    res.status(500).json({ error: error.message || "Failed to upload to Arweave via Irys" });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
