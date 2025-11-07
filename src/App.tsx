import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { ArenaProvider } from "./contexts/ArenaContext";
import { SolanaWalletProvider } from "./contexts/SolanaWalletProvider";
import { useSolanaWallet } from "./hooks/useSolanaWallet";
import { supabase } from "@/integrations/supabase/client";
import GenreSelectionDialog from "./components/GenreSelectionDialog";
import Landing from "./pages/Landing";
import Arena from "./pages/Arena";
import CreateCategory from "./pages/CreateCategory";
import Launchpad from "./pages/Launchpad";
import Admin from "./pages/Admin";
import Marketplace from "./pages/Marketplace";
import Swap from "./pages/Swap";
import Staking from "./pages/Staking";
import Profile from "./pages/Profile";
import Tasks from "./pages/Tasks";
import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppContent = () => {
  const { walletAddress, isConnected } = useSolanaWallet();
  const [showGenreDialog, setShowGenreDialog] = useState(false);

  useEffect(() => {
    const checkPersonalization = async () => {
      if (!isConnected || !walletAddress) {
        setShowGenreDialog(false);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('personalization')
        .eq('wallet_address', walletAddress)
        .maybeSingle();

      setShowGenreDialog(!data?.personalization);
    };

    checkPersonalization();
  }, [walletAddress, isConnected]);

  return (
    <>
      <Navbar />
      <GenreSelectionDialog 
        walletAddress={walletAddress}
        open={showGenreDialog}
        onComplete={() => setShowGenreDialog(false)}
      />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/arena" element={<Arena />} />
        <Route path="/create-category" element={<CreateCategory />} />
        <Route path="/launchpad" element={<Launchpad />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/swap" element={<Swap />} />
        <Route path="/staking" element={<Staking />} />
        <Route path="/profile/:username" element={<Profile />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/analytics" element={<Analytics />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <SolanaWalletProvider>
      <ArenaProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </TooltipProvider>
      </ArenaProvider>
    </SolanaWalletProvider>
  </QueryClientProvider>
);

export default App;
