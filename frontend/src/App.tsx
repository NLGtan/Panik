import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import CoreApp from "./CoreApp";
import { LandingPage } from "./pages/LandingPage";

function LandingRoute() {
  const navigate = useNavigate();

  return <LandingPage onUsePanik={() => navigate("/app")} />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingRoute />} />
      <Route path="/app" element={<CoreApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
