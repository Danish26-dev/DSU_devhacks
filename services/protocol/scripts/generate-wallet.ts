/**
 * KLAIM Wallet Generator — Algorand Testnet
 *
 * Run: npx tsx scripts/generate-wallet.ts
 */
import algosdk from "algosdk";

const account = algosdk.generateAccount();
const mnemonic = algosdk.secretKeyToMnemonic(account.sk);

console.log("\n" + "=".repeat(60));
console.log("  KLAIM — Algorand Testnet Wallet Generated");
console.log("=".repeat(60));
console.log("\n  Address:", account.addr.toString());
console.log("  Mnemonic:", mnemonic);
console.log("\n  Next steps:");
console.log("  1. Fund with ALGO: https://lora.algokit.io/testnet/fund");
console.log("  2. Opt-in to USDC: npx tsx scripts/optin-usdc.ts <mnemonic>");
console.log("  3. Fund with USDC: https://faucet.circle.com/ (Algorand Testnet)");
console.log("=".repeat(60) + "\n");
