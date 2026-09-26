import { normalizeSettings } from '../core/settings.js';

// Pending edits survive locale rebuilds, storage notifications and failed writes.
// Keep writes serial and reread their base; never retry user mutations implicitly.
export function createSettingsStore(initial, {read, write, changed}) {
  let committed=normalizeSettings(initial), queue=Promise.resolve(), observation=0;
  const pending=[];
  const apply=(base, edit)=>edit.reset ? normalizeSettings() : normalizeSettings({...base,
    [edit.key]:edit.key==='toolbarHidden' ? {...base.toolbarHidden,...edit.value} : edit.value});
  const publish=()=>changed(pending.reduce(apply,committed));
  function enqueue(edit) {
    pending.push(edit); publish();
    const result=queue.catch(()=>{}).then(async()=>{
      try {
        const next=apply(await read(),edit);
        await write(next);
        // A storage event for a newer external edit may arrive before this
        // write's callback. Never publish the older submitted snapshot last.
        const revision=observation;
        const latest=await read().catch(()=>next);
        if(revision===observation)committed=normalizeSettings(latest);
      } finally {
        pending.splice(pending.indexOf(edit),1); publish();
      }
    });
    queue=result;
    return result;
  }
  return {save:(key,value)=>enqueue({key,value}),reset:()=>enqueue({reset:true}),
    receive(next){observation++;committed=normalizeSettings(next);publish();}};
}
