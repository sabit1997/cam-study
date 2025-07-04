import * as Tooltip from "@radix-ui/react-tooltip";
import { ReactNode } from "react";

interface TooltipWrapperProps {
  content: string;
  children: ReactNode;
}

const TooltipWrapper = ({ content, children }: TooltipWrapperProps) => {
  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="center"
            sideOffset={8}
            className="z-50 rounded bg-dark px-3 py-1.5 text-sm text-[var(--text-selected)] shadow-lg"
          >
            {content}
            <Tooltip.Arrow className="fill-dark" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};

export default TooltipWrapper;
