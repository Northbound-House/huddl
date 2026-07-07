import React, { useEffect, useMemo, useRef, useState } from 'react';
import { updateProfile } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Camera, Sparkles, User } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { auth, storage } from '@/lib/firebase';
import { base44 } from '@/api/base44Client';
import {
  nameLooksGeneric,
  needsProfilePromptAttention,
  pickFirebasePhotoUrl,
  readProfilePromptComplete,
  writeProfilePromptComplete,
} from '@/lib/profilePrompt';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

function extFromFile(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith('.png')) return 'png';
  if (n.endsWith('.webp')) return 'webp';
  if (n.endsWith('.gif')) return 'gif';
  return 'jpg';
}

/**
 * First-session dialog: encourage a real display name (not just the email handle) and a profile photo when missing.
 */
export default function ProfileFirstLoginPrompt() {
  const { isFirebaseAuth, firebaseUser, refreshSession } = useAuth();
  const uid = firebaseUser?.uid ?? null;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const nameInitializedRef = useRef(false);

  const email = firebaseUser?.email ?? '';
  const emailLocal = useMemo(() => (email.includes('@') ? email.split('@')[0] : ''), [email]);

  const nameNeedsWork = useMemo(
    () => nameLooksGeneric(firebaseUser?.displayName, email),
    [firebaseUser?.displayName, email]
  );
  const photoNeedsWork = useMemo(() => !pickFirebasePhotoUrl(firebaseUser), [firebaseUser]);

  const shouldOffer = Boolean(
    isFirebaseAuth && uid && firebaseUser && needsProfilePromptAttention(firebaseUser)
  );
  const alreadyDone = readProfilePromptComplete(uid);

  useEffect(() => {
    nameInitializedRef.current = false;
  }, [uid]);

  useEffect(() => {
    if (!shouldOffer || alreadyDone) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!nameInitializedRef.current) {
      const dn = (firebaseUser.displayName || '').trim();
      setName(dn || emailLocal || '');
      nameInitializedRef.current = true;
    }
  }, [shouldOffer, alreadyDone, uid, firebaseUser, emailLocal]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const currentPhoto = previewUrl || pickFirebasePhotoUrl(firebaseUser);

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
    setPendingFile(file);
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const finishAndClose = () => {
    if (uid) writeProfilePromptComplete(uid);
    setOpen(false);
    setPendingFile(null);
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSkip = () => {
    finishAndClose();
  };

  const handleSave = async () => {
    const user = auth?.currentUser;
    if (!user) {
      toast.error('Not signed in.');
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error('Enter a name others will recognize (at least 2 characters).');
      return;
    }
    if (nameNeedsWork && trimmed.toLowerCase() === emailLocal.toLowerCase()) {
      toast.error('Pick a friendly name — not just the part before @ in your email.');
      return;
    }
    if (pendingFile && !storage) {
      toast.error('Photo upload needs Firebase Storage. You can add a photo later from Profile.');
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
      }

      await updateProfile(user, {
        displayName: trimmed,
        ...(photoURLUpdate !== undefined ? { photoURL: photoURLUpdate } : {}),
      });

      await refreshSession();
      const finalPhoto =
        photoURLUpdate !== undefined
          ? photoURLUpdate
          : pickFirebasePhotoUrl(user) || user.photoURL || null;
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
      toast.success('You’re all set — thanks for personalizing your profile.');
      finishAndClose();
    } catch (err) {
      toast.error(err?.message || 'Could not save. Try again or use Profile later.');
    } finally {
      setSaving(false);
    }
  };

  if (!isFirebaseAuth || !firebaseUser) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleSkip()}>
      <DialogContent className="sm:max-w-md rounded-2xl gap-0 p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-border/60">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-xl bg-gradient-to-br from-primary to-accent p-2.5 text-white shadow-sm shrink-0">
                <Sparkles className="w-5 h-5" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-xl">How should we show you?</DialogTitle>
                <DialogDescription className="text-left text-sm leading-relaxed">
                  A quick one-time setup so teammates see a <strong className="text-foreground">real name</strong> and
                  (when possible) your face on Items and votes.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 py-4 space-y-5 text-sm">
          <div className="space-y-2">
            <label htmlFor="first-login-name" className="text-xs font-medium text-muted-foreground">
              Friendly name
            </label>
            <input
              id="first-login-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
              autoComplete="name"
              placeholder="e.g. Casey Wright"
            />
            {nameNeedsWork ? (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your account currently looks like <span className="font-medium text-foreground">{emailLocal}</span> —
                use the name people actually call you in meetings and messages.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">You can tweak this if you like.</p>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Profile photo</p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="shrink-0 flex justify-center sm:justify-start">
                {currentPhoto ? (
                  <img
                    src={currentPhoto}
                    alt=""
                    className="w-20 h-20 rounded-full object-cover border-2 border-border shadow-sm"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center border-2 border-dashed border-border">
                    <User className="w-9 h-9 text-muted-foreground" aria-hidden />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                {photoNeedsWork ? (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    No photo came from Google for this account. Adding one helps others recognize you in{' '}
                    <strong className="text-foreground">likes and comments</strong> — totally optional, but we recommend
                    it.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    We already have a picture from your account. You can replace it below or keep it.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Camera className="w-4 h-4 mr-2" aria-hidden />
                    {pendingFile || photoNeedsWork ? 'Upload photo' : 'Change photo'}
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={ACCEPT}
                    className="hidden"
                    onChange={onPickFile}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">JPEG, PNG, WebP, or GIF · max 2 MB</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/60 bg-muted/20 flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="ghost" className="rounded-xl w-full sm:w-auto" onClick={handleSkip}>
            Skip for now
          </Button>
          <Button type="button" className="rounded-xl w-full sm:w-auto" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save and continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
