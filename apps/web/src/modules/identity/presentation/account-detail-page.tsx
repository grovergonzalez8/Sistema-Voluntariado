import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Field,
  LoadingState,
  Notice,
  PageHeader,
  StatusBadge,
} from '@sistema-voluntariado/ui';

import type { AccountAdministrationService } from '../application/account-administration-service';
import type { InvitationAdministrationService } from '../application/invitation-administration-service';
import type { AccountDetail } from '../domain/account-administration';
import {
  normalizeAdministrativeReason,
  type AccountStatus,
} from '../domain/account-lifecycle';
import { useIdentity } from './identity-context';
import { getAccountStatusTone } from './status-badge-tone';
import type { Result } from '@sistema-voluntariado/shared-kernel';

interface AccountDetailPageProps {
  readonly invitationService?: InvitationAdministrationService;
  readonly service: AccountAdministrationService;
}

interface PendingRecoveryRequest {
  readonly idempotencyKey: string;
  readonly reason: string;
}

export function AccountDetailPage(props: AccountDetailPageProps) {
  const { id = '' } = useParams();
  const identity = useIdentity();
  const currentActor = useRef<string | null>(null);
  const recoveryRequests = useRef(new Map<string, PendingRecoveryRequest>());
  useLayoutEffect(() => {
    currentActor.current = identity.user?.id ?? null;
    recoveryRequests.current.clear();
  }, [identity.user?.id]);
  return (
    <AccountDetailForResource
      id={id}
      key={`${id}:${identity.user?.id ?? 'anonymous'}`}
      currentActor={currentActor}
      recoveryRequests={recoveryRequests}
      {...props}
    />
  );
}

