import { readerEntryTarget } from '../../core/source.js';
// Replace the transient public entry, so bookmarks/history retain the stable
// reader URL. No document bytes, messages, or caller-selected destination page.
location.replace(readerEntryTarget(location.href));
