import { shortAddress } from "../lib/format";

interface WalletPanelProps {
  connected: boolean;
  address?: string;
  chainId?: number;
  requiredChainId: number;
  isEoa: boolean | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onSwitchNetwork: () => void;
  connectLoading?: boolean;
  disconnectLoading?: boolean;
}

export function WalletPanel(props: WalletPanelProps) {
  const {
    connected,
    address,
    chainId,
    requiredChainId,
    isEoa,
    onConnect,
    onDisconnect,
    onSwitchNetwork,
    connectLoading,
    disconnectLoading,
  } = props;

  const wrongChain = connected && chainId !== requiredChainId;
  const eoaBlocked = connected && isEoa === false;

  return (
    <>
      <header className="w-full flex justify-between items-center h-24 px-9 pt-4">
        <span className="text-[22px] font-semibold tracking-[0.18em] text-white leading-none">
          PANIK
        </span>

        <div className="flex items-center gap-2">
          {!connected ? (
            <button
              onClick={onConnect}
              disabled={connectLoading}
              className="flex items-center justify-center !bg-white !text-black font-semibold h-[44px] px-[24px] rounded-full hover:!bg-white/90 transition-colors disabled:opacity-40 text-[15px] leading-none tracking-tight"
            >
              {connectLoading ? "Connecting..." : "Connect wallet"}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 h-[44px] px-[18px] rounded-full border border-[#333] bg-[#111]">
                {!wrongChain ? (
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                )}
                <span className="text-[15px] font-medium text-gray-200 tracking-tight">
                  {!wrongChain ? "Base Sepolia" : "Wrong Network"}
                </span>
              </div>
              
              <div className="flex items-center h-[44px] px-[18px] rounded-full border border-[#333] bg-[#111]">
                <span className="text-[15px] font-medium text-gray-200 font-mono tracking-tight">
                  {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "—"}
                </span>
              </div>

              <button
                onClick={onDisconnect}
                className="flex items-center justify-center h-[44px] px-[20px] rounded-full font-semibold text-[15px] tracking-tight bg-transparent text-gray-400 hover:text-white hover:bg-[#222] border border-transparent hover:border-[#333] transition-colors"
               >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </header>

      {wrongChain && (
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-yellow-500/20 bg-yellow-500/[0.06] text-[13px] text-yellow-400/80">
          Wrong network — switch to Base Sepolia to continue.
          <button
            onClick={onSwitchNetwork}
            className="h-[26px] px-2.5 rounded-md border border-current text-[12px] opacity-90 hover:opacity-100"
          >
            Switch network
          </button>
        </div>
      )}

      {eoaBlocked && (
        <div className="px-6 py-2.5 border-b border-red-500/20 bg-red-500/[0.06] text-[13px] text-red-400/80">
          Contract wallets are not supported. Please connect an EOA.
        </div>
      )}
    </>
  );
}
