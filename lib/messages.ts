import type { FrameKind } from './types';

/** Frame content script → background: the item name in this frame changed. */
export interface FrameItemMessage {
  type: 'ghl:frame-item';
  kind: FrameKind;
  name: string | null;
  frameUrl: string;
}

/** Background → top frame: a frame's report, tagged with its frame ID. */
export interface FrameItemRelayMessage {
  type: 'ghl:frame-item-relay';
  kind: FrameKind;
  name: string | null;
  frameUrl: string;
  frameId: number;
}

/** Top frame → background → all frames: please send your current item again. */
export interface FramesResendMessage {
  type: 'ghl:frames-resend';
}

/** Popup → top frame: return a DebugInfo object. */
export interface GetDebugMessage {
  type: 'ghl:get-debug';
}

export type ExtensionMessage =
  | FrameItemMessage
  | FrameItemRelayMessage
  | FramesResendMessage
  | GetDebugMessage;

export function isMessage<T extends ExtensionMessage['type']>(
  value: unknown,
  type: T,
): value is Extract<ExtensionMessage, { type: T }> {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === type;
}
