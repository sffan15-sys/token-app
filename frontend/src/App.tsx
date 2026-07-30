import { Route, Routes } from "react-router-dom";
import { TopBar } from "./components/TopBar";
import { Home } from "./pages/Home";
import { PlatformDetail } from "./pages/PlatformDetail";
import { Alerts } from "./pages/Alerts";
import { Settings } from "./pages/Settings";

function App() {
  return (
    <div className="min-h-full">
      <TopBar />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/platform/:platformId" element={<PlatformDetail />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
