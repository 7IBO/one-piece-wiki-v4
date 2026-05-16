/**
 * Sign-in page. The dashboard supports exactly two write-eligible
 * paths plus read-only browsing:
 *
 *   1. **Anonymous-with-pseudo** — the contributor types a display
 *      name and gets a better-auth anonymous session. The name lands
 *      on the PR body as bold plain text (no `@` prefix) so a
 *      reviewer can never confuse it for a GitHub handle.
 *   2. **GitHub** — standard OAuth flow via better-auth's social
 *      provider. The login + numeric id are persisted on the user
 *      row; the PR body @mentions the login. Admin allow-list
 *      membership (ADMIN_GITHUB_USERNAMES) is checked per-endpoint.
 *   3. **Read-only** — skip the dance entirely; the site is browse-
 *      able without an account. The save bar stays disabled until a
 *      session exists.
 *
 * Both write paths land here when the editor's save button is
 * clicked without a session; we redirect back to the previous page
 * (via the `?from=…` query param) on successful sign-in so the
 * contributor doesn't lose their place.
 */
import { Button } from '@/components/ui/button';
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { type JSX, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { auth } from '../auth';
import { useLocale, useT } from '../form/locale';

const searchSchema = z.object({
  from: z.string().optional(),
});

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  component: LoginPage,
});

function LoginPage(): JSX.Element {
  const locale = useLocale();
  const t = useT();
  const navigate = useNavigate();
  const search = useSearch({ from: '/login' }) as { from?: string; };
  const safeFrom = typeof search.from === 'string' && search.from.startsWith('/')
    ? search.from
    : '/';

  const [nickname, setNickname] = useState('');
  const [anonBusy, setAnonBusy] = useState(false);
  const [githubBusy, setGithubBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAnonymous(): Promise<void> {
    const trimmed = nickname.trim();
    if (trimmed === '') {
      setError(t('nicknameRequired'));
      return;
    }
    setAnonBusy(true);
    setError(null);
    try {
      await auth.signInAnonymous(trimmed);
      toast.success(t('signedInToastTitle'));
      await navigate({ to: safeFrom });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnonBusy(false);
    }
  }

  function onGitHub(): void {
    setGithubBusy(true);
    setError(null);
    // Full-page navigation takes over here — the server 302s to
    // GitHub, then GitHub 302s to our callback, then the callback
    // 302s back to "/" with the cookie set. The `safeFrom` is lost
    // because the OAuth flow can't carry app state across; this is
    // acceptable since the user is almost always sent here from "/"
    // already (the sign-in link on the header). If a future caller
    // needs `safeFrom` preserved we can stash it in sessionStorage
    // and read it back from "/" on next mount.
    auth.signInWithGitHub();
  }

  // Two columns visually, single-column on narrow viewports. The
  // explainer at the top is intentionally chatty — most contributors
  // won't know what a "Pull Request" is, and the dashboard's whole
  // value prop hinges on them being comfortable that their edits go
  // somewhere reversible.
  return (
    <div className='mx-auto flex max-w-3xl flex-col gap-6 py-10'>
      <div>
        <h1 className='text-foreground text-2xl font-semibold tracking-tight'>
          {t('loginTitle')}
        </h1>
        <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
          {t('loginExplainer')}
        </p>
      </div>

      {error !== null
        ? (
          <div
            role='alert'
            className='border-destructive/30 bg-destructive/5 text-destructive rounded-[3px] border px-3 py-2 text-xs'
          >
            {error}
          </div>
        )
        : null}

      <div className='grid gap-4 sm:grid-cols-2'>
        {/* Anonymous-with-pseudo */}
        <section
          aria-label={t('loginAnonymousTitle')}
          className='border-border bg-card flex flex-col gap-3 rounded-[6px] border p-5'
        >
          <h2 className='text-foreground text-sm font-semibold'>
            {t('loginAnonymousTitle')}
          </h2>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {t('loginAnonymousSubtitle')}
          </p>
          <input
            type='text'
            autoFocus
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 32))}
            placeholder={t('nicknamePlaceholder')}
            maxLength={32}
            aria-label={t('nickname')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !anonBusy && !githubBusy) void onAnonymous();
            }}
            className='border-input bg-background placeholder:text-muted-foreground/70 focus:ring-ring h-9 rounded-[3px] border px-2 text-sm focus:outline-none focus:ring-1'
          />
          <Button
            type='button'
            size='sm'
            disabled={anonBusy || githubBusy || nickname.trim() === ''}
            onClick={onAnonymous}
          >
            {anonBusy ? t('signingIn') : t('loginAnonymousCta')}
          </Button>
          <p className='text-muted-foreground/70 text-[11px] leading-snug'>
            {t('loginAnonymousFootnote')}
          </p>
        </section>

        {/* GitHub */}
        <section
          aria-label={t('loginGithubTitle')}
          className='border-border bg-card flex flex-col gap-3 rounded-[6px] border p-5'
        >
          <h2 className='text-foreground text-sm font-semibold'>
            {t('loginGithubTitle')}
          </h2>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {t('loginGithubSubtitle')}
          </p>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={anonBusy || githubBusy}
            onClick={onGitHub}
          >
            {githubBusy ? t('signingIn') : t('loginGithubCta')}
          </Button>
          <p className='text-muted-foreground/70 text-[11px] leading-snug'>
            {t('loginGithubFootnote')}
          </p>
        </section>
      </div>

      <div className='text-muted-foreground border-border border-t pt-4 text-xs'>
        <a
          href={safeFrom}
          className='hover:text-foreground underline-offset-2 hover:underline'
        >
          {t('loginContinueReadOnly')}
        </a>
        {' · '}
        <span lang={locale}>{t('loginReadOnlyHint')}</span>
      </div>
    </div>
  );
}
