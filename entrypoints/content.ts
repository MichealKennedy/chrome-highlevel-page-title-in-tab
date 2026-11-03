import { defineContentScript } from '#imports';
import { startChildFrame } from '@/lib/child-frame';
import { startTopFrame } from '@/lib/top-frame';

export default defineContentScript({
  // Any site: HighLevel runs on custom white-label domains, so the script detects HighLevel
  // from the page itself and stays idle everywhere else.
  matches: ['http://*/*', 'https://*/*'],
  allFrames: true,
  runAt: 'document_idle',
  noScriptStartedPostMessage: true,
  main(ctx) {
    if (window.top === window) startTopFrame(ctx);
    else void startChildFrame(ctx);
  },
});
