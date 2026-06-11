"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther, zeroAddress } from "viem";
import { QUEST_ESCROW_ADDRESS } from "@/lib/contracts/addresses";
import { questEscrowAbi, QUEST_STATUS_LABELS } from "@/lib/contracts/questEscrowAbi";

type QuestTuple = readonly [
  `0x${string}`,
  `0x${string}`,
  string,
  string,
  bigint,
  `0x${string}`,
  bigint,
  bigint,
  bigint,
  number,
  string,
];

export type QuestView = {
  id: bigint;
  poster: string;
  worker: string;
  title: string;
  description: string;
  reward: bigint;
  token: string;
  acceptDeadline: bigint;
  reviewPeriod: bigint;
  reviewDeadline: bigint;
  status: number;
  statusLabel: (typeof QUEST_STATUS_LABELS)[number];
  deliverableUri: string;
  isEth: boolean;
};

export function useQuestCount() {
  return useReadContract({
    address: QUEST_ESCROW_ADDRESS,
    abi: questEscrowAbi,
    functionName: "questCount",
  });
}

export function useQuest(questId: bigint | undefined) {
  const { data, refetch, isLoading } = useReadContract({
    address: QUEST_ESCROW_ADDRESS,
    abi: questEscrowAbi,
    functionName: "getQuest",
    args: questId !== undefined ? [questId] : undefined,
    query: { enabled: questId !== undefined },
  });

  const row = data as QuestTuple | undefined;
  const quest: QuestView | null =
    row && questId !== undefined
      ? {
        id: questId,
        poster: row[0],
        worker: row[1],
        title: row[2],
        description: row[3],
        reward: row[4],
        token: row[5],
        acceptDeadline: row[6],
        reviewPeriod: row[7],
        reviewDeadline: row[8],
        status: row[9],
        statusLabel: QUEST_STATUS_LABELS[row[9]] ?? "Open",
        deliverableUri: row[10],
        isEth: row[5].toLowerCase() === zeroAddress,
      }
      : null;

  return { quest, refetch, isLoading };
}

export function useQuestList() {
  const { data: count } = useQuestCount();
  const publicClient = usePublicClient();
  const [quests, setQuests] = useState<QuestView[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const total = count as bigint | undefined;
    if (!publicClient || !total || total === 0n) {
      setQuests([]);
      return;
    }
    setLoading(true);
    try {
      const items: QuestView[] = [];
      for (let id = 1n; id <= total; id++) {
        const data = (await publicClient.readContract({
          address: QUEST_ESCROW_ADDRESS,
          abi: questEscrowAbi,
          functionName: "getQuest",
          args: [id],
        })) as QuestTuple;
        items.push({
          id,
          poster: data[0],
          worker: data[1],
          title: data[2],
          description: data[3],
          reward: data[4],
          token: data[5],
          acceptDeadline: data[6],
          reviewPeriod: data[7],
          reviewDeadline: data[8],
          status: data[9],
          statusLabel: QUEST_STATUS_LABELS[data[9]] ?? "Open",
          deliverableUri: data[10],
          isEth: data[5].toLowerCase() === zeroAddress,
        });
      }
      setQuests(items.reverse());
    } finally {
      setLoading(false);
    }
  }, [publicClient, count]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { quests, loading, refresh };
}