function AccountDetailForResource({
  id,
  currentActor,
  recoveryRequests,
  invitationService,
  service,
}: AccountDetailPageProps & {
  readonly id: string;
  readonly currentActor: RefObject<string | null>;
  readonly recoveryRequests: RefObject<Map<string, PendingRecoveryRequest>>;
}) {
  const identity = useIdentity();
  const recoveryScope = `${identity.user?.id ?? 'anonymous'}:${id}`;
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [reason, setReason] = useState(
    () =>
      recoveryRequests.current.get(recoveryScope)?.reason ??
      'Cambio administrativo autorizado',
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const { t } = useTranslation();
  const isMounted = useCallback(() => mounted.current, []);
  const permissions = identity.account?.permissions ?? [];
  const canActivate = permissions.includes('account.activate');
  const canRecover = permissions.includes('invitation.recover');
  const canArchive = permissions.includes('account.archive');
  const canManageRoles = permissions.includes('role_assignment.manage');
  const canReactivate = permissions.includes('account.reactivate');
  const canSuspend = permissions.includes('account.suspend');

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void service.getAccountDetail(id).then(
      (result) => {
        if (!active) return;
        if (result.ok && result.value.accountId === id) {
          if (
            result.value.status !== 'invited' &&
            recoveryRequests.current.has(recoveryScope)
          ) {
            recoveryRequests.current.delete(recoveryScope);
            setReason('Cambio administrativo autorizado');
          }
          setAccount(result.value);
          setError(null);
        } else {
          setAccount(null);
          setError(
            result.ok ? t('common.resourceLoadError') : result.error.message,
          );
        }
      },
      () => {
        if (active) {
          setAccount(null);
          setError(t('common.resourceLoadError'));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [id, service, loadAttempt, t, recoveryRequests, recoveryScope]);

  const runOperation = async (
    operation: (actorId: string | null) => Promise<void>,
  ) => {
    if (!isMounted() || inFlight.current || account?.accountId !== id) return;
    const actorId = identity.user?.id ?? null;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await operation(actorId);
    } catch {
      if (isMounted()) setError(t('common.resourceSaveError'));
    } finally {
      if (isMounted()) {
        inFlight.current = false;
        setSubmitting(false);
      }
    }
  };

  const applyAccountChange = async (
    result: Result<AccountDetail>,
    actorId: string | null,
  ) => {
    if (isMounted()) {
      if (result.ok && result.value.accountId === id) {
        setAccount(result.value);
        setMessage(t('accounts.updated'));
        setError(null);
      } else
        setError(
          result.ok ? t('common.resourceSaveError') : result.error.message,
        );
    }
    if (
      result.ok &&
      result.value.accountId === id &&
      actorId !== null &&
      result.value.userId === actorId &&
      currentActor.current === actorId
    ) {
      await identity.refreshAccountContext();
    }
  };

  const changeStatus = async (status: AccountStatus) => {
    if (inFlight.current || !window.confirm(t(`accounts.confirm.${status}`)))
      return;
    await runOperation(async (actorId) => {
      const result = await service.changeAccountStatus({
        accountId: id,
        reason,
        status,
      });
      await applyAccountChange(result, actorId);
    });
  };

  const changeRole = async (
    roleCode: string,
    operation: 'grant' | 'revoke',
  ) => {
    if (inFlight.current || !window.confirm(t(`accounts.confirm.${operation}`)))
      return;
    await runOperation(async (actorId) => {
      const result = await service.manageAccountRole({
        accountId: id,
        operation,
        roleCode,
      });
      await applyAccountChange(result, actorId);
    });
  };

  const recoverInvitation = async () => {
    if (
      inFlight.current ||
      !invitationService ||
      !window.confirm(t('accounts.confirm.recover'))
    ) {
      return;
    }
    await runOperation(async () => {
      let request = recoveryRequests.current.get(recoveryScope);
      if (!request) {
        const normalizedReason = normalizeAdministrativeReason(reason);
        if (!normalizedReason.ok) {
          setError(normalizedReason.error.message);
          return;
        }
        request = {
          idempotencyKey: crypto.randomUUID(),
          reason: normalizedReason.value,
        };
        recoveryRequests.current.set(recoveryScope, request);
      }
      const result = await invitationService.recoverAccountInvitation({
        accountId: id,
        ...request,
      });
      if (!isMounted()) return;
      if (result.ok && result.value.accountId !== id) {
        setError(t('common.resourceSaveError'));
        return;
      }
      if (
        result.ok &&
        result.value.outcome !== 'in_progress' &&
        result.value.outcome !== 'failed'
      ) {
        recoveryRequests.current.delete(recoveryScope);
        try {
          const refreshed = await service.getAccountDetail(id);
          if (!isMounted()) return;
          if (refreshed.ok && refreshed.value.accountId === id)
            setAccount(refreshed.value);
          else {
            setAccount(null);
            setError(
              refreshed.ok
                ? t('common.resourceLoadError')
                : refreshed.error.message,
            );
            return;
          }
        } catch {
          if (!isMounted()) return;
          setAccount(null);
          setError(t('common.resourceLoadError'));
          return;
        }
        setMessage(t('invitations.recoveryStarted'));
        setError(null);
      } else if (result.ok && result.value.outcome === 'in_progress') {
        setMessage(t('invitations.actionInProgress'));
        setError(null);
      } else if (result.ok) {
        recoveryRequests.current.delete(recoveryScope);
        setError(t('invitations.actionFailed'));
      } else {
        setError(result.error.message);
      }
    });
  };

  if (error && !account)
    return (
      <section>
        <Notice tone="error">{error}</Notice>
        <Button
          onClick={() => {
            setError(null);
            setLoadAttempt((attempt) => attempt + 1);
          }}
        >
          {t('common.retry')}
        </Button>
      </section>
    );
  if (!account) return <LoadingState>{t('common.loading')}</LoadingState>;

  return (
    <section className="admin-page">
      <PageHeader
        description={account.email ?? t('common.notAvailable')}
        eyebrow={t('admin.eyebrow')}
        title={account.displayName ?? t('accounts.detailTitle')}
        titleClassName="dynamic-title"
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      <div className="detail-grid">
        <section className="panel">
          <h2>{t('accounts.statusAndActions')}</h2>
          <StatusBadge tone={getAccountStatusTone(account.status)}>
            {t(`accountStatus.${account.status}`)}
          </StatusBadge>
          <Field
            disabled={submitting || recoveryRequests.current.has(recoveryScope)}
            label={t('accounts.reason')}
            minLength={3}
            name="accountReason"
            onChange={(event) => {
              setReason(event.target.value);
            }}
            value={reason}
          />
          <div className="button-row">
            {account.status === 'pending_profile' && canActivate ? (
              <Button
                disabled={submitting}
                onClick={() => void changeStatus('active')}
                variant="primary"
              >
                {t('accounts.activate')}
              </Button>
            ) : null}
            {account.status === 'invited' && canRecover ? (
              <Button
                disabled={submitting}
                onClick={() => void recoverInvitation()}
                variant="primary"
              >
                {t('accounts.recoverInvitation')}
              </Button>
            ) : null}
            {account.status === 'active' && canSuspend ? (
              <Button
                disabled={submitting}
                onClick={() => void changeStatus('suspended')}
                variant="danger"
              >
                {t('accounts.suspend')}
              </Button>
            ) : null}
            {(account.status === 'active' || account.status === 'suspended') &&
            canArchive ? (
              <Button
                disabled={submitting}
                onClick={() => void changeStatus('archived')}
                variant="danger"
              >
                {t('accounts.archive')}
              </Button>
            ) : null}
            {(account.status === 'suspended' ||
              account.status === 'archived') &&
            canReactivate ? (
              <Button
                disabled={submitting}
                onClick={() => void changeStatus('active')}
                variant="primary"
              >
                {t('accounts.reactivate')}
              </Button>
            ) : null}
          </div>
        </section>
        <section className="panel">
          <h2>{t('accounts.roles')}</h2>
          {account.roles.length === 0 ? <p>{t('accounts.noRoles')}</p> : null}
          {account.roles.map((role) => (
            <div className="inline-item" key={role}>
              <StatusBadge>{t(`roles.${role}`)}</StatusBadge>
              {canManageRoles ? (
                <Button
                  disabled={submitting || account.status !== 'active'}
                  onClick={() => void changeRole(role, 'revoke')}
                  variant="danger"
                >
                  {t('accounts.removeRole')}
                </Button>
              ) : null}
            </div>
          ))}
          {canManageRoles
            ? account.grantableRoles.map((role) => (
                <Button
                  disabled={
                    submitting ||
                    account.roles.includes(role.code) ||
                    account.status !== 'active'
                  }
                  key={role.code}
                  onClick={() => void changeRole(role.code, 'grant')}
                >
                  {t('accounts.addRole', { role: t(`roles.${role.code}`) })}
                </Button>
              ))
            : null}
        </section>
        <section className="panel">
          <h2>{t('accounts.history')}</h2>
          <ol className="timeline">
            {account.history.map((entry) => (
              <li key={`${entry.changedAt}-${entry.toStatus}`}>
                <StatusBadge tone={getAccountStatusTone(entry.toStatus)}>
                  {t(`accountStatus.${entry.toStatus}`)}
                </StatusBadge>
                <span>{entry.reason}</span>
                <time>{new Date(entry.changedAt).toLocaleString()}</time>
              </li>
            ))}
          </ol>
        </section>
        <section className="panel">
          <h2>{t('accounts.audit')}</h2>
          <ol className="timeline">
            {account.audit.map((entry) => (
              <li key={`${entry.occurredAt}-${entry.action}`}>
                <strong>{entry.action}</strong>
                <time>{new Date(entry.occurredAt).toLocaleString()}</time>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </section>
  );
}
