import React from 'react';
import { PinPromptModal } from './PinPromptModal';
import { PinSetupModal } from './PinSetupModal';
import type { useSensitiveAction } from '../hooks/useSensitiveAction';

export function SensitiveActionModals({
  action,
}: {
  action: ReturnType<typeof useSensitiveAction>;
}) {
  return (
    <>
      <PinSetupModal
        visible={action.setupVisible}
        onComplete={(pin) => void action.onSetupComplete(pin)}
        onCancel={action.onSetupCancel}
      />
      <PinPromptModal
        visible={action.promptVisible}
        busy={action.busy}
        error={action.pinError}
        onSubmit={(pin) => void action.onPromptSubmit(pin)}
        onCancel={action.onPromptCancel}
      />
    </>
  );
}
