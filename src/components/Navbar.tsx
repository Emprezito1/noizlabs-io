import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wallet, Sparkles, Home, Trophy, Rocket, ShoppingBag, ArrowLeftRight, Coins, ListChecks, Radio, User, BarChart3 } from 'lucide-react';
import { useArena } from '@/contexts/ArenaContext';
import { useSolanaWallet } from '@/hooks/useSolanaWallet';
import { useIsMobile } from '@/hooks/use-mobile';

export const Navbar = () => {
  const { userPoints, fetchUserPoints, profiles } = useArena();
  const { walletAddress, isConnected, disconnect } = useSolanaWallet();
  const { setVisible } = useWalletModal();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (walletAddress) {
      fetchUserPoints(walletAddress);
    }
  }, [walletAddress]);

  const handleWalletClick = () => {
    if (isConnected) {
      disconnect();
    } else {
      setVisible(true);
    }
  };

  const handlePointsClick = () => {
    if (walletAddress) {
      const userProfile = profiles.find(p => p.wallet_address === walletAddress);
      if (userProfile) {
        navigate(`/profile/${userProfile.username}`);
      }
    }
  };

  const navLinks = [
    { to: '/arena', label: 'Arena', icon: Trophy },
    { to: '/launchpad', label: 'Launchpad', icon: Rocket },
    { to: '/marketplace', label: 'Market', icon: ShoppingBag },
    { to: '/swap', label: 'Swap', icon: ArrowLeftRight },
    { to: '/staking', label: 'Staking', icon: Coins },
  ];

  const desktopNavLinks = [
    { to: '/', label: 'Home', icon: Home },
    { to: '/arena', label: 'Arena', icon: Trophy },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/launchpad', label: 'Launchpad', icon: Rocket },
    { to: '/marketplace', label: 'Market', icon: ShoppingBag },
    { to: '/swap', label: 'Swap', icon: ArrowLeftRight },
    { to: '/staking', label: 'Staking', icon: Coins },
  ];

  if (isMobile) {
    return (
      <>
        {/* Top bar for mobile */}
        <nav className="fixed top-0 left-0 right-0 z-50 glass-strong border-b border-border">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between h-14">
              {/* Logo */}
              <Link to="/" className="flex items-center gap-2">
                <Radio className="w-6 h-6 text-primary" />
              </Link>

              {/* Wallet Address (center) */}
              <Button variant="ghost" size="sm" onClick={handleWalletClick} className="text-xs px-2 touch-manipulation active:scale-95">
                <Wallet className="w-3 h-3 mr-1" />
                {isConnected 
                  ? `${walletAddress?.slice(0, 4)}...${walletAddress?.slice(-4)}` 
                  : 'Connect'}
              </Button>

              {/* Points (right) */}
              {isConnected && (
                <Badge 
                  variant="outline" 
                  className="border-primary text-primary px-2 py-1 cursor-pointer hover:bg-primary/10 transition-colors text-xs flex items-center gap-1 touch-manipulation active:scale-95"
                  onClick={handlePointsClick}
                >
                  <Sparkles className="w-3 h-3" />
                  {userPoints}
                  <User className="w-3 h-3" />
                </Badge>
              )}
            </div>
          </div>
        </nav>

        {/* Bottom navigation for mobile */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-border pb-safe">
          <div className="grid grid-cols-5 gap-1 px-2 py-2">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex flex-col items-center justify-center py-2 px-1 rounded-lg hover:bg-primary/10 transition-colors"
              >
                <Icon className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            ))}
          </div>
        </nav>
      </>
    );
  }

  // Desktop navbar (original design)
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-strong border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <Radio className="w-10 h-10 text-primary" />
            <span className="text-2xl font-bold text-gradient">NoizLabs</span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {desktopNavLinks.map(({ to, label }) => (
              <Link key={to} to={to} className="text-sm font-medium hover:text-primary transition-colors">
                {label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {isConnected && (
              <Badge 
                variant="outline" 
                className="border-primary text-primary px-3 py-1.5 cursor-pointer hover:bg-primary/10 transition-colors flex items-center gap-2 touch-manipulation active:scale-95"
                onClick={handlePointsClick}
              >
                <Sparkles className="w-3 h-3" />
                {userPoints} Points
                <User className="w-4 h-4" />
              </Badge>
            )}
            <Button variant="neon" size="sm" onClick={handleWalletClick} className="touch-manipulation active:scale-95">
              <Wallet className="w-4 h-4 mr-2" />
              {isConnected 
                ? `${walletAddress?.slice(0, 4)}...${walletAddress?.slice(-4)}` 
                : 'Connect Wallet'}
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};