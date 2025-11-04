import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, Play, Trophy, Users, Sparkles, FolderPlus, Zap, Share2, Clock, Music, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate, Link } from 'react-router-dom';
import { useArena } from '@/contexts/ArenaContext';
import { useSolanaWallet } from '@/hooks/useSolanaWallet';
import { supabase } from '@/integrations/supabase/client';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { AudioPlayer } from '@/components/AudioPlayer';
import { RemixDialog } from '@/components/RemixDialog';
import { Leaderboard } from '@/components/Leaderboard';

interface Battle {
  id: string;
  category: string;
  categoryId: string;
  contestants: [any, any]; // 1v1 battle - exactly 2 clips
}

const Arena = () => {
  const navigate = useNavigate();
  const { audioClips, categories, refreshData, getOrCreateProfile } = useArena();
  const { walletAddress, isConnected } = useSolanaWallet();
  const { setVisible } = useWalletModal();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [audioTitle, setAudioTitle] = useState('');
  const [selectedUploadCategory, setSelectedUploadCategory] = useState('');
  const [battles, setBattles] = useState<Battle[]>([]);
  const [votedBattles, setVotedBattles] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [, setTick] = useState(0);
  const [remixDialogOpen, setRemixDialogOpen] = useState(false);
  const [selectedRemixClip, setSelectedRemixClip] = useState<{ url: string; title: string } | null>(null);
  const [categorySearch, setCategorySearch] = useState('');
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [preferredGenres, setPreferredGenres] = useState<string[]>([]);

  // Fetch user's preferred genres
  useEffect(() => {
    const fetchPreferredGenres = async () => {
      if (!walletAddress) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('preferred_genres')
        .eq('wallet_address', walletAddress)
        .maybeSingle();
      
      if (data?.preferred_genres && data.preferred_genres.length > 0) {
        setPreferredGenres(data.preferred_genres);
      }
    };

    fetchPreferredGenres();
  }, [walletAddress]);

  // Update countdown every second
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Generate battles only when clips change
  useEffect(() => {
    generateBattles();
  }, [audioClips.length, selectedCategory]);

  const generateBattles = () => {
    const newBattles: Battle[] = [];
    
    categories.forEach(category => {
      const categoryClips = audioClips.filter(clip => clip.category === category.name);
      if (categoryClips.length >= 2) {
        // Create 1v1 battles - pair clips together
        for (let i = 0; i < categoryClips.length - 1; i += 2) {
          newBattles.push({
            id: `${category.name}-${i}`,
            category: category.name,
            categoryId: category.id,
            contestants: [categoryClips[i], categoryClips[i + 1]]
          });
        }
      }
    });
    
    setBattles(newBattles);
  };

  const requireWallet = () => {
    if (!isConnected || !walletAddress) {
      toast.error('Please connect your wallet first');
      setVisible(true);
      return false;
    }
    return true;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!requireWallet()) return;
    
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      setSelectedFile(file);
      toast.success('Audio file selected!');
    } else {
      toast.error('Please select a valid audio file');
    }
  };

  const handleUpload = async () => {
    if (!requireWallet()) return;
    if (!selectedFile) {
      toast.error('Please select an audio file');
      return;
    }
    if (!audioTitle) {
      toast.error('Please enter a title');
      return;
    }
    if (!selectedUploadCategory) {
      toast.error('Please select a category');
      return;
    }

    // Ensure user has a profile
    await getOrCreateProfile(walletAddress!);

    // Check if user already uploaded to this category
    const userClipInCategory = audioClips.find(
      clip => clip.categoryId === selectedUploadCategory && clip.creator === walletAddress
    );
    
    if (userClipInCategory) {
      toast.error('You can only upload 1 clip per category');
      return;
    }

    // Check if user is the creator of this category
    const category = categories.find(cat => cat.id === selectedUploadCategory);
    if (category && category.creatorWallet === walletAddress) {
      toast.error("You can't upload to a category you created");
      return;
    }

    // Remove 10 clip limit - now unlimited

    try {
      // Upload audio file to storage
      const fileName = `${Date.now()}-${selectedFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('audio-clips')
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('audio-clips')
        .getPublicUrl(fileName);

      // Insert audio clip with URL
      const { error } = await supabase
        .from('audio_clips')
        .insert({
          title: audioTitle,
          creator_wallet: walletAddress!,
          category_id: selectedUploadCategory,
          audio_url: publicUrl,
        });

      if (error) throw error;

      // Award points
      await supabase.rpc('add_user_points', { wallet: walletAddress!, points_to_add: 10 });

      // Update daily quest progress
      await updateDailyQuest('clips_uploaded');

      toast.success('Audio uploaded! You earned 10 points! 🎉');
      setSelectedFile(null);
      setAudioTitle('');
      setSelectedUploadCategory('');
      refreshData();
    } catch (error: any) {
      console.error('Error uploading:', error);
      toast.error('Failed to upload audio clip');
    }
  };

  const handleVote = async (battleId: string, clipId: string) => {
    if (!requireWallet()) return;

    // Ensure user has a profile
    await getOrCreateProfile(walletAddress!);

    try {
      // Check if user already voted in this battle
      const { data: existingVote } = await supabase
        .from('votes')
        .select('*')
        .eq('voter_wallet', walletAddress)
        .eq('battle_id', battleId)
        .maybeSingle();

      if (existingVote) {
        toast.error('You already voted in this battle!');
        return;
      }

      // Insert vote
      const { error } = await supabase
        .from('votes')
        .insert({
          voter_wallet: walletAddress!,
          clip_id: clipId,
          battle_id: battleId,
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('You already voted in this battle');
        } else {
          throw error;
        }
        return;
      }

      // Award points
      await supabase.rpc('add_user_points', { wallet: walletAddress!, points_to_add: 5 });

      // Update daily quest progress
      await updateDailyQuest('votes_cast');

      setVotedBattles(prev => new Set(prev).add(battleId));
      toast.success('Vote recorded! You earned 5 points!');
      refreshData();
    } catch (error: any) {
      console.error('Error voting:', error);
      toast.error('Failed to record vote');
    }
  };

  const updateDailyQuest = async (questType: 'categories_created' | 'clips_uploaded' | 'votes_cast') => {
    if (!walletAddress) return;

    try {
      // Get user's timezone
      const { data: profileData } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('wallet_address', walletAddress)
        .maybeSingle();
      
      const timezone = profileData?.timezone || 'UTC';
      
      // Get today's date in user's timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      
      const parts = formatter.formatToParts(new Date());
      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      const today = `${year}-${month}-${day}`;
      
      // Get or create today's quest
      const { data: existingQuest } = await supabase
        .from('daily_quests')
        .select('*')
        .eq('user_wallet', walletAddress)
        .eq('quest_date', today)
        .single();

      let newValue = 1;
      let questCompleted = false;
      let questGoal = 0;

      if (existingQuest) {
        newValue = existingQuest[questType] + 1;
      }

      // Determine quest goal and check completion
      if (questType === 'categories_created') {
        questGoal = 1;
        questCompleted = !existingQuest && newValue >= questGoal;
      } else if (questType === 'clips_uploaded') {
        questGoal = 5;
        questCompleted = existingQuest && existingQuest[questType] < questGoal && newValue >= questGoal;
      } else if (questType === 'votes_cast') {
        questGoal = 20;
        questCompleted = existingQuest && existingQuest[questType] < questGoal && newValue >= questGoal;
      }

      // Upsert quest progress
      await supabase
        .from('daily_quests')
        .upsert({
          user_wallet: walletAddress,
          quest_date: today,
          [questType]: newValue,
        }, {
          onConflict: 'user_wallet,quest_date'
        });

      // Award 10 points if quest just completed
      if (questCompleted) {
        await supabase.rpc('add_user_points', {
          wallet: walletAddress,
          points_to_add: 10,
        });
        toast.success('Daily quest completed! +10 bonus points! 🎯');
      }
    } catch (error) {
      console.error('Error updating daily quest:', error);
    }
  };

  const handleShare = (clipId: string, clipTitle: string) => {
    const shareUrl = `${window.location.origin}/arena?clip=${clipId}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success(`Link copied for ${clipTitle}!`);
  };

  const handleRemix = (audioUrl: string, title: string) => {
    setSelectedRemixClip({ url: audioUrl, title });
    setRemixDialogOpen(true);
  };

  const filteredBattles = selectedCategory === 'all' 
    ? battles 
    : battles.filter(b => b.category === selectedCategory);

  const totalVotes = audioClips.reduce((sum, clip) => sum + clip.votes, 0);

  const categoriesWithCount = categories
    .filter(cat => {
      // Filter by preferred genres if user has set preferences
      if (preferredGenres.length > 0 && cat.genre) {
        return preferredGenres.includes(cat.genre);
      }
      // Show all categories if no preferences set
      return true;
    })
    .map(cat => ({
      ...cat,
      entriesCount: audioClips.filter(clip => clip.categoryId === cat.id).length,
    }));

  const filteredCategories = categoriesWithCount.filter(cat =>
    cat.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const displayedCategories = categorySearch ? filteredCategories : categoriesWithCount.slice(0, 5);
  const hasMoreCategories = categoriesWithCount.length > 5;

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date().getTime();
    const expiry = new Date(expiresAt).getTime();
    const diff = expiry - now;
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  return (
    <div className="min-h-screen pt-24 pb-24 md:pb-12">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 text-gradient">Audio Arena</h1>
          <p className="text-xl text-muted-foreground">
            Battle for glory. Vote for winners. Earn rewards.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="glass-strong border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/20">
                  <Trophy className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{totalVotes}</div>
                  <div className="text-sm text-muted-foreground">Total Votes</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-strong border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-secondary/20">
                  <Users className="w-6 h-6 text-secondary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{categories.length}</div>
                  <div className="text-sm text-muted-foreground">Categories</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-strong border-border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-accent/20">
                  <Sparkles className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{audioClips.length}</div>
                  <div className="text-sm text-muted-foreground">Audio Clips</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-strong border-border">
            <CardContent className="pt-6">
              <Button 
                variant="glow" 
                className="w-full h-full touch-manipulation active:scale-95"
                onClick={() => {
                  if (requireWallet()) navigate('/create-category');
                }}
              >
                <FolderPlus className="w-4 h-4 mr-2" />
                Create Category
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Battle Arena and Leaderboard Tabs */}
        <Tabs defaultValue="arena" className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
            <TabsTrigger value="arena">Battle Arena</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          </TabsList>

          <TabsContent value="arena">
            {/* Category Filter */}
            <div className="mb-8 space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search categories..."
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Category Badges */}
              <div className="flex gap-3 overflow-x-auto pb-2">
                <Badge
                  variant={selectedCategory === 'all' ? 'default' : 'outline'}
                  className="cursor-pointer px-4 py-2"
                  onClick={() => setSelectedCategory('all')}
                >
                  All
                </Badge>
                {displayedCategories.map(cat => (
                  <Badge
                    key={cat.id}
                    variant={selectedCategory === cat.name ? 'default' : 'outline'}
                    className="cursor-pointer px-4 py-2 whitespace-nowrap flex items-center gap-2"
                    onClick={() => setSelectedCategory(cat.name)}
                  >
                    <span>{cat.name} ({cat.entriesCount})</span>
                    <span className="text-xs opacity-75 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {getTimeRemaining(cat.expiresAt)}
                    </span>
                  </Badge>
                ))}
                {hasMoreCategories && !categorySearch && (
                  <Dialog open={showAllCategories} onOpenChange={setShowAllCategories}>
                    <DialogTrigger asChild>
                      <Badge
                        variant="outline"
                        className="cursor-pointer px-4 py-2 whitespace-nowrap border-primary text-primary hover:bg-primary/10"
                      >
                        <Filter className="w-3 h-3 mr-1" />
                        More ({categoriesWithCount.length - 5})
                      </Badge>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>All Categories</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            placeholder="Search categories..."
                            value={categorySearch}
                            onChange={(e) => setCategorySearch(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {filteredCategories.map(cat => (
                            <Card
                              key={cat.id}
                              className={`cursor-pointer transition-all hover:border-primary ${
                                selectedCategory === cat.name ? 'border-primary bg-primary/5' : 'glass'
                              }`}
                              onClick={() => {
                                setSelectedCategory(cat.name);
                                setShowAllCategories(false);
                                setCategorySearch('');
                              }}
                            >
                              <CardContent className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                  <h4 className="font-semibold">{cat.name}</h4>
                                  <Badge variant="outline" className="text-xs">
                                    {cat.entriesCount} clips
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="w-3 h-3" />
                                  {getTimeRemaining(cat.expiresAt)}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>

        <div className="grid lg:grid-cols-4 gap-8">
          {/* Upload Section */}
          <div className="lg:col-span-1">
            <Card className="glass-strong border-border sticky top-24">
              <CardHeader>
                <CardTitle>Upload Audio</CardTitle>
                <CardDescription>Free to upload and compete</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer">
                  <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <Input
                    type="file"
                    accept="audio/*,.aac"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="audio-upload"
                  />
                  <label htmlFor="audio-upload" className="cursor-pointer">
                    <p className="font-medium mb-2">
                      {selectedFile ? selectedFile.name : 'Click to upload audio'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      MP3, WAV, AAC, or OGG (max 30s)
                    </p>
                  </label>
                </div>

                {selectedFile && (
                  <>
                    <Input 
                      placeholder="Audio Title" 
                      value={audioTitle}
                      onChange={(e) => setAudioTitle(e.target.value)}
                    />
                    <select 
                      className="w-full p-2 rounded-lg glass border border-border"
                      value={selectedUploadCategory}
                      onChange={(e) => setSelectedUploadCategory(e.target.value)}
                    >
                      <option value="">Select Category</option>
                      {categoriesWithCount.map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name} ({cat.entriesCount})
                        </option>
                      ))}
                    </select>
                    <Badge variant="outline" className="border-primary text-primary w-full justify-center py-2">
                      <Sparkles className="w-3 h-3 mr-1" />
                      Earn 10 Points
                    </Badge>
                    <Button variant="glow" className="w-full touch-manipulation active:scale-95" onClick={handleUpload}>
                      <Zap className="w-4 h-4 mr-2" />
                      Upload Free
                    </Button>
                  </>
                )}

                <div className="glass rounded-lg p-4 mt-6">
                  <h4 className="font-semibold mb-3">How It Works</h4>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>• Connect your Solana wallet</p>
                    <p>• Upload audio clips for free</p>
                    <p>• Earn 10 points per upload</p>
                    <p>• Unlimited entries per category</p>
                    <p>• Vote to earn 5 points</p>
                    <p>• Share clips to get votes</p>
                    <p>• Top clip wins 25 points after 7 days</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Battle Feed */}
          <div className="lg:col-span-3">
            <div className="space-y-6">
              {filteredBattles.length > 0 ? (
                filteredBattles.map((battle) => {
                  const hasVoted = votedBattles.has(battle.id);
                  const category = categories.find(c => c.id === battle.categoryId);
                  return (
                     <Card key={battle.id} className="glass-strong border-border">
                       <CardHeader className="pb-3">
                         <div className="flex items-center justify-between">
                           <CardTitle className="text-base">Battle Arena</CardTitle>
                           <div className="flex items-center gap-2">
                             <Badge variant="outline" className="border-accent text-accent flex items-center gap-1 text-xs px-2 py-0.5">
                               <Clock className="w-3 h-3" />
                               {category && getTimeRemaining(category.expiresAt)}
                             </Badge>
                             <Badge variant="outline" className="border-primary text-primary text-xs px-2 py-0.5">
                               {battle.category}
                             </Badge>
                           </div>
                         </div>
                       </CardHeader>
                       <CardContent>
                           {/* 1v1 Battle Layout */}
                            <div className="grid grid-cols-2 gap-4 md:gap-6">
                              {battle.contestants.map((meme) => (
                                <div key={meme.id} className="relative">
                                  <Card
                                   className="glass border-border/50 transition-all hover:border-primary/70 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:scale-[1.02] group h-full"
                                 >
                                   <CardContent className="p-3 md:p-4 space-y-2.5 md:space-y-3">
                                     {/* Header: Category Label and Play Button */}
                                     <div className="flex items-start justify-between">
                                       <Badge variant="outline" className="text-[9px] md:text-[10px] px-1.5 py-0.5 border-primary/50 text-primary">
                                         {battle.category}
                                       </Badge>
                                       <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center group-hover:shadow-[0_0_15px_rgba(168,85,247,0.6)] transition-all cursor-pointer">
                                         <Play className="w-3.5 h-3.5 md:w-4 md:h-4 text-white fill-white" />
                                       </div>
                                     </div>

                                     {/* Title and Username */}
                                     <div className="space-y-0.5">
                                       <h3 className="text-sm md:text-base font-bold line-clamp-1">{meme.title}</h3>
                                       {meme.creatorUsername ? (
                                         <p className="text-[11px] md:text-xs text-muted-foreground">
                                           @{meme.creatorUsername}
                                         </p>
                                       ) : (
                                         <p className="text-[11px] md:text-xs text-muted-foreground">
                                           {meme.creator.slice(0, 4)}...{meme.creator.slice(-4)}
                                         </p>
                                       )}
                                     </div>

                                     {/* Audio Player */}
                                     {meme.audioUrl ? (
                                       <div className="py-0.5">
                                         <AudioPlayer audioUrl={meme.audioUrl} />
                                       </div>
                                     ) : (
                                       <div className="h-0.5 bg-muted rounded-full w-full" />
                                     )}

                                      {/* Vote Button */}
                                      <Button
                                        variant={hasVoted ? "outline" : "default"}
                                        size="sm"
                                        className="w-full h-9 md:h-10 text-xs md:text-sm font-semibold bg-primary hover:bg-primary/90 touch-manipulation active:scale-95"
                                        disabled={hasVoted}
                                        onClick={() => handleVote(battle.id, meme.id)}
                                      >
                                        {hasVoted ? '✓ Voted' : 'Vote for This (+5 pts)'}
                                      </Button>

                                       {/* Action Buttons Row */}
                                       <div className="flex gap-1.5 items-center w-full">
                                         <Button
                                           variant="ghost"
                                           size="sm"
                                           className="flex-1 h-8 text-[11px] md:text-xs hover:bg-primary/10 touch-manipulation active:scale-95 min-w-0"
                                           onClick={() => handleShare(meme.id, meme.title)}
                                         >
                                           <Share2 className="w-3 h-3 md:w-3.5 md:h-3.5 mr-0.5 md:mr-1 flex-shrink-0" />
                                           <span className="truncate">Share</span>
                                         </Button>
                                         {meme.audioUrl && (
                                           <Button
                                             variant="ghost"
                                             size="sm"
                                             className="flex-1 h-8 text-[11px] md:text-xs hover:bg-primary/10 touch-manipulation active:scale-95 min-w-0"
                                             onClick={() => handleRemix(meme.audioUrl, meme.title)}
                                           >
                                             <Music className="w-3 h-3 md:w-3.5 md:h-3.5 mr-0.5 md:mr-1 flex-shrink-0" />
                                             <span className="truncate">Remix</span>
                                           </Button>
                                         )}
                                       </div>

                                     {/* Vote Count */}
                                     <div className="flex items-center justify-center text-[10px] md:text-xs text-muted-foreground pt-0.5">
                                       <Trophy className="w-3 h-3 mr-1" />
                                       <span className="font-semibold">{meme.votes} votes</span>
                                     </div>
                                  </CardContent>
                                </Card>
                              </div>
                            ))}
                          </div>
                       </CardContent>
                     </Card>
                   );
                 })
              ) : (
                <Card className="glass-strong border-border">
                   <CardContent className="py-12 text-center">
                     <p className="text-muted-foreground">
                       {selectedCategory === 'all' 
                         ? 'No battles yet. Upload some audio clips to get started!' 
                         : 'No battles in this category yet. Need at least 2 clips for a 1v1 battle.'}
                     </p>
                   </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
          </TabsContent>

          <TabsContent value="leaderboard">
            <div className="max-w-4xl mx-auto">
              <Leaderboard />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {selectedRemixClip && (
        <RemixDialog
          open={remixDialogOpen}
          onOpenChange={setRemixDialogOpen}
          audioUrl={selectedRemixClip.url}
          clipTitle={selectedRemixClip.title}
        />
      )}
    </div>
  );
};

export default Arena;
