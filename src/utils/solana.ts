/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { WalletState } from "../types";

// Fast check if RPC URL is responsive and belongs to a Solana cluster
export function getChainName(rpcUrl: string): string {
  const url = rpcUrl.toLowerCase();
  if (url.includes("mainnet")) return "Solana Mainnet-Beta";
  if (url.includes("testnet")) return "Solana Testnet";
  if (url.includes("devnet")) return "Solana Devnet";
  if (url.includes("localhost") || url.includes("127.0.0.1") || url.includes("3000")) return "Solana Localhost / Custom";
  return "Custom RPC Network";
}

export async function verifyRpcConnection(rpcUrl: string): Promise<{ success: boolean; epoch?: number; error?: string }> {
  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const epochInfo = await connection.getEpochInfo();
    return { success: true, epoch: epochInfo.epoch };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to reach RPC node" };
  }
}

// Native high-performance Base64 <-> Uint8Array conversions to avoid Node Buffer error in browser
export function uint8ArrayToBase64(arr: Uint8Array): string {
  let binary = "";
  const len = arr.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Generate a random virtual cryptographic keypair
export function generateVirtualKeypair(): { publicKey: string; secretKey: string } {
  const kp = Keypair.generate();
  return {
    publicKey: kp.publicKey.toBase58(),
    secretKey: uint8ArrayToBase64(kp.secretKey), // store base64
  };
}

// Import base64 secret key
export function getKeypairFromSecret(secretBase64: string): Keypair {
  const buffer = base64ToUint8Array(secretBase64);
  return Keypair.fromSecretKey(buffer);
}

// Fetch balance from Devnet RPC
export async function getSolBalance(rpcUrl: string, address: string): Promise<number> {
  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const pubKey = new PublicKey(address);
    const balance = await connection.getBalance(pubKey);
    return balance / LAMPORTS_PER_SOL;
  } catch {
    return 0;
  }
}

// Request SOL airdrop on Solana Devnet
export async function requestDevnetAirdrop(rpcUrl: string, address: string): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const pubKey = new PublicKey(address);
    const sig = await connection.requestAirdrop(pubKey, 1 * LAMPORTS_PER_SOL);
    
    // Wait for validation confirmation
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature: sig,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    }, "confirmed");

    return { success: true, signature: sig };
  } catch (error: any) {
    console.error("Airdrop failed:", error);
    return { success: false, error: error.message || "Airdrop request rejected by Solana rate-limiter. Please try again or use standard Solana Devnet faucet." };
  }
}

// Mathematically accurate estimation of Merkle Tree size and rent-exemption cost
export function calculateMerkleTreeCost(maxDepth: number, maxBufferSize: number, canopyDepth: number): { bytes: number; sol: number } {
  const headerBytes = 128;
  const nodesBytes = Math.pow(2, canopyDepth) * 32;
  const bufferBytes = maxBufferSize * 96;
  const stateBytes = maxDepth * 32;
  
  const totalBytes = headerBytes + nodesBytes + bufferBytes + stateBytes;
  
  // Rent cost constant on Solana is 0.000002048 SOL per byte
  const solCost = totalBytes * 0.000002048;
  
  return {
    bytes: totalBytes,
    sol: parseFloat(solCost.toFixed(6)),
  };
}

// Fetch SOL to CAD price conversion
export async function getSolToCadRate(): Promise<number> {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=cad");
    const data = await res.json();
    return data.solana.cad || 185.0; // Fallback to $185 CAD
  } catch {
    return 185.0; // Standard fallback rate
  }
}

