"use client";

import {
  AssistantRuntimeProvider,
  type ThreadMessage,
  useLocalRuntime,
} from "@assistant-ui/react";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from "react";

import {
  createAnthropicAdapter,
  isAnthropicConfigured,
} from "./adapters/anthropic";
import {
  createOllamaAdapter,
  getOllamaConfig,
  isOllamaConfigured,
} from "./adapters/ollama";
import { createTestAdapter } from "./adapters/test";
import { withToolCommands } from "./adapters/withToolCommands";
import { ToolUIRegistry } from "@/components/tool-ui/ToolUIRegistry";
import { ResearchProvider, useResearchContext } from "./ResearchContext";

type RuntimeErrorState = {
  message: string;
  detail?: string;
};

const RuntimeErrorContext = createContext<RuntimeErrorState | null>(null);

export const useRuntimeError = () => useContext(RuntimeErrorContext);

const initialMessages: ThreadMessage[] = [
  {
    id: "welcome-message",
    createdAt: new Date(),
    role: "assistant",
    content: [
      {
        type: "text",
        text: "Welcome to the Workbench. Ask a question to start the thread.",
      },
    ],
    status: {
      type: "complete",
      reason: "stop",
    },
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: {},
    },
  },
];

const RuntimeContent = ({ children }: PropsWithChildren) => {
  const [runtimeError, setRuntimeError] = useState<RuntimeErrorState | null>(
    null
  );
  const { researchPrompt } = useResearchContext();

  const adapter = useMemo(
    () =>
      (() => {
        const forceTestAdapter = ["1", "true"].includes(
          (process.env.NEXT_PUBLIC_USE_TEST_ADAPTER ?? "").toLowerCase()
        );
        const handlers = {
          onError: (error: unknown) =>
            setRuntimeError({
              message: "Runtime error",
              detail: error instanceof Error ? error.message : String(error),
            }),
          onResponse: () => setRuntimeError(null),
        };

        const createAdapter = () => {
          if (forceTestAdapter) {
            return createTestAdapter(handlers);
          }

          if (isOllamaConfigured()) {
            const { baseUrl, model } = getOllamaConfig();
            return createOllamaAdapter({
              baseUrl,
              model,
              ...handlers,
            });
          }

          if (isAnthropicConfigured()) {
            return createAnthropicAdapter(handlers);
          }

          return createTestAdapter(handlers);
        };

        return withToolCommands(createAdapter(), {
          systemPromptOverride: researchPrompt,
        });
      })(),
    [researchPrompt]
  );

  const runtime = useLocalRuntime(adapter, { initialMessages });

  return (
    <RuntimeErrorContext.Provider value={runtimeError}>
      <AssistantRuntimeProvider runtime={runtime}>
        <ToolUIRegistry />
        {children}
      </AssistantRuntimeProvider>
    </RuntimeErrorContext.Provider>
  );
};

export const WorkbenchRuntimeProvider = ({
  children,
}: PropsWithChildren) => {
  return (
    <ResearchProvider>
      <RuntimeContent>{children}</RuntimeContent>
    </ResearchProvider>
  );
};
