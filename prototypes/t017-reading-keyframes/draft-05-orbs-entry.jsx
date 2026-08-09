import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ThinkingOrb } from "thinking-orbs";

const ORB_STATES = {
  resting: { orb: "breathing", label: "准备好了" },
  listening: { orb: "listening", label: "正在听你说" },
  thinking: { orb: "solving", label: "正在整理你的理解" },
  speaking: { orb: "weaving", label: "陪读正在回应" },
};

function DraftOrb({ size, theme, labelPrefix }) {
  const [activity, setActivity] = useState({ state: "resting", paused: true });

  useEffect(() => {
    function handleOrbState(event) {
      const state = event.detail?.state;
      if (!ORB_STATES[state]) return;

      setActivity({
        state,
        paused: state === "resting" && event.detail?.paused === true,
      });
    }

    window.addEventListener("draft05:orb-state", handleOrbState);
    return () => window.removeEventListener("draft05:orb-state", handleOrbState);
  }, []);

  const presentation = ORB_STATES[activity.state];

  return (
    <ThinkingOrb
      state={presentation.orb}
      size={size}
      theme={theme}
      paused={activity.paused}
      aria-label={`${labelPrefix}：${presentation.label}`}
    />
  );
}

const miniMount = document.querySelector("[data-thinking-orb-mini]");
const mainMount = document.querySelector("[data-thinking-orb-main]");

createRoot(miniMount).render(<DraftOrb size={20} theme="light" labelPrefix="陪读状态" />);
createRoot(mainMount).render(<DraftOrb size={64} theme="dark" labelPrefix="实时陪读" />);