/** Implement write helpers with useWriteContract + useWaitForTransactionReceipt. */
export function useCreateQuest() {
  const { isConnected } = useAccount();
  const { writeContractAsync,
    data: hash,
    isPending,
    error: writeError
  } = useWriteContract()

  const { isLoading:isConfirming, isSuccess, error: receiptError } = useWaitForTransactionReceipt({
    hash,
    query: {
      enabled: Boolean(hash)
    }
  })
  const createEthQuest = useCallback(
    async (input: {
      title: string;
      description: string;
      rewardEth: string;
      acceptDeadline: Date;
      reviewPeriodHours: number;
    }) => {
      if (!isConnected) {
        throw new Error("Connect MetaMask or another Web3 wallet first");
      }

      const reward = parseEther(input.rewardEth);

      const acceptDeadlineSeconds = BigInt(
        Math.floor(input.acceptDeadline.getTime() / 1000)
      );

      const reviewPeriodSeconds = BigInt(
        Math.floor(input.reviewPeriodHours * 60 * 60)
      );

      if (!input.title.trim()) {
        throw new Error("Title is required");
      }

      if (!input.description.trim()) {
        throw new Error("Description is required");
      }

      if (reward <= 0n) {
        throw new Error("Reward must be greater than 0");
      }

      if (acceptDeadlineSeconds <= BigInt(Math.floor(Date.now() / 1000))) {
        throw new Error("Accept deadline must be in the future");
      }

      if (reviewPeriodSeconds <= 0n) {
        throw new Error("Review period must be greater than 0");
      }

      return writeContractAsync({
        address: QUEST_ESCROW_ADDRESS,
        abi: questEscrowAbi,
        functionName: "createQuest",
        args: [
          input.title,
          input.description,
          reward,
          acceptDeadlineSeconds,
          reviewPeriodSeconds,
          zeroAddress,
        ],
        value: reward,
      });
    },
    [isConnected, writeContractAsync]
  );

  return {
    createEthQuest,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error: writeError ?? receiptError,
  };
}

export function useQuestActions(questId: bigint) {
  const { isConnected } = useAccount();

  const {
    writeContractAsync,
    data: hash,
    isPending,
    error: writeError,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash,
    query: {
      enabled: Boolean(hash),
    },
  });

  const ensureConnected = useCallback(() => {
    if (!isConnected) {
      throw new Error("Connect MetaMask or another Web3 wallet first");
    }
  }, [isConnected]);

  const accept = useCallback(async (): Promise<void> => {
    ensureConnected();

    await writeContractAsync({
      address: QUEST_ESCROW_ADDRESS,
      abi: questEscrowAbi,
      functionName: "acceptQuest",
      args: [questId],
    });
  }, [ensureConnected, writeContractAsync, questId]);

  const submit = useCallback(
    async (deliverableUri: string): Promise<void> => {
      ensureConnected();

      if (!deliverableUri.trim()) {
        throw new Error("Deliverable URI is required");
      }

      await writeContractAsync({
        address: QUEST_ESCROW_ADDRESS,
        abi: questEscrowAbi,
        functionName: "submitWork",
        args: [questId, deliverableUri],
      });
    },
    [ensureConnected, writeContractAsync, questId]
  );

  const approve = useCallback(async (): Promise<void> => {
    ensureConnected();

    await writeContractAsync({
      address: QUEST_ESCROW_ADDRESS,
      abi: questEscrowAbi,
      functionName: "approveAndPay",
      args: [questId],
    });
  }, [ensureConnected, writeContractAsync, questId]);

  const claimTimeout = useCallback(async (): Promise<void> => {
    ensureConnected();

    await writeContractAsync({
      address: QUEST_ESCROW_ADDRESS,
      abi: questEscrowAbi,
      functionName: "claimTimeoutPayout",
      args: [questId],
    });
  }, [ensureConnected, writeContractAsync, questId]);

  const cancel = useCallback(async (): Promise<void> => {
    ensureConnected();

    await writeContractAsync({
      address: QUEST_ESCROW_ADDRESS,
      abi: questEscrowAbi,
      functionName: "cancelQuest",
      args: [questId],
    });
  }, [ensureConnected, writeContractAsync, questId]);

  const refund = useCallback(async (): Promise<void> => {
    ensureConnected();

    await writeContractAsync({
      address: QUEST_ESCROW_ADDRESS,
      abi: questEscrowAbi,
      functionName: "refundPoster",
      args: [questId],
    });
  }, [ensureConnected, writeContractAsync, questId]);

  return {
    accept,
    submit,
    approve,
    claimTimeout,
    cancel,
    refund,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error: writeError ?? receiptError,
  };
}
