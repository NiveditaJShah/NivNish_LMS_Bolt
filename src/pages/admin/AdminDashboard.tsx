import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, ClipboardList, BarChart3, FileText, TrendingUp, Clock, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { PageHeader, Card, Badge, LoadingSpinner } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

interface Stats {
  studentCount: number;
  assessmentCount: number;
  publishedCount: number;
  submissionCount: number;
  pendingGradingCount: number;
  avgScore: number;
}

interface RecentSubmission {
  id: string;
  student_name: string;
  assessment_title: string;
  score: number;
  total_points: number;
  status: string;
  submitted_at: string;
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [
        { count: studentCount },
        { count: assessmentCount },
        { count: publishedCount },
        { count: submissionCount },
        { count: pendingGradingCount },
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
        supabase.from('assessments').select('*', { count: 'exact', head: true }),
        supabase.from('assessments').select('*', { count: 'exact', head: true }).eq('is_published', true),
        supabase.from('submissions').select('*', { count: 'exact', head: true }).neq('status', 'in_progress'),
        supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
      ]);

      // Recent submissions
      const { data: recentSubs } = await supabase
        .from('submissions')
        .select('id, score, total_points, status, submitted_at, student_id, assessment_id')
        .neq('status', 'in_progress')
        .order('submitted_at', { ascending: false })
        .limit(5);

      let recentData: RecentSubmission[] = [];
      if (recentSubs && recentSubs.length > 0) {
        const studentIds = [...new Set(recentSubs.map((s) => s.student_id))];
        const assessmentIds = [...new Set(recentSubs.map((s) => s.assessment_id))];

        const [studentsRes, assessmentsRes] = await Promise.all([
          supabase.from('profiles').select('id, full_name, email').in('id', studentIds),
          supabase.from('assessments').select('id, title').in('id', assessmentIds),
        ]);

        const studentMap = new Map<string, string>();
        (studentsRes.data || []).forEach((s) => {
          studentMap.set(s.id, s.full_name || s.email);
        });
        const aMap = new Map<string, string>();
        (assessmentsRes.data || []).forEach((a) => aMap.set(a.id, a.title));

        recentData = recentSubs.map((s) => ({
          id: s.id,
          student_name: studentMap.get(s.student_id) || 'Unknown',
          assessment_title: aMap.get(s.assessment_id) || 'Unknown',
          score: s.score,
          total_points: s.total_points,
          status: s.status,
          submitted_at: s.submitted_at,
        }));
      }

      // Average score
      let avg = 0;
      if (submissionCount && submissionCount > 0) {
        const { data: scored } = await supabase
          .from('submissions')
          .select('score, total_points')
          .neq('status', 'in_progress');
        if (scored && scored.length > 0) {
          const validScores = scored.filter((s) => s.total_points > 0);
          if (validScores.length > 0) {
            avg = Math.round(
              (validScores.reduce((sum, s) => sum + (s.score / s.total_points) * 100, 0) / validScores.length)
            );
          }
        }
      }

      setStats({
        studentCount: studentCount || 0,
        assessmentCount: assessmentCount || 0,
        publishedCount: publishedCount || 0,
        submissionCount: submissionCount || 0,
        pendingGradingCount: pendingGradingCount || 0,
        avgScore: avg,
      });
      setRecent(recentData);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <LoadingSpinner />;

  const statCards = [
    { label: 'Students', value: stats?.studentCount || 0, icon: Users, color: 'bg-blue-50 text-blue-600', to: '/app/students' },
    { label: 'Assessments', value: stats?.assessmentCount || 0, icon: ClipboardList, color: 'bg-indigo-50 text-indigo-600', to: '/app/assessments' },
    { label: 'Published', value: stats?.publishedCount || 0, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600', to: '/app/assessments' },
    { label: 'Submissions', value: stats?.submissionCount || 0, icon: FileText, color: 'bg-amber-50 text-amber-600', to: '/app/results' },
    { label: 'Pending Grading', value: stats?.pendingGradingCount || 0, icon: Clock, color: 'bg-rose-50 text-rose-600', to: '/app/results' },
    { label: 'Avg Score', value: `${stats?.avgScore || 0}%`, icon: TrendingUp, color: 'bg-slate-100 text-slate-600', to: '/app/results' },
  ];

  return (
    <div>
      <PageHeader title={`Admin Dashboard`} subtitle={`Welcome back, ${profile?.full_name || 'Admin'}`} />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {statCards.map((card) => (
          <button
            key={card.label}
            onClick={() => navigate(card.to)}
            className="text-left"
          >
            <Card className="p-4 hover:shadow-md transition-shadow">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${card.color}`}>
                <card.icon className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{card.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{card.label}</p>
            </Card>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Recent Submissions</h2>
            <button onClick={() => navigate('/app/results')} className="text-sm text-indigo-600 hover:text-indigo-700">
              View all
            </button>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No submissions yet</p>
          ) : (
            <div className="space-y-3">
              {recent.map((s) => {
                const pct = s.total_points > 0 ? Math.round((s.score / s.total_points) * 100) : 0;
                return (
                  <div key={s.id} className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{s.student_name}</p>
                      <p className="text-xs text-slate-400 truncate">{s.assessment_title}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {s.status === 'graded' ? <Badge color="emerald">Graded</Badge> : <Badge color="amber">Pending</Badge>}
                      <span className={`text-sm font-semibold ${pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/app/assessments')}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
                <ClipboardList className="w-4.5 h-4.5 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Create Assessment</p>
                <p className="text-xs text-slate-400">Build a new quiz or assignment</p>
              </div>
            </button>
            <button
              onClick={() => navigate('/app/students')}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="w-4.5 h-4.5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Manage Students</p>
                <p className="text-xs text-slate-400">Add, deactivate, or view students</p>
              </div>
            </button>
            <button
              onClick={() => navigate('/app/results')}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                <BarChart3 className="w-4.5 h-4.5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Review Results</p>
                <p className="text-xs text-slate-400">Grade submissions and override scores</p>
              </div>
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
