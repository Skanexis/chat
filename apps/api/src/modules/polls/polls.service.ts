import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { DATABASE_SERVICE } from "../../core/database.service.js";
import type { DatabaseService } from "../../core/database.service.js";
import { PolicyService } from "../../core/policy.service.js";
import type { ChatMember, RequestUser } from "../../core/types.js";
import type { ClosePollDto, CreatePollDto, VotePollDto } from "./polls.dto.js";

@Injectable()
export class PollsService {
  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly policy: PolicyService
  ) {}

  async createPoll(chatId: string, requestUser: RequestUser, dto: CreatePollDto) {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);

    if (dto.is_quiz === true) {
      await this.policy.assertCan(chatId, member, "poll.quiz.create");
    } else {
      await this.policy.assertCan(chatId, member, "message.send.poll");
    }

    this.assertOptions(dto.options);
    const allowMultiple = dto.allow_multiple ?? false;
    const correctIndexes = dto.correct_option_indexes ?? [];
    const closesAt = this.parseOptionalIso(dto.closes_at, "closes_at");
    this.assertCorrectIndexes(dto.is_quiz === true, correctIndexes, dto.options.length, allowMultiple);

    if (dto.allowed_role_ids && dto.allowed_role_ids.length > 0) {
      const roles = await this.db.listRoles(chatId);
      const roleSet = new Set(roles.map((role) => role.id));
      for (const roleId of dto.allowed_role_ids) {
        if (!roleSet.has(roleId)) {
          throw new BadRequestException(`Allowed role does not exist: ${roleId}`);
        }
      }
    }

    const created = await this.db.createPoll({
      chatId,
      question: dto.question.trim(),
      options: dto.options.map((item) => item.trim()),
      allowMultiple,
      isAnonymous: dto.is_anonymous ?? false,
      isQuiz: dto.is_quiz ?? false,
      correctOptionIndexes: correctIndexes,
      allowedRoleIds: dto.allowed_role_ids ?? [],
      closesAt,
      status: "open",
      createdBy: requestUser.userId
    });

    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "poll.create",
      targetType: "poll",
      targetId: created.id,
      payload: dto as unknown as Record<string, unknown>
    });

    return created;
  }

  async vote(chatId: string, pollId: string, requestUser: RequestUser, dto: VotePollDto) {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "chat.view");

    const poll = await this.db.getPoll(chatId, pollId);
    if (poll.status !== "open") {
      throw new BadRequestException("Poll is closed.");
    }

    if (poll.closesAt && Date.parse(poll.closesAt) <= Date.now()) {
      await this.db.updatePoll(chatId, pollId, { status: "closed" });
      throw new BadRequestException("Poll voting window is closed.");
    }

    if (poll.allowedRoleIds.length > 0 && !poll.allowedRoleIds.includes(member.roleId)) {
      throw new BadRequestException("Your role is not allowed to vote in this poll.");
    }

    this.assertVoteIndexes(dto.option_indexes, poll.options.length, poll.allowMultiple);

    const existing = await this.db.getPollVote(chatId, pollId, requestUser.userId);
    if (existing) {
      throw new BadRequestException("User has already voted in this poll.");
    }

    const vote = await this.db.createPollVote({
      chatId,
      pollId,
      userId: requestUser.userId,
      optionIndexes: dto.option_indexes
    });
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "poll.vote",
      targetType: "poll",
      targetId: pollId,
      payload: {
        optionIndexes: dto.option_indexes
      }
    });

    return {
      ok: true,
      voteId: vote.id
    };
  }

  async close(chatId: string, pollId: string, requestUser: RequestUser, dto: ClosePollDto = {}) {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "poll.quiz.close");

    const poll = await this.db.getPoll(chatId, pollId);
    if (poll.status === "closed") {
      throw new BadRequestException("Poll is already closed.");
    }

    const updated = await this.db.updatePoll(chatId, pollId, { status: "closed" });
    await this.db.addAuditLog({
      chatId,
      actorId: requestUser.userId,
      action: "poll.close",
      targetType: "poll",
      targetId: pollId,
      payload: {
        reason: dto.reason ?? null
      }
    });
    return updated;
  }

  async results(chatId: string, pollId: string, requestUser: RequestUser) {
    const member = await this.db.ensureMember(chatId, requestUser.userId);
    this.policy.assertMemberCanOperate(member);
    await this.policy.assertCan(chatId, member, "poll.quiz.results.view");

    const poll = await this.db.getPoll(chatId, pollId);
    const votes = await this.db.listPollVotes(chatId, pollId);
    const counts = poll.options.map((option, index) => {
      const total = votes.filter((vote) => vote.optionIndexes.includes(index)).length;
      return {
        optionIndex: index,
        option,
        votes: total
      };
    });

    return {
      pollId: poll.id,
      status: poll.status,
      totalVotes: votes.length,
      allowMultiple: poll.allowMultiple,
      isQuiz: poll.isQuiz,
      correctOptionIndexes: poll.isQuiz ? poll.correctOptionIndexes : [],
      options: counts
    };
  }

  private assertOptions(options: string[]): void {
    if (!Array.isArray(options) || options.length < 2) {
      throw new BadRequestException("Poll requires at least 2 options.");
    }
    if (options.length > 12) {
      throw new BadRequestException("Poll supports at most 12 options.");
    }
    const normalized = options.map((item) => item.trim().toLowerCase());
    if (normalized.some((item) => item.length === 0)) {
      throw new BadRequestException("Poll options cannot be empty.");
    }
    if (new Set(normalized).size !== normalized.length) {
      throw new BadRequestException("Poll options must be unique.");
    }
  }

  private assertCorrectIndexes(isQuiz: boolean, indexes: number[], optionCount: number, allowMultiple: boolean): void {
    if (!isQuiz && indexes.length > 0) {
      throw new BadRequestException("correct_option_indexes is allowed only for quiz polls.");
    }
    if (!isQuiz) {
      return;
    }
    if (indexes.length === 0) {
      throw new BadRequestException("Quiz poll requires at least one correct option index.");
    }
    if (!allowMultiple && indexes.length !== 1) {
      throw new BadRequestException("Single-choice quiz must have exactly one correct option.");
    }
    this.assertIndexRange(indexes, optionCount, "correct_option_indexes");
  }

  private assertVoteIndexes(indexes: number[], optionCount: number, allowMultiple: boolean): void {
    if (!Array.isArray(indexes) || indexes.length === 0) {
      throw new BadRequestException("Poll vote requires at least one option index.");
    }
    if (!allowMultiple && indexes.length !== 1) {
      throw new BadRequestException("Poll allows only one selected option.");
    }
    this.assertIndexRange(indexes, optionCount, "option_indexes");
  }

  private assertIndexRange(indexes: number[], optionCount: number, fieldName: string): void {
    const unique = new Set(indexes);
    if (unique.size !== indexes.length) {
      throw new BadRequestException(`${fieldName} contains duplicate values.`);
    }
    for (const index of indexes) {
      if (!Number.isInteger(index) || index < 0 || index >= optionCount) {
        throw new BadRequestException(`${fieldName} contains invalid option index: ${index}`);
      }
    }
  }

  private parseOptionalIso(value: string | undefined, fieldName: string): string | null {
    if (!value) {
      return null;
    }
    if (Number.isNaN(Date.parse(value))) {
      throw new BadRequestException(`${fieldName} must be a valid ISO datetime.`);
    }
    return new Date(value).toISOString();
  }
}
