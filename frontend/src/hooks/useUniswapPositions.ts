import { useCallback } from "react";
import { usePublicClient } from "wagmi";
import { getAddress, keccak256, encodePacked } from "viem";
import { appConfig } from "../config/appConfig";
import { nftManagerAbi, uniswapPoolAbi, erc20Abi } from "../lib/contracts";
import type { UniswapPositionView, PositionTag } from "../types";

const FEE_LABELS: Record<number, string> = {
  100: "0.01%",
  500: "0.05%",
  3000: "0.3%",
  10000: "1%",
};

// Uniswap V3 pool init code hash (canonical)
const POOL_INIT_CODE_HASH =
  "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";

// Uniswap V3 factory on Base Sepolia
const UNISWAP_V3_FACTORY = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";

function computePoolAddress(
  token0: `0x${string}`,
  token1: `0x${string}`,
  fee: number
): `0x${string}` {
  // Sort tokens
  const [sorted0, sorted1] =
    token0.toLowerCase() < token1.toLowerCase()
      ? [token0, token1]
      : [token1, token0];

  const salt = keccak256(
    encodePacked(
      ["address", "address", "uint24"],
      [sorted0, sorted1, fee]
    )
  );

  const hash = keccak256(
    encodePacked(
      ["bytes1", "address", "bytes32", "bytes32"],
      ["0xff", UNISWAP_V3_FACTORY as `0x${string}`, salt, POOL_INIT_CODE_HASH as `0x${string}`]
    )
  );

  return getAddress(`0x${hash.slice(26)}`) as `0x${string}`;
}

// Cache for resolved token symbols
const symbolCache = new Map<string, string>();

export function useUniswapPositions() {
  const publicClient = usePublicClient({ chainId: appConfig.chainId });

  const fetchUniswapPositions = useCallback(
    async (walletAddress: `0x${string}`): Promise<UniswapPositionView[]> => {
      if (!publicClient) return [];

      const nftManagerAddress = appConfig.nonfungiblePositionManager;

      // Step 1: How many LP NFTs does the user own?
      const balance = (await publicClient.readContract({
        address: nftManagerAddress,
        abi: nftManagerAbi,
        functionName: "balanceOf",
        args: [walletAddress],
      })) as bigint;

      if (balance === 0n) return [];

      // Step 2: Get all token IDs
      const tokenIdPromises: Promise<bigint>[] = [];
      for (let i = 0n; i < balance; i++) {
        tokenIdPromises.push(
          publicClient.readContract({
            address: nftManagerAddress,
            abi: nftManagerAbi,
            functionName: "tokenOfOwnerByIndex",
            args: [walletAddress, i],
          }) as Promise<bigint>
        );
      }
      const tokenIds = await Promise.all(tokenIdPromises);

      // Step 3: Get position data for each token ID
      const positions: UniswapPositionView[] = [];

      for (const tokenId of tokenIds) {
        try {
          const positionData = (await publicClient.readContract({
            address: nftManagerAddress,
            abi: nftManagerAbi,
            functionName: "positions",
            args: [tokenId],
          })) as readonly [
            bigint, // nonce
            string, // operator
            string, // token0
            string, // token1
            number, // fee
            number, // tickLower
            number, // tickUpper
            bigint, // liquidity
            bigint, // feeGrowthInside0LastX128
            bigint, // feeGrowthInside1LastX128
            bigint, // tokensOwed0
            bigint, // tokensOwed1
          ];

          const token0 = positionData[2] as `0x${string}`;
          const token1 = positionData[3] as `0x${string}`;
          const fee = Number(positionData[4]);
          const tickLower = Number(positionData[5]);
          const tickUpper = Number(positionData[6]);
          const liquidity = positionData[7];
          const tokensOwed0 = positionData[10];
          const tokensOwed1 = positionData[11];

          // Skip positions with zero liquidity and zero fees
          const hasValue = liquidity > 0n || tokensOwed0 > 0n || tokensOwed1 > 0n;

          // Resolve token symbols
          const symbol0 = await resolveSymbol(publicClient, token0);
          const symbol1 = await resolveSymbol(publicClient, token1);

          // Determine in-range by reading pool tick
          let inRange = false;
          try {
            const poolAddress = computePoolAddress(token0, token1, fee);
            const slot0 = (await publicClient.readContract({
              address: poolAddress,
              abi: uniswapPoolAbi,
              functionName: "slot0",
            })) as readonly [bigint, number, number, number, number, number, boolean];
            const currentTick = Number(slot0[1]);
            inRange = currentTick >= tickLower && currentTick < tickUpper;
          } catch {
            // Pool may not exist on testnet, default to unknown
            inRange = false;
          }

          // Determine eligibility
          let tag: PositionTag;
          let eligible: boolean;
          let reason: string;

          if (!hasValue) {
            tag = "not_eligible";
            eligible = false;
            reason = "Position has zero liquidity and no uncollected fees.";
          } else {
            tag = "eligible";
            eligible = true;
            reason = inRange
              ? "Eligible for one-click Uniswap V3 LP exit."
              : "Eligible for exit (position is out of range).";
          }

          positions.push({
            id: `uni:${tokenId.toString()}`,
            protocol: "uniswap",
            tokenId,
            token0,
            token1,
            symbol0,
            symbol1,
            feeTier: FEE_LABELS[fee] ?? `${fee / 10000}%`,
            fee,
            liquidity,
            inRange,
            tokensOwed0,
            tokensOwed1,
            eligible,
            locked: false,
            tag,
            reason,
          });
        } catch {
          // Skip individual positions that fail to read
        }
      }

      return positions;
    },
    [publicClient]
  );

  return { fetchUniswapPositions };
}

async function resolveSymbol(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicClient: any,
  tokenAddress: `0x${string}`
): Promise<string> {
  const key = tokenAddress.toLowerCase();
  const cached = symbolCache.get(key);
  if (cached) return cached;

  try {
    const symbol = (await publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "symbol",
    })) as string;

    symbolCache.set(key, symbol);
    return symbol;
  } catch {
    const short = `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}`;
    symbolCache.set(key, short);
    return short;
  }
}
