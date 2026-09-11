<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Patch notes

Users see "What's new" from `src/lib/patchNotes.ts`. When a commit changes something a user will notice, end its message with one `Patch-note:` line per change, written for users, in the same final paragraph as the `Co-Authored-By:` lines:

```
Patch-note: Withdraw from your emergency fund.
```

Leave it off docs, refactors, tooling, and fixes no one would notice. Before a release, `npm run patch-notes` drafts an entry from those lines into `src/lib/patchNotes.ts`. Replace its TODO title, edit the wording, and commit it — `npm test` fails while the TODO title is still there.
