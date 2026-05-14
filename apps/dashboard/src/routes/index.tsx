import { Card, Content } from '@onepiece-wiki/ui';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type JSX, useEffect, useState } from 'react';
import { api, type SchemaCatalogue } from '../api.ts';

export const Route = createFileRoute('/')({
  component: IndexComponent,
});

function IndexComponent(): JSX.Element {
  const [schemas, setSchemas] = useState<SchemaCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.schemas().then(setSchemas).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, []);

  if (error !== null) {
    return (
      <Content>
        <p className='text-danger'>Failed to load schemas: {error}</p>
      </Content>
    );
  }
  if (schemas === null) {
    return (
      <Content>
        <p className='text-text-muted'>Loading…</p>
      </Content>
    );
  }

  const types = Object.values(schemas.entityTypes).sort((a, b) => a.id.localeCompare(b.id));

  return (
    <Content>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        {types.map((t) => (
          <Link
            key={t.id}
            to='/types/$type'
            params={{ type: t.id }}
            className='no-underline'
          >
            <Card title={<code className='font-mono'>{t.id}</code>}>
              <p className='text-text-muted text-sm'>
                {t.labels.en} · {t.properties.length} properties
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </Content>
  );
}
