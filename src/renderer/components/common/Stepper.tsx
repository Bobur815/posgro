import React from "react";
import styled from "styled-components";
import { Check } from "lucide-react";

// Horizontal stepper: label above each circle, circles joined by a line. A finished step is a
// filled circle with a tick, the current one a filled circle, an upcoming one a hollow ring; the
// line is coloured up to the current step.

interface StepperProps {
  steps: string[];
  /** Index of the step being worked on. Steps before it are shown as done. */
  current: number;
  /** All steps done (the last one included). */
  finished?: boolean;
}

const Wrap = styled.ol`
  display: flex;
  list-style: none;
  margin: 0;
  padding: 0;
`;

const Item = styled.li`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  position: relative;
  min-width: 0;
`;

const StepLabel = styled.span<{ $active: boolean }>`
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  color: ${({ theme }) => theme.colors.primary};
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
`;

const Track = styled.div`
  position: relative;
  width: 100%;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

/** The half-lines either side of a circle; together they join neighbouring circles. */
const Line = styled.span<{ $side: "left" | "right"; $on: boolean }>`
  position: absolute;
  top: 50%;
  height: 2px;
  width: 50%;
  ${({ $side }) => ($side === "left" ? "left: 0;" : "right: 0;")}
  background: ${({ theme, $on }) => ($on ? theme.colors.primary : theme.colors.border)};
  transform: translateY(-50%);
`;

const Dot = styled.span<{ $state: "done" | "current" | "todo" }>`
  position: relative;
  z-index: 1;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: ${({ theme, $state }) =>
    $state === "todo" ? theme.colors.surface : theme.colors.primary};
  border: 2px solid ${({ theme }) => theme.colors.primary};
`;

export function Stepper({ steps, current, finished = false }: StepperProps) {
  return (
    <Wrap>
      {steps.map((label, i) => {
        const state = finished || i < current ? "done" : i === current ? "current" : "todo";
        return (
          <Item key={label} aria-current={state === "current" ? "step" : undefined}>
            <StepLabel $active={state === "current"}>{label}</StepLabel>
            <Track>
              {i > 0 && <Line $side="left" $on={finished || i <= current} />}
              {i < steps.length - 1 && <Line $side="right" $on={finished || i < current} />}
              <Dot $state={state}>{state === "done" && <Check size={16} strokeWidth={3} />}</Dot>
            </Track>
          </Item>
        );
      })}
    </Wrap>
  );
}
