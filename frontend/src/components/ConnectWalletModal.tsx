import { useEffect } from "react";
import { X, WalletCards } from "lucide-react";

interface ConnectWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectMetamask: () => void;
}

export function ConnectWalletModal({
  isOpen,
  onClose,
  onConnectMetamask,
}: ConnectWalletModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      window.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Modal Box */}
      <div 
        className="relative bg-[#111111] border border-white/10 rounded-[20px] w-full max-w-[380px] p-6 shadow-2xl flex flex-col gap-6"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="w-8 h-8 rounded-full bg-white/5 text-white/40 flex items-center justify-center cursor-help" title="Help">
            <span className="text-sm font-semibold">?</span>
          </div>
          <h2 className="text-white text-[17px] font-semibold tracking-tight m-0" style={{ textTransform: "none" }}>Connect Wallet</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-4 mt-2">
          {/* Wallet List */}
          <div className="flex flex-col gap-2.5">
            <button
              onClick={onConnectMetamask}
              className="w-full flex items-center justify-between bg-[#1a1a1a] hover:bg-[#252525] border border-transparent hover:border-white/5 rounded-2xl p-4 transition-all group"
            >
              <span className="text-[#eeeeee] font-medium text-[15px] group-hover:text-white transition-colors">MetaMask</span>
              <img 
                src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" 
                alt="MetaMask" 
                className="w-[26px] h-[26px] object-contain"
              />
            </button>

            {/* Coming Soon */}
            <button
              disabled
              className="w-full flex items-center justify-between bg-[#1a1a1a]/40 border border-transparent rounded-2xl p-4 opacity-50 cursor-not-allowed"
            >
              <div className="flex items-center gap-3">
                <div className="w-[26px] h-[26px] flex items-center justify-center bg-white/5 rounded-full">
                  <WalletCards size={14} className="text-white/40" />
                </div>
                <span className="text-[#aaaaaa] font-medium text-[15px]">Other Wallets</span>
              </div>
              <span className="text-[10px] font-semibold tracking-widest uppercase text-white/30 bg-white/5 px-2 py-1 rounded-md">Coming Soon</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pt-2 mt-2">
          <p className="text-[#666666] text-[11px] leading-[1.6]">
            By connecting your wallet you agree to the<br />
            <a href="#" className="text-[#888888] hover:text-white transition-colors">Terms of Service</a> and <a href="#" className="text-[#888888] hover:text-white transition-colors">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
}
