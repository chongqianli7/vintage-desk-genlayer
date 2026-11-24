import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';

export const chain = studionet;
export const reader = createClient({ chain });
export const explorer = 'https://explorer-studio.genlayer.com/transactions/';
export function read(address, functionName, args = []) {
  return reader.readContract({ address, functionName, args, transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
}
export async function fund(address) {
  try {
    await reader.request({ method: 'sim_fundAccount', params: [address, 1000000000000000000] });
  } catch (error) {
    // Studio may return its faucet transaction hash as the RPC error message.
    if (!/^0x[\da-f]{64}$/i.test(error.cause?.message ?? '') &&
        !/\n0x[\da-f]{64}$/i.test(error.message)) throw error;
  }
}
export function wait(hash) {
  return reader.waitForTransactionReceipt({ hash, waitUntil: 'finalized',
    interval: 2500, retries: 120, fullTransaction: true });
}
export function execution(receipt) {
  const leaders = receipt.consensus_data?.leader_receipt;
  const leader = Array.isArray(leaders) ? leaders.find(entry => entry.mode === 'leader') : leaders;
  // Studio can mix validator receipts into this field. Its top-level result
  // is authoritative and is not affected by idle validators after quorum.
  if (receipt.txExecutionResultName === 'FINISHED_WITH_RETURN') return 'SUCCESS';
  return leader?.execution_result ?? receipt.txExecutionResultName ??
    String(receipt.txExecutionResult ?? 'UNKNOWN');
}
export function succeeded(receipt) {
  return ['SUCCESS', 'FINISHED_WITH_RETURN'].includes(execution(receipt));
}
