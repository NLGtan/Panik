import { shortAddress } from "../lib/format";
import { Link } from "react-router-dom";
import LogoIcon from "../assets/icon/logo.png";

interface WalletPanelProps {
  connected: boolean;
  address?: string;
  chainId?: number;
  requiredChainId: number;
  isEoa: boolean | null;
  logoHref?: string;
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
    logoHref,
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
      <header className="wallet-sticky-header w-full flex justify-between items-center h-24 px-9 pt-4">
        {logoHref ? (
          <Link
            to={logoHref}
            className="flex items-center transition-opacity hover:opacity-90"
          >
            <img src={LogoIcon} alt="Panik" className="h-[28px] w-auto object-contain" />
          </Link>
        ) : (
          <div className="flex items-center">
            <img src={LogoIcon} alt="Panik" className="h-[28px] w-auto object-contain" />
          </div>
        )}

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
              {wrongChain && (
                <div className="flex items-center gap-2 h-[44px] px-[18px] rounded-full border border-[#333] bg-[#111]">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="font-medium text-[15px] leading-none mt-0.5 text-gray-200">
                    Wrong Network
                  </span>
                </div>
              )}
              
              <div className="flex items-center h-[44px] px-[18px] rounded-full border border-[#333] bg-[#111]">
                <span className="text-[15px] font-medium text-gray-200 font-mono tracking-tight">
                  {address ? shortAddress(address) : "—"}
                </span>
              </div>

              <button
                onClick={onDisconnect}
                disabled={disconnectLoading}
                className="flex items-center justify-center h-[44px] px-[20px] rounded-full font-semibold text-[15px] tracking-tight bg-transparent text-gray-400 hover:text-white hover:bg-[#222] border border-transparent hover:border-[#333] transition-colors"
               >
                {disconnectLoading ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          )}
        </div>
      </header>

      {wrongChain && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center justify-between mt-4 mx-9">
          <p className="text-red-400 text-xs font-medium uppercase tracking-wider">
            Wrong network — switch to Base Sepolia to continue.
          </p>
          <button
            onClick={onSwitchNetwork}
            className="h-[26px] px-2.5 rounded-md border border-current text-[12px] text-red-400 opacity-90 hover:opacity-100"
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