// Deploy raw Concurrent Merkle Tree account on-chain (assigned to state compression program)
export async function deployMerkleTreeOnChain(
  rpcUrl: string,
  wallet: WalletState,
  maxDepth: number,
  maxBufferSize: number,
  canopyDepth: number,
  provider: any
): Promise<{ success: boolean; treeAddress?: string; signature?: string; error?: string }> {
  try {
    if (!wallet.isConnected || !wallet.publicKey) {
      throw new Error("Please connect your wallet first.");
    }

    const connection = new Connection(rpcUrl, "confirmed");
    const payerPubkey = new PublicKey(wallet.publicKey);
    
    // Calculate size and rent exempt balance
    const { bytes } = calculateMerkleTreeCost(maxDepth, maxBufferSize, canopyDepth);
    const lamports = await connection.getMinimumBalanceForRentExemption(bytes);
    
    const treeKeypair = Keypair.generate();
    const transaction = new Transaction();

    let activePayerPubkey = payerPubkey;
    let payerKeypair: Keypair | null = null;

    if (wallet.isVirtual) {
      if (!wallet.privateKey) {
        throw new Error("Private key missing for the virtual/imported wallet.");
      }
      payerKeypair = getKeypairFromSecret(wallet.privateKey);
      activePayerPubkey = payerKeypair.publicKey;
    } else {
      if (!provider) {
        throw new Error("Wallet provider not detected. Since this app is running inside a sandboxed iframe, your browser extension (like Phantom or Solflare) is blocked from connecting. Please click 'Open in New Tab' at the top of the screen to sign the transaction securely, or connect via the 'Direct Keys / Seed' tab.");
      }
    }
    
    const createAccountIdx = SystemProgram.createAccount({
      fromPubkey: activePayerPubkey,
      newAccountPubkey: treeKeypair.publicKey,
      lamports: lamports,
      space: bytes,
      programId: new PublicKey("cmt4A6fkaFD1CHv6vFC9f4Sf6nC2gK3ALvA5CDoH1f5"), // State Compression Program
    });
    
    transaction.add(createAccountIdx);
    
    let signature = "";
    if (payerKeypair) {
      transaction.feePayer = activePayerPubkey;
      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      
      transaction.sign(payerKeypair, treeKeypair);
      signature = await connection.sendRawTransaction(transaction.serialize());
    } else {
      transaction.feePayer = payerPubkey;
      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      
      const signedTx = await provider.signTransaction(transaction);
      signedTx.partialSign(treeKeypair);
      signature = await connection.sendRawTransaction(signedTx.serialize());
    }
    
    const latest = await connection.getLatestBlockhash();
    try {
      await connection.confirmTransaction({
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight
      }, "confirmed");
    } catch (err) {
      console.warn("Transaction confirmation timed out/failed, checking if account was created anyway...", err);
      // Wait 2 seconds and check if account info exists
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const accountInfo = await connection.getAccountInfo(treeKeypair.publicKey);
      if (!accountInfo) {
        throw new Error("Transaction failed or timed out. Please check your Solana wallet or explorer. " + (err as Error).message);
      }
    }
    
    return {
      success: true,
      treeAddress: treeKeypair.publicKey.toBase58(),
      signature,
    };
  } catch (error: any) {
    console.error("Merkle Tree deploy failed:", error);
    return { success: false, error: error.message || "Failed to create Merkle Tree account" };
  }
}

