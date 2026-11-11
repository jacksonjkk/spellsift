import React from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { PageWrapper } from '../components/Layout/PageWrapper';

interface LegalProps {
  kind: 'privacy' | 'terms';
  onNavigate: (page: string) => void;
}

const SUPPORT_EMAIL = 'support@spellsift.app';
const LAST_UPDATED = 'November 11, 2026';

const PrivacyContent: React.FC = () => (
  <>
    <h2>Privacy Policy</h2>
    <p className="legal-meta">Last updated: {LAST_UPDATED}</p>

    <h3>What we collect</h3>
    <ul>
      <li>
        <strong>Account data:</strong> your email address (stored by Supabase Auth), username,
        avatar, and account creation date.
      </li>
      <li>
        <strong>Gameplay data:</strong> rooms you join, submitted words, scores, wins, ties, and
        match results.
      </li>
      <li>
        <strong>Chat data:</strong> messages you send in room chat, read receipts, and reports you
        file. Chat is visible to players in the same room and is deleted when the room is empty or
        after the room expires.
      </li>
      <li>
        <strong>Moderation data:</strong> players you block and reports you submit.
      </li>
      <li>
        <strong>Technical data:</strong> standard server logs from our hosting provider. We do not
        run third-party advertising or analytics trackers.
      </li>
    </ul>

    <h3>How we use it</h3>
    <ul>
      <li>To create and secure your account, run games, and show leaderboards and match history.</li>
      <li>To deliver chat, read receipts, and moderation features.</li>
      <li>To detect abuse, enforce our terms, and keep the game fair.</li>
    </ul>

    <h3>Who can see your data</h3>
    <ul>
      <li>
        Your username, avatar, wins, ties, and games played are visible to signed-in players.
        Your email is never exposed through the game API.
      </li>
      <li>
        Room members can see your score, ready status, submitted words in results, and chat
        messages for that room.
      </li>
      <li>
        We use Supabase for authentication, database, realtime, and hosting. DiceBear renders
        avatars. These providers process data on our behalf.
      </li>
    </ul>

    <h3>Retention and deletion</h3>
    <ul>
      <li>
        Active rooms expire automatically. Chat is removed when a room is empty and rooms are
        cleaned up after they end.
      </li>
      <li>
        You can delete your account from the Profile page. Deletion removes your profile, player
        rows, submissions, receipts, and reports, and signs you out. Some anonymised aggregate
        results may remain in completed match records.
      </li>
      <li>
        To request deletion if you cannot sign in, email {SUPPORT_EMAIL} from the address on the
        account.
      </li>
    </ul>

    <h3>Children</h3>
    <p>
      SpellSift is not directed to children under 13. If you believe a child under 13 created an
      account, contact {SUPPORT_EMAIL} and we will remove it.
    </p>

    <h3>Security</h3>
    <p>
      Game state is validated on the server. Access is restricted with row-level security and
      short-lived sessions. No system is perfectly secure; report suspected issues to{' '}
      {SUPPORT_EMAIL}.
    </p>

    <h3>Changes</h3>
    <p>
      We may update this policy. Material changes will be announced in the app before they take
      effect.
    </p>
  </>
);

const TermsContent: React.FC = () => (
  <>
    <h2>Terms of Service</h2>
    <p className="legal-meta">Last updated: {LAST_UPDATED}</p>

    <h3>Using SpellSift</h3>
    <p>
      You must be at least 13 years old to use SpellSift. You are responsible for activity on your
      account and for keeping your password secure. Do not share your account.
    </p>

    <h3>Fair play</h3>
    <ul>
      <li>Do not automate submissions, tamper with the client, or attempt to change scores.</li>
      <li>Do not create multiple accounts to manipulate results or evade moderation.</li>
      <li>Do not abuse bugs. Report them to {SUPPORT_EMAIL}.</li>
    </ul>

    <h3>Chat and user content</h3>
    <ul>
      <li>
        You are responsible for the messages you send. Harassment, hate speech, threats, spam,
        sexual content involving minors, doxxing, and illegal content are prohibited.
      </li>
      <li>
        We may hide or remove messages, restrict features, or suspend accounts that violate these
        rules. You can report a message and block a player from chat.
      </li>
      <li>
        You grant us a limited licence to store and display your messages to room members for the
        purpose of running chat and moderation.
      </li>
    </ul>

    <h3>Game rules</h3>
    <p>
      Words must be at least three letters and use only letters from the base word. Dictionary
      mode, when enabled by the host, requires a recognised English word. Scores are awarded by the
      server and are final.
    </p>

    <h3>Availability and termination</h3>
    <p>
      We may change, suspend, or discontinue the service. You may stop using SpellSift at any time
      and delete your account from the Profile page. We may suspend accounts that break these
      terms or create risk for other players.
    </p>

    <h3>Disclaimers</h3>
    <p>
      SpellSift is provided “as is” without warranties. To the extent permitted by law, we are not
      liable for indirect or consequential losses arising from your use of the service.
    </p>

    <h3>Contact</h3>
    <p>Questions about these terms: {SUPPORT_EMAIL}.</p>
  </>
);

export const Legal: React.FC<LegalProps> = ({ kind, onNavigate }) => (
  <PageWrapper>
    <div className="form-page" style={{ maxWidth: '760px', margin: '2rem auto' }}>
      <button
        type="button"
        onClick={() => onNavigate('landing')}
        className="btn btn-outline"
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}
      >
        <ArrowLeft size={16} /> Back to Home
      </button>

      <article className="card legal-page">
        <div className="legal-heading">
          <ShieldCheck size={28} style={{ color: 'var(--color-accent)' }} />
          <span>{kind === 'privacy' ? 'Your privacy' : 'Fair play'}</span>
        </div>
        {kind === 'privacy' ? <PrivacyContent /> : <TermsContent />}
      </article>
    </div>
  </PageWrapper>
);
