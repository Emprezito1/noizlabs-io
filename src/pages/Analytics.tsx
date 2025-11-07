import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { BarChart3, TrendingUp, Trophy, Users } from 'lucide-react';

interface CategoryStats {
  id: string;
  name: string;
  total_clips: number;
  total_votes: number;
}

interface VotingTrend {
  date: string;
  vote_count: number;
}

const Analytics = () => {
  const [totalBattles, setTotalBattles] = useState(0);
  const [totalVotes, setTotalVotes] = useState(0);
  const [totalClips, setTotalClips] = useState(0);
  const [activeCategories, setActiveCategories] = useState(0);
  const [popularCategories, setPopularCategories] = useState<CategoryStats[]>([]);
  const [votingTrends, setVotingTrends] = useState<VotingTrend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      // Fetch total votes
      const { count: votesCount } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true });

      setTotalVotes(votesCount || 0);

      // Fetch total clips
      const { count: clipsCount } = await supabase
        .from('audio_clips')
        .select('*', { count: 'exact', head: true });

      setTotalClips(clipsCount || 0);

      // Fetch active categories
      const { count: categoriesCount } = await supabase
        .from('categories')
        .select('*', { count: 'exact', head: true })
        .gt('expires_at', new Date().toISOString());

      setActiveCategories(categoriesCount || 0);

      // Calculate total battles (each pair of clips in a category creates battles)
      const { data: categoriesData } = await supabase
        .from('categories')
        .select('id');

      if (categoriesData) {
        let battleCount = 0;
        for (const category of categoriesData) {
          const { count } = await supabase
            .from('audio_clips')
            .select('*', { count: 'exact', head: true })
            .eq('category_id', category.id);

          if (count && count > 1) {
            // Calculate combinations: n * (n-1) / 2
            battleCount += (count * (count - 1)) / 2;
          }
        }
        setTotalBattles(battleCount);
      }

      // Fetch popular categories with vote counts
      const { data: clipsData } = await supabase
        .from('audio_clips')
        .select('category_id, categories(name)');

      const { data: votesData } = await supabase
        .from('votes')
        .select('clip_id, audio_clips(category_id)');

      // Group clips by category
      const categoryClipsMap = new Map<string, { name: string; clips: number }>();
      clipsData?.forEach((clip: any) => {
        const catId = clip.category_id;
        const catName = clip.categories?.name;
        if (catId && catName) {
          const existing = categoryClipsMap.get(catId) || { name: catName, clips: 0 };
          categoryClipsMap.set(catId, { ...existing, clips: existing.clips + 1 });
        }
      });

      // Group votes by category
      const categoryVotesMap = new Map<string, number>();
      votesData?.forEach((vote: any) => {
        const catId = vote.audio_clips?.category_id;
        if (catId) {
          categoryVotesMap.set(catId, (categoryVotesMap.get(catId) || 0) + 1);
        }
      });

      // Combine and sort
      const categoryStats: CategoryStats[] = Array.from(categoryClipsMap.entries())
        .map(([id, data]) => ({
          id,
          name: data.name,
          total_clips: data.clips,
          total_votes: categoryVotesMap.get(id) || 0,
        }))
        .sort((a, b) => b.total_votes - a.total_votes)
        .slice(0, 5);

      setPopularCategories(categoryStats);

      // Fetch voting trends (last 7 days)
      const { data: recentVotes } = await supabase
        .from('votes')
        .select('created_at')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: true });

      // Group by date
      const trendMap = new Map<string, number>();
      recentVotes?.forEach((vote) => {
        const date = new Date(vote.created_at).toLocaleDateString();
        trendMap.set(date, (trendMap.get(date) || 0) + 1);
      });

      const trends = Array.from(trendMap.entries())
        .map(([date, vote_count]) => ({ date, vote_count }))
        .slice(-7);

      setVotingTrends(trends);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-24 pb-24 md:pb-12">
        <div className="container mx-auto px-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/4 mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-24 md:pb-12">
      <div className="container mx-auto px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-gradient mb-4">
              Analytics Dashboard
            </h1>
            <p className="text-muted-foreground text-lg">
              Track battle statistics, popular categories, and voting trends
            </p>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card className="glass-strong border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Total Battles
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">{totalBattles.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">All possible matchups</p>
              </CardContent>
            </Card>

            <Card className="glass-strong border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Total Votes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">{totalVotes.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Community engagement</p>
              </CardContent>
            </Card>

            <Card className="glass-strong border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Trophy className="w-4 h-4" />
                  Audio Clips
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">{totalClips.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Total submissions</p>
              </CardContent>
            </Card>

            <Card className="glass-strong border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Active Categories
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">{activeCategories.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Currently running</p>
              </CardContent>
            </Card>
          </div>

          {/* Popular Categories */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <Card className="glass-strong border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="w-5 h-5" />
                  Most Popular Categories
                </CardTitle>
                <CardDescription>Categories with the most votes</CardDescription>
              </CardHeader>
              <CardContent>
                {popularCategories.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No data yet</p>
                ) : (
                  <div className="space-y-4">
                    {popularCategories.map((category, index) => (
                      <div key={category.id} className="flex items-center justify-between p-3 bg-background/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                            index === 0 ? 'bg-yellow-500/20 text-yellow-500' :
                            index === 1 ? 'bg-gray-400/20 text-gray-400' :
                            index === 2 ? 'bg-orange-500/20 text-orange-500' :
                            'bg-primary/20 text-primary'
                          }`}>
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-semibold">{category.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {category.total_clips} clips
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-primary">{category.total_votes}</div>
                          <div className="text-xs text-muted-foreground">votes</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Voting Trends */}
            <Card className="glass-strong border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Voting Trends
                </CardTitle>
                <CardDescription>Last 7 days of voting activity</CardDescription>
              </CardHeader>
              <CardContent>
                {votingTrends.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No voting data yet</p>
                ) : (
                  <div className="space-y-3">
                    {votingTrends.map((trend, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <div className="text-sm text-muted-foreground w-24 flex-shrink-0">
                          {trend.date}
                        </div>
                        <div className="flex-1">
                          <div className="h-8 bg-primary/20 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.max((trend.vote_count / Math.max(...votingTrends.map(t => t.vote_count))) * 100, 5)}%`
                              }}
                            />
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-primary w-12 text-right">
                          {trend.vote_count}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
