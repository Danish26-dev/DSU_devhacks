/**
 * KLAIM USDC Opt-In — opts an Algorand account into Testnet USDC (ASA 10458941).
 *
 * Usage: npx tsx scripts/optin-usdc.ts <25-word-mnemonic>
 * Account must have at least 0.2 ALGO funded first.
 */
import algosdk from "algosdk";

const USDC_ASA_ID = 10458941;
const ALGOD_URL = "https://testnet-api.algonode.cloud";

async function main() {
  const mnemonic = process.argv.slice(2).join(" ").trim();
  if (!mnemonic || mnemonic.split(" ").length < 25) {
    console.error("Usage: npx tsx scripts/optin-usdc.ts <25-word-mnemonic>");
    process.exit(1);
  }

  const account = algosdk.mnemonicToSecretKey(mnemonic);
  console.log(`\nOpting in: ${account.addr}`);
  console.log(`Asset: USDC (ASA ${USDC_ASA_ID})\n`);

  const client = new algosdk.Algodv2("", ALGOD_URL, "");
  const params = await client.getTransactionParams().do();

  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: account.addr,
    receiver: account.addr,
    amount: 0,
    assetIndex: USDC_ASA_ID,
    suggestedParams: params,
  });

  const signed = txn.signTxn(account.sk);
  const { txid } = await client.sendRawTransaction(signed).do();
  console.log(`TX submitted: ${txid}`);

  const result = await algosdk.waitForConfirmation(client, txid, 4);
  console.log(`Confirmed in round: ${result["confirmed-round"]}`);
  console.log(`\n✓ Opted into USDC (ASA ${USDC_ASA_ID})`);
  console.log(`  Lora: https://lora.algokit.io/testnet/transaction/${txid}\n`);
}

main().catch((err: unknown) => {
  console.error("Opt-in failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
