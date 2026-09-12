import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import {
  Button,
  EmptyState,
  Field,
  LoadingState,
  Notice,
  PageHeader,
  StatusBadge,
} from '@sistema-voluntariado/ui';

import type { AccountAdministrationService } from '../application/account-administration-service';
import type { AccountSummary } from '../domain/account-administration';
import { getAccountStatusTone } from './status-badge-tone';

export function AccountsPage({
  service,
}: {
  readonly service: AccountAdministrationService;
}) {
  const [accounts, setAccounts] = useState<readonly AccountSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const { t } = useTranslation();

  const load = useCallback(
    async (requestedSearch = '') => {
      const generation = ++requestGeneration.current;
      setLoading(true);
      const result = await service.listAccounts({ search: requestedSearch });
      if (generation !== requestGeneration.current) return;
      if (result.ok) {
        setAccounts(result.value);
        setError(null);
      } else {
        setError(result.error.message);
      }
      setLoading(false);
    },
    [service],
  );

  useEffect(() => {
    const generation = ++requestGeneration.current;
    void service.listAccounts().then((result) => {
      if (generation !== requestGeneration.current) return;
      if (result.ok) {
        setAccounts(result.value);
        setError(null);
      } else {
        setError(result.error.message);
      }
      setLoading(false);
    });
    return () => {
      requestGeneration.current += 1;
    };
  }, [service]);

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    void load(search);
  };

  return (
    <section className="admin-page">
      <PageHeader
        description={t('accounts.description')}
        eyebrow={t('admin.eyebrow')}
        title={t('accounts.title')}
      />
      <form
        className="search-row search-row--single toolbar-form"
        onSubmit={submit}
      >
        <Field
          label={t('accounts.search')}
          name="accountSearch"
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          value={search}
        />
        <Button type="submit" variant="primary">
          {t('accounts.searchAction')}
        </Button>
      </form>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading ? <LoadingState>{t('common.loading')}</LoadingState> : null}
      {!loading && accounts.length === 0 ? (
        <EmptyState title={t('accounts.empty')} />
      ) : null}
      <div className="data-list">
        {accounts.map((account) => (
          <article
            className="data-card data-card--account"
            key={account.accountId}
          >
            <div>
              <strong>{account.displayName ?? t('common.notProvided')}</strong>
              <p>{account.email ?? t('common.notAvailable')}</p>
            </div>
            <StatusBadge tone={getAccountStatusTone(account.status)}>
              {t(`accountStatus.${account.status}`)}
            </StatusBadge>
            <div className="badge-group">
              {account.roles.length > 0 ? (
                account.roles.map((role) => (
                  <StatusBadge key={role}>{t(`roles.${role}`)}</StatusBadge>
                ))
              ) : (
                <span className="muted">{t('accounts.noRoles')}</span>
              )}
            </div>
            <div className="data-card__link">
              <Link to={`/app/admin/accounts/${account.accountId}`}>
                {t('accounts.view')}
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
