import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatUnits } from "viem";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { PositionList } from "./components/PositionList";
import { WalletPanel } from "./components/WalletPanel";
import { ApprovalGate } from "./components/ApprovalGate";
import { appConfig } from "./config/appConfig";
import {
  aaveDataProviderAbi,
  lockCheckerAbi,
  panikExecutorAbi,
  toAddressSet,
} from "./lib/contracts";
import {
  ArrowRight,
  RefreshCw,
  Circle,
  Lock,
  Zap,
  ShieldCheck,
  ShieldAlert,
  Layers,
  Droplets,
  ChartPie,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { cn } from "@/lib/utils";
import { mapContractError } from "./lib/errors";
import { formatUsd } from "./lib/format";
import { usePanikApprovals } from "./hooks/usePanikApprovals";
import { useUniswapPositions } from "./hooks/useUniswapPositions";
import type {
  ApprovalToken,
  AavePositionView,
  UniswapPositionView,
  PositionView,
  EntryPoint,
  ScreenKey,
  TxSummary,
} from "./types";
import { isAavePosition, isUniswapPosition } from "./types";

const lower = (value: string) => value.toLowerCase();
const hiddenAssetSet = new Set(appConfig.hiddenAssets.map((asset) => lower(asset)));

type DashboardStatus = "can_exit" | "flash_loan_required" | "locked";
type DashboardHealthTone = "safe" | "warning" | "neutral";

interface DashboardRow {
  id: string;
  protocolLabel: string;
  assetLabel: string;
  assetTypeLabel: string;
  valueUsd: number;
  healthLabel: string;
  healthTone: DashboardHealthTone;
  healthPercent: number | null;
  status: DashboardStatus;
}

const MAX_UI_HEALTH_FACTOR = 4;
const SAFE_HEALTH_FACTOR_THRESHOLD = 1.8;
const LIQUIDITY_VALUE_DIVISOR = 1000n;

function toSafeNumber(value: bigint): number {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (value > max) return Number.MAX_SAFE_INTEGER;
  if (value < 0n) return 0;
  return Number(value);
}

function toUsdValue(rawAmount: bigint, decimals: number): number {
  const parsed = Number.parseFloat(formatUnits(rawAmount, decimals));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function CoreApp() {
  const { address, isConnected, connector: activeConnector } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: appConfig.chainId });
  const { data: walletClient } = useWalletClient({ chainId: appConfig.chainId });
  const { isPending: isConnecting } = useConnect();
  const { disconnectAsync, isPending: isDisconnecting } = useDisconnect();
  const { switchChain, switchChainAsync } = useSwitchChain();
  const navigate = useNavigate();
  const { fetchUniswapPositions } = useUniswapPositions();

  const [screen, setScreen] = useState<ScreenKey>("screen1");
  const [entryPoint, setEntryPoint] = useState<EntryPoint>(null);
  const [aavePositions, setAavePositions] = useState<AavePositionView[]>([]);
  const [uniswapPositions, setUniswapPositions] = useState<UniswapPositionView[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hasScanned, setHasScanned] = useState(false);
  const [isEoa, setIsEoa] = useState<boolean | null>(null);
  const [isLoadingEligibility, setIsLoadingEligibility] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<string | null>(null);
  const [autoSubmitOnScreen3, setAutoSubmitOnScreen3] = useState(false);
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(null);
  const [txSummary, setTxSummary] = useState<TxSummary | null>(null);
  const [receiptInfo, setReceiptInfo] = useState<{
    blockNumber: bigint;
    timestamp: string;
  } | null>(null);
  const [approvalTokens, setApprovalTokens] = useState<ApprovalToken[]>([]);

  const wrongChain = isConnected && chainId !== appConfig.chainId;

  const nftApprovalConfig = useMemo(
    () => ({
      address: appConfig.nonfungiblePositionManager,
      symbol: "Uniswap V3 LP NFT",
      enabled: uniswapPositions.length > 0,
      description: "Approve PANIK to manage your Uniswap LP positions",
    }),
    [uniswapPositions.length]
  );

  const approvals = usePanikApprovals(approvalTokens, appConfig.panikExecutor, nftApprovalConfig);

  const setScreenState = useCallback((next: ScreenKey) => {
    setErrorMessage(null);
    setScreen(next);
  }, []);

  const clearWalletSessionHints = useCallback(() => {
    if (typeof window === "undefined") return;
    const keys = [
      "recentConnectorId",
      "wagmi.recentConnectorId",
      "injected.connected",
      "wagmi.injected.connected",
    ];
    for (const key of keys) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    async function checkEoa() {
      if (!isConnected || !address || !publicClient) {
        setIsEoa(null);
        return;
      }
      try {
        const code = await publicClient.getCode({ address });
        setIsEoa(code === undefined || code === "0x");
      } catch (error) {
        setIsEoa(null);
        setErrorMessage(mapContractError(error));
      }
    }
    void checkEoa();
  }, [address, isConnected, publicClient]);

  const scanAavePositions = useCallback(async (): Promise<{
    positions: AavePositionView[];
    approvalTokens: ApprovalToken[];
    error: string | null;
  }> => {
    if (!isConnected || !address || !publicClient || wrongChain || isEoa !== true) {
      return { positions: [], approvalTokens: [], error: null };
    }
    try {
      let assetsToScan = appConfig.assets.filter(
        (asset) => !hiddenAssetSet.has(lower(asset.address))
      );
      try {
        const trackedFromContract = (await publicClient.readContract({
          address: appConfig.panikExecutor,
          abi: panikExecutorAbi,
          functionName: "getTrackedAssets",
        })) as readonly string[];
        if (trackedFromContract.length > 0) {
          const trackedSet = toAddressSet(trackedFromContract);
          const knownTrackedAssets = appConfig.assets.filter((asset) =>
            trackedSet.has(lower(asset.address))
          );
          if (knownTrackedAssets.length > 0) {
            assetsToScan = knownTrackedAssets.filter(
              (asset) => !hiddenAssetSet.has(lower(asset.address))
            );
          }
        }
      } catch {
        // fallback
      }

      const routeMap = new Map<string, boolean>();
      const reserveByAsset = new Map<
        string,
        { collateralAmount: bigint; stableDebtAmount: bigint; variableDebtAmount: bigint }
      >();

      const dataProvider = (await publicClient.readContract({
        address: appConfig.panikExecutor,
        abi: panikExecutorAbi,
        functionName: "dataProvider",
      })) as `0x${string}`;

      const resolvedApprovalTokens: ApprovalToken[] = [
        { address: appConfig.usdc, symbol: "USDC" },
      ];
      const seenATokens = new Set<string>();

      for (const asset of assetsToScan) {
        const routeData = (await publicClient.readContract({
          address: appConfig.panikExecutor,
          abi: panikExecutorAbi,
          functionName: "getSwapConfig",
          args: [asset.address],
        })) as readonly [boolean, `0x${string}`, number, boolean];
        routeMap.set(lower(asset.address), Boolean(routeData[0]));

        const reserveData = (await publicClient.readContract({
          address: dataProvider,
          abi: aaveDataProviderAbi,
          functionName: "getUserReserveData",
          args: [asset.address, address],
        })) as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, number, boolean];

        const hasPosition = reserveData[0] > 0n || reserveData[1] > 0n || reserveData[2] > 0n;
        reserveByAsset.set(lower(asset.address), {
          collateralAmount: reserveData[0],
          stableDebtAmount: reserveData[1],
          variableDebtAmount: reserveData[2],
        });

        if (reserveData[0] > 0n) {
          try {
            const reserveTokens = (await publicClient.readContract({
              address: dataProvider,
              abi: aaveDataProviderAbi,
              functionName: "getReserveTokensAddresses",
              args: [asset.address],
            })) as readonly [`0x${string}`, `0x${string}`, `0x${string}`];
            const aTokenAddress = reserveTokens[0];
            const aTokenKey = lower(aTokenAddress);
            if (
              aTokenAddress !== "0x0000000000000000000000000000000000000000" &&
              !seenATokens.has(aTokenKey)
            ) {
              seenATokens.add(aTokenKey);
              resolvedApprovalTokens.push({ address: aTokenAddress, symbol: `a${asset.symbol}` });
            }
          } catch {
            // skip
          }
        }

        const totalDebt = reserveData[1] + reserveData[2];
        if (totalDebt > 0n) {
          const debtAssetKey = lower(asset.address);
          if (!seenATokens.has(`debt:${debtAssetKey}`)) {
            seenATokens.add(`debt:${debtAssetKey}`);
            resolvedApprovalTokens.push({ address: asset.address, symbol: asset.symbol });
          }
        }

        if (!hasPosition) continue;
      }

      const lockedAssets = (await publicClient.readContract({
        address: appConfig.lockChecker,
        abi: lockCheckerAbi,
        functionName: "getLockedAssets",
        args: [address, assetsToScan.map((asset) => asset.address)],
      })) as readonly string[];

      const lockedSet = toAddressSet(lockedAssets);
      const scannedAssets = assetsToScan.filter((asset) => {
        const reserve = reserveByAsset.get(lower(asset.address));
        if (!reserve) return false;
        return (
          reserve.collateralAmount > 0n ||
          reserve.stableDebtAmount > 0n ||
          reserve.variableDebtAmount > 0n
        );
      });

      const positions: AavePositionView[] = scannedAssets.map((asset) => {
        const key = lower(asset.address);
        const routeEnabled = routeMap.get(key) ?? false;
        const locked = lockedSet.has(key);
        const reserve = reserveByAsset.get(key) ?? {
          collateralAmount: 0n,
          stableDebtAmount: 0n,
          variableDebtAmount: 0n,
        };

        if (locked) {
          return {
            id: `aave:${key}`,
            protocol: "aave" as const,
            asset,
            collateralAmount: reserve.collateralAmount,
            stableDebtAmount: reserve.stableDebtAmount,
            variableDebtAmount: reserve.variableDebtAmount,
            routeEnabled,
            locked: true,
            eligible: false,
            tag: "locked" as const,
            reason: "Locked by pre-flight checks (cooldown/frozen/zero-liquidity).",
          };
        }

        const needsCollateralSwap =
          reserve.collateralAmount > 0n &&
          asset.address.toLowerCase() !== appConfig.usdc.toLowerCase();

        if (needsCollateralSwap && !routeEnabled) {
          return {
            id: `aave:${key}`,
            protocol: "aave" as const,
            asset,
            collateralAmount: reserve.collateralAmount,
            stableDebtAmount: reserve.stableDebtAmount,
            variableDebtAmount: reserve.variableDebtAmount,
            routeEnabled,
            locked: false,
            eligible: false,
            tag: "route_missing" as const,
            reason: "No configured collateral swap route to USDC for this asset.",
          };
        }

        return {
          id: `aave:${key}`,
          protocol: "aave" as const,
          asset,
          collateralAmount: reserve.collateralAmount,
          stableDebtAmount: reserve.stableDebtAmount,
          variableDebtAmount: reserve.variableDebtAmount,
          routeEnabled,
          locked: false,
          eligible: true,
          tag: "eligible" as const,
          reason: "Eligible for one-click Aave exit flow.",
        };
      });

      return { positions, approvalTokens: resolvedApprovalTokens, error: null };
    } catch (error) {
      return {
        positions: [],
        approvalTokens: [{ address: appConfig.usdc, symbol: "USDC" }],
        error: mapContractError(error),
      };
    }
  }, [address, isConnected, isEoa, publicClient, wrongChain]);

  const refreshEligibility = useCallback(async () => {
    if (!isConnected || !address || !publicClient || wrongChain || isEoa !== true) {
      setAavePositions([]);
      setUniswapPositions([]);
      setApprovalTokens([]);
      setLastScannedAt(null);
      return;
    }
    setIsLoadingEligibility(true);
    setHasScanned(false);
    setErrorMessage(null);

    const [aaveResult, uniPositions] = await Promise.all([
      scanAavePositions(),
      (async (): Promise<{ positions: UniswapPositionView[]; error: string | null }> => {
        try {
          const positions = await fetchUniswapPositions(address);
          return { positions, error: null };
        } catch (error) {
          return { positions: [], error: mapContractError(error) };
        }
      })(),
    ]);

    setAavePositions(aaveResult.positions);
    setUniswapPositions(uniPositions.positions);
    setApprovalTokens(aaveResult.approvalTokens);

    const mergedErrors = [aaveResult.error, uniPositions.error]
      .filter((v): v is string => Boolean(v))
      .join(" | ");
    setErrorMessage(mergedErrors.length > 0 ? mergedErrors : null);
    setHasScanned(true);
    setLastScannedAt(new Date().toISOString());
    setIsLoadingEligibility(false);
  }, [address, fetchUniswapPositions, isConnected, isEoa, publicClient, scanAavePositions, wrongChain]);

  useEffect(() => {
    if (!isConnected || wrongChain || isEoa === false) {
      setAavePositions([]);
      setUniswapPositions([]);
      setSelected(new Set());
      setHasScanned(false);
      setLastScannedAt(null);
      setSubmitProgress(null);
      setAutoSubmitOnScreen3(false);
      setApprovalTokens([]);
      setScreen("screen1");
    }
  }, [isConnected, wrongChain, isEoa]);

  const positions = useMemo<PositionView[]>(
    () => [...aavePositions, ...uniswapPositions],
    [aavePositions, uniswapPositions]
  );

  const eligiblePositions = useMemo(
    () => positions.filter((position) => position.eligible),
    [positions]
  );

  const dashboardRows = useMemo<DashboardRow[]>(() => {
    const mapped = positions.map((position) => {
      const status: DashboardStatus = isAavePosition(position)
        ? position.locked
          ? "locked"
          : position.eligible
            ? "can_exit"
            : "flash_loan_required"
        : position.locked || !position.eligible
          ? "locked"
          : "can_exit";

      if (isAavePosition(position)) {
        const collateral = toUsdValue(position.collateralAmount, position.asset.decimals);
        const debt = toUsdValue(
          position.stableDebtAmount + position.variableDebtAmount,
          position.asset.decimals
        );
        const derivedHealth =
          debt > 0 ? collateral / debt : collateral > 0 ? MAX_UI_HEALTH_FACTOR : null;
        const normalizedHealth =
          derivedHealth === null
            ? null
            : Math.max(0, Math.min(derivedHealth, MAX_UI_HEALTH_FACTOR));
        const healthTone: DashboardHealthTone =
          normalizedHealth === null
            ? "neutral"
            : normalizedHealth < SAFE_HEALTH_FACTOR_THRESHOLD
              ? "warning"
              : "safe";
        const hasSupply = collateral > 0;
        const hasDebt = debt > 0;
        const assetTypeLabel =
          hasSupply && hasDebt ? "Supply + Borrow" : hasSupply ? "Supply" : "Borrow";

        return {
          id: position.id,
          protocolLabel: "Aave",
          assetLabel: position.asset.symbol,
          assetTypeLabel,
          valueUsd: hasSupply ? collateral : debt,
          healthLabel: normalizedHealth === null ? "—" : normalizedHealth.toFixed(2),
          healthTone,
          healthPercent:
            normalizedHealth === null ? null : (normalizedHealth / MAX_UI_HEALTH_FACTOR) * 100,
          status,
        } satisfies DashboardRow;
      }

      const liquidityValue = toSafeNumber(position.liquidity / LIQUIDITY_VALUE_DIVISOR);
      const feeValue = toSafeNumber(position.tokensOwed0 + position.tokensOwed1);

      return {
        id: position.id,
        protocolLabel: "Uniswap",
        assetLabel: `${position.symbol0}/${position.symbol1}`,
        assetTypeLabel: "LP",
        valueUsd: Math.max(liquidityValue + feeValue, 0),
        healthLabel: "—",
        healthTone: "neutral",
        healthPercent: null,
        status,
      } satisfies DashboardRow;
    });

    return mapped.sort((a, b) => {
      if (a.status === "locked" && b.status !== "locked") return 1;
      if (b.status === "locked" && a.status !== "locked") return -1;
      return 0;
    });
  }, [positions]);

  const totalPortfolioValue = useMemo(
    () =>
      dashboardRows.reduce(
        (sum, row) => sum + (Number.isFinite(row.valueUsd) ? row.valueUsd : 0),
        0
      ),
    [dashboardRows]
  );

  const lockedCount = useMemo(
    () => dashboardRows.filter((row) => row.status === "locked").length,
    [dashboardRows]
  );
  const atRiskCount = useMemo(
    () => dashboardRows.filter((row) => row.healthTone === "warning").length,
    [dashboardRows]
  );
  const uniswapInRangeCount = useMemo(
    () => uniswapPositions.filter((position) => position.inRange).length,
    [uniswapPositions]
  );
  const uniswapOutOfRangeCount = useMemo(
    () => uniswapPositions.filter((position) => !position.inRange).length,
    [uniswapPositions]
  );
  const pendingFeeCount = useMemo(
    () =>
      uniswapPositions.filter(
        (position) => position.tokensOwed0 > 0n || position.tokensOwed1 > 0n
      ).length,
    [uniswapPositions]
  );
  const aaveValueUsd = useMemo(
    () =>
      dashboardRows
        .filter((row) => row.protocolLabel === "Aave")
        .reduce((sum, row) => sum + (Number.isFinite(row.valueUsd) ? row.valueUsd : 0), 0),
    [dashboardRows]
  );
  const uniswapValueUsd = useMemo(
    () =>
      dashboardRows
        .filter((row) => row.protocolLabel === "Uniswap")
        .reduce((sum, row) => sum + (Number.isFinite(row.valueUsd) ? row.valueUsd : 0), 0),
    [dashboardRows]
  );
  const aaveSharePercent = useMemo(() => {
    const total = aaveValueUsd + uniswapValueUsd;
    if (total <= 0) return 50;
    return Math.max(0, Math.min(100, (aaveValueUsd / total) * 100));
  }, [aaveValueUsd, uniswapValueUsd]);
  const uniswapSharePercent = 100 - aaveSharePercent;
  const exitReadyPercent = useMemo(() => {
    if (positions.length === 0) return 0;
    return Math.round((eligiblePositions.length / positions.length) * 100);
  }, [eligiblePositions.length, positions.length]);
  const lastScannedLabel = useMemo(() => {
    if (!lastScannedAt) return "Not scanned";
    const parsed = new Date(lastScannedAt);
    if (Number.isNaN(parsed.getTime())) return "Not scanned";
    return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }, [lastScannedAt]);

  const selectedPositions = useMemo(
    () => positions.filter((position) => selected.has(position.id)),
    [positions, selected]
  );

  const willExitPositions = useMemo(
    () => selectedPositions.filter((position) => position.eligible),
    [selectedPositions]
  );

  const cannotExitPositions = useMemo(() => {
    if (entryPoint === "panic") return positions.filter((position) => !position.eligible);
    return selectedPositions.filter((position) => !position.eligible);
  }, [entryPoint, positions, selectedPositions]);

  const willExitAave = useMemo(() => willExitPositions.filter(isAavePosition), [willExitPositions]);
  const willExitUniswap = useMemo(
    () => willExitPositions.filter(isUniswapPosition),
    [willExitPositions]
  );
  const cannotExitAave = useMemo(
    () => cannotExitPositions.filter(isAavePosition),
    [cannotExitPositions]
  );
  const cannotExitUniswap = useMemo(
    () => cannotExitPositions.filter(isUniswapPosition),
    [cannotExitPositions]
  );

  const setSelectedFromList = useCallback((list: PositionView[]) => {
    setSelected(new Set(list.map((position) => position.id)));
  }, []);

  const resetToScreen1 = useCallback(() => {
    setScreenState("screen1");
    setEntryPoint(null);
    setSelected(new Set());
    setHasScanned(false);
    setLastScannedAt(null);
    setAavePositions([]);
    setUniswapPositions([]);
    setIsSubmitting(false);
    setSubmitProgress(null);
    setAutoSubmitOnScreen3(false);
    setTxSummary(null);
    setReceiptInfo(null);
    setApprovalTokens([]);
  }, [setScreenState]);

  const handleExitAll = useCallback(() => {
    setEntryPoint("panic");
    setSelectedFromList(eligiblePositions);
    setAutoSubmitOnScreen3(true);
    setScreenState("screen3");
  }, [eligiblePositions, setScreenState, setSelectedFromList]);

  const handleSelectPositions = useCallback(() => {
    setEntryPoint("cautious");
    setSelected(new Set());
    setAutoSubmitOnScreen3(false);
    setScreenState("screen2");
  }, [setScreenState]);

  const toggleSelection = useCallback((positionId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(positionId)) next.delete(positionId);
      else next.add(positionId);
      return next;
    });
  }, []);

  const canPerformExit =
    isConnected &&
    !wrongChain &&
    isEoa === true &&
    Boolean(walletClient) &&
    Boolean(publicClient);

  const canScanPositions =
    isConnected && !wrongChain && isEoa === true && Boolean(publicClient);

  const submitExit = useCallback(async () => {
    if (!address || !walletClient || !publicClient) {
      setErrorMessage("Wallet client is not ready.");
      return;
    }
    try {
      const walletChainId = await walletClient.getChainId();
      if (walletChainId !== appConfig.chainId) {
        await switchChainAsync({ chainId: appConfig.chainId });
        setErrorMessage("Switched to Base Sepolia. Please confirm exit again.");
        return;
      }
    } catch (error) {
      setErrorMessage(
        `Please switch your wallet to Base Sepolia (chain 84532) and retry. ${mapContractError(error)}`
      );
      return;
    }
    if (willExitPositions.length === 0) {
      setErrorMessage("No eligible positions selected.");
      return;
    }
    const stillApproved = await approvals.verifyAllowancesOnChain();
    if (!stillApproved) {
      approvals.recheckApprovals();
      setErrorMessage("One or more approvals were revoked. Please re-enable PANIK.");
      return;
    }

    const selectedAaveAssets = willExitPositions
      .filter(isAavePosition)
      .map((p) => p.asset.address as `0x${string}`);
    const selectedUniswapTokenIds = willExitPositions
      .filter(isUniswapPosition)
      .map((p) => p.tokenId);

    if (selectedAaveAssets.length === 0 && selectedUniswapTokenIds.length === 0) {
      setErrorMessage("No eligible positions selected.");
      return;
    }

    setIsSubmitting(true);
    setSubmitProgress("Preparing secure one-click exit...");
    setErrorMessage(null);

    try {
      setSubmitProgress("Submitting exit transaction...");
      
      // Bypassing simulateContract and estimateContractGas entirely!
      // Base Sepolia RPCs have a known bug with these test tokens returning
      // "intrinsic gas too high" during gas estimation.
      // Providing a manual high gas limit forces the transaction through.
      const manualGasLimit = 3_000_000n;

      // @ts-expect-error viem typing evaluates args union to never without strict ABI string narrowing
      const hash = await walletClient.writeContract({
        address: appConfig.panikExecutor,
        abi: panikExecutorAbi,
        functionName: "atomicExit",
        args: [selectedAaveAssets, selectedUniswapTokenIds],
        account: address,
        gas: manualGasLimit,
      });

      setTxSummary({
        hash,
        selectedAaveAssets,
        selectedUniswapTokenIds,
        functionName: "atomicExit",
        gasEstimate: manualGasLimit,
      });
      setScreen("executing");

      setSubmitProgress("Waiting for Base confirmation...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setReceiptInfo({ blockNumber: receipt.blockNumber, timestamp: new Date().toISOString() });
      setScreen("screen4");
    } catch (error) {
      setErrorMessage(mapContractError(error));
      setScreen("screen3");
    } finally {
      setIsSubmitting(false);
      setSubmitProgress(null);
    }
  }, [address, approvals, publicClient, switchChainAsync, walletClient, willExitPositions]);

  useEffect(() => {
    if (
      screen !== "screen3" ||
      !autoSubmitOnScreen3 ||
      isSubmitting ||
      willExitPositions.length === 0
    )
      return;
    setAutoSubmitOnScreen3(false);
    void submitExit();
  }, [autoSubmitOnScreen3, isSubmitting, screen, submitExit, willExitPositions.length]);

  return (
    <div className="core-app-root flex flex-col min-h-screen w-full relative overflow-x-clip">
      <div className="app-glow-1" aria-hidden="true" />
      <div className="app-glow-2" aria-hidden="true" />
      <div className="app-glow-3" aria-hidden="true" />
      <WalletPanel
        connected={isConnected}
        address={address}
        chainId={chainId}
        requiredChainId={appConfig.chainId}
        isEoa={isEoa}
        logoHref="/"
        onConnect={() => {
          // Redirect to landing page — that's the sole connection point
          navigate("/");
        }}
        onDisconnect={() => {
          void (async () => {
            setErrorMessage(null);
            try {
              if (activeConnector) await disconnectAsync({ connector: activeConnector });
              else await disconnectAsync();
            } catch (error) {
              clearWalletSessionHints();
              setErrorMessage(
                `Disconnect had a wallet-side issue. Cleared local session; reconnect if needed. ${mapContractError(error)}`
              );
            } finally {
              resetToScreen1();
              navigate("/");
            }
          })();
        }}
        onSwitchNetwork={() => switchChain({ chainId: appConfig.chainId })}
        connectLoading={isConnecting}
        disconnectLoading={isDisconnecting}
      />

      <main className="app-shell w-full flex-1">
      {isConnected && !wrongChain && isEoa === true && hasScanned && (
        <ApprovalGate approvals={approvals} />
      )}

      {errorMessage && (
        <div className="banner danger">
          {errorMessage}
          <button className="btn-ghost" onClick={() => setErrorMessage(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* ── Screen 1: Dashboard ── */}
      {screen === "screen1" && (
        <section className="dashboard-surface">
          <div className="market-strip">
            <div className="market-strip-head">
              <div>
                <h2 className="market-strip-title">Portfolio Overview</h2>
                <div className="market-strip-worth">
                  <span>Net worth</span>
                  <strong>{formatUsd(totalPortfolioValue)}</strong>
                  <span>Last scan {lastScannedLabel}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void refreshEligibility()}
                disabled={!canScanPositions || isLoadingEligibility}
                className="market-strip-button"
              >
                <RefreshCw className="w-4 h-4" />
                {isLoadingEligibility ? "Scanning..." : hasScanned ? "Refresh Market" : "Scan Positions"}
              </Button>
            </div>

            <div className="market-kpi-grid">
              <Card className="market-kpi-card">
                <CardContent className="market-kpi-content">
                  <div className="market-kpi-title">
                    <ShieldCheck className="market-kpi-icon text-green-500" />
                    Exit ready
                  </div>
                  <div className="market-kpi-value">{eligiblePositions.length}</div>
                  <div className="market-kpi-sub">
                    {positions.length > 0 ? `${exitReadyPercent}% of scanned` : "Run scan"}
                  </div>
                </CardContent>
              </Card>

              <Card className="market-kpi-card">
                <CardContent className="market-kpi-content">
                  <div className="market-kpi-title">
                    <ShieldAlert className="market-kpi-icon text-amber-500" />
                    Blocked
                  </div>
                  <div className="market-kpi-value">{lockedCount}</div>
                  <div className="market-kpi-sub">
                    {positions.length > 0 ? `${positions.length - lockedCount} unlockable` : "No data"}
                  </div>
                </CardContent>
              </Card>

              <Card className="market-kpi-card">
                <CardContent className="market-kpi-content">
                  <div className="market-kpi-title">
                    <Zap className="market-kpi-icon text-amber-500" />
                    At risk
                  </div>
                  <div className="market-kpi-value">{atRiskCount}</div>
                  <div className="market-kpi-sub">Aave warning health</div>
                </CardContent>
              </Card>

              <Card className="market-kpi-card">
                <CardContent className="market-kpi-content">
                  <div className="market-kpi-title">
                    <Layers className="market-kpi-icon text-blue-400" />
                    LP in range
                  </div>
                  <div className="market-kpi-value">
                    {uniswapPositions.length > 0
                      ? `${uniswapInRangeCount}/${uniswapPositions.length}`
                      : "0"}
                  </div>
                  <div className="market-kpi-sub">{uniswapOutOfRangeCount} out of range</div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="dashboard-grid">

          {/* ── Positions Card ── */}
          <Card className="positions-card">
            <CardContent className="positions-card-inner">

              {/* Header */}
              <div className="positions-head">
                <h2 className="positions-title">Positions</h2>
                <span className="positions-subtitle">
                  {hasScanned ? `${positions.length} positions scanned` : "Run scan to load positions"}
                </span>
              </div>

              {/* Loading */}
              {isLoadingEligibility && (
                <div className="table-empty">Scanning Aave and Uniswap positions…</div>
              )}

              {/* Table */}
              {hasScanned && dashboardRows.length > 0 && (
                <div className="positions-scroll">
                  <Table className="positions-table">
                    <TableHeader>
                      <TableRow className="table-header-row">
                        <TableHead className="col-protocol th-label">Protocol</TableHead>
                        <TableHead className="col-asset th-label">Asset</TableHead>
                        <TableHead className="col-value th-label">Value</TableHead>
                        <TableHead className="col-health th-label">Health</TableHead>
                        <TableHead className="col-status th-label">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboardRows.map((row) => (
                        <TableRow
                          key={row.id}
                          className={cn("table-data-row", row.status === "locked" && "is-locked")}
                        >
                          <TableCell className="col-protocol td-protocol">
                            {row.protocolLabel}
                          </TableCell>
                          <TableCell className="col-asset td-asset">
                            <span className="asset-name">{row.assetLabel}</span>
                            <span className="asset-type">{row.assetTypeLabel}</span>
                          </TableCell>
                          <TableCell className="col-value td-value">
                            {formatUsd(row.valueUsd)}
                          </TableCell>
                          <TableCell className="col-health td-health">
                            <span
                              className={cn(
                                "health-value",
                                row.healthTone === "safe" && "health-safe",
                                row.healthTone === "warning" && "health-warning",
                                row.healthTone === "neutral" && "health-neutral"
                              )}
                            >
                              {row.healthLabel}
                            </span>
                          </TableCell>
                          <TableCell className="col-status td-status">
                            {row.status === "can_exit" && (
                              <Badge className="badge-can-exit">
                                <Circle className="w-1.5 h-1.5 fill-green-500 stroke-none" />
                                Can exit
                              </Badge>
                            )}
                            {row.status === "locked" && (
                              <Badge className="badge-locked">
                                <Lock className="w-3 h-3" />
                                Locked
                              </Badge>
                            )}
                            {row.status === "flash_loan_required" && (
                              <Badge className="badge-flash">
                                <Zap className="w-3 h-3" />
                                Flash loan
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {hasScanned && !isLoadingEligibility && dashboardRows.length === 0 && (
                <div className="table-empty">No positions found for this wallet.</div>
              )}

              {!isConnected && !isLoadingEligibility && (
                <div className="table-empty">
                  Connect your wallet to scan and exit DeFi positions.
                </div>
              )}
              {isConnected && wrongChain && !isLoadingEligibility && (
                <div className="table-empty">
                  Switch to Base Sepolia to continue.
                </div>
              )}
              {isConnected && !wrongChain && isEoa === false && !isLoadingEligibility && (
                <div className="table-empty">
                  Contract wallets are not supported.
                </div>
              )}
              {isConnected && !wrongChain && isEoa === true && !hasScanned && !isLoadingEligibility && (
                <div className="table-empty">
                  Click Scan to detect your Aave and Uniswap positions.
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Control Rail ── */}
          <aside className="control-card">
            <div className="rail-portfolio-label">Total Portfolio Value</div>
            <div className="rail-portfolio-amount">{formatUsd(totalPortfolioValue)}</div>

            <Button
              className="btn-exit-all"
              onClick={handleExitAll}
              disabled={!canPerformExit || eligiblePositions.length === 0 || isLoadingEligibility}
            >
              Exit All Positions <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
            <p className="rail-note">Fastest route. Exit all eligible positions.</p>

            <div className="rail-or">
              <Separator className="rail-sep" />
              <span>or</span>
              <Separator className="rail-sep" />
            </div>

            <Button
              className="btn-select"
              onClick={handleSelectPositions}
              disabled={!canPerformExit || positions.length === 0}
            >
              Select Positions
            </Button>
            <p className="rail-note">Review and choose manually.</p>

            <Separator className="rail-divider" />

            <div className="rail-mix-head">
              <Badge variant="outline" className="rail-mix-badge">
                <ChartPie className="w-3.5 h-3.5" />
                Market Mix
              </Badge>
            </div>
            <div className="rail-stat-row">
              <span>Aave exposure</span>
              <strong>{formatUsd(aaveValueUsd)}</strong>
            </div>
            <div className="rail-stat-row">
              <span>Uniswap exposure</span>
              <strong>{formatUsd(uniswapValueUsd)}</strong>
            </div>
            <div className="rail-mix-track" role="presentation" aria-hidden="true">
              <span className="rail-mix-segment rail-mix-segment-aave" style={{ width: `${aaveSharePercent}%` }} />
              <span className="rail-mix-segment rail-mix-segment-uni" style={{ width: `${uniswapSharePercent}%` }} />
            </div>
            <div className="rail-stat-row">
              <span className="rail-inline-label">
                <Droplets className="w-3.5 h-3.5" />
                Fees pending
              </span>
              <strong>{pendingFeeCount}</strong>
            </div>
          </aside>
          </div>
        </section>
      )}

      {/* ── Screen 2 ── */}
      {screen === "screen2" && (
        <div className="select-surface">
          <h2>Select Positions</h2>
          <p className="muted">Choose which positions to exit.</p>
          <PositionList
            title="Aave V3"
            positions={aavePositions}
            selectable
            selected={selected}
            onToggle={toggleSelection}
          />
          <PositionList
            title="Uniswap V3"
            positions={uniswapPositions}
            selectable
            selected={selected}
            onToggle={toggleSelection}
          />
          <div className="select-footer">
            <span className="select-count">
              <strong>{selectedPositions.filter((p) => p.eligible).length}</strong> of{" "}
              {positions.length} selected
            </span>
            <div className="select-actions">
              <button className="btn-ghost" onClick={resetToScreen1}>Back</button>
              <button
                className="btn-sm"
                onClick={() => setScreenState("screen15")}
                disabled={selectedPositions.length === 0}
              >
                Continue →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Screen 1.5 ── */}
      {screen === "screen15" && (
        <div className="confirm-surface">
          <div className="confirm-header">
            <h2>Review Exit</h2>
            <p className="muted">Confirm which positions will be exited.</p>
          </div>
          {willExitPositions.length > 0 && (
            <>
              <div className="select-section-label">Will exit</div>
              <PositionList title="Aave V3" positions={willExitAave} />
              <PositionList title="Uniswap V3" positions={willExitUniswap} />
            </>
          )}
          {cannotExitPositions.length > 0 && (
            <>
              <div className="select-section-label">Cannot exit</div>
              <PositionList title="Aave V3" positions={cannotExitAave} />
              <PositionList title="Uniswap V3" positions={cannotExitUniswap} />
            </>
          )}
          <div className="confirm-actions" style={{ marginTop: 32 }}>
            <button
              className="btn-primary"
              disabled={willExitPositions.length === 0 || !canPerformExit}
              onClick={() => {
                setAutoSubmitOnScreen3(false);
                setScreenState("screen3");
              }}
            >
              Confirm Exit ({willExitPositions.length})
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                if (entryPoint === "panic") resetToScreen1();
                else setScreenState("screen2");
              }}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* ── Screen 3 ── */}
      {screen === "screen3" && (
        <div className="confirm-surface">
          <div className="confirm-header">
            <h2>Confirm Exit</h2>
            <p className="muted">
              {willExitPositions.length} position
              {willExitPositions.length !== 1 ? "s" : ""} will be exited atomically.
            </p>
          </div>
          <div className="confirm-list">
            {willExitPositions.map((p) => (
              <div key={p.id} className="confirm-row">
                <div className="confirm-row-left">
                  <span className="confirm-protocol">
                    {isAavePosition(p) ? "Aave" : "Uniswap"}
                  </span>
                  <span className="confirm-asset">
                    {isAavePosition(p) ? p.asset.symbol : `${p.symbol0}/${p.symbol1}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="confirm-actions">
            <button
              className="btn-primary"
              disabled={isSubmitting || !canPerformExit}
              onClick={() => void submitExit()}
            >
              {isSubmitting ? submitProgress ?? "Preparing..." : "Confirm Exit"}
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                setAutoSubmitOnScreen3(false);
                setScreenState("screen15");
              }}
              disabled={isSubmitting}
            >
              Back
            </button>
          </div>
          <button className="recheck-link" onClick={() => approvals.recheckApprovals()}>
            Re-check approvals
          </button>
        </div>
      )}

      {/* ── Executing ── */}
      {screen === "executing" && (
        <div className="executing-surface">
          <div className="spinner" />
          <h2>Executing</h2>
          <p className="muted">Waiting for on-chain confirmation…</p>
          {txSummary?.hash && (
            <a
              className="tx-link"
              href={`${appConfig.baseScanTx}${txSummary.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction ↗
            </a>
          )}
        </div>
      )}

      {/* ── Screen 4 ── */}
      {screen === "screen4" && txSummary && (
        <div className="summary-surface">
          <h2>Exit Complete</h2>
          <div className="summary-row">
            <span>Positions exited</span>
            <strong>
              {txSummary.selectedAaveAssets.length + txSummary.selectedUniswapTokenIds.length}
            </strong>
          </div>
          <div className="summary-row">
            <span>Aave assets</span>
            <strong>{txSummary.selectedAaveAssets.length}</strong>
          </div>
          <div className="summary-row">
            <span>Uniswap positions</span>
            <strong>{txSummary.selectedUniswapTokenIds.length}</strong>
          </div>
          <div className="summary-row">
            <span>Gas (estimated)</span>
            <strong>{txSummary.gasEstimate.toString()}</strong>
          </div>
          {receiptInfo && (
            <div className="summary-row">
              <span>Block</span>
              <strong>#{receiptInfo.blockNumber.toString()}</strong>
            </div>
          )}
          <a
            className="tx-link"
            href={`${appConfig.baseScanTx}${txSummary.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View on Basescan ↗
          </a>
          <div style={{ marginTop: 32 }}>
            <button className="btn-secondary" onClick={resetToScreen1}>Done</button>
          </div>
        </div>
      )}
      </main>
    </div>
  );
}

export default CoreApp;
