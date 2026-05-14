/**
 * bun run format:data — normalises entity JSON files: strips
 * default-equal fields per CONVENTIONS.md § "Entity JSON".
 * Phase 1 implementation: stub that just reports it would run; the full
 * normaliser lands when the first entity file is committed and we
 * observe what dprint already takes care of vs what needs custom work.
 */
process.stdout.write(
  'format:data is a Phase 1 stub. Entity JSON files are currently '
    + 'normalised by dprint and validated by `bun run validate`.\n',
);
