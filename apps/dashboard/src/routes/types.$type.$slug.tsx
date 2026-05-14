import { Content } from '@onepiece-wiki/ui';
import { createFileRoute } from '@tanstack/react-router';
import { type JSX, useEffect, useState } from 'react';
import { api, type EntityDetail, type SchemaCatalogue } from '../api.ts';
import { EntityForm } from '../form/EntityForm.tsx';

export const Route = createFileRoute('/types/$type/$slug')({
  component: EntityEditComponent,
});

function EntityEditComponent(): JSX.Element {
  const { type, slug } = Route.useParams() as { type: string; slug: string; };
  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [schemas, setSchemas] = useState<SchemaCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getEntity(type, slug), api.schemas()])
      .then(([e, s]) => {
        setEntity(e);
        setSchemas(s);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [type, slug]);

  if (error !== null) {
    return (
      <Content>
        <p className='text-danger'>Failed: {error}</p>
      </Content>
    );
  }
  if (entity === null || schemas === null) {
    return (
      <Content>
        <p className='text-text-muted'>Loading…</p>
      </Content>
    );
  }

  const entityType = schemas.entityTypes[type];
  if (entityType === undefined) {
    return (
      <Content>
        <p className='text-danger'>No entity-type schema for {type}.</p>
      </Content>
    );
  }

  return (
    <Content>
      <h2 className='mb-2 text-lg font-semibold'>
        <code className='font-mono'>{entity.id}</code>
      </h2>
      {savedNote !== null ? <p className='text-accent mb-3 text-sm'>{savedNote}</p> : null}
      <EntityForm
        entityType={entityType}
        propertyTypes={schemas.propertyTypes}
        initialData={entity.data}
        onSave={async (next) => {
          const saved = await api.saveEntity(type, slug, next);
          setEntity(saved);
          setSavedNote(`Saved at ${new Date().toLocaleTimeString()}.`);
        }}
      />
    </Content>
  );
}