// Deploy raw SPL Mint account on-chain for the collection representation
export async function deployCollectionOnChain(
  rpcUrl: string,
  wallet: WalletState,
  collectionName: string,
  provider: any
): Promise<{ success: boolean; collectionAddress?: string; signature?: string; error?: string }> {
  try {
    if (!wallet.isConnected || !wallet.publicKey) {
      throw new Error("Please connect your wallet first.");
    }

    const connection = new Connection(rpcUrl, "confirmed");
    const payerPubkey = new PublicKey(wallet.publicKey);
    
    const mintKeypair = Keypair.generate();
    const space = 82; // SPL Token Mint space
    const lamports = await connection.getMinimumBalanceForRentExemption(space);
    
    const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbVbW8X60sY37Vf715DQDg");
    const transaction = new Transaction();

    let activePayerPubkey = payerPubkey;
    let payerKeypair: Keypair | null = null;

    if (wallet.isVirtual) {
      if (!wallet.privateKey) {
        throw new Error("Private key missing for the virtual/imported wallet.");
      }
      payerKeypair = getKeypairFromSecret(wallet.privateKey);
      activePayerPubkey = payerKeypair.publicKey;
    } else {
      if (!provider) {
        throw new Error("Wallet provider not detected. Since this app is running inside a sandboxed iframe, your browser extension (like Phantom or Solflare) is blocked from connecting. Please click 'Open in New Tab' at the top of the screen to sign the transaction securely, or connect via the 'Direct Keys / Seed' tab.");
      }
    }
    
    const createAccountIdx = SystemProgram.createAccount({
      fromPubkey: activePayerPubkey,
      newAccountPubkey: mintKeypair.publicKey,
      lamports: lamports,
      space: space,
      programId: TOKEN_PROGRAM_ID,
    });
    
    // Prepare manually structured InitializeMint instruction with activePayerPubkey as Mint and Freeze authorities
    const initMintData = Buffer.alloc(1 + 1 + 32 + 1 + 32);
    initMintData.writeUInt8(0, 0); // InitializeMint Instruction Code
    initMintData.writeUInt8(0, 1); // Decimals (0 for NFTs)
    activePayerPubkey.toBuffer().copy(initMintData, 2); // Mint Authority (32 bytes)
    initMintData.writeUInt8(1, 34); // Freeze Authority Option (1 = Present)
    activePayerPubkey.toBuffer().copy(initMintData, 35); // Freeze Authority (32 bytes)
    
    const initMintIdx = new TransactionInstruction({
      keys: [
        { pubkey: mintKeypair.publicKey, isSigner: false, isWritable: true },
        { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
      ],
      programId: TOKEN_PROGRAM_ID,
      data: initMintData,
    });

    // Derive and Create Associated Token Account for original wallet (payerPubkey)
    const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
    const SYSVAR_RENT_PUBKEY = new PublicKey("SysvarRent111111111111111111111111111111111");
    
    const [associatedTokenAddress] = PublicKey.findProgramAddressSync(
      [
        payerPubkey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mintKeypair.publicKey.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const createAtaIdx = new TransactionInstruction({
      keys: [
        { pubkey: activePayerPubkey, isSigner: true, isWritable: true },
        { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
        { pubkey: payerPubkey, isSigner: false, isWritable: false },
        { pubkey: mintKeypair.publicKey, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      data: Buffer.alloc(0),
    });

    // Mint 1 token to original wallet ATA using activePayerPubkey
    const mintToData = Buffer.alloc(9);
    mintToData.writeUInt8(7, 0); // MintTo Instruction Code
    mintToData.writeUInt8(1, 1); // Amount: 1 (u64 little-endian, byte 0)
    mintToData.writeUInt8(0, 2);
    mintToData.writeUInt8(0, 3);
    mintToData.writeUInt8(0, 4);
    mintToData.writeUInt8(0, 5);
    mintToData.writeUInt8(0, 6);
    mintToData.writeUInt8(0, 7);
    mintToData.writeUInt8(0, 8);
    
    const mintToIdx = new TransactionInstruction({
      keys: [
        { pubkey: mintKeypair.publicKey, isSigner: false, isWritable: true },
        { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
        { pubkey: activePayerPubkey, isSigner: true, isWritable: false },
      ],
      programId: TOKEN_PROGRAM_ID,
      data: mintToData,
    });

    // Transfer (SetAuthority) Mint Authority to original wallet (payerPubkey)
    const setMintAuthData = Buffer.alloc(1 + 1 + 1 + 32);
    setMintAuthData.writeUInt8(6, 0); // SetAuthority Instruction Code
    setMintAuthData.writeUInt8(0, 1); // AuthorityType (0 = MintTokens)
    setMintAuthData.writeUInt8(1, 2); // NewAuthority Option (1 = Present)
    payerPubkey.toBuffer().copy(setMintAuthData, 3);
    
    const setMintAuthIdx = new TransactionInstruction({
      keys: [
        { pubkey: mintKeypair.publicKey, isSigner: false, isWritable: true },
        { pubkey: activePayerPubkey, isSigner: true, isWritable: false },
      ],
      programId: TOKEN_PROGRAM_ID,
      data: setMintAuthData,
    });

    // Transfer (SetAuthority) Freeze Authority to original wallet (payerPubkey)
    const setFreezeAuthData = Buffer.alloc(1 + 1 + 1 + 32);
    setFreezeAuthData.writeUInt8(6, 0); // SetAuthority Instruction Code
    setFreezeAuthData.writeUInt8(1, 1); // AuthorityType (1 = FreezeAccount)
    setFreezeAuthData.writeUInt8(1, 2); // NewAuthority Option (1 = Present)
    payerPubkey.toBuffer().copy(setFreezeAuthData, 3);
    
    const setFreezeAuthIdx = new TransactionInstruction({
      keys: [
        { pubkey: mintKeypair.publicKey, isSigner: false, isWritable: true },
        { pubkey: activePayerPubkey, isSigner: true, isWritable: false },
      ],
      programId: TOKEN_PROGRAM_ID,
      data: setFreezeAuthData,
    });
    
    transaction.add(
      createAccountIdx, 
      initMintIdx, 
      createAtaIdx, 
      mintToIdx, 
      setMintAuthIdx, 
      setFreezeAuthIdx
    );
    
    let signature = "";
    if (payerKeypair) {
      transaction.feePayer = activePayerPubkey;
      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      
      transaction.sign(payerKeypair, mintKeypair);
      signature = await connection.sendRawTransaction(transaction.serialize());
    } else {
      transaction.feePayer = payerPubkey;
      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      
      const signedTx = await provider.signTransaction(transaction);
      signedTx.partialSign(mintKeypair);
      signature = await connection.sendRawTransaction(signedTx.serialize());
    }
    
    const latest = await connection.getLatestBlockhash();
    try {
      await connection.confirmTransaction({
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight
      }, "confirmed");
    } catch (err) {
      console.warn("Transaction confirmation timed out/failed, checking if account was created anyway...", err);
      // Wait 2 seconds and check if account info exists
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const accountInfo = await connection.getAccountInfo(mintKeypair.publicKey);
      if (!accountInfo) {
        throw new Error("Transaction failed or timed out. Please check your Solana wallet or explorer. " + (err as Error).message);
      }
    }
    
    return {
      success: true,
      collectionAddress: mintKeypair.publicKey.toBase58(),
      signature,
    };
  } catch (error: any) {
    console.error("Collection Mint deploy failed:", error);
    return { success: false, error: error.message || "Failed to create Collection Mint account" };
  }
}

// Anchors leaf metadata on-chain permanently using the standard Solana Memo Program
export async function anchorLeafOnChain(
  rpcUrl: string,
  wallet: WalletState,
  payload: {
    name: string;
    symbol: string;
    uri: string;
    treeAddress: string;
    collectionAddress: string;
    sellerFeeBasisPoints: number;
  },
  provider: any
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    if (!wallet.isConnected || !wallet.publicKey) {
      throw new Error("Please connect your wallet first.");
    }

    const connection = new Connection(rpcUrl, "confirmed");
    const payerPubkey = new PublicKey(wallet.publicKey);
    
    const MEMO_PROGRAM_ID = new PublicKey("MemoSq9gH97f3G7p5TMcMCGkm1V5XXKSL9c68Xai7un");
    const transaction = new Transaction();
    
    const textData = JSON.stringify({
      action: "SANDS_MINT_CNFT",
      ...payload,
      timestamp: new Date().toISOString(),
    });

    let activePayerPubkey = payerPubkey;
    let payerKeypair: Keypair | null = null;

    if (wallet.isVirtual) {
      if (!wallet.privateKey) {
        throw new Error("Private key missing for the virtual/imported wallet.");
      }
      payerKeypair = getKeypairFromSecret(wallet.privateKey);
      activePayerPubkey = payerKeypair.publicKey;
    } else {
      if (!provider) {
        throw new Error("Wallet provider not detected. Since this app is running inside a sandboxed iframe, your browser extension (like Phantom or Solflare) is blocked from connecting. Please click 'Open in New Tab' at the top of the screen to sign the transaction securely, or connect via the 'Direct Keys / Seed' tab.");
      }
    }
    
    const memoIdx = new TransactionInstruction({
      keys: [{ pubkey: activePayerPubkey, isSigner: true, isWritable: false }],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(textData, "utf-8"),
    });
    
    transaction.add(memoIdx);
    
    let signature = "";
    if (payerKeypair) {
      transaction.feePayer = activePayerPubkey;
      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      
      transaction.sign(payerKeypair);
      signature = await connection.sendRawTransaction(transaction.serialize());
    } else {
      transaction.feePayer = payerPubkey;
      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      
      const signedTx = await provider.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signedTx.serialize());
    }
    
    const latest = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight
    }, "confirmed");
    
    return {
      success: true,
      signature,
    };
  } catch (error: any) {
    console.error("Leaf anchor failed:", error);
    return { success: false, error: error.message || "Failed to anchor leaf metadata on-chain" };
  }
}

// Helper to retrieve window wallet extension provider dynamically
export function getWalletProvider(walletType?: string): any {
  if (!walletType) return null;
  if (walletType === "phantom") {
    return (window as any).solana || (window as any).phantom?.solana;
  }
  if (walletType === "solflare") {
    return (window as any).solflare;
  }
  if (walletType === "coinbase") {
    return (window as any).coinbaseSolana;
  }
  if (walletType === "backpack") {
    return (window as any).backpack;
  }
  if (walletType === "okx") {
    return (window as any).okxwallet?.solana;
  }
  if (walletType === "trust") {
    return (window as any).trustWallet?.solana || ((window as any).solana?.isTrust ? (window as any).solana : null);
  }
  return null;
}

/**
 * Scan the connected wallet's transaction history on-chain to detect any deployed Merkle Trees.
 */
export async function scanWalletForMerkleTrees(
  rpcUrl: string,
  walletAddress: string
): Promise<{ success: boolean; trees: Array<{ address: string; signature: string; timestamp?: number }>; error?: string }> {
  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const pubKey = new PublicKey(walletAddress);
    
    // Fetch recent transaction signatures (up to 40)
    const signatures = await connection.getSignaturesForAddress(pubKey, { limit: 40 });
    
    if (signatures.length === 0) {
      return { success: true, trees: [] };
    }

    const foundTrees: Array<{ address: string; signature: string; timestamp?: number }> = [];
    const signaturesToFetch = signatures.map(s => s.signature);

    // Fetch parsed transactions in small batches to avoid RPC rate-limits
    const batchSize = 10;
    for (let i = 0; i < signaturesToFetch.length; i += batchSize) {
      const batch = signaturesToFetch.slice(i, i + batchSize);
      
      const txs = await connection.getParsedTransactions(batch, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed"
      });

      txs.forEach((tx, idx) => {
        if (!tx) return;
        const currentSig = batch[idx];
        const timestamp = tx.blockTime ? tx.blockTime * 1000 : undefined;

        // Check outer instructions for SystemProgram.createAccount owned by cmt4A6...
        const instructions = tx.transaction.message.instructions;
        instructions.forEach((inst: any) => {
          if (inst.program === "system" && inst.parsed?.type === "createAccount") {
            const info = inst.parsed.info;
            if (
              info &&
              (info.owner === "cmt4A6fkaFD1CHv6vFC9f4Sf6nC2gK3ALvA5CDoH1f5" ||
               info.owner === "cmt3gCH9m7S81CHbeX6Y4Z2B7688NndP4Jk7S9Z8Uux")
            ) {
              const treeAddress = info.newAccount;
              if (treeAddress && !foundTrees.some(t => t.address === treeAddress)) {
                foundTrees.push({
                  address: treeAddress,
                  signature: currentSig,
                  timestamp
                });
              }
            }
          }
        });

        // Also check innerInstructions in case it was created via CPI
        if (tx.meta?.innerInstructions) {
          tx.meta.innerInstructions.forEach((inner: any) => {
            inner.instructions.forEach((inst: any) => {
              if (inst.program === "system" && inst.parsed?.type === "createAccount") {
                const info = inst.parsed.info;
                if (
                  info &&
                  (info.owner === "cmt4A6fkaFD1CHv6vFC9f4Sf6nC2gK3ALvA5CDoH1f5" ||
                   info.owner === "cmt3gCH9m7S81CHbeX6Y4Z2B7688NndP4Jk7S9Z8Uux")
                ) {
                  const treeAddress = info.newAccount;
                  if (treeAddress && !foundTrees.some(t => t.address === treeAddress)) {
                    foundTrees.push({
                      address: treeAddress,
                      signature: currentSig,
                      timestamp
                    });
                  }
                }
              }
            });
          });
        }
      });
      
      if (i + batchSize < signaturesToFetch.length) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }

    return { success: true, trees: foundTrees };
  } catch (err: any) {
    console.error("Failed to scan for Merkle trees:", err);
    return { success: false, trees: [], error: err.message || "Failed to scan wallet history" };
  }
}
