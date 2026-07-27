import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button, Field } from '@sistema-voluntariado/ui';

import type { AccountAdministrationService } from '../application/account-administration-service';
import type { AccountSummary } from '../domain/account-administration';

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
      <header className="page-heading">
        <p className="eyebrow">{t('admin.eyebrow')}</p>
        <h1>{t('accounts.title')}</h1>
        <p className="muted">{t('accounts.description')}</p>
      </header>
      <form className="search-row" onSubmit={submit}>
        <Field
          label={t('accounts.search')}
          name="accountSearch"
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          value={search}
        />
        <Button type="submit">{t('accounts.searchAction')}</Button>
      </form>
      {error ? <p className="notice notice--error">{error}</p> : null}
      {loading ? <p role="status">{t('common.loading')}</p> : null}
      {!loading && accounts.length === 0 ? <p>{t('accounts.empty')}</p> : null}
      <div className="data-list">
        {accounts.map((account) => (
          <article className="data-card" key={account.accountId}>
            <div>
              <strong>{account.displayName ?? t('common.notProvided')}</strong>
              <p>{account.email ?? t('common.notAvailable')}</p>
            </div>
            <p>{t(`accountStatus.${account.status}`)}</p>
            <p>
              {account.roles.map((role) => t(`roles.${role}`)).join(', ') ||
                t('accounts.noRoles')}
            </p>
            <Link to={`/app/admin/accounts/${account.accountId}`}>
              {t('accounts.view')}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
