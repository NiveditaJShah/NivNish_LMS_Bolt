import { useEffect, useState } from 'react';
import { Users, UserPlus, Search, Trash2, Ban, CheckCircle2, AlertCircle, Mail, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { PageHeader, Card, Badge, LoadingSpinner, EmptyState, Button, Modal } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { Profile } from '@/types';

export default function StudentManagement() {
  const { profile: adminProfile } = useAuth();
  const [students, setStudents] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Profile | null>(null);
  const [newStudent, setNewStudent] = useState({ fullName: '', email: '', password: '' });
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const loadStudents = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'student')
      .order('created_at', { ascending: false });
    setStudents((data || []) as Profile[]);
    setLoading(false);
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const toggleStatus = async (student: Profile) => {
    const newStatus = student.status === 'active' ? 'deactivated' : 'active';
    await supabase
      .from('profiles')
      .update({ status: newStatus })
      .eq('id', student.id);
    setStudents((prev) => prev.map((s) => s.id === student.id ? { ...s, status: newStatus } : s));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: newStudent.email,
      password: newStudent.password,
      options: { data: { full_name: newStudent.fullName } },
    });

    if (error) {
      setAddError(error.message);
      setAddLoading(false);
      return;
    }

    if (data.user) {
      await supabase
        .from('profiles')
        .update({ role: 'student' })
        .eq('id', data.user.id);
    }

    setShowAdd(false);
    setNewStudent({ fullName: '', email: '', password: '' });
    setAddLoading(false);
    await loadStudents();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    // Delete from auth.users via profile cascade (profile has ON DELETE CASCADE)
    // We can't directly delete from auth.users via client, so we deactivate instead
    // and delete the profile which cascades
    await supabase.from('profiles').delete().eq('id', confirmDelete.id);
    setStudents((prev) => prev.filter((s) => s.id !== confirmDelete.id));
    setConfirmDelete(null);
  };

  const filtered = students.filter((s) =>
    s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="Student Management" subtitle="Manage student accounts and access">
        <Button onClick={() => setShowAdd(true)}>
          <UserPlus className="w-4 h-4" /> Add Student
        </Button>
      </PageHeader>

      <Card className="mb-4 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition text-slate-900 placeholder-slate-400"
          />
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={Users} title="No students found" subtitle="Add students or adjust your search." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden sm:table-cell">Email</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden md:table-cell">Joined</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <span className="text-sm font-semibold text-slate-600">
                            {s.full_name?.[0]?.toUpperCase() || s.email?.[0]?.toUpperCase() || '?'}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{s.full_name || 'Unnamed'}</p>
                          <p className="text-xs text-slate-400 sm:hidden">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden sm:table-cell">
                      <span className="text-sm text-slate-600">{s.email}</span>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <span className="text-sm text-slate-500">{formatDate(s.created_at)}</span>
                    </td>
                    <td className="px-6 py-4">
                      {s.status === 'active' ? (
                        <Badge color="emerald">Active</Badge>
                      ) : (
                        <Badge color="rose">Deactivated</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {s.id !== adminProfile?.id && (
                          <>
                            <button
                              onClick={() => toggleStatus(s)}
                              className={`p-2 rounded-lg transition ${
                                s.status === 'active'
                                  ? 'text-slate-400 hover:bg-amber-50 hover:text-amber-600'
                                  : 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'
                              }`}
                              title={s.status === 'active' ? 'Deactivate' : 'Activate'}
                            >
                              {s.status === 'active' ? <Ban className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(s)}
                              className="p-2 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add Student Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add New Student">
        <form onSubmit={handleAdd} className="space-y-4">
          {addError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{addError}</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
            <input
              type="text"
              value={newStudent.fullName}
              onChange={(e) => setNewStudent({ ...newStudent, fullName: e.target.value })}
              required
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={newStudent.email}
                onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
                required
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
                placeholder="student@example.com"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Temporary Password</label>
            <input
              type="password"
              value={newStudent.password}
              onChange={(e) => setNewStudent({ ...newStudent, password: e.target.value })}
              required
              minLength={6}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
              placeholder="At least 6 characters"
            />
            <p className="text-xs text-slate-400 mt-1">The student can change this after their first login.</p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" disabled={addLoading}>
              {addLoading ? 'Creating...' : 'Create Student'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete Student" maxWidth="max-w-sm">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
            <Trash2 className="w-6 h-6 text-rose-600" />
          </div>
          <p className="text-slate-700 mb-1">Are you sure you want to delete <strong>{confirmDelete?.full_name || confirmDelete?.email}</strong>?</p>
          <p className="text-sm text-slate-400 mb-6">This will also delete all their submissions and answers. This cannot be undone.</p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
