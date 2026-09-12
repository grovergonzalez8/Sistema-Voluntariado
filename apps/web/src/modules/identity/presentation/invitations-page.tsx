import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import type { AppError } from '@sistema-voluntariado/shared-kernel';
import {
  Button,
  EmptyState,
  Field,
  LoadingState,
  Notice,
  PageHeader,
  StatusBadge,
} from '@sistema-voluntariado/ui';

import type { InvitationAdministrationService } from '../application/invitation-administration-service';
import type { InvitationSummary } from '../domain/account-administration';
import { useIdentity } from './identity-context';
import { getInvitationStatusTone } from './status-badge-tone';

const allInitialRoles = [
  'volunteer',
  'coordinator',
  'accommodation_manager',
  'project_manager',
  'finance',
  'administrator',
] as const;

function getInvitationErrorMessage(
  error: AppError,
  translate: (key: string) => string,
): string {
  switch (error.code) {
    case 'network':
      return translate('invitations.errors.network');
    case 'origin-denied':
      return translate('invitations.errors.originDenied');
    case 'forbidden':
      return translate('invitations.errors.permissionDenied');
    case 'role-not-grantable':
      return translate('invitations.errors.roleNotGrantable');
    case 'server':
      return translate('invitations.errors.server');
    case 'unauthenticated':
      return translate('invitations.errors.sessionExpired');
    default:
      return error.message;
  }
}

export function InvitationsPage({
  service,
}: {
  readonly service: InvitationAdministrationService;
}) {
  const identity = useIdentity();
  const identityScope = `${identity.user?.id ?? 'anonymous'}:${identity.account?.authorityVersion ?? 'unknown'}`;

  return <ScopedInvitationsPage key={identityScope} service={service} />;
}

