import { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/app-shell";
import { DashboardPage } from "./pages/dashboard-page";
import { NewJobPage } from "./pages/new-job-page";
import { JobAnalysisPage } from "./pages/job-analysis-page";
import { JobQueuePage } from "./pages/job-queue-page";
import { LibraryPage } from "./pages/library-page";

function App() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/new" element={<NewJobPage />} />
          <Route path="/jobs/:jobId/analysis" element={<JobAnalysisPage />} />
          <Route path="/jobs/:jobId/queue" element={<JobQueuePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
