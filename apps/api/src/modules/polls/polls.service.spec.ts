import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { InMemoryDatabase } from "../../core/in-memory-database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { RequestUser } from "../../core/types.js";
import { PollsService } from "./polls.service.js";

async function makeRequestUser(db: InMemoryDatabase, telegramId: number, username: string): Promise<RequestUser> {
  const user = await db.upsertTelegramUser({ telegramId, username });
  await db.ensureMember("main", user.id);
  return {
    userId: user.id,
    telegramId: user.telegramId
  };
}

function createFixture() {
  const db = new InMemoryDatabase();
  const policy = new PolicyService(db);
  const pollsService = new PollsService(db, policy);
  return { db, pollsService };
}

describe("PollsService", () => {
  it("creates poll, accepts vote, and returns aggregated results", async () => {
    const { db, pollsService } = createFixture();
    const pollRole = await db.createRole({
      chatId: "main",
      name: "poll_operator",
      priority: 1400,
      isDefault: false,
      permissions: ["message.send.poll", "poll.quiz.results.view"]
    });
    const creator = await makeRequestUser(db, 980001, "poll_creator");
    const voter = await makeRequestUser(db, 980002, "poll_voter");
    await db.updateMemberRole("main", creator.userId, pollRole.id);

    const poll = await pollsService.createPoll("main", creator, {
      question: "Best color?",
      options: ["Red", "Blue", "Green"]
    });
    expect(poll.status).toBe("open");

    const voted = await pollsService.vote("main", poll.id, voter, {
      option_indexes: [1]
    });
    expect(voted.ok).toBe(true);

    const results = await pollsService.results("main", poll.id, creator);
    expect(results.totalVotes).toBe(1);
    expect(results.options.find((item) => item.optionIndex === 1)?.votes).toBe(1);
  });

  it("blocks second vote from same user", async () => {
    const { db, pollsService } = createFixture();
    const pollRole = await db.createRole({
      chatId: "main",
      name: "poll_operator_second_vote",
      priority: 1400,
      isDefault: false,
      permissions: ["message.send.poll", "chat.view"]
    });
    const creator = await makeRequestUser(db, 980003, "poll_creator_2");
    await db.updateMemberRole("main", creator.userId, pollRole.id);

    const poll = await pollsService.createPoll("main", creator, {
      question: "One vote?",
      options: ["Yes", "No"]
    });

    await pollsService.vote("main", poll.id, creator, {
      option_indexes: [0]
    });

    await expect(
      pollsService.vote("main", poll.id, creator, {
        option_indexes: [1]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("denies quiz creation without poll.quiz.create", async () => {
    const { db, pollsService } = createFixture();
    const member = await makeRequestUser(db, 980004, "plain_member");

    await expect(
      pollsService.createPoll("main", member, {
        question: "Quiz?",
        options: ["A", "B"],
        is_quiz: true,
        correct_option_indexes: [0]
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