function ScopedInvitationsPage({
  service,
}: {
  readonly service: InvitationAdministrationService;
}) {
  const [invitations, setInvitations] = useState<readonly InvitationSummary[]>(
    [],
  );
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [locale, setLocale] = useState('es');
  const [role, setRole] = useState('volunteer');
  const [reason, setReason] = useState('Solicitud administrativa');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const createIdempotencyKeys = useRef(new Map<string, string>());
  const actionIdempotencyKeys = useRef(new Map<string, string>());
  const requestGeneration = useRef(0);
  const operationGeneration = useRef(0);
  const identity = useIdentity();
  const { signOut } = identity;
  const { t } = useTranslation();
  const canResend =
    identity.account?.permissions.includes('invitation.resend') ?? false;
  const canRevoke =
    identity.account?.permissions.includes('invitation.revoke') ?? false;
  const allowedRoles = canResend
    ? allInitialRoles
    : allInitialRoles.slice(0, 1);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    const result = await service.listInvitations();
    if (generation !== requestGeneration.current) return;
    if (result.ok) {
      setInvitations(result.value);
      setError(null);
    } else {
      setError(result.error);
      if (result.error.code === 'unauthenticated') void signOut();
    }
    setLoading(false);
  }, [service, signOut]);

  useLayoutEffect(
    () => () => {
      requestGeneration.current += 1;
      operationGeneration.current += 1;
      createIdempotencyKeys.current.clear();
      actionIdempotencyKeys.current.clear();
    },
    [],
  );

  useEffect(() => {
    const generation = ++requestGeneration.current;
    void service.listInvitations().then((result) => {
      if (generation !== requestGeneration.current) return;
      if (result.ok) {
        setInvitations(result.value);
        setError(null);
      } else {
        setError(result.error);
        if (result.error.code === 'unauthenticated') void signOut();
      }
      setLoading(false);
    });
  }, [service, signOut]);

  const create = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const generation = operationGeneration.current;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    const fingerprint = JSON.stringify({
      displayName: displayName.trim() || null,
      email: email.trim().toLowerCase(),
      locale,
      role,
    });
    const idempotencyKey =
      createIdempotencyKeys.current.get(fingerprint) ?? crypto.randomUUID();
    createIdempotencyKeys.current.set(fingerprint, idempotencyKey);
    const result = await service.createInvitation({
      displayName: displayName || null,
      email,
      idempotencyKey,
      preferredLocale: locale,
      requestedInitialRoleCode: role,
    });
    if (generation !== operationGeneration.current) return;
    if (
      result.ok &&
      result.value.outcome !== 'in_progress' &&
      result.value.outcome !== 'failed'
    ) {
      createIdempotencyKeys.current.delete(fingerprint);
      setEmail('');
      setDisplayName('');
      setMessage(t('invitations.created'));
      await load();
    } else if (result.ok && result.value.outcome === 'in_progress') {
      setMessage(t('invitations.actionInProgress'));
    } else if (result.ok) {
      createIdempotencyKeys.current.delete(fingerprint);
      setError({
        code: 'unexpected',
        message: t('invitations.actionFailed'),
      });
      await load();
    } else {
      setError(result.error);
      if (result.error.code === 'unauthenticated') await signOut();
    }
    if (generation !== operationGeneration.current) return;
    setSubmitting(false);
  };

  const act = async (
    invitation: InvitationSummary,
    operation: 'replace' | 'resend' | 'revoke',
  ) => {
    if (!window.confirm(t(`invitations.confirm.${operation}`))) return;
    const generation = operationGeneration.current;
    setSubmitting(true);
    const actionKey = `${operation}:${invitation.id}`;
    const idempotencyKey =
      actionIdempotencyKeys.current.get(actionKey) ?? crypto.randomUUID();
    actionIdempotencyKeys.current.set(actionKey, idempotencyKey);
    const result =
      operation === 'revoke'
        ? await service.revokeInvitation({
            idempotencyKey,
            invitationId: invitation.id,
            reason,
          })
        : await service[
            operation === 'replace' ? 'replaceInvitation' : 'resendInvitation'
          ]({
            idempotencyKey,
            invitationId: invitation.id,
          });
    if (generation !== operationGeneration.current) return;
    if (
      result.ok &&
      result.value.outcome !== 'in_progress' &&
      result.value.outcome !== 'failed'
    ) {
      actionIdempotencyKeys.current.delete(actionKey);
      setMessage(t('invitations.actionCompleted'));
      setError(null);
      await load();
    } else if (result.ok && result.value.outcome === 'in_progress') {
      setMessage(t('invitations.actionInProgress'));
      setError(null);
    } else if (result.ok) {
      actionIdempotencyKeys.current.delete(actionKey);
      setMessage(null);
      setError({
        code: 'unexpected',
        message: t('invitations.actionFailed'),
      });
      await load();
    } else {
      setError(result.error);
      if (result.error.code === 'unauthenticated') await signOut();
    }
    if (generation !== operationGeneration.current) return;
    setSubmitting(false);
  };

  return (
    <section className="admin-page">
      <PageHeader
        description={t('invitations.description')}
        eyebrow={t('admin.eyebrow')}
        title={t('invitations.title')}
      />
      <form
        aria-labelledby="invitation-create-title"
        className="panel compact-form invitation-create-form"
        onSubmit={(event) => void create(event)}
      >
        <div className="form-heading">
          <h2 id="invitation-create-title">
            {t('invitations.createSectionTitle')}
          </h2>
        </div>
        <Field
          label={t('login.email')}
          name="invitationEmail"
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          required
          type="email"
          value={email}
        />
        <Field
          label={t('profile.displayName')}
          name="invitationDisplayName"
          onChange={(event) => {
            setDisplayName(event.target.value);
          }}
          value={displayName}
        />
        <label className="field">
          <span>{t('profile.preferredLocale')}</span>
          <select
            onChange={(event) => {
              setLocale(event.target.value);
            }}
            value={locale}
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="field">
          <span>{t('invitations.initialRole')}</span>
          <select
            onChange={(event) => {
              setRole(event.target.value);
            }}
            value={role}
          >
            {allowedRoles.map((roleCode) => (
              <option key={roleCode} value={roleCode}>
                {t(`roles.${roleCode}`)}
              </option>
            ))}
          </select>
        </label>
        <Button
          busy={submitting}
          disabled={submitting}
          type="submit"
          variant="primary"
        >
          {submitting ? t('common.saving') : t('invitations.create')}
        </Button>
      </form>
      <section aria-labelledby="invitation-list-title" className="data-section">
        <div className="section-heading">
          <div>
            <h2 id="invitation-list-title">{t('invitations.listTitle')}</h2>
          </div>
          {canRevoke ? (
            <div className="list-toolbar">
              <Field
                label={t('invitations.reason')}
                minLength={3}
                name="invitationReason"
                onChange={(event) => {
                  setReason(event.target.value);
                }}
                value={reason}
              />
            </div>
          ) : null}
        </div>
        <div className="feedback-stack">
          {error ? (
            <Notice tone="error">{getInvitationErrorMessage(error, t)}</Notice>
          ) : null}
          {message ? <Notice tone="success">{message}</Notice> : null}
        </div>
        {loading ? <LoadingState>{t('common.loading')}</LoadingState> : null}
        {!loading && invitations.length === 0 ? (
          <EmptyState title={t('invitations.empty')} />
        ) : null}
        <div className="data-list invitation-list">
          {invitations.map((invitation) => (
            <article
              className="data-card data-card--invitation"
              key={invitation.id}
            >
              <div>
                <strong>{invitation.normalizedEmail}</strong>
                <p>{invitation.displayName ?? t('common.notProvided')}</p>
              </div>
              <dl className="data-card__meta">
                <dt>{t('common.status')}</dt>
                <dd>
                  <StatusBadge
                    tone={getInvitationStatusTone(invitation.status)}
                  >
                    {t(`invitationStatus.${invitation.status}`)}
                  </StatusBadge>
                </dd>
                <dt>{t('invitations.initialRole')}</dt>
                <dd>
                  <StatusBadge>
                    {t(`roles.${invitation.requestedInitialRoleCode}`)}
                  </StatusBadge>
                </dd>
                <dt>{t('invitations.expires')}</dt>
                <dd>{new Date(invitation.expiresAt).toLocaleString()}</dd>
              </dl>
              <div className="data-card__link">
                <Link to={`/app/admin/invitations/${invitation.id}`}>
                  {t('invitations.view')}
                </Link>
              </div>
              {(canResend &&
                (['pending', 'sent', 'delivery_failed'].includes(
                  invitation.status,
                ) ||
                  (['revoked', 'expired'].includes(invitation.status) &&
                    !invitation.supersededBy))) ||
              (canRevoke &&
                ['pending', 'sent', 'delivery_failed'].includes(
                  invitation.status,
                )) ? (
                <div className="button-row data-card__actions">
                  {canResend &&
                  ['sent', 'delivery_failed'].includes(invitation.status) ? (
                    <Button
                      disabled={submitting}
                      onClick={() => void act(invitation, 'resend')}
                    >
                      {t('invitations.resend')}
                    </Button>
                  ) : null}
                  {canResend &&
                  (['pending', 'sent', 'delivery_failed'].includes(
                    invitation.status,
                  ) ||
                    (['revoked', 'expired'].includes(invitation.status) &&
                      !invitation.supersededBy)) ? (
                    <Button
                      disabled={submitting}
                      onClick={() => void act(invitation, 'replace')}
                    >
                      {t('invitations.replace')}
                    </Button>
                  ) : null}
                  {canRevoke &&
                  ['pending', 'sent', 'delivery_failed'].includes(
                    invitation.status,
                  ) ? (
                    <Button
                      disabled={submitting}
                      onClick={() => void act(invitation, 'revoke')}
                    >
                      {t('invitations.revoke')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
