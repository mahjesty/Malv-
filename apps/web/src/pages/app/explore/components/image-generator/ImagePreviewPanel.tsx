import { MessageThread } from "./MessageThread";
import type { ThreadMessage } from "./types";

type Props = {
  threadClassName?: string;
  messages: ThreadMessage[];
};

export function ImagePreviewPanel({ threadClassName, messages }: Props) {
  if (messages.length === 0) {
    return null;
  }

  return <MessageThread className={threadClassName} messages={messages} />;
}
