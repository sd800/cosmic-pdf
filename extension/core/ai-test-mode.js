// Development controls, separate from the saved API provider and key slots.
export const AI_TEST_MODE_KEY='ai-test-mode';
export const AI_TEST_MODEL=Object.freeze({model:'Test mode'});
export function normalizeAiTestMode(value){
  const enabled=value?.enabled===true;
  return {enabled,selected:enabled&&value?.selected===true};
}
