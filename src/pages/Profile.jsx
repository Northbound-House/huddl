import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { updateProfile } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, ChevronRight, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { useUserAccess } from '@/context/UserAccessContext';
import MainHeader from '@/components/MainHeader';
import { auth, db, storage } from '@/lib/firebase';
import { base44, isFirestoreBackend } from '@/api/base44Client';
import { fetchVisibleTeams } from '@/api/accessQueries';
import { normalizeEmail } from '@/lib/email';
import { circleDetailPath } from '@/lib/orgPaths';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

function extFromFile(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith('.png')) return 'png';
  if (n.endsWith('.webp')) return 'webp';
  if (n.endsWith('.gif')) return 'gif';
  return 'jpg';
}

export default function Profile() {
  const queryClient = useQueryClient();
  const { sessionUser, isFirebaseAuth, refreshSession } = useAuth();
  const {
    loading: accessLoading,
    isGlobalAdmin,
    memberships,
    refreshAccess,
    accessibleTeamIds,
  } = useUserAccess();
  const [name, setName] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState(null);
  const fileRef = useRef(null);

  const accessKey = isGlobalAdmin
    ? 'all'
    : `${accessibleTeamIds?.join(',') ?? 'none'}:${sessionUser?.uid ?? ''}`;
  const memberKey = normalizeEmail(sessionUser?.email ?? '');

  const { data: teams = [] } = useQuery({
    queryKey: ['teams', 'visible', accessKey, sessionUser?.uid ?? '', memberKey],
    queryFn: async () => {
      if (!isFirestoreBackend) {
        return base44.entities.Team.list('name');
      }
      return fetchVisibleTeams(db, {
        isGlobalAdmin,
        accessibleTeamIds: accessibleTeamIds ?? [],
        creatorUid: sessionUser?.uid ?? null,
        memberEmail: sessionUser?.email ?? null,
        memberUid: sessionUser?.uid ?? null,
      });
    },
    staleTime: 0,
    enabled:
      isFirebaseAuth &&
      !accessLoading &&
      (!isFirestoreBackend || !!sessionUser?.uid),
  });

  const circleRows = useMemo(() => {
    const byId = new Map(teams.map((t) => [t.id, t]));
    const rows = memberships.map((m) => ({
      membershipId: m.id,
      teamId: m.team_id,
      role: m.role,
      name: byId.get(m.team_id)?.name || 'Circle',
    }));
    rows.sort((a, b) => {
      const aLead = a.role === 'team_admin' ? 0 : 1;
      const bLead = b.role === 'team_admin' ? 0 : 1;
      if (aLead !== bLead) return aLead - bLead;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    return rows;
  }, [memberships, teams]);

  const leaveMutation = useMutation({
    mutationFn: (membershipId) => base44.entities.TeamMembership.delete(membershipId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['team_memberships'] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      refreshAccess();
      toast.success('You left the Circle');
      setLeaveTarget(null);
    },
    onError: () => toast.error('Could not leave this Circle'),
  });

  useEffect(() => {
    if (sessionUser?.full_name) setName(sessionUser.full_name);
  }, [sessionUser?.full_name]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const currentPhoto = removePhoto ? null : previewUrl || sessionUser?.photoURL;

  const onPickFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPT.split(',').some((t) => file.type === t.trim())) {
      toast.error('Use a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Image must be 2 MB or smaller.');
      return;
    }
    setRemovePhoto(false);
    setPendingFile(file);
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const user = auth?.currentUser;
    if (!user) {
      toast.error('Not signed in.');
      return;
    }
    if (pendingFile && !storage) {
      toast.error('Firebase Storage is not configured (missing bucket).');
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Enter a display name.');
      return;
    }

    setSaving(true);
    try {
      let photoURLUpdate;
      if (pendingFile) {
        const path = `avatars/${user.uid}/profile_${Date.now()}.${extFromFile(pendingFile)}`;
        const sref = ref(storage, path);
        await uploadBytes(sref, pendingFile, { contentType: pendingFile.type });
        photoURLUpdate = await getDownloadURL(sref);
      } else if (removePhoto) {
        photoURLUpdate = null;
      }

      await updateProfile(user, {
        displayName: trimmed,
        ...(photoURLUpdate !== undefined ? { photoURL: photoURLUpdate } : {}),
      });

      await refreshSession();
      const finalPhoto =
        photoURLUpdate !== undefined
          ? photoURLUpdate
          : auth?.currentUser?.photoURL ||
            auth?.currentUser?.providerData?.find((p) => p.photoURL)?.photoURL ||
            null;
      if (base44.entities.PublicProfile?.upsert && user.email) {
        try {
          await base44.entities.PublicProfile.upsert(user.email, {
            photo_url: finalPhoto ?? null,
            display_name: trimmed,
          });
        } catch {
          /* ignore */
        }
      }
      queryClient.invalidateQueries({ queryKey: ['public_profiles'] });
      setPendingFile(null);
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setRemovePhoto(false);
      if (fileRef.current) fileRef.current.value = '';
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err?.message || 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  if (!isFirebaseAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <User className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground text-center max-w-sm mb-4">
          Profile editing is available when you sign in with Google (Firebase).
        </p>
        <Button asChild variant="outline" className="rounded-xl">
          <Link to="/">Back home</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <MainHeader />
      <header className="border-b border-border/60 bg-card/80 backdrop-blur-xl">
        <div className="max-w-lg mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link to="/" className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <h1 className="font-heading text-xl font-bold">Profile</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 sm:px-6 py-8 space-y-6">
        {!accessLoading && circleRows.length > 0 && (
          <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-3">
            <h2 className="font-heading text-sm font-semibold text-foreground">Your Circles</h2>
            <p className="text-xs text-muted-foreground">
              Circles where you’re a Circle Lead are listed first. You can leave Circles where you’re only a member.
            </p>
            <ul className="divide-y divide-border/60 rounded-xl border border-border/50 overflow-hidden">
              {circleRows.map((row) => {
                const isLead = row.role === 'team_admin';
                const href = circleDetailPath(row.teamId);
                return (
                  <li key={row.membershipId} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-muted/10 px-3 py-3">
                    <div className="min-w-0 flex items-center gap-2 flex-1">
                      <Link
                        to={href}
                        className="font-medium text-sm text-foreground truncate hover:text-primary hover:underline inline-flex items-center gap-1 min-w-0"
                      >
                        <span className="truncate">{row.name}</span>
                        <ChevronRight className="w-4 h-4 shrink-0 opacity-50" aria-hidden />
                      </Link>
                      <span
                        className={
                          isLead
                            ? 'text-[10px] uppercase tracking-wide font-semibold text-primary shrink-0'
                            : 'text-[10px] uppercase tracking-wide text-muted-foreground shrink-0'
                        }
                      >
                        {isLead ? 'Circle Lead' : 'Member'}
                      </span>
                    </div>
                    {!isLead && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0 w-full sm:w-auto"
                        onClick={() =>
                          setLeaveTarget({
                            membershipId: row.membershipId,
                            circleName: row.name,
                          })
                        }
                      >
                        Leave Circle
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <form onSubmit={handleSubmit} className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-6">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              {currentPhoto ? (
                <img
                  src={currentPhoto}
                  alt=""
                  className="w-28 h-28 rounded-full object-cover border-2 border-border shadow-md"
                />
              ) : (
                <div className="w-28 h-28 rounded-full bg-muted flex items-center justify-center border-2 border-dashed border-border">
                  <User className="w-14 h-14 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => fileRef.current?.click()}
              >
                <Camera className="w-4 h-4 mr-2" />
                {sessionUser?.photoURL || pendingFile ? 'Change photo' : 'Upload photo'}
              </Button>
              {(sessionUser?.photoURL || pendingFile) && !removePhoto && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-xl text-muted-foreground"
                  onClick={() => {
                    setRemovePhoto(true);
                    setPendingFile(null);
                    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
                    setPreviewUrl(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove photo
                </Button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={onPickFile}
            />
            <p className="text-xs text-muted-foreground text-center">JPEG, PNG, WebP, or GIF · max 2 MB</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Display name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              autoComplete="name"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <input
              value={sessionUser?.email || ''}
              readOnly
              className="w-full rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
            />
            <p className="text-[11px] text-muted-foreground">Email comes from your Google account and can’t be changed here.</p>
          </div>

          <Button type="submit" className="w-full rounded-xl" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </Button>
        </form>
      </main>

      <ConfirmDialog
        open={leaveTarget != null}
        onOpenChange={(open) => {
          if (!open) setLeaveTarget(null);
        }}
        title={`Leave “${leaveTarget?.circleName ?? 'Circle'}”?`}
        description={
          <>
            <p>
              You’ll lose access to this Circle’s shared Huddl Boards. To come back later, a <strong>Circle Lead</strong>{' '}
              must add
              your email again.
            </p>
          </>
        }
        confirmLabel="Leave Circle"
        cancelLabel="Cancel"
        variant="destructive"
        confirmPending={leaveMutation.isPending}
        onConfirm={() => {
          if (leaveTarget?.membershipId) leaveMutation.mutate(leaveTarget.membershipId);
        }}
      />
    </div>
  );
}
