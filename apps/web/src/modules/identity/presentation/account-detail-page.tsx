import { useEffect, useRef, useState } from 'react';
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
import type { AccountStatus } from '../domain/account-lifecycle';
import { useIdentity } from './identity-context';
import { getAccountStatusTone } from './status-badge-tone';

export function AccountDetailPage({
  invitationService,
  service,
}: {
  readonly invitationService?: InvitationAdministrationService;
  readonly service: AccountAdministrationService;
}) {
  const { id = '' } = useParams();
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [reason, setReason] = useState('Cambio administrativo autorizado');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const recoveryIdempotencyKeys = useRef(new Map<string, string>());
  const identity = useIdentity();
  const { t } = useTranslation();
  const permissions = identity.account?.permissions ?? [];
  const canActivate = permissions.includes('account.activate');
  const canRecover = permissions.includes('invitation.recover');
  const canArchive = permissions.includes('account.archive');
  const canManageRoles = permissions.includes('role_assignment.manage');
  const canReactivate = permissions.includes('account.reactivate');
  const canSuspend = permissions.includes('account.suspend');

  useEffect(() => {
    let active = true;
    void service.getAccountDetail(id).then((result) => {
      if (!active) return;
      if (result.ok) {
        setAccount(result.value);
        setError(null);
      } else {
        setError(result.error.message);
      }
    });
    return () => {
      active = false;
    };
  }, [id, service]);

  const changeStatus = async (status: AccountStatus) => {
    if (!window.confirm(t(`accounts.confirm.${status}`))) return;
    setSubmitting(true);
    const result = await service.changeAccountStatus({
      accountId: id,
      reason,
      status,
    });
    if (result.ok) {
      setAccount(result.value);
      setMessage(t('accounts.updated'));
      setError(null);
      if (result.value.userId === identity.user?.id) {
        await identity.refreshAccountContext();
      }
    } else {
      setError(result.error.message);
    }
    setSubmitting(false);
  };

  const changeRole = async (
    roleCode: string,
    operation: 'grant' | 'revoke',
  ) => {
    if (!window.confirm(t(`accounts.confirm.${operation}`))) return;
    setSubmitting(true);
    const result = await service.manageAccountRole({
      accountId: id,
      operation,
      roleCode,
    });
    if (result.ok) {
      setAccount(result.value);
      setMessage(t('accounts.updated'));
      setError(null);
      if (result.value.userId === identity.user?.id) {
        await identity.refreshAccountContext();
      }
    } else {
      setError(result.error.message);
    }
    setSubmitting(false);
  };

  const recoverInvitation = async () => {
    if (!invitationService || !window.confirm(t('accounts.confirm.recover'))) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setMessage(null);
    const idempotencyKey =
      recoveryIdempotencyKeys.current.get(id) ?? crypto.randomUUID();
    recoveryIdempotencyKeys.current.set(id, idempotencyKey);
    const result = await invitationService.recoverAccountInvitation({
      accountId: id,
      idempotencyKey,
      reason,
    });
    if (
      result.ok &&
      result.value.outcome !== 'in_progress' &&
      result.value.outcome !== 'failed'
    ) {
      recoveryIdempotencyKeys.current.delete(id);
      const refreshed = await service.getAccountDetail(id);
      if (refreshed.ok) setAccount(refreshed.value);
      setMessage(t('invitations.recoveryStarted'));
      setError(null);
    } else if (result.ok && result.value.outcome === 'in_progress') {
      setMessage(t('invitations.actionInProgress'));
      setError(null);
    } else if (result.ok) {
      recoveryIdempotencyKeys.current.delete(id);
      setError(t('invitations.actionFailed'));
    } else {
      setError(result.error.message);
    }
    setSubmitting(false);
  };

  if (error && !account) return <Notice tone="error">{error}</Notice>;
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
