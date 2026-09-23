"use client";

import { ChevronDown } from "lucide-react";

import { useModels, useSetModel } from "@/hooks/use-models";

/** "openai/gpt-oss-120b" reads better as "gpt-oss-120b" in a 30rem rail. */
const shortName = (id: string): string => id.split("/").at(-1) ?? id;

export const ModelPicker = ({ userId }: { userId: number }) => {
  const { data, isPending, error } = useModels(userId);
  const setModel = useSetModel(userId);

  if (error) {
    return (
      <span className="text-[0.75rem] text-[var(--co-error)]">
        {error.message}
      </span>
    );
  }

  if (isPending || !data) {
    return (
      <span className="font-mono text-[0.6875rem] tracking-[0.28px] text-[var(--co-muted)] uppercase">
        Loading models…
      </span>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <label
        htmlFor="model-picker"
        className="font-mono text-[0.6875rem] tracking-[0.28px] text-[var(--co-muted)] uppercase"
      >
        Model
      </label>

      <div className="relative inline-flex min-w-0 items-center">
        <select
          id="model-picker"
          value={data.selected}
          disabled={setModel.isPending}
          onChange={(event) => setModel.mutate(event.target.value)}
          className="w-full appearance-none rounded-[var(--radius-xs)] border border-transparent bg-transparent py-0.5 pr-5 pl-1 font-mono text-[0.75rem] text-[var(--co-body-muted)] transition-colors hover:border-[var(--co-hairline)] focus-visible:border-[var(--co-form-focus)] disabled:opacity-50"
        >
          {data.models.map((model) => (
            <option key={model.id} value={model.id}>
              {shortName(model.id)}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          aria-hidden="true"
          className="pointer-events-none absolute right-1 text-[var(--co-muted)]"
        />
      </div>

      {/* Surfaced, not swallowed: a rejected model id says so rather than silently
          reverting the dropdown. */}
      {setModel.error ? (
        <span className="text-[0.6875rem] text-[var(--co-error)]">
          {setModel.error.message}
        </span>
      ) : null}
    </div>
  );
};
