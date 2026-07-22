import { useState } from "react";
import { AuthProvider, useAuth } from "./lib/auth";
import AuthScreen from "./screens/AuthScreen";
import Dashboard from "./screens/Dashboard";
import QuizSetup from "./screens/QuizSetup";
import QuizTake from "./screens/QuizTake";
import QuizResult from "./screens/QuizResult";
import Progress from "./screens/Progress";
import ChapterDetail from "./screens/ChapterDetail";
import Mistakes from "./screens/Mistakes";
import Manage from "./screens/Manage";
import { Spinner } from "./components/ui";

function AppContent() {
  const { user, loading } = useAuth();
  const [screen, setScreen] = useState("dashboard");
  const [params, setParams] = useState<Record<string, string>>({});

  const navigate = (s: string, p?: Record<string, string>) => {
    setScreen(s);
    setParams(p || {});
    window.scrollTo(0, 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner size={32} />
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  switch (screen) {
    case "quiz-setup":
      return <QuizSetup onNavigate={navigate} initialMode={params.mode} initialParams={params} />;
    case "quiz-take":
      return <QuizTake onNavigate={navigate} params={params} />;
    case "quiz-result":
      return <QuizResult onNavigate={navigate} params={params} />;
    case "progress":
      return <Progress onNavigate={navigate} />;
    case "mistakes":
      return <Mistakes onNavigate={navigate} />;
    case "chapter-detail":
      return <ChapterDetail onNavigate={navigate} params={params} />;
    case "manage":
      return <Manage onNavigate={navigate} />;
    default:
      return <Dashboard onNavigate={navigate} />;
  }
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
