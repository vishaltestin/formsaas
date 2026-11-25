-- v6: teams, RBAC, form access, invites, audit log and per-workspace email providers.
-- Existing data is backfilled: every user gets a personal workspace they OWN, and
-- their forms and API keys move into it. Columns are added nullable, backfilled,
-- then tightened to NOT NULL before the foreign keys are created.

-- AlterTable
ALTER TABLE `ApiKey` ADD COLUMN `workspaceId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `EmailOutbox` ADD COLUMN `workspaceId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Form` ADD COLUMN `createdById` VARCHAR(191) NULL,
    ADD COLUMN `workspaceId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Workspace` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Workspace_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkspaceMember` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'EDITOR', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WorkspaceMember_userId_idx`(`userId`),
    UNIQUE INDEX `WorkspaceMember_workspaceId_userId_key`(`workspaceId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkspaceGroup` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `description` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WorkspaceGroup_workspaceId_name_key`(`workspaceId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkspaceGroupMember` (
    `groupId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WorkspaceGroupMember_memberId_idx`(`memberId`),
    PRIMARY KEY (`groupId`, `memberId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FormAccess` (
    `id` VARCHAR(191) NOT NULL,
    `formId` VARCHAR(191) NOT NULL,
    `memberId` VARCHAR(191) NULL,
    `groupId` VARCHAR(191) NULL,
    `level` ENUM('VIEW', 'REVIEW', 'EDIT', 'MANAGE') NOT NULL DEFAULT 'VIEW',
    `grantedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FormAccess_memberId_idx`(`memberId`),
    INDEX `FormAccess_groupId_idx`(`groupId`),
    UNIQUE INDEX `FormAccess_formId_memberId_key`(`formId`, `memberId`),
    UNIQUE INDEX `FormAccess_formId_groupId_key`(`formId`, `groupId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkspaceInvite` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'EDITOR', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
    `groupIds` JSON NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `invitedById` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WorkspaceInvite_tokenHash_key`(`tokenHash`),
    INDEX `WorkspaceInvite_workspaceId_email_idx`(`workspaceId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkspaceEmailProvider` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `provider` ENUM('BREVO', 'MAILTRAP', 'SMTP') NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `fromEmail` VARCHAR(191) NOT NULL,
    `fromName` VARCHAR(191) NULL,
    `replyTo` VARCHAR(191) NULL,
    `config` JSON NOT NULL,
    `secretCiphertext` TEXT NOT NULL,
    `secretHint` VARCHAR(8) NULL,
    `lastTestAt` DATETIME(3) NULL,
    `lastTestOk` BOOLEAN NULL,
    `lastError` TEXT NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WorkspaceEmailProvider_workspaceId_key`(`workspaceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `action` VARCHAR(64) NOT NULL,
    `targetType` VARCHAR(32) NULL,
    `targetId` VARCHAR(64) NULL,
    `summary` VARCHAR(500) NOT NULL,
    `metadata` JSON NULL,
    `ip` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_workspaceId_createdAt_idx`(`workspaceId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill: one personal workspace per existing user
INSERT INTO `Workspace` (`id`, `name`, `ownerId`, `createdAt`, `updatedAt`)
SELECT CONCAT('wsp_', u.`id`),
       LEFT(CONCAT(COALESCE(NULLIF(TRIM(u.`name`), ''), SUBSTRING_INDEX(u.`email`, '@', 1)), '''s workspace'), 191),
       u.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `User` u;

INSERT INTO `WorkspaceMember` (`id`, `workspaceId`, `userId`, `role`, `createdAt`, `updatedAt`)
SELECT CONCAT('wsm_', u.`id`), CONCAT('wsp_', u.`id`), u.`id`, 'OWNER', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `User` u;

UPDATE `Form` SET `workspaceId` = CONCAT('wsp_', `userId`), `createdById` = `userId` WHERE `workspaceId` IS NULL;
UPDATE `ApiKey` SET `workspaceId` = CONCAT('wsp_', `userId`) WHERE `workspaceId` IS NULL;

ALTER TABLE `Form` MODIFY `workspaceId` VARCHAR(191) NOT NULL;
ALTER TABLE `ApiKey` MODIFY `workspaceId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `ApiKey_workspaceId_idx` ON `ApiKey`(`workspaceId`);

-- CreateIndex
CREATE INDEX `EmailOutbox_workspaceId_createdAt_idx` ON `EmailOutbox`(`workspaceId`, `createdAt`);

-- CreateIndex
CREATE INDEX `Form_workspaceId_updatedAt_idx` ON `Form`(`workspaceId`, `updatedAt`);

-- CreateIndex
CREATE INDEX `Form_createdById_idx` ON `Form`(`createdById`);

-- AddForeignKey
ALTER TABLE `Form` ADD CONSTRAINT `Form_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Form` ADD CONSTRAINT `Form_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApiKey` ADD CONSTRAINT `ApiKey_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Workspace` ADD CONSTRAINT `Workspace_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkspaceMember` ADD CONSTRAINT `WorkspaceMember_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkspaceMember` ADD CONSTRAINT `WorkspaceMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkspaceGroup` ADD CONSTRAINT `WorkspaceGroup_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkspaceGroupMember` ADD CONSTRAINT `WorkspaceGroupMember_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `WorkspaceGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkspaceGroupMember` ADD CONSTRAINT `WorkspaceGroupMember_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `WorkspaceMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FormAccess` ADD CONSTRAINT `FormAccess_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `Form`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FormAccess` ADD CONSTRAINT `FormAccess_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `WorkspaceMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FormAccess` ADD CONSTRAINT `FormAccess_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `WorkspaceGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkspaceInvite` ADD CONSTRAINT `WorkspaceInvite_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkspaceInvite` ADD CONSTRAINT `WorkspaceInvite_invitedById_fkey` FOREIGN KEY (`invitedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkspaceEmailProvider` ADD CONSTRAINT `WorkspaceEmailProvider_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
