"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  fetchModels,
  modelsQueryKey,
  saveModel,
  type ModelsResponse,
} from "@/lib/api/models";

export const useModels = (
  userId: number,
): UseQueryResult<ModelsResponse, Error> =>
  useQuery({
    queryKey: modelsQueryKey(userId),
    queryFn: fetchModels,
    // The catalogue barely moves; no need to poll it alongside the data queries.
    staleTime: 5 * 60 * 1000,
  });

export const useSetModel = (
  userId: number,
): UseMutationResult<void, Error, string> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveModel,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: modelsQueryKey(userId) }),
  });
};
