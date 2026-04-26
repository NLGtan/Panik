import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useCallback, useState } from "react";
import CoreApp from "./CoreApp";
import { LandingPage } from "./pages/LandingPage";
import { ConnectWalletModal } from "./components/ConnectWalletModal";

function LandingRoute() {
  const navigate = useNavigate();
  const { isConnected, address } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnectAsync } = useDisconnect();

  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  const handleConnectWallet = useCallback(() => {
    if (isConnected) {
      // Already connected — go to dashboard
      navigate("/app");
      return;
    }
    setIsWalletModalOpen(true);
  }, [isConnected, navigate]);

  const executeMetamaskConnect = useCallback(() => {
    if (connectors.length === 0) return;

    // Mobile without injected provider → deep link to MetaMask app
    const hasInjected = typeof window !== "undefined" && "ethereum" in window;
    if (!hasInjected && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)) {
      const dappUrl = window.location.href.replace(/^https?:\/\//, "");
      window.location.href = `https://metamask.app.link/dapp/${dappUrl}`;
      return;
    }

    // Find the specific MetaMask connector (EIP-6963 or default injected)
    const metamaskConnector = connectors.find(
      (c) => c.id === "metaMask" || c.name.toLowerCase().includes("metamask")
    ) || connectors[0]; // fallback if not found by name

    // Desktop or MetaMask in-app browser → trigger wallet popup
    connect({ connector: metamaskConnector });
    setIsWalletModalOpen(false);
  }, [connect, connectors]);

  const handleDisconnect = useCallback(() => {
    void disconnectAsync();
  }, [disconnectAsync]);

  const handleLaunchApp = useCallback(() => {
    navigate("/app");
  }, [navigate]);

  return (
    <>
      <LandingPage
        onUsePanik={handleConnectWallet}
        isConnecting={isPending}
        isConnected={isConnected}
        address={address}
        onDisconnect={handleDisconnect}
        onLaunchApp={handleLaunchApp}
      />
      <ConnectWalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
        onConnectMetamask={executeMetamaskConnect}
      />
    </>
  );
}

/** Protects /app — redirects to landing if not connected */
function ProtectedAppRoute() {
  const { isConnected } = useAccount();

  if (!isConnected) {
    return <Navigate to="/" replace />;
  }

  return <CoreApp />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingRoute />} />
      <Route path="/app" element={<ProtectedAppRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
