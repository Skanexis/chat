import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../core/current-user.decorator.js";
import { JwtAuthGuard } from "../../core/jwt-auth.guard.js";
import type { RequestUser } from "../../core/types.js";
import { CreateRoleDto, PermissionsPatchDto, PermissionSimulationDto, RoleMemberPatchDto, UpdateRoleDto } from "./roles.dto.js";
import { RolesService } from "./roles.service.js";

@UseGuards(JwtAuthGuard)
@Controller("chats/:chatId/roles")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  async listRoles(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser) {
    return this.rolesService.listRoles(chatId, user);
  }

  @Post()
  async createRole(@Param("chatId") chatId: string, @CurrentUser() user: RequestUser, @Body() dto: CreateRoleDto) {
    return this.rolesService.createRole(chatId, user, dto);
  }

  @Patch(":roleId")
  async updateRole(
    @Param("chatId") chatId: string,
    @Param("roleId") roleId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateRoleDto
  ) {
    return this.rolesService.updateRole(chatId, roleId, user, dto);
  }

  @Post(":roleId/permissions/grant")
  async grantPermissions(
    @Param("chatId") chatId: string,
    @Param("roleId") roleId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: PermissionsPatchDto
  ) {
    return this.rolesService.grantPermissions(chatId, roleId, user, dto);
  }

  @Post(":roleId/permissions/revoke")
  async revokePermissions(
    @Param("chatId") chatId: string,
    @Param("roleId") roleId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: PermissionsPatchDto
  ) {
    return this.rolesService.revokePermissions(chatId, roleId, user, dto);
  }

  @Post(":roleId/assign")
  async assignRole(
    @Param("chatId") chatId: string,
    @Param("roleId") roleId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: RoleMemberPatchDto
  ) {
    return this.rolesService.assignRole(chatId, roleId, user, dto);
  }

  @Post(":roleId/unassign")
  async unassignRole(
    @Param("chatId") chatId: string,
    @Param("roleId") roleId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: RoleMemberPatchDto
  ) {
    return this.rolesService.unassignRole(chatId, roleId, user, dto);
  }

  @Post("permissions/simulate")
  async simulatePermissions(
    @Param("chatId") chatId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: PermissionSimulationDto
  ) {
    return this.rolesService.simulatePermissions(chatId, user, dto);
  }
}
