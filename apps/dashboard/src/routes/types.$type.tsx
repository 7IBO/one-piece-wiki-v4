import { Card, Content } from '@onepiece-wiki/ui';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type JSX, useEffect, useState } from 'react';
import { api, type EntityRef } from '../api.ts';

export const Route = createFileRoute('/types/$type')({
  component: TypeListComponent,
});

function TypeListComponent(): JSX.Element {
  const { type } = Route.useParams() as { type: string; };
  const [list, setList] = useState<EntityRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setList(null);
    api.listEntities(type).then(setList).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [type]);

  if (error !== null) {
    return (
      <Content>
        <p className='text-danger'>Failed: {error}</p>
      </Content>
    );
  }

  return (
    <Content>
      <h2 className='mb-3 text-lg font-semibold'>
        <code className='font-mono'>{type}</code>
        <span className='text-text-muted ml-2 text-sm'>
          ({list?.length ?? '…'})
        </span>
      </h2>
      {list === null ? <p className='text-text-muted'>Loading…</p> : (
        <Card>
          <ul className='space-y-1 text-sm'>
            {list.map((e) => (
              <li key={e.id}>
                <Link
                  to='/types/$type/$slug'
                  params={{ type: e.type, slug: e.slug }}
                  className='text-accent hover:underline'
                >
                  <code className='font-mono'>{e.slug}</code>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Content>
  );
}
