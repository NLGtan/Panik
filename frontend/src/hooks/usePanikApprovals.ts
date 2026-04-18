import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { type Abi } from "viem";
import { erc20Abi, nftManagerAbi } from "../lib/contracts";
import { mapContractError } from "../lib/errors";
import { appConfig } from "../config/appConfig";
import type { ApprovalToken, NftApprovalConfig } from "../types";

const MAX_UINT256 = (1n << 256n) - 1n;
const HIGH_ALLOWANCE_THRESHOLD = 1n << 255n;

const POLL_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_500;

function isPendingDuplicateTxError(error: unknown): boolean {
  const raw =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    raw.includes("already known") ||
    raw.includes("nonce too low") ||
    raw.includes("replacement transaction underpriced")
  );
}

export interface UsePanikApprovalsReturn {
  needsApproval: boolean;
  missingApprovals: ApprovalToken[];
  needsNftApproval: boolean;
  approveAll: () => Promise<void>;
  recheckApprovals: () => void;
  verifyAllowancesOnChain: () => Promise<boolean>;
  isLoading: boolean;
  isApproving: boolean;
  approvalComplete: boolean;
  progress: string | null;
  error: string | null;
}

export function usePanikApprovals(
  tokens: ApprovalToken[],
  spender: `0x${string}`,
  nftApproval?: NftApprovalConfig
): UsePanikApprovalsReturn {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: appConfig.chainId });
  const { data: walletClient } = useWalletClient({ chainId: appConfig.chainId });

  const [missingApprovals, setMissingApprovals] = useState<ApprovalToken[]>([]);
  const [needsNftApproval, setNeedsNftApproval] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approvalComplete, setApprovalComplete] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const approvalFlowPromiseRef = useRef<Promise<void> | null>(null);

  const checkNftApproval = useCallback(async (): Promise<boolean> => {
    if (!nftApproval?.enabled || !address || !publicClient) return false;

    try {
      const isApproved = (await publicClient.readContract({
        address: nftApproval.address,
        abi: nftManagerAbi,
        functionName: "isApprovedForAll",
        args: [address, spender],
      })) as boolean;
      return !isApproved;
    } catch {
      return false;
    }
  }, [address, nftApproval, publicClient, spender]);

  const refreshMissingApprovals = useCallback(async (): Promise<ApprovalToken[]> => {
    if (!address || !publicClient) {
      return [];
    }

    return collectMissingApprovals(tokens, ownerAddress(address), spender, publicClient);
  }, [address, publicClient, spender, tokens]);

  useEffect(() => {
    if (!address || !publicClient) {
      setApprovalComplete(false);
      setMissingApprovals([]);
      setNeedsNftApproval(false);
      return;
    }

    let active = true;
    setIsLoading(true);
    setError(null);

    void (async () => {
      try {
        const [missing, nftNeeded] = await Promise.all([
          refreshMissingApprovals(),
          checkNftApproval(),
        ]);
        if (!active) return;

        setMissingApprovals(missing);
        setNeedsNftApproval(nftNeeded);
        setApprovalComplete(missing.length === 0 && !nftNeeded);
      } catch (err) {
        if (!active) return;
        setError(mapContractError(err));
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [address, publicClient, refreshMissingApprovals, checkNftApproval]);

  const recheckApprovals = useCallback(() => {
    if (!address || !publicClient) return;

    setApprovalComplete(false);
    setMissingApprovals([]);
    setNeedsNftApproval(false);
    setProgress(null);
    setError(null);
    setIsLoading(true);

    void (async () => {
      try {
        const [missing, nftNeeded] = await Promise.all([
          refreshMissingApprovals(),
          checkNftApproval(),
        ]);
        setMissingApprovals(missing);
        setNeedsNftApproval(nftNeeded);
        setApprovalComplete(missing.length === 0 && !nftNeeded);
      } catch (err) {
        setError(mapContractError(err));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [address, checkNftApproval, publicClient, refreshMissingApprovals]);

  const approveAll = useCallback(async (): Promise<void> => {
    if (!address || !walletClient || !publicClient) {
      setError("Wallet client is not ready.");
      return;
    }

    if (approvalFlowPromiseRef.current) {
      return approvalFlowPromiseRef.current;
    }

    const flowPromise = (async (): Promise<void> => {
      setIsApproving(true);
      setProgress("Checking required approvals...");
      setError(null);

      try {
        const tokensToApprove = await refreshMissingApprovals();
        const nftNeeded = await checkNftApproval();

        if (tokensToApprove.length === 0 && !nftNeeded) {
          setProgress("All approvals already in place.");
          setMissingApprovals([]);
          setNeedsNftApproval(false);
          setApprovalComplete(true);
          return;
        }

        const totalSteps = tokensToApprove.length + (nftNeeded ? 1 : 0);
        let currentStep = 0;

        // ERC20 approvals first
        for (let i = 0; i < tokensToApprove.length; i++) {
          const token = tokensToApprove[i];
          currentStep++;
          const progressPrefix = `Approving ${token.symbol} (${currentStep}/${totalSteps})...`;

          const alreadyApproved = await isTokenApproved(
            token,
            ownerAddress(address),
            spender,
            publicClient
          );
          if (alreadyApproved) {
            continue;
          }

          setProgress(progressPrefix);

          try {
            const hash = await walletClient.writeContract({
              address: token.address,
              abi: erc20Abi as Abi,
              functionName: "approve",
              args: [spender, MAX_UINT256],
              account: ownerAddress(address),
            } as never);

            await publicClient.waitForTransactionReceipt({ hash });
          } catch (txError) {
            if (!isPendingDuplicateTxError(txError)) {
              throw txError;
            }

            setProgress(
              `${progressPrefix} already pending on network, waiting confirmation...`
            );

            let confirmed = false;
            const pollDeadline = Date.now() + POLL_TIMEOUT_MS;
            while (Date.now() < pollDeadline) {
              await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
              const approved = await isTokenApproved(
                token,
                ownerAddress(address),
                spender,
                publicClient
              );
              if (approved) {
                confirmed = true;
                break;
              }
            }

            if (!confirmed) {
              throw new Error(
                `Approval for ${token.symbol} timed out after ${
                  POLL_TIMEOUT_MS / 1000
                }s. The transaction may still be pending.`
              );
            }
          }
        }

        // NFT approval
        if (nftNeeded && nftApproval) {
          currentStep++;
          const nftProgressLabel = `Approving ${nftApproval.symbol} (${currentStep}/${totalSteps})...`;
          setProgress(nftProgressLabel);

          try {
            const hash = await walletClient.writeContract({
              address: nftApproval.address,
              abi: nftManagerAbi as Abi,
              functionName: "setApprovalForAll",
              args: [spender, true],
              account: ownerAddress(address),
            } as never);

            await publicClient.waitForTransactionReceipt({ hash });
          } catch (txError) {
            if (!isPendingDuplicateTxError(txError)) {
              throw txError;
            }

            setProgress(
              `${nftProgressLabel} already pending on network, waiting confirmation...`
            );

            let confirmed = false;
            const pollDeadline = Date.now() + POLL_TIMEOUT_MS;
            while (Date.now() < pollDeadline) {
              await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
              const stillNeeded = await checkNftApproval();
              if (!stillNeeded) {
                confirmed = true;
                break;
              }
            }

            if (!confirmed) {
              throw new Error(
                `NFT approval timed out after ${
                  POLL_TIMEOUT_MS / 1000
                }s. The transaction may still be pending.`
              );
            }
          }
        }

        const [remaining, nftStillNeeded] = await Promise.all([
          refreshMissingApprovals(),
          checkNftApproval(),
        ]);
        setMissingApprovals(remaining);
        setNeedsNftApproval(nftStillNeeded);

        if (remaining.length === 0 && !nftStillNeeded) {
          setApprovalComplete(true);
          setProgress("PANIK approvals are complete.");
        } else {
          setError("Some approvals did not confirm. Please retry.");
        }
      } catch (err) {
        setError(mapContractError(err));
      } finally {
        setIsApproving(false);
      }
    })();

    approvalFlowPromiseRef.current = flowPromise;
    try {
      await flowPromise;
    } finally {
      approvalFlowPromiseRef.current = null;
    }
  }, [address, checkNftApproval, nftApproval, publicClient, refreshMissingApprovals, spender, walletClient]);

  const verifyAllowancesOnChain = useCallback(async (): Promise<boolean> => {
    if (!address || !publicClient) return false;
    try {
      const [missing, nftNeeded] = await Promise.all([
        refreshMissingApprovals(),
        checkNftApproval(),
      ]);
      return missing.length === 0 && !nftNeeded;
    } catch {
      return false;
    }
  }, [address, checkNftApproval, publicClient, refreshMissingApprovals]);

  const needsApproval = !isLoading && (missingApprovals.length > 0 || needsNftApproval);

  return {
    needsApproval,
    missingApprovals,
    needsNftApproval,
    approveAll,
    recheckApprovals,
    verifyAllowancesOnChain,
    isLoading,
    isApproving,
    approvalComplete,
    progress,
    error,
  };
}

function ownerAddress(address: string): `0x${string}` {
  return address as `0x${string}`;
}

async function isTokenApproved(
  token: ApprovalToken,
  owner: `0x${string}`,
  spender: `0x${string}`,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicClient: any
): Promise<boolean> {
  const allowance = (await publicClient.readContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  })) as bigint;

  return allowance >= HIGH_ALLOWANCE_THRESHOLD;
}

async function collectMissingApprovals(
  tokens: ApprovalToken[],
  owner: `0x${string}`,
  spender: `0x${string}`,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicClient: any
): Promise<ApprovalToken[]> {
  if (tokens.length === 0) {
    return [];
  }

  const results = await Promise.all(
    tokens.map(async (token) => {
      const allowance = (await publicClient.readContract({
        address: token.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, spender],
      })) as bigint;

      return { token, allowance };
    })
  );

  return results
    .filter((result) => result.allowance < HIGH_ALLOWANCE_THRESHOLD)
    .map((result) => result.token);
}
